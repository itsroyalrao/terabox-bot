const express = require("express");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

const teraboxRouter = require("./routes/terabox");

app.use(express.json());
app.use("/terabox", teraboxRouter);

app.get("/health", (_, res) => res.json({ status: "ok" }));

app.listen(port, () => {
  console.log(`Server running on port ${port}`);

  async function keepAliveWithRetry(url, retries = 3, delay = 1000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          console.log("Keep-alive ping successful");
          return;
        } else {
          console.error(
            `Attempt ${attempt} failed: Status ${response.status} ${response.statusText}`
          );
        }
      } catch (error) {
        console.error(`Attempt ${attempt} failed: ${error.message || error}`);
      }

      if (attempt < retries) {
        console.log(`Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      }
    }

    console.error(`All ${retries} keep-alive attempts failed.`);
  }

  const KEEP_ALIVE_URL = "https://telegram-bot-w1ij.onrender.com";
  setInterval(() => keepAliveWithRetry(KEEP_ALIVE_URL), 14 * 60 * 1000);
});
