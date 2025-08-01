require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

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

async function generateQRCode(verificationData) {
  return new Promise((resolve, reject) => {
    const qrPath = path.join(__dirname, `qr_${Date.now()}.png`);
    QRCode.toFile(qrPath, verificationData, {
      color: {
        dark: '#000000',
        light: '#ffffff'
      },
      width: 150,
      margin: 1
    }, (err) => {
      if (err) reject(err);
      else resolve(qrPath);
    });
  });
}

async function generateGpaPdf(chatId, session, gpa, userFullName) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const filePath = path.join(__dirname, `gpa_${chatId}_${Date.now()}.pdf`);
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // Generate verification data for QR code
      const verificationData = JSON.stringify({
        student: userFullName,
        gpa: gpa.toFixed(2),
        date: new Date().toISOString(),
        verificationId: `JIU-${Math.random().toString(36).substring(2, 10).toUpperCase()}`
      });

      // Generate QR code
      const qrPath = await generateQRCode(verificationData);
      
      // Add logo if exists
      const logoPath = path.join(__dirname, 'logo.png');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 230, 30, { width: 120 });
      }

      doc.moveDown(6);
      doc.fontSize(20).text('Jimma University', { align: 'center' });
      doc.fontSize(16).text('GPA Result Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(13).text(`Student: ${userFullName}`, { align: 'center' });
      doc.fontSize(11).text(`Date: ${new Date().toLocaleDateString()}`, { align: 'center' });
      doc.moveDown(2);

      const startX = 50;
      let y = doc.y;

      const colWidths = {
        course: 360,
        score: 50,
        grade: 50,
        point: 50,
      };

      // Table header
      doc.font('Helvetica-Bold').fontSize(11);
      doc.text('Course', startX, y);
      doc.text('Score', startX + colWidths.course, y);
      doc.text('Grade', startX + colWidths.course + colWidths.score, y);
      doc.text('Point', startX + colWidths.course + colWidths.score + colWidths.grade, y);
      y += 20;
      doc.moveTo(startX, y - 5).lineTo(550, y - 5).stroke();

      let totalWeighted = 0, totalCredits = 0;

      doc.font('Helvetica').fontSize(10);

      session.scores.forEach((score, i) => {
        const { letter, point } = getGrade(score);
        const course = courses[i];
        const weighted = point * course.credit;
        totalWeighted += weighted;
        totalCredits += course.credit;

        doc.text(course.name.substring(0, 40) + (course.name.length > 40 ? '...' : ''), startX, y);
        doc.text(score.toString(), startX + colWidths.course, y);
        doc.text(letter, startX + colWidths.course + colWidths.score, y);
        doc.text(point.toFixed(2), startX + colWidths.course + colWidths.score + colWidths.grade, y);
        
        y += 18;
      });

      doc.moveDown();
      doc.moveTo(50, y).lineTo(550, y).stroke();

      doc.moveDown(2);
      doc.fontSize(13).text(`Final GPA: ${gpa.toFixed(2)}`, { align: 'center' });

      // Add QR code for verification
      doc.moveDown(2);
      doc.fontSize(10).text('Verification QR Code:', { align: 'center' });
      doc.image(qrPath, 200, doc.y, { width: 100 });
      doc.moveDown(6);

      doc.fontSize(10).text('THIS IS UNOFFICIAL COPY OF RESULT', { align: 'center' });
      doc.fontSize(8).text(`Verification ID: ${JSON.parse(verificationData).verificationId}`, { align: 'center' });

      doc.end();
      
      stream.on('finish', () => {
        fs.unlinkSync(qrPath); // Clean up QR code image
        resolve(filePath);
      });
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
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
bot.hears('logs', async (ctx) => {
  const chatId = ctx.chat.id.toString();

  if (chatId !== ADMIN_ID) {
    return ctx.reply('🚫 You are not authorized to access logs.');
  }

  try {
    const snapshot = await logsRef.orderBy('timestamp', 'desc').limit(10).get();

    if (snapshot.empty) {
      return ctx.reply('📭 No logs found.');
    }

    let message = '📄 *Latest GPA Logs:*\n\n';

    snapshot.forEach((doc, i) => {
      const data = doc.data();
      const date = new Date(data.timestamp).toLocaleString();
      const gpa = data.gpa;
      const courses = data.results?.length || 0;

      message += `#${i + 1} - 🧑‍🎓 ID: ${data.userId}\n`;
      message += `📅 ${date}\n📘 GPA: *${gpa}*\n📚 Courses: ${courses}\n\n`;
    });

    await ctx.replyWithMarkdown(message);
  } catch (err) {
    console.error('Error fetching logs:', err);
    await ctx.reply('⚠️ Error retrieving logs.');
  }
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

  const userFullName = `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim();
  
  try {
    await ctx.reply(`${resultText}\n🎯 Final GPA: ${gpa.toFixed(2)}\n\n📄 Generating PDF report...`);
    
    const pdfPath = await generateGpaPdf(chatId, session, gpa, userFullName);
    await ctx.replyWithDocument({ 
      source: pdfPath, 
      filename: `GPA_Result_${userFullName.replace(/\s+/g, '_')}.pdf` 
    });
    
    fs.unlinkSync(pdfPath); // Clean up PDF file
  } catch (err) {
    console.error('PDF generation error:', err);
    await ctx.reply('⚠️ Error generating PDF. Here are your results:\n\n' + resultText);
  } finally {
    delete sessions[chatId];
  }
});


app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString(), bot: true });
});

app.get('/', (req, res) => {
  res.send('Bot is running');
});
// Secure /logs route for ADMIN only
app.get('/logs', async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing Bearer token' });
  }

  const token = authHeader.split(' ')[1];

  // Compare token to ADMIN_ID (in practice, you'd use a more secure token system)
  if (token !== ADMIN_ID) {
    return res.status(403).json({ error: 'Forbidden: Invalid token' });
  }

  try {
    const snapshot = await logsRef.orderBy('timestamp', 'desc').limit(100).get();
    const logs = [];

    snapshot.forEach(doc => {
      logs.push({ id: doc.id, ...doc.data() });
    });

    return res.status(200).json({
      count: logs.length,
      logs
    });
  } catch (err) {
    console.error('Error fetching logs:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
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
