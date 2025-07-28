require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
// Initialize Express app for health checks
const app = express();
const port = process.env.PORT || 3000;

// Firebase initialization
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG_JSON);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();
const logsRef = db.collection('logs');
const usersRef = db.collection('users');

// Bot initialization
const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID;

// Course data
const courses = [
  { name: 'Applied Mathematics I (Math. 1041)', credit: 5 },
  { name: 'Communicative English Language Skills II (FLEn. 1012)', credit: 5 },
  { name: 'Moral and Civic Education (MCiE. 1012)', credit: 4 },
  { name: 'Entrepreneurship (Mgmt. 1012)', credit: 5 },
  { name: 'Social Anthropology (Anth. 1012)', credit: 4 },
  { name: 'Introduction to Emerging Technologies (EmTe. 1012)', credit: 5 },
  { name: 'Computer Programming (ECEg 2052)', credit: 5 }
];

// Grade calculation
function getGrade(score) {
  if (score > 90) return { letter: 'A+', point: 4.0 };
  if (score >= 85) return { letter: 'A', point: 4.0 };
  if (score >= 80) return { letter: 'A-', point: 3.75 };
  if (score >= 75) return { letter: 'B+', point: 3.5 };
  if (score >= 70) return { letter: 'B', point: 3.0 };
  if (score >= 65) return { letter: 'B-', point: 2.75 };
  if (score >= 60) return { letter: 'C+', point: 2.5 };
  if (score >= 50) return { letter: 'C', point: 2.0 };
  if (score >= 45) return { letter: 'C-', point: 1.75 };
  if (score >= 40) return { letter: 'D', point: 1.0 };
  if (score >= 30) return { letter: 'FX', point: 0.0 };
  return { letter: 'F', point: 0.0 };
}

// Session storage
const sessions = {};

// Logging function
async function logUserCalculation(chatId, session, gpa) {
  await logsRef.add({
    userId: chatId,
    timestamp: new Date().toISOString(),
    gpa: gpa.toFixed(2),
    results: session.scores.map((score, i) => {
      const grade = getGrade(score);
      return {
        course: courses[i].name,
        credit: courses[i].credit,
        score,
        grade: grade.letter,
        point: grade.point
      };
    })
  });
}

// Bot commands
bot.start(async (ctx) => {
  const chatId = ctx.chat.id;
  await usersRef.doc(chatId.toString()).set({
    id: chatId,
    username: ctx.from.username || null,
    name: ctx.from.first_name || '',
    timestamp: new Date().toISOString()
  });

  ctx.reply('📘 Welcome to GPA Calculator!',
    Markup.keyboard([
      ['🎓 Calculate GPA'],
      ['📜 My History'],
      ['📢 About', '📬 Broadcast (Admin)']
    ]).resize()
  );
});

bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();

  if (text === '📢 About') {
    return ctx.reply('This bot is developed by Amenadam Solomon\nGitHub: https://github.com/amenadam');
  }

  if (text === '📬 Broadcast (Admin)') {
    if (ctx.from.id.toString() !== ADMIN_ID) {
      return ctx.reply('🚫 Not authorized.');
    }
    ctx.reply('📨 Send the broadcast message:');
    sessions[chatId] = { mode: 'broadcast' };
    return;
  }

  if (sessions[chatId]?.mode === 'broadcast') {
    delete sessions[chatId];
    const snapshot = await logsRef.get();
    const uniqueUserIds = new Set();

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.userId) {
        uniqueUserIds.add(data.userId);
      }
    });

    let success = 0, failed = 0;

    await Promise.all([...uniqueUserIds].map(async (userId) => {
      try {
        await ctx.telegram.sendMessage(userId, `${text}`);
        success++;
      } catch {
        failed++;
      }
    }));

    return ctx.reply(`✅ Sent: ${success}\n❌ Failed: ${failed}`);
  }

  if (text === '🎓 Calculate GPA') {
    sessions[chatId] = { index: 0, scores: [] };
    return ctx.reply(`Send your score for: ${courses[0].name}`);
  }

  if (text === '📜 My History') {
    const snapshot = await logsRef.where('userId', '==', chatId).orderBy('timestamp', 'desc').limit(5).get();
    if (snapshot.empty) {
      return ctx.reply('📭 No GPA history found.');
    }
    let history = '🕘 Your Last 5 GPA Calculations:\n\n';
    snapshot.forEach(doc => {
      const data = doc.data();
      history += `📅 ${new Date(data.timestamp).toLocaleString()} → GPA: ${data.gpa}\n`;
    });
    return ctx.reply(history);
  }

  const session = sessions[chatId];
  if (!session) return;

  const score = parseFloat(text);
  if (isNaN(score) || score < 0 || score > 100) {
    return ctx.reply('❌ Enter a valid score (0–100)');
  }

  session.scores.push(score);
  session.index++;

  if (session.index < courses.length) {
    ctx.reply(`Next score for: ${courses[session.index].name}`);
  } else {
    let totalWeighted = 0;
    let totalCredits = 0;
    let resultText = '📊 GPA Results:\n\n';

    session.scores.forEach((score, i) => {
      const { letter, point } = getGrade(score);
      const course = courses[i];
      const weighted = point * course.credit;
      totalWeighted += weighted;
      totalCredits += course.credit;

      resultText += `${course.name}: ${score} → ${letter} (${point}) x ${course.credit} = ${weighted.toFixed(2)}\n`;
    });

    const gpa = totalWeighted / totalCredits;
    await logUserCalculation(chatId, session, gpa);

    ctx.reply(`${resultText}\n🎯 Final GPA: ${gpa.toFixed(2)}`);
    delete sessions[chatId];
  }
});

