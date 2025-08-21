require("dotenv").config();
const express = require("express");
const { Telegraf, Markup } = require("telegraf");
const admin = require("firebase-admin");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");

const { version } = require("./package.json");
const botVersion = version;
const app = express();
const port = process.env.PORT || 3000;

const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG_JSON);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();
const logsRef = db.collection("logs");
const usersRef = db.collection("users");

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID;

const courses = [
  { name: "Applied Mathematics I (Math. 1041)", credit: 5 },
  { name: "Communicative English Language Skills II (FLEn. 1012)", credit: 5 },
  { name: "Moral and Civic Education (MCiE. 1012)", credit: 4 },
  { name: "Entrepreneurship (Mgmt. 1012)", credit: 5 },
  { name: "Social Anthropology (Anth. 1012)", credit: 4 },
  { name: "Introduction to Emerging Technologies (EmTe. 1012)", credit: 5 },
  { name: "Computer Programming (ECEg 2052)", credit: 5 },
];

function getGrade(score) {
  if (score > 90) return { letter: "A+", point: 4.0 };
  if (score >= 85) return { letter: "A", point: 4.0 };
  if (score >= 80) return { letter: "A-", point: 3.75 };
  if (score >= 75) return { letter: "B+", point: 3.5 };
  if (score >= 70) return { letter: "B", point: 3.0 };
  if (score >= 65) return { letter: "B-", point: 2.75 };
  if (score >= 60) return { letter: "C+", point: 2.5 };
  if (score >= 50) return { letter: "C", point: 2.0 };
  if (score >= 45) return { letter: "C-", point: 1.75 };
  if (score >= 40) return { letter: "D", point: 1.0 };
  if (score >= 30) return { letter: "FX", point: 0.0 };
  return { letter: "F", point: 0.0 };
}

function getGradeByPoint(score) {
  if (score > 4.0) return { letter: "A+", point: 4.0 };
  if (score >= 4.0) return { letter: "A", point: 4.0 };
  if (score >= 3.75) return { letter: "A-", point: 3.75 };
  if (score >= 3.5) return { letter: "B+", point: 3.5 };
  if (score >= 3.0) return { letter: "B", point: 3.0 };
  if (score >= 2.75) return { letter: "B-", point: 2.75 };
  if (score >= 2.5) return { letter: "C+", point: 2.5 };
  if (score >= 2.0) return { letter: "C", point: 2.0 };
  if (score >= 1.75) return { letter: "C-", point: 1.75 };
  if (score >= 1.0) return { letter: "D", point: 1.0 };
  if (score >= 0.0) return { letter: "FX", point: 0.0 };
  return { letter: "F", point: 0.0 };
}

let userStates = {};
const sessions = {};

const calculatecGPA = (gpas_arr, userId) => {
  let usercGPA = {};

  let cGpa = parseFloat((gpas_arr[0] * 30 + gpas_arr[1] * 33) / (30 + 33));
  usercGPA[userId] = { cGpa };
  return usercGPA[userId].cGpa.toFixed(2);
};

async function generateQRCode(verificationData) {
  return new Promise((resolve, reject) => {
    const qrPath = path.join(__dirname, `qr_${Date.now()}.png`);
    QRCode.toFile(
      qrPath,
      verificationData,
      {
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
        width: 150,
        margin: 1,
      },
      (err) => {
        if (err) reject(err);
        else resolve(qrPath);
      }
    );
  });
}

