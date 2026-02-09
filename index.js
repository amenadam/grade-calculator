require("dotenv").config();
const express = require("express");
const { Telegraf, Markup } = require("telegraf");
const mongoose = require("mongoose");

// MongoDB User Schema - SIMPLIFIED: only telegramId
const userSchema = mongoose.Schema(
  {
    telegramId: { type: Number, required: true, unique: true },
  },
  { timestamps: true },
);

const User = mongoose.model("User", userSchema);

// GPA Calculation Logic (kept for functionality)
const { version } = require("./package.json");
const botVersion = version;
const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

app.use(express.json());

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID;

// Course definitions
const coursesPreEngineering = [
  { name: "Applied Mathematics I (Math. 1041)", credit: 5 },
  { name: "Communicative English Language Skills II (FLEn. 1012)", credit: 5 },
  { name: "Moral and Civic Education (MCiE. 1012)", credit: 4 },
  { name: "Entrepreneurship (Mgmt. 1012)", credit: 5 },
  { name: "Social Anthropology (Anth. 1012)", credit: 4 },
  { name: "Introduction to Emerging Technologies (EmTe. 1012)", credit: 5 },
  { name: "Computer Programming (ECEg 2052)", credit: 5 },
];

const coursesOtherNaturalScience = [
  { name: "Chemistry", credit: 5 },
  { name: "English", credit: 5 },
  { name: "Anthropology", credit: 4 },
  { name: "Civic", credit: 4 },
  { name: "Economics", credit: 5 },
  { name: "Biology", credit: 5 },
  { name: "Emerging Technology", credit: 5 },
];

const firstSemesterNaturalCourses = [
  { name: "Communicative English Language Skills I (FLEn. 1011)", credit: 3 },
  { name: "General Physics (Phys. 1011)", credit: 3 },
  { name: "General Psychology (Psyc. 1011)", credit: 3 },
  { name: "Mathematics For Natural Sciences (Math. 1011)", credit: 3 },
  { name: "Critical Thinking (LoCT. 1011)", credit: 3 },
  { name: "Geography of Ethiopia and The Horn (GeES 1011)", credit: 3 },
];

// Grade calculation functions
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

function getPlacementAdvice(gpa) {
  const advice = [];

  if (gpa >= 3.5) {
    advice.push("🩺 Health Sciences");
    advice.push("🔧 Pre-Engineering");
    advice.push("🔬 Other Natural Sciences");
  } else if (gpa >= 3.0) {
    advice.push("🔧 Pre-Engineering");
    advice.push("🔬 Other Natural Sciences");
  } else if (gpa >= 2.0) {
    advice.push("🔬 Other Natural Sciences");
  }

  return advice;
}

// Session management
let userStates = {};
const sessions = {};

// cGPA calculation function
const calculatecGPA = (gpas_arr) => {
  let cGpa = parseFloat((gpas_arr[0] * 30 + gpas_arr[1] * 33) / (30 + 33));
  return cGpa.toFixed(2);
};

// Bot middleware - ONLY saves telegramId if new user
bot.use(async (ctx, next) => {
  if (ctx.from) {
    const chatId = ctx.from.id;

    try {
      // Check if user exists, if not create with only telegramId
      const existingUser = await User.findOne({ telegramId: chatId });
      if (!existingUser) {
        await User.create({ telegramId: chatId });
        bot.telegram.sendMessage(ADMIN_ID, `New User \n ${ctx.from.username} `);
      }
      // NO other data is saved
    } catch (error) {
      console.error("Error saving user:", error);
    }
  }
  return next();
});

// Bot commands - SIMPLIFIED: removed history, verification, stats, etc.
bot.start(async (ctx) => {
  await ctx.reply(
    "📘 Welcome to GPA Calculator!",
    Markup.keyboard([
      ["🎓 Calculate 1st Sem. GPA", "🎓 Calculate 2nd Sem. GPA"],
      ["[NEW] Calculate cGPA"],
      ["📢 About"],
    ]).resize(),
  );
});

bot.help((ctx) => {
  return ctx.reply(
    `Disclaimer:
This calculator is for estimation purposes only. The official GPA and CGPA will be determined and published by the University Registrar's office. While we strive for accuracy, always refer to your official transcript for final grades.

Bot version: ${botVersion}`,
  );
});

// GPA calculation handlers (kept but simplified - no logging)
bot.hears("[NEW] Calculate cGPA", (ctx) => {
  const chatId = ctx.chat.id;
  userStates[chatId] = {
    status: "calculating_cGPA",
    index: 0,
    gpas: [],
  };
  return ctx.reply("Enter first semester GPA:");
});

bot.hears("🎓 Calculate 2nd Sem. GPA", (ctx) => {
  return ctx.reply(
    "Please select your program:",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("🔧 Pre-Engineering", "program_pre_engineering"),
        Markup.button.callback(
          "🔬 Other Natural Science",
          "program_other_science",
        ),
      ],
    ]),
  );
});

