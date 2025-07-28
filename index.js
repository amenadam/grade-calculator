// ✅ UPDATED GPA BOT WITH SEMESTER SYSTEM & BROADCAST MENU FEATURE
require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const admin = require('firebase-admin');

// 🔐 Firebase initialization
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG_JSON);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const logsRef = db.collection('logs');
const usersRef = db.collection('users');

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID;

// 📚 Courses by semester (Only Year 1 Sem 2 available for now)
const courseCatalog = {
  'Year 1': {
    'Semester 1': [], // 🚧 Coming soon
    'Semester 2': [
      { name: 'Applied Mathematics I(Math. 1041)', credit: 5 },
      { name: 'Communicative English Language Skills II(FLEn. 1012)', credit: 5 },
      { name: 'Moral and Civic Education(MCiE. 1012)', credit: 4 },
      { name: 'Enterprenuership(Mgmt. 1012)', credit: 5 },
      { name: 'Social Anthropology(Anth. 1012)', credit: 4 },
      { name: 'Introduction to Emerging Technologies(EmTe.1012)', credit: 5 },
      { name: 'Computer Programing(ECEg 2052) C++', credit: 5 }
    ]
  }
};

const sessions = {};

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

async function logUserCalculation(chatId, session, gpa) {
  await logsRef.add({
    userId: chatId,
    year: session.year,
    semester: session.semester,
    timestamp: new Date().toISOString(),
    gpa: gpa.toFixed(2),
    results: session.scores.map((score, i) => {
      const course = session.courses[i];
      const grade = getGrade(score);
      return { course: course.name, credit: course.credit, score, grade: grade.letter, point: grade.point };
    })
  });
}

bot.start(async (ctx) => {
  const chatId = ctx.chat.id;
  await usersRef.doc(chatId.toString()).set({ id: chatId, username: ctx.from.username || '', first_name: ctx.from.first_name || '', last_active: new Date().toISOString() }, { merge: true });

  sessions[chatId] = {};
  ctx.reply('📘 Welcome to GPA Calculator!
Select your academic year:', Markup.keyboard([['Year 1']]).oneTime().resize());
});

bot.hears('Year 1', (ctx) => {
  const chatId = ctx.chat.id;
  sessions[chatId].year = 'Year 1';
  ctx.reply('🧭 Choose your semester:', Markup.keyboard([['Semester 1'], ['Semester 2']]).oneTime().resize());
});

bot.hears('Semester 2', (ctx) => {
  const chatId = ctx.chat.id;
  sessions[chatId].semester = 'Semester 2';
  const courses = courseCatalog['Year 1']['Semester 2'];
  sessions[chatId].courses = courses;
  sessions[chatId].index = 0;
  sessions[chatId].scores = [];
  ctx.reply(`📌 Enter score for: ${courses[0].name}`);
});

bot.hears('Semester 1', (ctx) => {
  ctx.reply('🚧 Semester 1 courses are coming soon.');
});

bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const session = sessions[chatId];
  if (!session || !session.courses) return;

  const score = parseFloat(ctx.message.text);
  if (isNaN(score) || score < 0 || score > 100) {
    return ctx.reply('❌ Enter a valid score (0–100)');
  }

  session.scores.push(score);
  session.index++;

  if (session.index < session.courses.length) {
    ctx.reply(`Next: ${session.courses[session.index].name}`);
  } else {
    let total = 0, credits = 0, result = '📊 GPA Results:\n\n';
    session.scores.forEach((score, i) => {
      const course = session.courses[i];
      const grade = getGrade(score);
      const weighted = grade.point * course.credit;
      total += weighted;
      credits += course.credit;
      result += `${course.name}: ${score} → ${grade.letter} (${grade.point}) x ${course.credit} = ${weighted.toFixed(2)}\n`;
    });

    const gpa = total / credits;
    await logUserCalculation(chatId, session, gpa);
    ctx.reply(result + `\n🎯 Final GPA: ${gpa.toFixed(2)}`);
    delete sessions[chatId];
  }
});

// 👑 Admin broadcast
bot.command('broadcast', async (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID) return;
  ctx.reply('📝 Send the message you want to broadcast:');
  sessions[ctx.chat.id] = { broadcastMode: true };
});

bot.on('text', async (ctx) => {
  const session = sessions[ctx.chat.id];
  if (session?.broadcastMode && ctx.from.id.toString() === ADMIN_ID) {
    const snapshot = await usersRef.get();
    snapshot.forEach(async (doc) => {
      try {
        await bot.telegram.sendMessage(doc.id, `📢 Update:
${ctx.message.text}`);
      } catch (e) {
        console.log(`⚠️ Failed to send to ${doc.id}`);
      }
    });
    delete sessions[ctx.chat.id];
    return ctx.reply('✅ Broadcast sent.');
  }
});


bot.launch();