async function generateGpaPdf(chatId, session, gpa, userFullName) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 50,
        size: "A4",
        info: {
          Title: "GPA Report",
          Author: "Jimma University",
          Subject: `GPA Report for ${userFullName}`,
        },
      });

      const filePath = path.join(__dirname, `gpa_${chatId}_${Date.now()}.pdf`);
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // Generate verification data for QR code
      const verificationData = JSON.stringify({
        student: userFullName,
        gpa: gpa.toFixed(2),
        date: new Date().toISOString(),
        verificationId: `JIU-${Math.random()
          .toString(36)
          .substring(2, 10)
          .toUpperCase()}`,
      });

      // Generate QR code
      const qrPath = await generateQRCode(verificationData);

      // Add background color
      doc.rect(0, 0, doc.page.width, 120).fill("#1a365d"); // Dark blue header

      // Add logo if exists
      const logoPath = path.join(__dirname, "logo.png");
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 35, { width: 50 });
      }

      // Header text
      doc.fillColor("white").fontSize(20).text("Jimma University", 110, 40);

      // Warning text
      doc
        .fillColor("#e53e3e")
        .fontSize(8)
        .text(
          "THIS IS NOT AN OFFICIAL GRADE REPORT: FOR EDUCATIONAL PURPOSES ONLY",
          50,
          100,
          { align: "center" }
        );

      // Reset color for main content
      doc.fillColor("black");

      // Title
      doc.fontSize(16).text("GPA Result Report", 50, 140, { align: "center" });

      // Student info section
      doc.rect(50, 170, doc.page.width - 80, 60).fill("#ebf8ff");

      doc
        .fillColor("black")
        .fontSize(12)
        .text(`Student: ${userFullName}`, 60, 185);

      doc.text(`Date: ${new Date().toLocaleDateString()}`, 60, 205);

      doc.text(`GPA: ${gpa.toFixed(2)}    `, 350, 185, { align: "right" });

      doc.text(
        `Verification ID: ${JSON.parse(verificationData).verificationId}    `,
        350,
        205,
        { align: "right" }
      );

      // Table header
      const startX = 50;
      let y = 250;

      const colWidths = {
        course: 270,
        credit: 50,
        score: 50,
        grade: 50,
        point: 50,
      };

      // Table header with background
      doc.rect(startX, y, colWidths.course, 20).fill("#e6fffa");
      doc
        .rect(startX + colWidths.course, y, colWidths.credit, 20)
        .fill("#e6fffa");
      doc
        .rect(
          startX + colWidths.course + colWidths.credit,
          y,
          colWidths.score,
          20
        )
        .fill("#e6fffa");
      doc
        .rect(
          startX + colWidths.course + colWidths.credit + colWidths.score,
          y,
          colWidths.grade,
          20
        )
        .fill("#e6fffa");
      doc
        .rect(
          startX +
            colWidths.course +
            colWidths.credit +
            colWidths.score +
            colWidths.grade,
          y,
          colWidths.point,
          20
        )
        .fill("#e6fffa");

      doc.font("Helvetica-Bold").fontSize(10);
      doc.fillColor("black");
      doc.text("Course", startX + 5, y + 5);
      doc.text("ECTS", startX + colWidths.course + 5, y + 5);
      doc.text(
        "Score",
        startX + colWidths.course + colWidths.credit + 5,
        y + 5
      );
      doc.text(
        "Grade",
        startX + colWidths.course + colWidths.credit + colWidths.score + 5,
        y + 5
      );
      doc.text(
        "Point",
        startX +
          colWidths.course +
          colWidths.credit +
          colWidths.score +
          colWidths.grade +
          5,
        y + 5
      );

      y += 20;

      // Draw header bottom border
      doc
        .moveTo(startX, y)
        .lineTo(
          startX +
            colWidths.course +
            colWidths.credit +
            colWidths.score +
            colWidths.grade +
            colWidths.point,
          y
        )
        .stroke();

      let totalWeighted = 0,
        totalCredits = 0;

      doc.font("Helvetica").fontSize(9);

      // Table rows with alternating background
      session.scores.forEach((score, i) => {
        const { letter, point } = getGrade(score);
        const course = courses[i];
        const weighted = point * course.credit;
        totalWeighted += weighted;
        totalCredits += course.credit;

        // Alternate row background
        if (i % 2 === 0) {
          doc
            .rect(
              startX,
              y,
              colWidths.course +
                colWidths.credit +
                colWidths.score +
                colWidths.grade +
                colWidths.point,
              18
            )
            .fill("#f7fafc");
        }

        doc.fillColor("black");
        doc.text(
          course.name.substring(0, 30) + (course.name.length > 30 ? "..." : ""),
          startX + 5,
          y + 5
        );
        doc.text(
          course.credit.toString(),
          startX + colWidths.course + 5,
          y + 5
        );
        doc.text(
          score.toString(),
          startX + colWidths.course + colWidths.credit + 5,
          y + 5
        );
        doc.text(
          letter,
          startX + colWidths.course + colWidths.credit + colWidths.score + 5,
          y + 5
        );
        doc.text(
          point.toFixed(1),
          startX +
            colWidths.course +
            colWidths.credit +
            colWidths.score +
            colWidths.grade +
            5,
          y + 5
        );

        y += 18;

        // Draw row border
        doc
          .moveTo(startX, y)
          .lineTo(
            startX +
              colWidths.course +
              colWidths.credit +
              colWidths.score +
              colWidths.grade +
              colWidths.point,
            y
          )
          .strokeColor("#e2e8f0")
          .stroke();
      });

      // Summary section
      y += 20;
      doc.rect(startX, y, 200, 60).fill("#f0fff4"); // Light green background

      doc.font("Helvetica-Bold").fontSize(12);
      doc.fillColor("black");
      doc.text("Summary", startX + 10, y + 10);

      doc.font("Helvetica").fontSize(10);
      doc.text(`Total Credits: ${totalCredits}`, startX + 10, y + 30);

      // Add QR code for verification
      doc.image(qrPath, 350, y, { width: 80 });
      doc
        .fontSize(8)
        .text("Scan to verify", 350, y + 85, { width: 80, align: "center" });

      doc.end();

      stream.on("finish", () => {
        fs.unlinkSync(qrPath); // Clean up QR code image
        console.log(`PDF generated successfully`);
        resolve(filePath);
      });

      stream.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
}

