require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG_JSON);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

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

async function generateGpaPdf(chatId, session, gpa, userFullName) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const filePath = path.join(__dirname, `gpa_${chatId}.pdf`);
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const logoPath = path.join(__dirname, 'logo.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 220, 20, { width: 150 });
    }

    doc.moveDown(4);
    doc.fontSize(20).text('Jimma University', { align: 'center' });
    doc.moveDown();
    doc.fontSize(18).text('GPA Result Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text(`Student: ${userFullName}`, { align: 'center' });
    doc.moveDown();

    // Table Header
    doc.fontSize(12).text('Course', 50, doc.y, { continued: true });
    doc.text('Score', 200, doc.y, { continued: true });
    doc.text('Grade', 260, doc.y, { continued: true });
    doc.text('Point', 320, doc.y, { continued: true });
    doc.text('Credit', 380, doc.y, { continued: true });
    doc.text('Weighted', 440, doc.y);
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();

    let totalWeighted = 0, totalCredits = 0;

    session.scores.forEach((score, i) => {
      const { letter, point } = getGrade(score);
      const course = courses[i];
      const weighted = point * course.credit;
      totalWeighted += weighted;
      totalCredits += course.credit;

      doc.fontSize(12).text(course.name, 50, doc.y, { continued: true });
      doc.text(score.toString(), 200, doc.y, { continued: true });
      doc.text(letter, 260, doc.y, { continued: true });
      doc.text(point.toFixed(2), 320, doc.y, { continued: true });
      doc.text(course.credit.toString(), 380, doc.y, { continued: true });
      doc.text(weighted.toFixed(2), 440, doc.y);
    });

    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();
    doc.fontSize(14).text(`🎯 Final GPA: ${gpa.toFixed(2)}`, { align: 'center' });

    doc.end();

    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
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
    const snapshot = await usersRef.get();
    let success = 0, failed = 0;
    await Promise.all(snapshot.docs.map(async (doc) => {
      try {
        await ctx.telegram.sendMessage(doc.id, text);
        success++;
      } catch {
        failed++;
      }
    }));
    return ctx.reply(`✅ Sent: ${success}\n❌ Failed: ${failed}`);
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

  const userFullName = `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim();
  const pdfPath = await generateGpaPdf(chatId, session, gpa, userFullName);

  delete sessions[chatId];

  await ctx.reply(`${resultText}\n🎯 Final GPA: ${gpa.toFixed(2)}\n\n📄 Generating PDF...`);
  await ctx.replyWithDocument({ source: pdfPath, filename: 'GPA_Result.pdf' });

  fs.unlinkSync(pdfPath);
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
