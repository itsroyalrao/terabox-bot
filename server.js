const express = require("express");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

const teraboxRouter = require("./routes/terabox");

app.use(express.json());
app.use("/terabox", teraboxRouter);

app.get("/health", (_, res) => res.json({ status: "ok" }));

app.listen(port, () => console.log(`Server running on port ${port}`));