// CGPA PDF Generation Function
async function generatecGpaPdf(chatId, semesters, cgpa, userFullName) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 50,
        size: "A4",
        info: {
          Title: "CGPA Report",
          Author: "Jimma University",
          Subject: `CGPA Report for ${userFullName}`,
        },
      });

      const filePath = path.join(__dirname, `cgpa_${chatId}_${Date.now()}.pdf`);
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // Generate verification data for QR code
      const verificationData = JSON.stringify({
        student: userFullName,
        cgpa,
        date: new Date().toISOString(),
        verificationId: `JIU-${Math.random()
          .toString(36)
          .substring(2, 10)
          .toUpperCase()}`,
      });

      // Generate QR code
      const qrPath = await generateQRCode(verificationData);

      // Add background color
      doc.rect(0, 0, doc.page.width, 120).fill("#1a365d"); // Dark blue header

      // Add logo if exists
      const logoPath = path.join(__dirname, "logo.png");
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 35, { width: 50 });
      }

      // Header text
      doc.fillColor("white").fontSize(20).text("Jimma University", 110, 40);

      // Warning text
      doc
        .fillColor("#e53e3e")
        .fontSize(8)
        .text(
          "THIS IS NOT AN OFFICIAL GRADE REPORT: FOR EDUCATIONAL PURPOSES ONLY",
          50,
          100,
          { align: "center" }
        );

      // Reset color for main content
      doc.fillColor("black");

      // Title
      doc.fontSize(16).text("CGPA Result Report", 50, 140, { align: "center" });

      // Student info section
      doc.rect(50, 170, doc.page.width - 100, 60).fill("#ebf8ff"); // Light blue background

      doc
        .fillColor("black")
        .fontSize(12)
        .text(`Student: ${userFullName}`, 60, 185);

      doc.text(`Date: ${new Date().toLocaleDateString()}`, 60, 205);

      doc.text(`CGPA: ${cgpa}`, 350, 185, { align: "right" });

      doc.text(
        `Verification ID: ${JSON.parse(verificationData).verificationId}`,
        350,
        205,
        { align: "right" }
      );

      // Table header
      const startX = 50;
      let y = 250;

      const colWidths = {
        semester: 250,
        credits: 80,
        gpa: 80,
      };

      // Table header with background
      doc.rect(startX, y, colWidths.semester, 20).fill("#e6fffa");
      doc
        .rect(startX + colWidths.semester, y, colWidths.credits, 20)
        .fill("#e6fffa");
      doc
        .rect(
          startX + colWidths.semester + colWidths.credits,
          y,
          colWidths.gpa,
          20
        )
        .fill("#e6fffa");
      doc
        .rect(
          startX + colWidths.semester + colWidths.credits + colWidths.gpa,
          y,

          20
        )
        .fill("#e6fffa");

      doc.font("Helvetica-Bold").fontSize(10);
      doc.fillColor("black");
      doc.text("Semester", startX + 5, y + 5);
      doc.text("Credits", startX + colWidths.semester + 5, y + 5);
      doc.text(
        "GPA",
        startX + colWidths.semester + colWidths.credits + 5,
        y + 5
      );

      y += 20;

      // Draw header bottom border
      doc
        .moveTo(startX, y)
        .lineTo(
          startX + colWidths.semester + colWidths.credits + colWidths.gpa + y
        )
        .stroke();

      let totalCredits = 0;

      doc.font("Helvetica").fontSize(10);

      // Table rows with alternating background
      semesters.forEach((semester, i) => {
        const semesterPoints = semester.gpa * semester.credits;
        totalCredits += semester.credits;

        // Alternate row background
        if (i % 2 === 0) {
          doc
            .rect(
              startX,
              y,
              colWidths.semester + colWidths.credits + colWidths.gpa,
              18
            )
            .fill("#f7fafc");
        }

        doc.fillColor("black");
        doc.text(semester.semester, startX + 5, y + 5);
        doc.text(
          semester.credits.toString(),
          startX + colWidths.semester + 5,
          y + 5
        );
        doc.text(
          semester.gpa.toFixed(2),
          startX + colWidths.semester + colWidths.credits + 5,
          y + 5
        );
        doc.text(
          semesterPoints.toFixed(2),
          startX + colWidths.semester + colWidths.credits + colWidths.gpa + 5,
          y + 5
        );

        y += 18;

        // Draw row border
        doc
          .moveTo(startX, y)
          .lineTo(
            startX + colWidths.semester + colWidths.credits + colWidths.gpa,
            y
          )
          .strokeColor("#e2e8f0")
          .stroke();
      });

      // Summary section
      y += 20;
      doc.rect(startX, y, 250, 80).fill("#f0fff4"); // Light green background

      doc.font("Helvetica-Bold").fontSize(12);
      doc.fillColor("black");
      doc.text("CGPA Summary", startX + 10, y + 10);

      doc.font("Helvetica").fontSize(10);
      doc.text(`Total Credits: ${totalCredits}`, startX + 10, y + 30);
      doc.text(`Cumulative GPA: ${cgpa}`, startX + 10, y + 60);

      // Add QR code for verification
      doc.image(qrPath, 350, y, { width: 80 });
      doc
        .fontSize(8)
        .text("Scan to verify", 350, y + 85, { width: 80, align: "center" });

      // Footer
      y = doc.page.height - 50;
      doc.rect(0, y, doc.page.width, 50).fill("#edf2f7");

      doc.end();

      stream.on("finish", () => {
        fs.unlinkSync(qrPath); // Clean up QR code image
        console.log(`CGPA PDF generated successfully`);
        resolve(filePath);
      });

      stream.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
}

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
        point: grade.point,
      };
    }),
  });
}

