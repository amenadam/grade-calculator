require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3000;

// Firebase init
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

bot.start(async (ctx) => {
  const chatId = ctx.chat.id;
  await usersRef.doc(chatId.toString()).set({
    id: chatId,
    username: ctx.from.username || null,
    name: ctx.from.first_name || '',
    timestamp: new Date().toISOString()
  });

  if (ADMIN_ID && ADMIN_ID !== chatId.toString()) {
    bot.telegram.sendMessage(
      ADMIN_ID,
      `🆕 New user joined:\n👤 Name: ${ctx.from.first_name}\n🆔 ID: ${chatId}\n📛 Username: @${ctx.from.username || 'N/A'}`
    ).catch(console.error);
  }

  ctx.reply('📘 Welcome to GPA Calculator!',
    Markup.keyboard([
      ['🎓 Calculate GPA'],
      ['📜 My History'],
      ['📢 About', '📬 Broadcast (Admin)']
    ]).resize()
  );
});

bot.command('status', async (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID) {
    return ctx.reply('🚫 Not authorized.');
  }
  try {
    const response = await fetch('https://api.uptimerobot.com/v2/getMonitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `api_key=${process.env.UPTIME_ROBOT_API_KEY}&format=json&logs=1&custom_uptime_ratios=30`
    });
    const data = await response.json();
    if (data.stat === 'ok') {
      let message = '📊 UptimeRobot Status:\n\n';
      data.monitors.forEach(monitor => {
        const uptime = monitor.custom_uptime_ratio || 'N/A';
        message += `🔹 *${monitor.friendly_name}* → ${monitor.status === 2 ? '✅ Up' : '❌ Down'}\n`;
        message += `⏱ Uptime: ${uptime}%\n`;
        message += `🕒 Last Check: ${new Date(monitor.logs[0]?.datetime * 1000).toLocaleString()}\n\n`;
      });
      return ctx.replyWithMarkdown(message);
    } else {
      return ctx.reply(`❌ UptimeRobot Error: ${data.error?.message || 'Unknown error'}`);
    }
  } catch (err) {
    console.error('UptimeRobot API error:', err);
    return ctx.reply(`⚠️ Error: ${err.message}`);
  }
});
