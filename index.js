const { Telegraf, Markup } = require('telegraf');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// === BOT CONFIG ===
const bot = new Telegraf('YOUR_BOT_TOKEN');
const ADMIN_ID = 'YOUR_ADMIN_TELEGRAM_ID'; // Replace with your Telegram ID

// === FIREBASE INIT ===
initializeApp({ credential: applicationDefault() });
const db = getFirestore();

// === MAIN MENU ===
const mainMenu = Markup.keyboard([
  ['🎓 Calculate GPA'],
  ['📢 About']
]).resize();

// === START ===
bot.start((ctx) => {
  ctx.reply('👋 Welcome! Use the menu below:', mainMenu);
});

// === HANDLE TEXT ===
bot.on('text', async (ctx) => {
  const message = ctx.message.text;

  if (message === '🎓 Calculate GPA') {
    ctx.reply('📚 Enter your courses in this format:\n\n`Course1 Credit1 Grade1, Course2 Credit2 Grade2, ...`\n\nExample:\n`Math 3 A, Physics 4 B+`', {
      reply_markup: mainMenu,
      parse_mode: 'Markdown'
    });
  }

  else if (message === '📢 About') {
    ctx.reply('📌 This bot calculates GPA using semester & year system.\n\n👨‍💻 [Created by @yourusername](https://github.com/yourgithub)', {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  }

  // === ADMIN BROADCAST ===
  else if (ctx.from.id.toString() === ADMIN_ID && message.startsWith('/broadcast ')) {
    const broadcastMessage = message.replace('/broadcast ', '');
    const usersSet = new Set();

    try {
      const snapshot = await db.collection('logs').get();
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.userID) usersSet.add(data.userID);
      });

      const users = [...usersSet];

      let sent = 0;
      for (const uid of users) {
        try {
          await ctx.telegram.sendMessage(uid, `📢 *Broadcast from Admin:*\n\n${broadcastMessage}`, { parse_mode: 'Markdown' });
          sent++;
        } catch (e) {
          console.log(`❌ Could not send to ${uid}`);
        }
      }

      ctx.reply(`✅ Broadcast sent to ${sent} users.`);
    } catch (err) {
      ctx.reply('❌ Failed to fetch users or send broadcast.');
    }
  }

  // === GPA CALCULATION ===
  else {
    const courseRegex = /([a-zA-Z0-9\s]+)\s+(\d+)\s+([A-F][+-]?)/g;
    let match, totalPoints = 0, totalCredits = 0;
    const grades = {
      'A+': 4, 'A': 4, 'A-': 3.7,
      'B+': 3.3, 'B': 3, 'B-': 2.7,
      'C+': 2.3, 'C': 2, 'C-': 1.7,
      'D+': 1.3, 'D': 1, 'F': 0
    };

    while ((match = courseRegex.exec(message)) !== null) {
      const course = match[1].trim();
      const credit = parseInt(match[2]);
      const grade = match[3].toUpperCase();

      const point = grades[grade];
      if (point !== undefined) {
        totalPoints += point * credit;
        totalCredits += credit;
      }
    }

    if (totalCredits === 0) {
      ctx.reply('⚠️ Please follow the correct format.\nExample:\n`Math 3 A, Physics 4 B+`');
      return;
    }

    const gpa = (totalPoints / totalCredits).toFixed(2);
    ctx.reply(`✅ Your GPA is: *${gpa}*`, { parse_mode: 'Markdown' });

    // Save log to Firebase
    await db.collection('logs').add({
      userID: ctx.from.id,
      name: ctx.from.first_name,
      gpa,
      timestamp: new Date().toISOString()
    });
  }
});

// === LAUNCH ===
bot.launch();
console.log('🚀 Bot is running...');
