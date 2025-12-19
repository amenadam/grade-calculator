require("dotenv").config();
const express = require("express");
const { Telegraf, Markup } = require("telegraf");
const admin = require("firebase-admin");
//const PDFDocument = require("pdfkit");
//const fs = require("fs");
//const path = require("path");
//const QRCode = require("qrcode");

const { version } = require("./package.json");
const botVersion = version;
const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

// Manual CORS middleware
app.use((req, res, next) => {
  const allowedOrigins = [
    "https://amenadamsolomon.rf.gd",
    "https://telegram.org",
    "http://localhost:3000",
  ];
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  next();
});

app.use(express.json());

// Initialize Firebase
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

const firstSemesterNaturalCourses = [
  { name: "Communicative English Language Skills I (FLEn. 1011)", credit: 3 },
  { name: "General Physics (Phys. 1011)", credit: 3 },
  { name: "General Psychology (Psyc. 1011)", credit: 3 },
  { name: "Mathematics For Natural Sciences (Math. 1011)", credit: 3 },
  { name: "Critical Thinking (LoCT. 1011)", credit: 3 },
  { name: "Geography of Ethiopia and The Horn (GeES 1011)", credit: 3 },
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
/*
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

      // Generate verification ID
      const verificationId = `JIU-${Math.random()
        .toString(36)
        .substring(2, 10)
        .toUpperCase()}`;

      // Generate QR code
      const qrPath = await generateQRCode(verificationId);

      // Add background color
      doc.rect(0, 0, doc.page.width, 120).fill("#1a365d");

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
      doc.text(`Verification ID: ${verificationId}    `, 350, 205, {
        align: "right",
      });

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

      // Table rows
      session.scores.forEach((score, i) => {
        const { letter, point } = getGrade(score);
        const course = courses[i];
        const weighted = point * course.credit;
        totalWeighted += weighted;
        totalCredits += course.credit;

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
      doc.rect(startX, y, 200, 60).fill("#f0fff4");
      doc.font("Helvetica-Bold").fontSize(12);
      doc.fillColor("black");
      doc.text("Summary", startX + 10, y + 10);
      doc.font("Helvetica").fontSize(10);
      doc.text(`Total Credits: ${totalCredits}`, startX + 10, y + 30);

      // Add QR code
      doc.image(qrPath, 350, y, { width: 80 });
      doc
        .fontSize(8)
        .text("Scan to verify", 350, y + 85, { width: 80, align: "center" });

      doc.end();

      stream.on("finish", () => {
        fs.unlinkSync(qrPath);
        resolve(filePath);
      });

      stream.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
}

async function generateGpaPdfFirst(chatId, session, gpa, userFullName) {
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

      // Generate verification ID
      const verificationId = `JIU-${Math.random()
        .toString(36)
        .substring(2, 10)
        .toUpperCase()}`;

      // Generate QR code
      const qrPath = await generateQRCode(verificationId);

      // Add background color
      doc.rect(0, 0, doc.page.width, 120).fill("#1a365d");

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
      doc.text(`Verification ID: ${verificationId}    `, 350, 205, {
        align: "right",
      });

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

      // Table rows
      session.scores.forEach((score, i) => {
        const { letter, point } = getGrade(score);
        const course = firstSemesterNaturalCourses[i];
        const weighted = point * course.credit;
        totalWeighted += weighted;
        totalCredits += course.credit;

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
      doc.rect(startX, y, 200, 60).fill("#f0fff4");
      doc.font("Helvetica-Bold").fontSize(12);
      doc.fillColor("black");
      doc.text("Summary", startX + 10, y + 10);
      doc.font("Helvetica").fontSize(10);
      doc.text(`Total Credits: ${totalCredits}`, startX + 10, y + 30);

      // Add QR code
      doc.image(qrPath, 350, y, { width: 80 });
      doc
        .fontSize(8)
        .text("Scan to verify", 350, y + 85, { width: 80, align: "center" });

      doc.end();

      stream.on("finish", () => {
        fs.unlinkSync(qrPath);
        resolve(filePath);
      });

      stream.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
} 

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

      // Generate verification ID
      const verificationId = `JIU-${Math.random()
        .toString(36)
        .substring(2, 10)
        .toUpperCase()}`;

      // Generate QR code
      const qrPath = await generateQRCode(verificationId);

      // Add background color
      doc.rect(0, 0, doc.page.width, 120).fill("#1a365d");

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
      doc.rect(50, 170, doc.page.width - 100, 60).fill("#ebf8ff");

      doc
        .fillColor("black")
        .fontSize(12)
        .text(`Student: ${userFullName}`, 60, 185);
      doc.text(`Date: ${new Date().toLocaleDateString()}`, 60, 205);
      doc.text(`CGPA: ${cgpa}`, 350, 185, { align: "right" });
      doc.text(`Verification ID: ${verificationId}`, 350, 205, {
        align: "right",
      });

      // Table header
      const startX = 50;
      let y = 250;

      const colWidths = {
        semester: 300,
        credits: 100,
        gpa: 100,
      };

      const totalTableWidth =
        colWidths.semester + colWidths.credits + colWidths.gpa;

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
        .lineTo(startX + totalTableWidth, y)
        .stroke();

      let totalCredits = 0;
      doc.font("Helvetica").fontSize(10);

      // Table rows
      semesters.forEach((semester, i) => {
        totalCredits += semester.credits;

        if (i % 2 === 0) {
          doc.rect(startX, y, totalTableWidth, 18).fill("#f7fafc");
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

        y += 18;
        doc
          .moveTo(startX, y)
          .lineTo(startX + totalTableWidth, y)
          .strokeColor("#e2e8f0")
          .stroke();
      });

      // Summary section
      y += 20;
      doc.rect(startX, y, 250, 80).fill("#f0fff4");
      doc.font("Helvetica-Bold").fontSize(12);
      doc.fillColor("black");
      doc.text("CGPA Summary", startX + 10, y + 10);
      doc.font("Helvetica").fontSize(10);
      doc.text(`Total Credits: ${totalCredits}`, startX + 10, y + 30);
      doc.text(`Cumulative GPA: ${cgpa}`, startX + 10, y + 60);

      // Add QR code
      doc.image(qrPath, 350, y, { width: 80 });
      doc
        .fontSize(8)
        .text("Scan to verify", 350, y + 85, { width: 80, align: "center" });

      // Footer
      y = doc.page.height - 50;
      doc.rect(0, y, doc.page.width, 50).fill("#edf2f7");

      doc.end();

      stream.on("finish", () => {
        fs.unlinkSync(qrPath);
        resolve(filePath);
      });

      stream.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
}

*/
async function logUserCalculation(chatId, data, gpa, type = "GPA") {
  const verificationId = `JIU-${Math.random()
    .toString(36)
    .substring(2, 10)
    .toUpperCase()}`;

  // Extract user information based on whether it's from session or userState
  const studentName =
    data.userFirstName && data.userLastName
      ? `${data.userFirstName || ""} ${data.userLastName || ""}`.trim()
      : "Unknown Student";

  const logData = {
    userId: chatId,
    studentName,
    timestamp: new Date().toISOString(),
    gpa: parseFloat(gpa).toFixed(2),
    verificationId,
    type,
  };

  // Only add results for GPA calculations (not cGPA)
  if (type === "GPA" && data.scores) {
    logData.results = data.scores.map((score, i) => {
      const grade = getGrade(score);
      return {
        course: courses[i].name,
        credit: courses[i].credit,
        score,
        grade: grade.letter,
        point: grade.point,
      };
    });
  } else if (type === "CGPA" && data.gpas) {
    // For cGPA, store the semester GPAs instead
    logData.semesterGpas = data.gpas;
  }

  await logsRef.add(logData);

  return verificationId;
}

function replaceMacros(message, macros = {}) {
  let processedMessage = message;
  for (const [key, value] of Object.entries(macros)) {
    const regex = new RegExp(`{{${key}}}`, "gi");
    processedMessage = processedMessage.replace(regex, value);
  }
  return processedMessage;
}

// Bot middleware
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

// Bot commands and handlers
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
      ["🎓 Calculate 1st Sem. GPA", "🎓 Calculate 2nd Sem. GPA"],
      ["[NEW] Calculate cGPA"],
      ["📜 My History", "🔍 Verify Result"],
      ["📢 About"],
    ]).resize()
  );
});

