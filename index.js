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

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID;

// Bot commands and handlers
bot.start(async (ctx) => {
  ctx.reply("Bot is offline for maintenance.\nTry again later.");
});

bot.help((ctx) => {
  ctx.reply("🛠️ Maintenance mode.\nNo commands available.");
});

bot.on("text", async (ctx) => {
  ctx.reply("Bot can't reply now! try again later");
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