function replaceMacros(message, macros = {}) {
  let processedMessage = message;

  for (const [key, value] of Object.entries(macros)) {
    const regex = new RegExp(`{{${key}}}`, "gi");
    processedMessage = processedMessage.replace(regex, value);
  }

  return processedMessage;
}

bot.use(async (ctx, next) => {
  if (ctx.from) {
    const chatId = ctx.from.id;
    try {
      await usersRef.doc(chatId.toString()).set(
        {
          id: chatId,
          username: ctx.from.username || null,
          firstName: ctx.from.first_name || "",
          lastName: ctx.from.last_name || "",
          lastActivity: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error("Error updating user activity:", error);
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
        `🆕 New user:\n👤 ${user.first_name} ${
          user.last_name || ""
        }\n🆔 ${chatId}\n📛 @${user.username || "N/A"}`
      );
    } catch (err) {
      console.error("Error notifying admin:", err);
    }
  }
  await ctx.reply(
    "📘 Welcome to GPA Calculator!",
    Markup.keyboard([
      ["🎓 Calculate GPA", "[NEW] Calculate cGPA"],
      ["📜 My History"],
      ["📢 About", "📬 Broadcast (Admin)"],
    ]).resize()
  );
});

bot.help((ctx) => {
  return ctx.reply(
    `This bot is developed by Amenadam Solomon\nGitHub: https://github.com/amenadam \nBot version: ${botVersion}`
  );
});

bot.hears("[NEW] Calculate cGPA", (ctx) => {
  const chatId = ctx.chat.id;
  userStates[chatId] = { status: "calculating_cGPA", index: 0, gpas: [] };
  return ctx.reply("Enter first semester GPA");
});

bot.hears("🎓 Calculate GPA", (ctx) => {
  const chatId = ctx.chat.id;
  sessions[chatId] = { index: 0, scores: [] };
  return ctx.reply(`Send your score for: ${courses[0].name}`);
});

bot.hears("📜 My History", async (ctx) => {
  const chatId = ctx.chat.id;
  const snapshot = await logsRef
    .where("userId", "==", chatId)
    .orderBy("timestamp", "desc")
    .limit(5)
    .get();

  if (snapshot.empty) return ctx.reply("📭 No GPA history found.");

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const date = new Date(data.timestamp).toLocaleString();
    const gpa = data.gpa;
    const docId = doc.id;

    const message = `📅 ${date}\n🎯 GPA: *${gpa}*\nTap below to view full details.`;

    await ctx.replyWithMarkdown(
      message,
      Markup.inlineKeyboard([
        Markup.button.callback("🔍 View Details", `viewlog_${docId}`),
      ])
    );
  }
});

