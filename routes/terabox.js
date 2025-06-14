const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const { extractTeraBoxFile, sessionCache } = require("../utils/terabox");
require("dotenv").config();

const router = express.Router();
const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
  console.error("Missing TELEGRAM_BOT_TOKEN in .env");
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

// /start command
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Welcome to the TeraBox Extractor Bot! 📦\nSend a TeraBox link to extract file details and get a download link.",
    { parse_mode: "Markdown" }
  );
});

// Handle messages
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith("/") || !text.includes("terabox")) return;

  if (sessionCache[text]) {
    const file = sessionCache[text];
    await sendFile(chatId, file, true);
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
    const file = await extractTeraBoxFile(text);

    bot.editMessageText(
      "✅ File extracted successfully:\n" + formatFileMessage(file),
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }
    );

    // Don't call sendFile - just edit the loading message
  } catch (err) {
    bot.editMessageText(
      `❌ Error: ${err.message || "Failed to fetch file details."}`,
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: "Markdown",
      }
    );
  }
});

// Send media if possible
async function sendFile(chatId, file, fromCache = false, loadingMessageId = null) {
  const ext = file.file_name.split(".").pop()?.toLowerCase();
  const messagePrefix = fromCache ? "✅ Loaded from cache:\n" : "✅ File extracted successfully:\n";

  // Delete loading message if provided
  if (loadingMessageId) {
    try {
      await bot.deleteMessage(chatId, loadingMessageId);
    } catch (err) {
      // Ignore if message already deleted
    }
  }

  try {
    if (ext?.match(/(jpg|jpeg|png|gif|webp)/)) {
      await bot.sendPhoto(chatId, file.proxy_url, {
        caption: messagePrefix + formatFileMessage(file),
        parse_mode: "Markdown",
      });
    } else if (ext?.match(/(mp4|mov|mkv|webm)/)) {
      await bot.sendVideo(chatId, file.proxy_url, {
        caption: messagePrefix + formatFileMessage(file),
        parse_mode: "Markdown",
      });
    } else {
      await bot.sendMessage(
        chatId,
        messagePrefix + formatFileMessage(file),
        {
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }
      );
    }
  } catch (err) {
    await bot.sendMessage(chatId, messagePrefix + formatFileMessage(file), {
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    });
  }
}

// REST API endpoint
router.post("/", async (req, res) => {
  const { link } = req.body;
  if (!link) return res.status(400).json({ error: "Link is required" });

  try {
    const file = await extractTeraBoxFile(link);
    res.json(file);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Polling error handler
bot.on("polling_error", (err) => {
  console.error("Polling error:", err.message);
});

process.on("SIGTERM", () => {
  console.log("Shutting down...");
  bot.stopPolling();
  process.exit(0);
});

module.exports = router;