bot.help((ctx) => {
  return ctx.reply(
    `Disclaimer:
This calculator is for estimation purposes only. The official GPA and CGPA will be determined and published by the University Registrar's office. While we strive for accuracy, always refer to your official transcript for final grades.

Bot version: ${botVersion}

Powered by @JUStudentsNetwork`
  );
});

bot.hears("🔍 Verify Result", (ctx) => {
  const miniAppUrl = `https://amenadamsolomon.rf.gd/verify.html`;
  return ctx.reply(
    "Verify your GPA results:",
    Markup.inlineKeyboard([
      Markup.button.webApp("🔍 Open Verifier", miniAppUrl),
    ])
  );
});

bot.hears("[NEW] Calculate cGPA", (ctx) => {
  const chatId = ctx.chat.id;
  userStates[chatId] = {
    status: "calculating_cGPA",
    index: 0,
    gpas: [],
    userFirstName: ctx.from.first_name || "",
    userLastName: ctx.from.last_name || "",
  };
  return ctx.reply("Enter first semester GPA:");
});

bot.hears("🎓 Calculate 2nd Sem. GPA", (ctx) => {
  const chatId = ctx.chat.id;
  userStates[chatId] = {
    status: "calculating_second",
    index: 0,
    scores: [],
    userFirstName: ctx.from.first_name || "",
    userLastName: ctx.from.last_name || "",
  };
  sessions[chatId] = {
    index: 0,
    scores: [],
    userFirstName: ctx.from.first_name || "",
    userLastName: ctx.from.last_name || "",
  };
  return ctx.reply(`Send your score for: ${courses[0].name}`);
});

