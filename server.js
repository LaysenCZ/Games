import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { Storage } from "./lib/storage.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// --- middlewares
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("tiny"));
app.use(express.static(path.join(__dirname, "public")));

// --- storage (Mongo nebo soubor)
const storage = new Storage({
  mongoUri: process.env.MONGODB_URI,
  fallbackFile: path.join(__dirname, "feedback.json")
});
await storage.init();

// --- health
app.get("/api/health", (req, res) => {
  res.json({ ok: true, env: process.env.NODE_ENV || "production", time: new Date().toISOString() });
});

// --- news
const NEWS = [
  { date: "2025-10-07", text: "První veřejný náhled – menu, info, náhled hry, audio." },
  { date: "2025-10-08", text: "Přidán formulář podpory: nahlášení chyb a zlepšováky." },
  { date: "2025-10-09", text: "Fix: overlay neblokuje kliknutí, vylepšena navigace." }
];
app.get("/api/news", (req, res) => res.json(NEWS));

// --- feedback
app.post("/api/feedback", async (req, res) => {
  try {
    const { type, title, message, contact } = req.body || {};
    if (!type || !title || !message) {
      return res.status(400).json({ ok: false, error: "Missing required fields." });
    }
    const saved = await storage.saveFeedback({ type, title, message, contact, createdAt: new Date() });
    res.json({ ok: true, id: saved.id || saved._id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Failed to save feedback." });
  }
});

// --- socket.io
io.on("connection", (socket) => {
  const room = "city-default";
  socket.join(room);
  socket.emit("server:hello", { msg: "Vítej v City Rumor (preview)!" });

  socket.on("client:rumor", (payload) => {
    if (!payload?.text) return;
    io.to(room).emit("server:rumor", {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      text: payload.text.trim().slice(0, 240),
      author: payload.author || "Obyvatel",
      time: new Date().toISOString(),
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`City Rumor server running on :${PORT}`);
});
