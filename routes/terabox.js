const express = require("express");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");
require("dotenv").config();

const router = express.Router();

const sessionCache = {};
const workerUrl = process.env.WORKER_URL;
const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!workerUrl || !botToken) {
  console.error("Missing WORKER_URL or TELEGRAM_BOT_TOKEN in .env");
  process.exit(1);
}

const bot = new TelegramBot(botToken, { polling: true });

const formatFileMessage = (file) => {
  const ext = file.file_name.split(".").pop()?.toLowerCase() || "";
  const time = file.fetchedAt
    ? new Date(file.fetchedAt).toLocaleTimeString()
    : "Unknown";
  return (
    `📄 *File:* ${
      file.file_name
    }\n📂 *Type:* ${ext.toUpperCase()}\n🕒 *Fetched At:* ${time}\n` +
    (file.proxy_url
      ? `🔗 [Download File](${file.proxy_url})`
      : "⚠️ No download link available.")
  );
};

// Telegram command
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Welcome to the TeraBox Extractor Bot! 📦\nSend a TeraBox link to extract file details and get a download link.",
    { parse_mode: "Markdown" }
  );
});

// Telegram message handler
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith("/") || !text.includes("terabox")) return;

  if (sessionCache[text]) {
    bot.sendMessage(
      chatId,
      "✅ Loaded from cache:\n" + formatFileMessage(sessionCache[text]),
      {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }
    );
    return;
  }

  const loadingMsg = await bot.sendMessage(
    chatId,
    "⏳ Extracting file details...",
    {
      parse_mode: "Markdown",
    }
  );

  try {
    const response = await axios.post(
      workerUrl,
      { link: text },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    if (response.status !== 200)
      throw new Error("Failed to fetch file details");

    const fileData = {
      ...response.data,
      sourceLink: text,
      fetchedAt: new Date().toISOString(),
    };

    sessionCache[text] = fileData;
    const history = sessionCache.history || [];
    history.unshift(fileData);
    sessionCache.history = history.slice(0, 10);

    bot.editMessageText(
      "✅ File extracted successfully:\n" + formatFileMessage(fileData),
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }
    );
  } catch (error) {
    bot.editMessageText(
      `❌ Error: ${error.message || "Failed to fetch file details."}`,
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: "Markdown",
      }
    );
  }
});

// Optional REST API
router.post("/", async (req, res) => {
  const { link } = req.body;
  if (!link) return res.status(400).json({ error: "Link is required" });

  try {
    if (sessionCache[link]) return res.json(sessionCache[link]);

    const response = await axios.post(
      workerUrl,
      { link },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    if (response.status !== 200)
      throw new Error("Failed to fetch file details");

    const fileData = {
      ...response.data,
      sourceLink: link,
      fetchedAt: new Date().toISOString(),
    };

    sessionCache[link] = fileData;
    const history = sessionCache.history || [];
    history.unshift(fileData);
    sessionCache.history = history.slice(0, 10);

    res.json(fileData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Handle bot errors
bot.on("polling_error", (err) => {
  console.error("Polling error:", err.message);
});

process.on("SIGTERM", () => {
  console.log("Shutting down...");
  bot.stopPolling();
  process.exit(0);
});

module.exports = router;