bot.hears("📢 About", (ctx) => {
  return ctx.reply(
    "This bot is developed by Amenadam Solomon\nGitHub: https://github.com/amenadam"
  );
});

bot.hears("logs", async (ctx) => {
  const chatId = ctx.chat.id.toString();
  if (chatId !== ADMIN_ID) {
    return ctx.reply("🚫 You are not authorized to access logs.");
  }

  try {
    const snapshot = await logsRef.orderBy("timestamp", "desc").limit(10).get();

    if (snapshot.empty) {
      return ctx.reply("📭 No logs found.");
    }

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const date = new Date(data.timestamp).toLocaleString();
      const gpa = data.gpa;
      const userId = data.userId;
      const docId = doc.id;

      const message = `🧾 Log for 🧑‍🎓 ID: ${userId}\n📅 ${date}\n🎯 GPA: *${gpa}*\nTap below to view full details.`;

      await ctx.replyWithMarkdown(
        message,
        Markup.inlineKeyboard([
          Markup.button.callback("🔍 View Details", `viewlog_${docId}`),
        ])
      );
    }
  } catch (err) {
    console.error("Error fetching logs:", err);
    await ctx.reply("⚠️ Error retrieving logs.");
  }
});

bot.on("callback_query", async (ctx) => {
  const chatId = ctx.chat.id.toString();
  const callbackData = ctx.callbackQuery.data;

  if (!callbackData.startsWith("viewlog_")) {
    return ctx.answerCbQuery();
  }

  const docId = callbackData.split("_")[1];

  try {
    const doc = await logsRef.doc(docId).get();

    if (!doc.exists) {
      return ctx.answerCbQuery("❌ Log not found");
    }

    const data = doc.data();
    const date = new Date(data.timestamp).toLocaleString();
    const gpa = data.gpa;
    const userId = data.userId.toString();
    const results = data.results;

    if (chatId !== ADMIN_ID && chatId !== userId) {
      return ctx.answerCbQuery("🚫 You are not authorized to view this log");
    }

    let message = `📘 *Detailed GPA Log*\n🧑‍🎓 User ID: ${userId}\n📅 Date: ${date}\n🎯 GPA: *${gpa}*\n\n`;

    results.forEach((r, i) => {
      message += `${i + 1}. ${r.course}\nScore: ${r.score} → ${r.grade} (${
        r.point
      }) x ${r.credit}\n\n`;
    });

    await ctx.answerCbQuery();
    await ctx.replyWithMarkdown(message);
  } catch (err) {
    console.error("Error fetching log details:", err);
    await ctx.answerCbQuery("⚠️ Error retrieving details");
  }
});

