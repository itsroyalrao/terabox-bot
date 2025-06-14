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
    `📄 *File:* ${file.file_name}\n` +
    `📂 *Type:* ${ext.toUpperCase()}\n` +
    `🕒 *Fetched At:* ${time}\n\n` +
    (file.proxy_url
      ? `🔗 *Download Link:*\n\`${file.proxy_url}\`\n\n_Tap the link above to copy it_`
      : "⚠️ No download link available.")
  );
};

// Alternative format with inline keyboard
const formatFileMessageWithButton = (file) => {
  const ext = file.file_name.split(".").pop()?.toLowerCase() || "";
  const time = file.fetchedAt
    ? new Date(file.fetchedAt).toLocaleTimeString()
    : "Unknown";
  return `📄 *File:* ${
    file.file_name
  }\n📂 *Type:* ${ext.toUpperCase()}\n🕒 *Fetched At:* ${time}`;
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
    // Update loading message to show we're fetching the link
    try {
      await bot.editMessageText(
        "⏳ Extracting file details...\n🔗 Fetching download link...",
        {
          chat_id: chatId,
          message_id: loadingMsg.message_id,
          parse_mode: "Markdown",
        }
      );
    } catch (editErr) {
      // If edit fails, send a new message instead
      console.log("Failed to edit loading message, sending new one");
    }

    const file = await extractTeraBoxFile(text);

    // Try to edit the message, if it fails, send a new one
    const successMessage = file.proxy_url
      ? "✅ File extracted successfully:\n\n" + formatFileMessage(file)
      : "⚠️ File details extracted but download link not available:\n\n" +
        formatFileMessage(file);

    try {
      await bot.editMessageText(successMessage, {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      });
    } catch (editErr) {
      // If edit fails, send a new message
      await bot.sendMessage(chatId, successMessage, {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      });
    }

    // Option 2: Send with inline keyboard button (uncomment to use this instead)
    /*
    bot.editMessageText(
      "✅ File extracted successfully:\n\n" + formatFileMessageWithButton(file),
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [[
            {
              text: "📋 Copy Download Link",
              callback_data: `copy_${file.proxy_url}`
            }
          ]]
        }
      }
    );
    */
  } catch (err) {
    // Try to edit the error message, if it fails, send a new one
    const errorMessage = `❌ Error: ${
      err.message || "Failed to fetch file details."
    }`;

    try {
      await bot.editMessageText(errorMessage, {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: "Markdown",
      });
    } catch (editErr) {
      // If edit fails, send a new message
      await bot.sendMessage(chatId, errorMessage, {
        parse_mode: "Markdown",
      });
    }
  }
});

// Handle inline keyboard callbacks for copy button
bot.on("callback_query", async (callbackQuery) => {
  const msg = callbackQuery.message;
  const data = callbackQuery.data;

  if (data.startsWith("copy_")) {
    const url = data.replace("copy_", "");

    // Send the URL as a separate message that's easy to copy
    await bot.sendMessage(
      msg.chat.id,
      `🔗 *Download Link:*\n\`${url}\`\n\n_Long press the link above to copy it_`,
      {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
        reply_to_message_id: msg.message_id,
      }
    );

    // Answer the callback query
    bot.answerCallbackQuery(callbackQuery.id, {
      text: "Download link sent! Long press to copy.",
      show_alert: false,
    });
  }
});

// Send media if possible
async function sendFile(
  chatId,
  file,
  fromCache = false,
  loadingMessageId = null
) {
  const ext = file.file_name.split(".").pop()?.toLowerCase();
  const messagePrefix = fromCache
    ? "✅ Loaded from cache:\n\n"
    : "✅ File extracted successfully:\n\n";

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
      await bot.sendMessage(chatId, messagePrefix + formatFileMessage(file), {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      });
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