// Error handling
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  if (ADMIN_ID) {
    ctx.telegram.sendMessage(ADMIN_ID, `Bot error: ${err.message}`).catch(console.error);
  }
});
// Add this near your other endpoint definitions (around line 200 in your original code)

// UptimeRobot monitoring endpoint
app.get('/uptime-robot', (req, res) => {
  res.status(200).json({
    status: 'operational',
    bot: 'running',
    timestamp: new Date().toISOString()
  });
});

// Optional: Add UptimeRobot status command to your bot
bot.command('status', async (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID) {
    return ctx.reply('🚫 Not authorized.');
  }

  try {
    console.log('Fetching UptimeRobot status...'); // Debug log
    const response = await fetch('https://api.uptimerobot.com/v2/getMonitors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache'
      },
      body: `api_key=${process.env.UPTIME_ROBOT_API_KEY}&format=json&logs=1`
    });

    const data = await response.json();
    console.log('UptimeRobot API Response:', data); // Debug log

    if (data.stat === 'ok') {
      let statusMessage = '📊 UptimeRobot Status:\n\n';
      data.monitors.forEach(monitor => {
        statusMessage += `🔹 ${monitor.friendly_name}: ${monitor.status === 2 ? '✅ Up' : '❌ Down'}\n`;
        statusMessage += `⏱ Uptime: ${monitor.all_time_uptime_ratio}%\n`;
        statusMessage += `🔄 Last check: ${new Date(monitor.logs[0].datetime * 1000).toLocaleString()}\n\n`;
      });
      ctx.reply(statusMessage);
    } else {
      ctx.reply(`❌ UptimeRobot Error: ${data.error?.message || 'Unknown error'}`);
    }
  } catch (err) {
    console.error('UptimeRobot API error:', err);
    ctx.reply(`⚠️ Error: ${err.message}`);
  }
});
// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    bot: bot != null
  });
});

app.get('/', (req, res) => {
  res.send("OK");
});
// Start servers
const startServers = async () => {
  try {
    // Start web server
    app.listen(port, () => {
      console.log(`Web server running on port ${port}`);
    });

    // Start bot
    await bot.launch();
    console.log('🤖 Bot is running');

    // Graceful shutdown
    process.once('SIGINT', () => {
      bot.stop('SIGINT');
      process.exit();
    });
    process.once('SIGTERM', () => {
      bot.stop('SIGTERM');
      process.exit();
    });
  } catch (err) {
    console.error('Failed to start servers:', err);
    process.exit(1);
  }
};

// Auto-restart logic
const restartBot = async () => {
  try {
    console.log('Restarting bot...');
    await bot.stop();
    await bot.launch();
    console.log('Bot restarted successfully');
  } catch (err) {
    console.error('Error during restart:', err);
    setTimeout(restartBot, 5000);
  }
};

// Start everything
startServers();

// Periodic restart to prevent memory leaks
setInterval(restartBot, 6 * 60 * 60 * 1000); // Every 6 hours
