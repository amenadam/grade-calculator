require('dotenv').config();
const { Telegraf } = require('telegraf');
const admin = require('firebase-admin');

// 🔐 Firebase initialization
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG_JSON);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();
const logsRef = db.collection('logs');

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID;

// 📚 Fixed course list
const courses = [
  { name: 'Applied Mathematics I(Math. 1041)', credit: 5 },
  { name: 'Communicative English Language Skills II(FLEn. 1012)', credit: 5 },
  { name: 'Moral and Civic Education(MCiE. 1012)', credit: 4 },
  { name: 'Enterprenuership(Mgmt. 1012)', credit: 5 },
  { name: 'Social Anthropology(Anth. 1012)', credit: 4 },
  { name: 'Introduction to Emerging Technologies(EmTe.1012)', credit: 5 },
  { name: 'Computer Programing(ECEg 2052)++', credit: 5 }
];

// 🎓 Grade mapping
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

// 🔐 Save calculation to Firestore
async function logUserCalculationToFirebase(chatId, session, gpa) {
  try {
    await logsRef.add({
      userId: chatId,
      timestamp: new Date().toISOString(),
      gpa: gpa.toFixed(2),
      results: session.scores.map((score, i) => ({
        course: courses[i].name,
        credit: courses[i].credit,
        score,
        grade: getGrade(score).letter,
        point: getGrade(score).point
      }))
    });
    console.log(`✅ Logged GPA for ${chatId} to Firebase`);
  } catch (err) {
    console.error('❌ Firebase log failed:', err);
  }
}

// 🧠 Session state
const sessions = {};

// 🚀 Start command
bot.start((ctx) => {
  const chatId = ctx.chat.id;
  sessions[chatId] = {
    index: 0,
    scores: []
  };

  ctx.reply(`🎓 GPA Calculator\n\nCourses:\n` +
    courses.map((c, i) => `${i + 1}. ${c.name} (${c.credit} credits)`).join('\n') +
    `\n\nSend your score (0–100) for: ${courses[0].name}`);
});

// 📝 Handle messages
bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;

  // 👑 Admin view logs
  if (ctx.from.id.toString() === ADMIN_ID && ctx.message.text === '/logs') {
    try {
      const snapshot = await logsRef.orderBy('timestamp', 'desc').limit(10).get();
      if (snapshot.empty) return ctx.reply('📂 No logs found.');

      let message = '📘 Last 10 GPA Calculations:\n\n';
      snapshot.forEach((doc, i) => {
        const log = doc.data();
        message += `#${i + 1} - User: ${log.userId}\nGPA: ${log.gpa}\nTime: ${log.timestamp}\n\n`;
      });

      return ctx.reply(message.slice(0, 4096));
    } catch (err) {
      return ctx.reply('❌ Error reading logs from Firebase.');
    }
  }

  const session = sessions[chatId];
  if (!session) return ctx.reply('❗ Use /start to begin.');

  const score = parseFloat(ctx.message.text);
  if (isNaN(score) || score < 0 || score > 100) {
    return ctx.reply('❌ Please enter a valid score (0–100)');
  }

  session.scores.push(score);
  session.index++;

  if (session.index < courses.length) {
    const nextCourse = courses[session.index];
    ctx.reply(`Enter your score for: ${nextCourse.name}`);
  } else {
    let totalWeighted = 0;
    let totalCredits = 0;
    let response = `📊 Detailed Results:\n\n`;

    console.log(`📌 Final Grades for User ${chatId}:`);

    session.scores.forEach((rawScore, i) => {
      const { letter, point } = getGrade(rawScore);
      const course = courses[i];
      const weighted = point * course.credit;
      totalWeighted += weighted;
      totalCredits += course.credit;

      response += `${course.name}: ${rawScore} → ${letter} (${point}) × ${course.credit} = ${weighted.toFixed(2)}\n`;
      console.log(`${course.name}: ${rawScore} → ${letter} (${point}) × ${course.credit} = ${weighted.toFixed(2)}`);
    });

    const gpa = totalWeighted / totalCredits;
    await logUserCalculationToFirebase(chatId, session, gpa);

    response += `\n🎯 Final GPA: ${gpa.toFixed(2)}`;
    console.log(`🎯 GPA: ${gpa.toFixed(2)}\n`);

    ctx.reply(response);
    delete sessions[chatId];
  }
});

bot.launch();
