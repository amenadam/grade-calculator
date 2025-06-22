require('dotenv').config();
const { Telegraf } = require('telegraf');
const fs = require('fs');

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID;


// Fixed course list with credit hours
const courses = [
  { name: 'Applied(Sedef)', credit: 5 },
  { name: 'English', credit: 5 },
  { name: 'Civic', credit: 4 },
  { name: 'Enter', credit: 5 },
  { name: 'Antro', credit: 4 },
  { name: 'Emerging', credit: 5 },
  { name: 'C++', credit: 5 }
];

// Grade mapping: returns letter and point
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
function logUserCalculation(chatId, session, gpa) {
  const logData = {
    userId: chatId,
    timestamp: new Date().toISOString(),
    results: session.scores.map((score, i) => ({
      course: courses[i].name,
      credit: courses[i].credit,
      score,
      grade: getGrade(score).letter,
      point: getGrade(score).point
    })),
    gpa: gpa.toFixed(2)
  };

  const filePath = './logs.json';
  let logs = [];

  try {
    if (fs.existsSync(filePath)) {
      logs = JSON.parse(fs.readFileSync(filePath));
    }
  } catch (err) {
    console.error('Failed to read logs:', err);
  }

  logs.push(logData);

  try {
    fs.writeFileSync(filePath, JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error('Failed to write logs:', err);
  }
}

// In-memory session data
const sessions = {};

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

bot.on('text', (ctx) => {
  const chatId = ctx.chat.id;
  const session = sessions[chatId];

  if (!session) return ctx.reply('❗ Use /start to begin.');
  
  if (ctx.from.id.toString() === ADMIN_ID && ctx.message.text === '/logs') {
  try {
    const logs = JSON.parse(fs.readFileSync('./logs.json'));
    if (logs.length === 0) return ctx.reply('📂 No logs found.');

    let message = `📘 All Calculations:\n\n`;
    logs.forEach((entry, idx) => {
      message += `#${idx + 1} - User: ${entry.userId}\nGPA: ${entry.gpa}\nTime: ${entry.timestamp}\n\n`;
    });

    return ctx.reply(message.slice(0, 4096)); // Telegram max message length
  } catch (err) {
    return ctx.reply('❌ Error reading logs.');
  }
}


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
    logUserCalculation(chatId, session, gpa);
    response += `\n🎯 Final GPA: ${gpa.toFixed(2)}`;

    console.log(`🎯 GPA: ${gpa.toFixed(2)}\n`);

    ctx.reply(response);
    delete sessions[chatId];
  }
});

bot.launch();
