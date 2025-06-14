const axios = require("axios");
const workerUrl = process.env.WORKER_URL;

if (!workerUrl) {
  console.error("Missing WORKER_URL in .env");
  process.exit(1);
}

const sessionCache = {};

async function extractTeraBoxFile(link) {
  if (sessionCache[link]) return sessionCache[link];

  const response = await axios.post(workerUrl, { link }, {
    headers: { "Content-Type": "application/json" },
  });

  if (response.status !== 200) throw new Error("Failed to fetch file details");

  const fileData = {
    ...response.data,
    sourceLink: link,
    fetchedAt: new Date().toISOString(),
  };

  sessionCache[link] = fileData;
  const history = sessionCache.history || [];
  history.unshift(fileData);
  sessionCache.history = history.slice(0, 10);

  return fileData;
}

module.exports = { extractTeraBoxFile, sessionCache };
