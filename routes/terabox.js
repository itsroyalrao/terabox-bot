// @ts-nocheck
const express = require("express");
const router = express.Router();

const COOKIE = "ndus=YzeXcd1peHuiK2_zig1UkhLraLgytieQ2TwpyHiy; ndut_fmt=35E53AA0B7793B84FF6E3D1F88C1A7D86BC036C1885B169D0EAA35446C0F2E65;";

const HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Accept-Encoding": "gzip, deflate, br",
  "Accept-Language": "en-US,en;q=0.9",
  "Connection": "keep-alive",
  "DNT": "1",
  "Host": "www.terabox.app",
  "Upgrade-Insecure-Requests": "1",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/135.0.0.0 Safari/537.36",
  "sec-ch-ua": '"Microsoft Edge";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Cookie": COOKIE,
};

const DL_HEADERS = {
  "User-Agent": HEADERS["User-Agent"],
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Referer": "https://terabox.com/",
  "DNT": "1",
  "Connection": "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Cookie": COOKIE,
};

function getSize(bytes) {
  if (bytes >= 1 << 30) return `${(bytes / (1 << 30)).toFixed(2)} GB`;
  if (bytes >= 1 << 20) return `${(bytes / (1 << 20)).toFixed(2)} MB`;
  if (bytes >= 1 << 10) return `${(bytes / (1 << 10)).toFixed(2)} KB`;
  return `${bytes} bytes`;
}

function findBetween(str, start, end) {
  const startIndex = str.indexOf(start);
  if (startIndex === -1) return "";
  const endIndex = str.indexOf(end, startIndex + start.length);
  if (endIndex === -1) return "";
  return str.slice(startIndex + start.length, endIndex);
}

async function getFileInfo(link, hostUrl) {
  if (!link) return { error: "Link cannot be empty." };

  let response = await fetch(link, { headers: HEADERS });
  if (!response.ok) return { error: `Initial fetch failed with status: ${response.status}` };

  const finalUrl = response.url;
  const surl = new URL(finalUrl).searchParams.get("surl");
  if (!surl) return { error: "Invalid link (missing surl param)." };

  const text = await response.text();
  const jsToken = findBetween(text, 'fn%28%22', '%22%29');
  const logid = findBetween(text, 'dp-logid=', '&');
  const bdstoken = findBetween(text, 'bdstoken":"', '"');

  if (!jsToken || !logid || !bdstoken) {
    return { error: "Required tokens not found in page." };
  }

  const params = new URLSearchParams({
    app_id: "250528",
    web: "1",
    channel: "dubox",
    clienttype: "0",
    jsToken,
    "dp-logid": logid,
    page: "1",
    num: "20",
    by: "name",
    order: "asc",
    site_referer: finalUrl,
    shorturl: surl,
    root: "1,",
  });

  response = await fetch(`https://dm.terabox.app/share/list?${params}`, { headers: HEADERS });
  const data = await response.json();

  if (!data?.list?.length || data.errno) {
    return { error: data.errmsg || "File list retrieval failed." };
  }

  const file = data.list[0];
  return {
    file_name: file.server_filename || "unknown",
    download_link: file.dlink || "",
    thumbnail: file.thumbs?.url3 || "",
    file_size: getSize(parseInt(file.size || 0)),
    size_bytes: parseInt(file.size || 0),
    proxy_url: `${hostUrl}/terabox/proxy?url=${encodeURIComponent(file.dlink)}&file_name=${encodeURIComponent(file.server_filename || 'download')}`,
  };
}

async function proxyDownload(req, res) {
  const url = req.query.url;
  const fileName = req.query.file_name || "download";

  if (!url) return res.status(400).json({ error: "Missing download URL." });

  try {
    const headers = { ...DL_HEADERS };
    if (req.headers.range) headers["Range"] = req.headers.range;

    const fetchRes = await fetch(url, { headers });

    if (!fetchRes.ok && fetchRes.status !== 206)
      return res.status(502).json({ error: `Download fetch failed: ${fetchRes.status}` });

    res.set({
      "Content-Type": fetchRes.headers.get("Content-Type") || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Range",
      "Access-Control-Expose-Headers": "Content-Length,Content-Range"
    });

    if (fetchRes.headers.has("Content-Range"))
      res.set("Content-Range", fetchRes.headers.get("Content-Range"));
    if (fetchRes.headers.has("Content-Length"))
      res.set("Content-Length", fetchRes.headers.get("Content-Length"));

    fetchRes.body.pipe(res);
  } catch (err) {
    res.status(500).json({ error: `Proxy error: ${err.message}` });
  }
}

// POST /terabox (main fetch route)
router.post("/", async (req, res) => {
  try {
    const { link } = req.body;
    const info = await getFileInfo(link, `${req.protocol}://${req.get("host")}`);
    return res.status(info.error ? 400 : 200).json(info);
  } catch (e) {
    return res.status(400).json({ error: `Bad request: ${e.message}` });
  }
});

// GET /terabox/proxy (download proxy)
router.get("/proxy", proxyDownload);

module.exports = router;
