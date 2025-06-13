const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Telegram Bot Setup
const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
  console.error("TELEGRAM_BOT_TOKEN is not set in .env");
  process.exit(1);
}

const workerUrl = process.env.WORKER_URL;
if (!workerUrl) {
  console.error("WORKER_URL is not set in .env");
  process.exit(1);
}

const bot = new TelegramBot(botToken, { polling: true });

// Cache to store file details (similar to React app's sessionCache)
const sessionCache = {};

// Helper function to format file details
const formatFileMessage = (file) => {
  const fileExtension = file.file_name.split(".").pop()?.toLowerCase() || "";
  const fetchedAt = file.fetchedAt
    ? new Date(file.fetchedAt).toLocaleTimeString()
    : "Unknown";
  let message = `📄 *File:* ${file.file_name}\n`;
  message += `📂 *Type:* ${fileExtension.toUpperCase()}\n`;
  message += `🕒 *Fetched At:* ${fetchedAt}\n`;
  if (file.proxy_url) {
    message += `🔗 [Download File](${file.proxy_url})\n`;
  } else {
    message += `⚠️ No download link available.\n`;
  }
  return message;
};

// Telegram Bot Command Handlers
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    "Welcome to the TeraBox Extractor Bot! 📦\n" +
      "Send a TeraBox link to extract file details and get a download link.",
    { parse_mode: "Markdown" }
  );
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Ignore commands and non-link messages
  if (!text || text.startsWith("/") || !text.includes("terabox")) {
    return;
  }

  // Check cache first
  if (sessionCache[text]) {
    bot.sendMessage(
      chatId,
      "✅ Loaded from cache:\n" + formatFileMessage(sessionCache[text]),
      { parse_mode: "Markdown", disable_web_page_preview: true }
    );
    return;
  }

  // Send loading message
  const loadingMsg = await bot.sendMessage(
    chatId,
    "⏳ Extracting file details...",
    {
      parse_mode: "Markdown",
    }
  );

  try {
    // Make request to WORKER_URL
    const response = await axios.post(
      workerUrl,
      { link: text },
      { headers: { "Content-Type": "application/json" } }
    );

    if (response.status !== 200) {
      throw new Error("Failed to fetch file details");
    }

    const fileData = {
      ...response.data,
      sourceLink: text,
      fetchedAt: new Date().toISOString(),
    };

    // Cache the result
    sessionCache[text] = fileData;

    // Update history in local storage (simulated with a simple array)
    const history = sessionCache.history || [];
    history.unshift(fileData);
    sessionCache.history = history.slice(0, 10); // Keep last 10 entries

    // Send file details
    await bot.editMessageText(
      "✅ File extracted successfully:\n" + formatFileMessage(fileData),
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }
    );
  } catch (error) {
    await bot.editMessageText(
      `❌ Error: ${error.message || "Failed to fetch file details."}`,
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: "Markdown",
      }
    );
  }
});

// Express route for health check
app.get("/health", (req, res) => {
  res
    .status(200)
    .json({ status: "ok", message: "TeraBox Bot Server is running" });
});

// Start the Express server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Error handling for Telegram bot
bot.on("polling_error", (error) => {
  console.error("Polling error:", error.message);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Shutting down...");
  bot.stopPolling();
  process.exit(0);
});