bot.hears("📬 Broadcast (Admin)", async (ctx) => {
  const chatId = ctx.chat.id;
  if (chatId.toString() !== ADMIN_ID) return ctx.reply("🚫 Not authorized.");

  const macroList = `
📨 Send your broadcast message with these macros:

• {{VERSION}} - Bot version (${botVersion})
• {{DATE}} - Current date
• {{TIME}} - Current time  
• {{DATETIME}} - Date and time
• {{BOT_NAME}} - Bot's name
• {{ADMIN}} - Your name

Example: "Hello! This is {{BOT_NAME}} v{{VERSION}} sending a message on {{DATETIME}}"
  `.trim();

  ctx.reply(macroList);
  sessions[chatId] = { mode: "broadcast" };
});

bot.on("text", async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();

  // Handle cGPA calculation first
  if (userStates[chatId] && userStates[chatId].status === "calculating_cGPA") {
    const state = userStates[chatId];
    const userFullName = `${ctx.from.first_name || ""} ${
      ctx.from.last_name || ""
    }`.trim();
    if (state.index === 0) {
      const gpa = parseFloat(text);
      if (isNaN(gpa) || gpa < 0 || gpa > 4.0) {
        return ctx.reply("❌ Enter a valid GPA (0.0-4.0)");
      }
      state.gpas.push(gpa);
      state.index = 1;
      return ctx.reply("Enter second semester GPA");
    } else if (state.index === 1) {
      const gpa = parseFloat(text);

      if (isNaN(gpa) || gpa < 0 || gpa > 4.0) {
        return ctx.reply("❌ Enter a valid GPA (0.0-4.0)");
      }
      state.gpas.push(gpa);
      const finalCgpa = calculatecGPA(state.gpas, chatId);
      const SemesterData = [
        { semester: "First Semester", gpa: state.gpas[0], credits: 30 },
        { semester: "Second Semester", gpa: state.gpas[1], credits: 33 },
      ];
      const { letter } = getGradeByPoint(finalCgpa);
      await ctx.reply(`Your cGPA is: ${finalCgpa} \nGrade: ${letter}`);
      delete userStates[chatId];
      const pdfPath = await generatecGpaPdf(
        chatId,
        SemesterData,
        finalCgpa,
        userFullName
      );
      try {
        await ctx.replyWithDocument({
          source: pdfPath,
          filename: `cGPA_Result_${userFullName.replace(/\s+/g, "_")}.pdf`,
        });

        fs.unlinkSync(pdfPath);
      } catch (err) {
        console.error("PDF generation error:", err);
        await ctx.reply(
          "⚠️ Error generating PDF. Here are your results:\n\n" + resultText
        );
      } finally {
        delete sessions[chatId];
      }

      return;
    }
  }

  const session = sessions[chatId];
  if (!session) return;

  if (session.mode === "broadcast") {
    const macros = {
      VERSION: botVersion,
      DATE: new Date().toLocaleDateString(),
      TIME: new Date().toLocaleTimeString(),
      DATETIME: new Date().toLocaleString(),
      BOT_NAME: ctx.botInfo.first_name,
      ADMIN: ctx.from.first_name || "Admin",
    };

    const broadcastMessage = replaceMacros(text, macros);

    const logsSnapshot = await logsRef.get();
    const uniqueUserIds = new Set();

    logsSnapshot.forEach((doc) => {
      uniqueUserIds.add(doc.data().userId);
    });

    let success = 0,
      failed = 0;
    const userIds = Array.from(uniqueUserIds);

    for (const userId of userIds) {
      try {
        await ctx.telegram.sendMessage(userId, broadcastMessage);
        success++;
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (err) {
        console.error(`Failed to send to ${userId}:`, err.message);
        failed++;
      }
    }

    await ctx.reply(
      `📊 Broadcast Results:\n✅ Sent: ${success}\n❌ Failed: ${failed}`
    );

    delete sessions[chatId];
    return;
  }

  // Handle GPA calculation
  const score = parseFloat(text);
  if (isNaN(score) || score < 0 || score > 100) {
    return ctx.reply("❌ Enter a valid score (0-100)");
  }

  session.scores.push(score);
  session.index++;

  if (session.index < courses.length) {
    return ctx.reply(`Next score for: ${courses[session.index].name}`);
  }

  let totalWeighted = 0,
    totalCredits = 0;
  let resultText = "📊 GPA Results:\n\n";

  session.scores.forEach((score, i) => {
    const { letter, point } = getGrade(score);
    const course = courses[i];
    const weighted = point * course.credit;
    totalWeighted += weighted;
    totalCredits += course.credit;
    resultText += `${course.name}: ${score} → ${letter} (${point}) x ${
      course.credit
    } = ${weighted.toFixed(2)}\n`;
  });

  const gpa = totalWeighted / totalCredits;
  await logUserCalculation(chatId, session, gpa);

  const userFullName = `${ctx.from.first_name || ""} ${
    ctx.from.last_name || ""
  }`.trim();

  try {
    await ctx.reply(
      `${resultText}\n🎯 Final GPA: ${gpa.toFixed(
        2
      )}\n\n📄 Generating PDF report...`
    );

    const pdfPath = await generateGpaPdf(chatId, session, gpa, userFullName);
    await ctx.replyWithDocument({
      source: pdfPath,
      filename: `GPA_Result_${userFullName.replace(/\s+/g, "_")}.pdf`,
    });

    fs.unlinkSync(pdfPath);
  } catch (err) {
    console.error("PDF generation error:", err);
    await ctx.reply(
      "⚠️ Error generating PDF. Here are your results:\n\n" + resultText
    );
  } finally {
    delete sessions[chatId];
  }
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    bot: true,
  });
});

app.get("/", (req, res) => {
  res.send("Bot is running");
});

app.get("/logs", async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Unauthorized: Missing Bearer token" });
  }

  const token = authHeader.split(" ")[1];

  if (token !== ADMIN_ID) {
    return res.status(403).json({ error: "Forbidden: Invalid token" });
  }

  try {
    const snapshot = await logsRef
      .orderBy("timestamp", "desc")
      .limit(100)
      .get();
    const logs = [];

    snapshot.forEach((doc) => {
      logs.push({ id: doc.id, ...doc.data() });
    });

    return res.status(200).json({
      count: logs.length,
      logs,
    });
  } catch (err) {
    console.error("Error fetching logs:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

const startServers = async () => {
  try {
    app.listen(port, () => console.log(`Web server on port ${port}`));
    await bot.launch();
    console.log("🤖 Bot is running");

    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1
    );
    const msUntilMidnight = nextMidnight - now;
    setTimeout(() => {
      console.log("🔄 Restarting bot at midnight");
      process.exit(0);
    }, msUntilMidnight);

    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
  } catch (err) {
    console.error("Startup error:", err);
    process.exit(1);
  }
};

startServers();