bot.action("program_pre_engineering", async (ctx) => {
  const chatId = ctx.chat.id;
  await ctx.answerCbQuery();

  sessions[chatId] = {
    index: 0,
    scores: [],
    program: "Pre-Engineering",
  };

  return ctx.reply(
    `Selected: Pre-Engineering\n\nSend your score for: ${coursesPreEngineering[0].name}`,
  );
});

bot.action("program_other_science", async (ctx) => {
  const chatId = ctx.chat.id;
  await ctx.answerCbQuery();

  sessions[chatId] = {
    index: 0,
    scores: [],
    program: "Other Natural Science",
  };

  return ctx.reply(
    `Selected: Other Natural Science\n\nSend your score for: ${coursesOtherNaturalScience[0].name}`,
  );
});

bot.hears("🎓 Calculate 1st Sem. GPA", (ctx) => {
  const chatId = ctx.chat.id;
  sessions[chatId] = {
    index: 0,
    scores: [],
    program: "First Semester",
  };
  return ctx.reply(
    `Send your score for: ${firstSemesterNaturalCourses[0].name}`,
  );
});

bot.hears("📢 About", (ctx) => {
  return ctx.reply(
    `Disclaimer:
This calculator is for estimation purposes only. The official GPA and CGPA will be determined and published by the University Registrar's office. While we strive for accuracy, always refer to your official transcript for final grades.

Bot version: ${botVersion}`,
  );
});

// Text message handler for GPA calculations
bot.on("text", async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();
  const session = sessions[chatId];

  // Handle cGPA calculation
  if (userStates[chatId] && userStates[chatId].status === "calculating_cGPA") {
    const state = userStates[chatId];

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
      const finalCgpa = calculatecGPA(state.gpas);
      const { letter } = getGradeByPoint(finalCgpa);

      await ctx.reply(`Your cGPA is: ${finalCgpa} \nGrade: ${letter}`);

      delete userStates[chatId];
      return;
    }
  }

  // Handle first semester GPA calculation
  if (session && session.program === "First Semester") {
    const score = parseFloat(text);
    if (isNaN(score) || score < 0 || score > 100)
      return ctx.reply("❌ Enter a valid score (0-100)");

    session.scores.push(score);
    session.index++;

    if (session.index < firstSemesterNaturalCourses.length)
      return ctx.reply(
        `Next score for: ${firstSemesterNaturalCourses[session.index].name}`,
      );

    let totalWeighted = 0,
      totalCredits = 0;
    let resultText = "📊<b> GPA Results:</b>\n\n";

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
    const placementOptions = getPlacementAdvice(gpa);

    let placementText =
      "📌 *Possible Placement Options Based on Your GPA:*\n\n";

    if (placementOptions.length === 0) {
      placementText +=
        "❌ Unfortunately, your GPA does not meet the minimum requirement for Natural Science streams.\n";
    } else {
      placementOptions.forEach((p) => {
        placementText += `• ${p}\n`;
      });
    }

    placementText +=
      "\n⚠️ *Note:* Placement depends on competition, university policy, and capacity.\n" +
      "This result is for guidance purposes only.";

    await ctx.reply(`${resultText}\n🎯 <b>Final GPA: ${gpa.toFixed(2)}</b>`, {
      parse_mode: "HTML",
    });

    delete sessions[chatId];
    return;
  }

  // Handle second semester GPA calculation
  if (
    session &&
    (session.program === "Pre-Engineering" ||
      session.program === "Other Natural Science")
  ) {
    const score = parseFloat(text);
    if (isNaN(score) || score < 0 || score > 100)
      return ctx.reply("❌ Enter a valid score (0-100)");

    session.scores.push(score);
    session.index++;

    const courses =
      session.program === "Other Natural Science"
        ? coursesOtherNaturalScience
        : coursesPreEngineering;

    if (session.index < courses.length)
      return ctx.reply(`Next score for: ${courses[session.index].name}`);

    let totalWeighted = 0,
      totalCredits = 0;
    let resultText = `📊 <b>${session.program} GPA Results:</b>\n\n`;

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

    await ctx.reply(
      `${resultText}\n🎓 <b>Program: ${session.program}\n🎯 Final GPA: ${gpa.toFixed(2)}</b>`,
    );

    delete sessions[chatId];
    return;
  }
});

// Webhook route
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

// Webhook setup function
async function setWebhook() {
  const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/webhook/${process.env.BOT_TOKEN}`;

  try {
    await bot.telegram.setWebhook(webhookUrl);
    console.log(`✅ Webhook set to: ${webhookUrl}`);
  } catch (error) {
    console.error("❌ Error setting webhook:", error);
  }
}

app.use(bot.webhookCallback("/webhook"));

async function startServer() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

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
