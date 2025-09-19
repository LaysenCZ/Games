import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true }
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static("public"));

/** ====== In-memory "DB" ====== */
const users = new Map(); // username -> {id, username, passHash}
const rooms = new Map(); // roomId -> {id, name, hostUserId, players:[{id,username,socketId,color}], state}
const socketsToUser = new Map(); // socket.id -> userId

/** ====== Questions (sample) ====== */
const QUESTIONS = [
  { q: "Hlavní město ČR?", a: ["Praha", "Brno", "Ostrava", "Plzeň"], correct: 0 },
  { q: "2 + 2 * 2 = ?", a: ["6", "8", "4", "10"], correct: 0 },
  { q: "Který prvek má značku Fe?", a: ["Měď", "Zlato", "Železo", "Stříbro"], correct: 2 },
  { q: "Kdo napsal Babičku?", a: ["Božena Němcová", "Karel Čapek", "A. Jirásek", "F. Kafka"], correct: 0 },
  { q: "Kolik je 10! / 9! ?", a: ["10", "9", "100", "90"], correct: 0 }
];

function pickRandomQuestion() {
  return QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
}

/** ====== Auth ====== */
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Chybí jméno/heslo" });
  if (users.has(username)) return res.status(409).json({ error: "Uživatel existuje" });
  const passHash = await bcrypt.hash(password, 10);
  const id = uuidv4();
  users.set(username, { id, username, passHash });
  const token = jwt.sign({ id, username }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, username });
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  const u = users.get(username);
  if (!u) return res.status(401).json({ error: "Špatné přihlašovací údaje" });
  const ok = await bcrypt.compare(password, u.passHash);
  if (!ok) return res.status(401).json({ error: "Špatné přihlašovací údaje" });
  const token = jwt.sign({ id: u.id, username }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, username });
});

function authFromToken(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

/** ====== Game helpers ====== */
const COLORS = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b"]; // red, blue, green, amber

function createEmptyBoard(size = 5) {
  const grid = [];
  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) {
      row.push({ owner: null, strength: 0 });
    }
    grid.push(row);
  }
  return grid;
}

function initRoomState(room) {
  room.state = {
    phase: "lobby",             // lobby -> question -> resolve -> end
    size: 5,
    board: createEmptyBoard(5),
    turnIndex: 0,
    currentQuestion: null,
    deadlineTs: null,           // ms
    answers: {},                // userId -> {answerIndex, at}
    claimedCountByUser: {},     // userId -> number
    maxCells: 5*5
  };
}

function broadcastRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  io.to(roomId).emit("room:update", sanitizeRoom(room));
}

function sanitizeRoom(room) {
  const { id, name, hostUserId, players, state } = room;
  return {
    id, name, hostUserId,
    players: players.map(p => ({ id: p.id, username: p.username, color: p.color })),
    state
  };
}

function nextPlayerId(room) {
  if (!room.players.length) return null;
  return room.players[room.state.turnIndex % room.players.length]?.id;
}

function nextTurn(room) {
  room.state.turnIndex = (room.state.turnIndex + 1) % room.players.length;
}

/** ====== Socket.IO ====== */
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  const user = authFromToken(token);
  if (!user) return next(new Error("Neautorizováno"));
  socket.user = user; // {id, username}
  socketsToUser.set(socket.id, user.id);
  next();
});

