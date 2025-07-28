require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3000;

const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG_JSON);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();
const logsRef = db.collection('logs');
const usersRef = db.collection('users');

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID;

const courses = [
  { name: 'Applied Mathematics I (Math. 1041)', credit: 5 },
  { name: 'Communicative English Language Skills II (FLEn. 1012)', credit: 5 },
  { name: 'Moral and Civic Education (MCiE. 1012)', credit: 4 },
  { name: 'Entrepreneurship (Mgmt. 1012)', credit: 5 },
  { name: 'Social Anthropology (Anth. 1012)', credit: 4 },
  { name: 'Introduction to Emerging Technologies (EmTe. 1012)', credit: 5 },
  { name: 'Computer Programming (ECEg 2052)', credit: 5 }
];

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

const sessions = {};

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

bot.use(async (ctx, next) => {
  if (ctx.from) {
    const chatId = ctx.from.id;
    try {
      await usersRef.doc(chatId.toString()).set({
        id: chatId,
        username: ctx.from.username || null,
        firstName: ctx.from.first_name || '',
        lastName: ctx.from.last_name || '',
        lastActivity: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      console.error('Error updating user activity:', error);
    }
  }
  return next();
});

bot.start(async (ctx) => {
  const chatId = ctx.chat.id;
  const user = ctx.from;
  if (ADMIN_ID && ADMIN_ID !== chatId.toString()) {
    try {
      await bot.telegram.sendMessage(
        ADMIN_ID,
        `🆕 New user:\n👤 ${user.first_name} ${user.last_name || ''}\n🆔 ${chatId}\n📛 @${user.username || 'N/A'}`
      );
    } catch (err) {
      console.error('Error notifying admin:', err);
    }
  }
  await ctx.reply('📘 Welcome to GPA Calculator!',
    Markup.keyboard([
      ['🎓 Calculate GPA'],
      ['📜 My History'],
      ['📢 About', '📬 Broadcast (Admin)']
    ]).resize()
  );
});

bot.hears('🎓 Calculate GPA', (ctx) => {
  const chatId = ctx.chat.id;
  sessions[chatId] = { index: 0, scores: [] };
  return ctx.reply(`Send your score for: ${courses[0].name}`);
});

bot.hears('📜 My History', async (ctx) => {
  const chatId = ctx.chat.id;
  const snapshot = await logsRef.where('userId', '==', chatId)
    .orderBy('timestamp', 'desc')
    .limit(5)
    .get();
  if (snapshot.empty) return ctx.reply('📭 No GPA history found.');

  let history = '🕘 Your Last 5 GPA Calculations:\n\n';
  snapshot.forEach(doc => {
    const data = doc.data();
    history += `📅 ${new Date(data.timestamp).toLocaleString()} → GPA: ${data.gpa}\n`;
  });
  return ctx.reply(history);
});

bot.hears('📢 About', (ctx) => {
  return ctx.reply('This bot is developed by Amenadam Solomon\nGitHub: https://github.com/amenadam');
});

bot.hears('📬 Broadcast (Admin)', async (ctx) => {
  const chatId = ctx.chat.id;
  if (chatId.toString() !== ADMIN_ID) return ctx.reply('🚫 Not authorized.');
  ctx.reply('📨 Send the broadcast message:');
  sessions[chatId] = { mode: 'broadcast' };
});

bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();
  const session = sessions[chatId];
  if (!session) return;

  if (session.mode === 'broadcast') {
    delete sessions[chatId];
    
    // Get unique user IDs from logs collection
    const logsSnapshot = await logsRef.get();
    const uniqueUserIds = new Set();
    
    logsSnapshot.forEach(doc => {
      uniqueUserIds.add(doc.data().userId);
    });
    
    let success = 0, failed = 0;
    const userIds = Array.from(uniqueUserIds);
    
    // Send messages sequentially to avoid rate limits
    for (const userId of userIds) {
      try {
        await ctx.telegram.sendMessage(userId, text);
        success++;
        // Small delay between messages
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (err) {
        console.error(`Failed to send to ${userId}:`, err.message);
        failed++;
      }
    }
    
    return ctx.reply(`📊 Broadcast Results:\n✅ Sent: ${success}\n❌ Failed: ${failed}`);
  }

  const score = parseFloat(text);
  if (isNaN(score) || score < 0 || score > 100) {
    return ctx.reply('❌ Enter a valid score (0-100)');
  }

  session.scores.push(score);
  session.index++;

  if (session.index < courses.length) {
    return ctx.reply(`Next score for: ${courses[session.index].name}`);
  }

  let totalWeighted = 0, totalCredits = 0;
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
  delete sessions[chatId];

  ctx.reply(`${resultText}\n🎯 Final GPA: ${gpa.toFixed(2)}`);
});

bot.command('status', async (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID) return ctx.reply('🚫 Not authorized.');
  try {
    await ctx.reply('🔄 Fetching UptimeRobot status...');

    const res = await fetch('https://api.uptimerobot.com/v2/getMonitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        api_key: process.env.UPTIME_ROBOT_API_KEY,
        format: 'json',
        logs: '1',
        custom_uptime_ratios: '30'
      })
    });

    const data = await res.json();
    if (data.stat !== 'ok') return ctx.reply(`❌ Error: ${data.error.message}`);

    let msg = '*📊 UptimeRobot Status:*\n\n';
    data.monitors.forEach(mon => {
      msg += `*${mon.friendly_name}*\n`;
      msg += `Status: ${mon.status === 2 ? '✅ Up' : '❌ Down'}\n`;
      msg += `Uptime: ${mon.custom_uptime_ratio || mon.all_time_uptime_ratio || 'N/A'}%\n`;
      if (mon.logs?.length) {
        msg += `Last check: ${new Date(mon.logs[0].datetime * 1000).toLocaleString()}\n`;
      }
      msg += '\n';
    });
    return ctx.replyWithMarkdown(msg);
  } catch (err) {
    console.error(err);
    return ctx.reply(`⚠️ Error: ${err.message}`);
  }
});

bot.command('testapi', async (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID) return ctx.reply('🚫 Not authorized.');
  try {
    const res = await fetch('https://api.uptimerobot.com/v2/getMonitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        api_key: process.env.UPTIME_ROBOT_API_KEY,
        format: 'json'
      })
    });
    const data = await res.json();
    if (data.stat === 'ok') ctx.reply('✅ UptimeRobot API is working.');
    else ctx.reply(`❌ API Error: ${data.error.message}`);
  } catch (err) {
    ctx.reply(`⚠️ Error: ${err.message}`);
  }
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString(), bot: true });
});

app.get('/', (req, res) => {
  res.send('Bot is running');
});

const startServers = async () => {
  try {
    app.listen(port, () => console.log(`Web server on port ${port}`));
    await bot.launch();
    console.log('🤖 Bot is running');

    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const msUntilMidnight = nextMidnight - now;
    setTimeout(() => {
      console.log('🔄 Restarting bot at midnight');
      process.exit(0);
    }, msUntilMidnight);

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } catch (err) {
    console.error('Startup error:', err);
    process.exit(1);
  }
};

startServers();