bot.hears("🎓 Calculate 1st Sem. GPA", (ctx) => {
  const chatId = ctx.chat.id;
  userStates[chatId] = {
    status: "calculating_first",
    index: 0,
    scores: [],
    userFirstName: ctx.from.first_name || "",
    userLastName: ctx.from.last_name || "",
  };
  sessions[chatId] = {
    index: 0,
    scores: [],
    userFirstName: ctx.from.first_name || "",
    userLastName: ctx.from.last_name || "",
  };
  return ctx.reply(
    `Send your score for: ${firstSemesterNaturalCourses[0].name}`
  );
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

    await ctx.replyWithMarkdown(
      `📅 ${date}\n🎯 GPA: *${gpa}*`,
      Markup.inlineKeyboard([
        Markup.button.callback("🔍 View Details", `viewlog_${docId}`),
      ])
    );
  }
});

bot.hears("📢 About", (ctx) => {
  return ctx.reply(
    `Disclaimer:
This calculator is for estimation purposes only. The official GPA and CGPA will be determined and published by the University Registrar's office. While we strive for accuracy, always refer to your official transcript for final grades.

Bot version: ${botVersion}

Powered by @JUStudentsNetwork`
  );
});

bot.hears("logs", async (ctx) => {
  const chatId = ctx.chat.id.toString();
  if (chatId !== ADMIN_ID)
    return ctx.reply("🚫 You are not authorized to access logs.");

  try {
    const snapshot = await logsRef.orderBy("timestamp", "desc").limit(10).get();
    if (snapshot.empty) return ctx.reply("📭 No logs found.");

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const date = new Date(data.timestamp).toLocaleString();
      const gpa = data.gpa;
      const userId = data.userId;
      const docId = doc.id;

      await ctx.replyWithMarkdown(
        `🧾 Log for 🧑‍🎓 ID: ${userId}\n📅 ${date}\n🎯 GPA: *${gpa}*`,
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
  const callbackData = ctx.callbackQuery.data;
  if (!callbackData.startsWith("viewlog_")) return ctx.answerCbQuery();

  const docId = callbackData.split("_")[1];
  try {
    const doc = await logsRef.doc(docId).get();
    if (!doc.exists) return ctx.answerCbQuery("❌ Log not found");

    const data = doc.data();
    const date = new Date(data.timestamp).toLocaleString();
    const gpa = data.gpa;
    const userId = data.userId.toString();
    const results = data.results;

    if (
      ctx.chat.id.toString() !== ADMIN_ID &&
      ctx.chat.id.toString() !== userId
    ) {
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

bot.hears("broadcast", async (ctx) => {
  const chatId = ctx.chat.id;
  if (chatId.toString() !== ADMIN_ID) return ctx.reply("🚫 Not authorized.");

  const macroList = `📨 Send your broadcast message with these macros:\n\n• {{VERSION}} - Bot version (${botVersion})\n• {{DATE}} - Current date\n• {{TIME}} - Current time\n• {{DATETIME}} - Date and time\n• {{BOT_NAME}} - Bot's name\n• {{ADMIN}} - Your name\n\nExample: "Hello! This is {{BOT_NAME}} v{{VERSION}} sending a message on {{DATETIME}}"`;
  ctx.reply(macroList);
  sessions[chatId] = { mode: "broadcast" };
  userStates[chatId] = {
    status: "broadcast",
  };
});

bot.on("text", async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();
  const session = sessions[chatId];

  // Handle cGPA calculation
  if (userStates[chatId] && userStates[chatId].status === "calculating_cGPA") {
    const state = userStates[chatId];
    const userFullName = `${ctx.from.first_name || ""} ${
      ctx.from.last_name || ""
    }`.trim();

    if (state.index === 0) {
      const gpa = parseFloat(text);
      if (isNaN(gpa) || gpa < 0 || gpa > 4.0)
        return ctx.reply("❌ Enter a valid GPA (0.0-4.0)");
      state.gpas.push(gpa);
      state.index = 1;
      return ctx.reply("Enter second semester GPA:");
    } else if (state.index === 1) {
      const gpa = parseFloat(text);
      if (isNaN(gpa) || gpa < 0 || gpa > 4.0)
        return ctx.reply("❌ Enter a valid GPA (0.0-4.0)");

      state.gpas.push(gpa);
      const finalCgpa = calculatecGPA(state.gpas, chatId);
      const { letter } = getGradeByPoint(finalCgpa);
      const SemesterData = [
        { semester: "First Semester", gpa: state.gpas[0], credits: 30 },
        { semester: "Second Semester", gpa: state.gpas[1], credits: 33 },
      ];

      const verificationId = await logUserCalculation(
        chatId,
        state,
        finalCgpa,
        "CGPA"
      );

      await ctx.reply(
        `Your cGPA is: ${finalCgpa} \nGrade: ${letter}\n🔍 Verification ID: ${verificationId}`
      );

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
        await ctx.reply("⚠️ Error generating PDF. Your cGPA is still saved.");
      } finally {
        delete userStates[chatId];
      }
      return;
    }
  }

  if (userStates[chatId] && userStates[chatId].status === "calculating_first") {
    const score = parseFloat(text);
    if (isNaN(score) || score < 0 || score > 100)
      return ctx.reply("❌ Enter a valid score (0-100)");

    session.scores.push(score);
    session.index++;

    if (session.index < firstSemesterNaturalCourses.length)
      return ctx.reply(
        `Next score for: ${firstSemesterNaturalCourses[session.index].name}`
      );

    let totalWeighted = 0,
      totalCredits = 0;
    let resultText = "📊 GPA Results:\n\n";

    session.scores.forEach((score, i) => {
      const { letter, point } = getGrade(score);
      const course = firstSemesterNaturalCourses[i];
      const weighted = point * course.credit;
      totalWeighted += weighted;
      totalCredits += course.credit;
      resultText += `${course.name}: ${score} → ${letter} (${point}) x ${
        course.credit
      } = ${weighted.toFixed(2)}\n`;
    });

    const gpa = totalWeighted / totalCredits;
    const verificationId = await logUserCalculation(chatId, session, gpa);
    const userFullName = `${ctx.from.first_name || ""} ${
      ctx.from.last_name || ""
    }`.trim();

    try {
      await ctx.reply(
        `${resultText}\n🎯 Final GPA: ${gpa.toFixed(
          2
        )}\n🔍 Verification ID: ${verificationId}\n\n📄 PDF Generation temporarly not available!`
      );
      delete sessions[chatId];

      //const pdfPath = await generateGpaPdfFirst(
      //  chatId,
      //   session,
      //   gpa,
      //   userFullName
      // );

      // await ctx.replyWithDocument({
      //   source: pdfPath,
      //    filename: `GPA_Result_${userFullName.replace(/\s+/g, "_")}.pdf`,
      //  });
      // fs.unlinkSync(pdfPath);
      return;
    } catch (err) {
      console.error("PDF generation error:", err);
    } finally {
      delete sessions[chatId];
    }
  }

  if (
    userStates[chatId] &&
    userStates[chatId].status === "calculating_second"
  ) {
    const score = parseFloat(text);
    if (isNaN(score) || score < 0 || score > 100)
      return ctx.reply("❌ Enter a valid score (0-100)");

    session.scores.push(score);
    session.index++;

    if (session.index < courses.length)
      return ctx.reply(`Next score for: ${courses[session.index].name}`);

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
    const verificationId = await logUserCalculation(chatId, session, gpa);
    const userFullName = `${ctx.from.first_name || ""} ${
      ctx.from.last_name || ""
    }`.trim();

    try {
      await ctx.reply(
        `${resultText}\n🎯 Final GPA: ${gpa.toFixed(
          2
        )}\n🔍 Verification ID: ${verificationId}\n\n📄 PDF Generation temporarly not available!`
      );
      delete sessions[chatId];

      // const pdfPath = await generateGpaPdf(chatId, session, gpa, userFullName);
      // await ctx.replyWithDocument({
      //   source: pdfPath,
      //   filename: `GPA_Result_${userFullName.replace(/\s+/g, "_")}.pdf`,
      //  });
      //  fs.unlinkSync(pdfPath);
      return;
    } catch (err) {
      console.error("PDF generation error:", err);
      //await ctx.reply(
      //   "⚠️ Error generating PDF. Here are your results:\n\n" + resultText
      // );
    } finally {
      delete sessions[chatId];
    }
  }

  if (!session) return;

  if (
    session.mode === "broadcast" ||
    userStates[chatId].status === "broadcast"
  ) {
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

    logsSnapshot.forEach((doc) => uniqueUserIds.add(doc.data().userId));

    let success = 0,
      failed = 0;
    for (const userId of Array.from(uniqueUserIds)) {
      try {
        await ctx.telegram.sendMessage(userId, broadcastMessage);
        success++;
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (err) {
        failed++;
      }
    }

    await ctx.reply(
      `📊 Broadcast Results:\n✅ Sent: ${success}\n❌ Failed: ${failed}`
    );
    delete sessions[chatId];
    return;
  }
});

// Webhook route - CRITICAL FOR WEBHOOK MODE
app.post(`/webhook/${process.env.BOT_TOKEN}`, (req, res) => {
  bot.handleUpdate(req.body, res);
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    webhook: true,
    botVersion: botVersion,
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.send("🤖 GPA Calculator Bot is running with webhooks!");
});

// Logs endpoint
app.get("/logs", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Unauthorized: Missing Bearer token" });
  }

  const token = authHeader.split(" ")[1];
  if (token !== ADMIN_ID)
    return res.status(403).json({ error: "Forbidden: Invalid token" });

  try {
    const snapshot = await logsRef
      .orderBy("timestamp", "desc")
      .limit(100)
      .get();
    const logs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.status(200).json({ count: logs.length, logs });
  } catch (err) {
    console.error("Error fetching logs:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// Verification endpoint
app.post("/api/verify", async (req, res) => {
  try {
    const { verificationId } = req.body;
    if (!verificationId) {
      return res
        .status(400)
        .json({ valid: false, error: "Verification ID required" });
    }

    const logsSnapshot = await logsRef
      .where("verificationId", "==", verificationId)
      .limit(1)
      .get();

    if (logsSnapshot.empty) {
      return res.json({ valid: false });
    }

    const logData = logsSnapshot.docs[0].data();
    res.json({
      valid: true,
      student: logData.studentName,
      gpa: logData.gpa,
      date: logData.timestamp,
      type: logData.type || "GPA",
      results: logData.results,
    });
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).json({ valid: false, error: "Server error" });
  }
});

// Webhook setup function
async function setWebhook() {
  const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/webhook/${process.env.BOT_TOKEN}`;

  try {
    await bot.telegram.setWebhook(webhookUrl);
    console.log(`✅ Webhook set to: ${webhookUrl}`);

    // Verify webhook info
    const webhookInfo = await bot.telegram.getWebhookInfo();
    console.log("📋 Webhook info:", {
      url: webhookInfo.url,
      has_custom_certificate: webhookInfo.has_custom_certificate,
      pending_update_count: webhookInfo.pending_update_count,
    });
  } catch (error) {
    console.error("❌ Error setting webhook:", error);
  }
}

app.use(bot.webhookCallback("/webhook"));

async function startServer() {
  try {
    await bot.telegram.setWebhook(`${WEBHOOK_URL}/webhook`);
    console.log(`✅ Webhook set to: ${WEBHOOK_URL}/webhook`);

    app.listen(PORT, () => {
      console.log(`🤖 Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Start the application
startServer();