io.on("connection", (socket) => {
  const user = socket.user;

  socket.on("room:create", ({ name }, cb) => {
    const id = uuidv4().slice(0, 6).toUpperCase();
    const room = { id, name: name || `Místnost ${id}`, hostUserId: user.id, players: [] };
    initRoomState(room);
    rooms.set(id, room);
    joinRoom(socket, id, cb);
  });

  socket.on("room:join", ({ roomId }, cb) => {
    joinRoom(socket, (roomId || "").trim().toUpperCase(), cb);
  });

  socket.on("room:leave", (cb) => {
    for (const [rid, room] of rooms) {
      const idx = room.players.findIndex(p => p.id === user.id);
      if (idx >= 0) {
        room.players.splice(idx, 1);
        socket.leave(rid);
        if (!room.players.length) rooms.delete(rid);
        else broadcastRoom(rid);
      }
    }
    cb && cb({ ok: true });
  });

  socket.on("game:start", ({ roomId }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return cb && cb({ ok: false, error: "Místnost neexistuje" });
    if (room.hostUserId !== user.id) return cb && cb({ ok: false, error: "Jen host může startovat" });
    if (room.players.length < 2) return cb && cb({ ok: false, error: "Potřeba alespoň 2 hráči" });
    initRoomState(room);
    room.state.phase = "question";
    room.state.currentQuestion = pickRandomQuestion();
    room.state.deadlineTs = Date.now() + 15000; // 15s
    room.state.answers = {};
    broadcastRoom(roomId);
    cb && cb({ ok: true });
  });

  socket.on("game:answer", ({ roomId, answerIndex }, cb) => {
    const room = rooms.get(roomId);
    if (!room || room.state.phase !== "question") return;
    room.state.answers[user.id] = { answerIndex, at: Date.now() };
    broadcastRoom(roomId);
    cb && cb({ ok: true });
  });

  socket.on("game:resolve", ({ roomId }, cb) => {
    const room = rooms.get(roomId);
    if (!room || room.state.phase !== "question") return;
    const q = room.state.currentQuestion;
    const correcters = Object.entries(room.state.answers)
      .filter(([uid, ans]) => ans.answerIndex === q.correct)
      .sort((a,b)=>a[1].at - b[1].at)
      .map(([uid]) => uid);

    room.state.phase = "resolve";
    io.to(roomId).emit("game:correcters", { userIds: correcters, correct: q.correct });

    // Pokud někdo odpověděl správně → první má tah na dobytí
    if (correcters.length) {
      room.state.turnIndex = room.players.findIndex(p => p.id === correcters[0]);
      room.state.phase = "claim";
      broadcastRoom(roomId);
    } else {
      // nikdo správně → další otázka
      room.state.phase = "question";
      room.state.currentQuestion = pickRandomQuestion();
      room.state.deadlineTs = Date.now() + 15000;
      room.state.answers = {};
      broadcastRoom(roomId);
    }
    cb && cb({ ok: true });
  });

  socket.on("game:claim", ({ roomId, x, y }, cb) => {
    const room = rooms.get(roomId);
    if (!room || room.state.phase !== "claim") return cb && cb({ ok: false });
    const current = nextPlayerId(room);
    if (current !== user.id) return cb && cb({ ok: false, error: "Nejsi na tahu" });

    const cell = room.state.board?.[y]?.[x];
    if (!cell) return cb && cb({ ok: false, error: "Mimo mapu" });
    if (cell.owner && cell.owner !== user.id) {
      // útok: přepíšeš
      cell.owner = user.id;
      cell.strength = 1;
    } else if (!cell.owner) {
      // dobytí prázdného
      cell.owner = user.id;
      cell.strength = 1;
    } else {
      // posílení vlastního
      cell.strength = Math.min(cell.strength + 1, 3);
    }

    room.state.claimedCountByUser[user.id] = (room.state.claimedCountByUser[user.id] || 0) + 1;

    // Kontrola konce
    const claimed = room.state.board.flat().filter(c => !!c.owner).length;
    if (claimed >= room.state.maxCells) {
      room.state.phase = "end";
      broadcastRoom(roomId);
      return cb && cb({ ok: true });
    }

    // Nové kolo: nová otázka
    nextTurn(room);
    room.state.phase = "question";
    room.state.currentQuestion = pickRandomQuestion();
    room.state.deadlineTs = Date.now() + 15000;
    room.state.answers = {};
    broadcastRoom(roomId);
    cb && cb({ ok: true });
  });

  socket.on("disconnect", () => {
    const uid = socketsToUser.get(socket.id);
    socketsToUser.delete(socket.id);
    for (const [rid, room] of rooms) {
      const idx = room.players.findIndex(p => p.id === uid);
      if (idx >= 0) {
        room.players.splice(idx, 1);
        if (!room.players.length) rooms.delete(rid);
        else broadcastRoom(rid);
      }
    }
  });
});

function joinRoom(socket, roomId, cb) {
  const room = rooms.get(roomId);
  if (!room) return cb && cb({ ok: false, error: "Místnost nenalezena" });
  if (room.players.find(p => p.id === socket.user.id)) {
    socket.join(roomId);
    broadcastRoom(roomId);
    return cb && cb({ ok: true, room: sanitizeRoom(room) });
  }
  const color = COLORS[room.players.length % COLORS.length];
  room.players.push({ id: socket.user.id, username: socket.user.username, socketId: socket.id, color });
  socket.join(roomId);
  broadcastRoom(roomId);
  cb && cb({ ok: true, room: sanitizeRoom(room) });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server běží na http://localhost:${PORT}`));
