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
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("tiny"));
app.use(express.static(path.join(__dirname, "public")));

// --- storage (Mongo, nebo fallback do souboru)
const storage = new Storage({
  mongoUri: process.env.MONGODB_URI,
  fallbackFile: path.join(__dirname, "feedback.json")
});
await storage.init();

// --- API: zdraví
app.get("/api/health", (req, res) => {
  res.json({ ok: true, env: process.env.NODE_ENV || "production", time: new Date().toISOString() });
});

// --- API: novinky (můžeš později napojit na DB)
const NEWS = [
  { date: "2025-10-07", text: "První veřejný náhled – menu, info, náhled hry, audio." },
  { date: "2025-10-08", text: "Přidán formulář podpory: nahlášení chyb a zlepšováky." }
];
app.get("/api/news", (req, res) => res.json(NEWS));

// --- API: feedback (bug reporty / nápady)
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

// --- Socket.io – základní kanály (připraveno pro multiplayer)
io.on("connection", (socket) => {
  // připojení do místnosti města (zatím 1 default)
  const room = "city-default";
  socket.join(room);

  // ukázkový ping
  socket.emit("server:hello", { msg: "Vítej v City Rumor (preview)!" });

  // příjem „lokálních“ rumorů (zatím neběží na serveru – jen broadcast do místnosti)
  socket.on("client:rumor", (payload) => {
    // Validace min
    if (!payload?.text) return;
    // Broadcast do místnosti (bez perzistence – v preview stačí)
    io.to(room).emit("server:rumor", {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      text: payload.text.trim().slice(0, 240),
      author: payload.author || "Obyvatel",
      time: new Date().toISOString(),
    });
  });

  socket.on("disconnect", () => {});
});

// --- start
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`City Rumor server running on :${PORT}`);
});
