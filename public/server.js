const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const bodyParser = require("body-parser");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(bodyParser.json({ limit: "5mb" }));
app.use(express.static("public"));

// ===== In-memory "DB" (MVP) =====
const users = new Map(); // username -> { passwordHash, avatarDataUrl }
const sessions = new Map(); // token -> username
const players = new Map(); // socket.id -> { username, x, y, avatarDataUrl, faction }

// jednoduchý hash (MVP) – pro produkci použij bcrypt/scrypt/argon2
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex");

// ===== API: Registrace & Login =====
app.post("/api/register", (req, res) => {
  const { username, password, avatarDataUrl } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "Chybí uživatelské jméno nebo heslo." });
  }
  if (users.has(username)) {
    return res.status(400).json({ ok: false, error: "Uživatel už existuje." });
  }
  users.set(username, { passwordHash: hash(password), avatarDataUrl: avatarDataUrl || null });
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, username);
  return res.json({ ok: true, token, username, avatarDataUrl: avatarDataUrl || null });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "Chybí uživatelské jméno nebo heslo." });
  }
  const u = users.get(username);
  if (!u || u.passwordHash !== hash(password)) {
    return res.status(401).json({ ok: false, error: "Špatné jméno nebo heslo." });
  }
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, username);
  return res.json({ ok: true, token, username, avatarDataUrl: u.avatarDataUrl || null });
});

app.get("/api/me", (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token || !sessions.has(token)) return res.status(401).json({ ok: false });
  const username = sessions.get(token);
  const u = users.get(username);
  res.json({ ok: true, username, avatarDataUrl: u?.avatarDataUrl || null });
});

// ===== Socket.IO – multiplayer =====

const WORLD = {
  width: 100,
  height: 100,
  specials: [
    { name: "Dračí hnízdo", x: 90, y: 90, type: "dragon" },
    { name: "Portál", x: 80, y: 20, type: "portal" },
    { name: "Magická fontána", x: 60, y: 75, type: "fountain" },
    { name: "Staré ruiny", x: 30, y: 65, type: "ruins" },
    { name: "Svatyně bohů", x: 50, y: 50, type: "shrine" }
  ],
  regions: [
    { name: "Lidé (Království)", x: 40, y: 50, r: 15, faction: "humans" },
    { name: "Elfové (Lesy)", x: 75, y: 65, r: 15, faction: "elves" },
    { name: "Nekromanti (Bažiny)", x: 20, y: 80, r: 15, faction: "necro" },
    { name: "Orkové (Pouště)", x: 50, y: 15, r: 15, faction: "orcs" },
    { name: "Trpaslíci (Hory)", x: 10, y: 40, r: 15, faction: "dwarves" }
  ]
};

io.on("connection", (socket) => {
  // očekáváme handshake s tokenem a avatar/faction
  socket.on("auth", ({ token, avatarDataUrl, faction }) => {
    const username = sessions.get(token);
    if (!username) {
      socket.emit("auth_error", "Neplatná session, přihlas se znovu.");
      socket.disconnect(true);
      return;
    }

    // inicializace hráče
    const start = pickStartForFaction(faction);
    players.set(socket.id, {
      username,
      x: start.x,
      y: start.y,
      avatarDataUrl: avatarDataUrl || users.get(username)?.avatarDataUrl || null,
      faction: faction || start.faction
    });

    socket.join("world");
    io.to("world").emit("sfx", { type: "join" }); // zvuk připojení
    socket.emit("world_init", { world: WORLD });
    io.to("world").emit("players", getPlayersSnapshot());
  });

  socket.on("move", (dir) => {
    const p = players.get(socket.id);
    if (!p) return;
    const speed = 1;
    if (dir === "up") p.y = Math.min(WORLD.height, p.y + speed);
    if (dir === "down") p.y = Math.max(0, p.y - speed);
    if (dir === "left") p.x = Math.max(0, p.x - speed);
    if (dir === "right") p.x = Math.min(WORLD.width, p.x + speed);
    io.to("world").emit("players", getPlayersSnapshot());
  });

  socket.on("chat", (msg) => {
    const p = players.get(socket.id);
    if (!p) return;
    const safe = ("" + msg).slice(0, 200);
    io.to("world").emit("chat", { from: p.username, faction: p.faction, text: safe, ts: Date.now() });
  });

  socket.on("disconnect", () => {
    if (players.has(socket.id)) {
      players.delete(socket.id);
      io.to("world").emit("players", getPlayersSnapshot());
      io.to("world").emit("sfx", { type: "leave" });
    }
  });
});

function getPlayersSnapshot() {
  const list = [];
  players.forEach((p, id) => {
    list.push({ id, username: p.username, x: p.x, y: p.y, avatarDataUrl: p.avatarDataUrl, faction: p.faction });
  });
  return list;
}

function pickStartForFaction(faction) {
  const r = WORLD.regions.find((x) => x.faction === faction) || WORLD.regions[0];
  // mírný random v rámci kruhu
  const angle = Math.random() * Math.PI * 2;
  const rad = Math.random() * (r.r - 2);
  const x = Math.max(0, Math.min(WORLD.width, r.x + Math.cos(angle) * rad));
  const y = Math.max(0, Math.min(WORLD.height, r.y + Math.sin(angle) * rad));
  return { x, y, faction: r.faction };
}

// ===== Start serveru =====
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server běží na http://localhost:" + PORT);
});
