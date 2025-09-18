// server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const path = require('path');
const { getDb, init } = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TICK_MS = 5000; // 5 sekundový tick

init();
const db = getDb();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Pomocné funkce
function signToken(userId) {
  return jwt.sign({ uid: userId }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.uid;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Registrace
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username & password required' });

  const password_hash = bcrypt.hashSync(password, 10);
  db.run(
    'INSERT INTO users (username, password_hash) VALUES (?, ?)',
    [username, password_hash],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'username taken' });
        return res.status(500).json({ error: 'db error' });
      }
      const userId = this.lastID;
      db.run(`INSERT INTO villages (user_id) VALUES (?)`, [userId], (err2) => {
        if (err2) return res.status(500).json({ error: 'db error (village)' });
        const token = signToken(userId);
        res.json({ token, username });
      });
    }
  );
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username & password required' });
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) return res.status(500).json({ error: 'db error' });
    if (!user) return res.status(401).json({ error: 'invalid credentials' });
    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    const token = signToken(user.id);
    res.json({ token, username });
  });
});

// Získání stavu vesnice
app.get('/api/me', authMiddleware, (req, res) => {
  db.get('SELECT * FROM villages WHERE user_id = ?', [req.userId], (err, v) => {
    if (err || !v) return res.status(500).json({ error: 'db error' });
    res.json({
      resources: { wood: v.wood, stone: v.stone, food: v.food },
      buildings: {
        sawmill: v.sawmill_level,
        quarry: v.quarry_level,
        farm: v.farm_level,
        warehouse: v.warehouse_level,
        barracks: v.barracks_level
      },
      units: { footman: v.footman }
    });
  });
});

// Ceny vylepšení budov a tréninku
function buildCost(type, levelNext) {
  const base = {
    sawmill: { wood: 20, stone: 10, food: 0 },
    quarry: { wood: 10, stone: 20, food: 0 },
    farm: { wood: 15, stone: 5, food: 0 },
    warehouse: { wood: 30, stone: 30, food: 10 },
    barracks: { wood: 25, stone: 25, food: 10 }
  }[type];
  if (!base) return null;
  const mult = 1 + (levelNext - 1) * 0.5;
  return {
    wood: Math.ceil(base.wood * mult),
    stone: Math.ceil(base.stone * mult),
    food: Math.ceil(base.food * mult)
  };
}

function trainCost(unitType) {
  if (unitType === 'footman') return { wood: 5, stone: 0, food: 10 };
  return null;
}

// Vylepšení budovy
app.post('/api/build', authMiddleware, (req, res) => {
  const { type } = req.body;
  if (!type) return res.status(400).json({ error: 'missing type' });
  db.get('SELECT * FROM villages WHERE user_id = ?', [req.userId], (err, v) => {
    if (err || !v) return res.status(500).json({ error: 'db error' });
    const levelField = `${type}_level`;
    const currentLevel = v[levelField];
    const nextLevel = currentLevel + 1;
    const cost = buildCost(type, nextLevel);
    if (!cost) return res.status(400).json({ error: 'invalid building' });

    if (v.wood < cost.wood || v.stone < cost.stone || v.food < cost.food) {
      return res.status(400).json({ error: 'not enough resources', cost });
    }

    const newWood = v.wood - cost.wood;
    const newStone = v.stone - cost.stone;
    const newFood = v.food - cost.food;

    db.run(
      `UPDATE villages SET ${levelField} = ?, wood = ?, stone = ?, food = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [nextLevel, newWood, newStone, newFood, v.id],
      function (err2) {
        if (err2) return res.status(500).json({ error: 'db error' });
        io.to(`user:${req.userId}`).emit('village_update');
        res.json({ ok: true, nextLevel, cost });
      }
    );
  });
});

// Trénink jednotek
app.post('/api/train', authMiddleware, (req, res) => {
  const { unit } = req.body;
  if (!unit) return res.status(400).json({ error: 'missing unit' });
  const cost = trainCost(unit);
  if (!cost) return res.status(400).json({ error: 'invalid unit' });

  db.get('SELECT * FROM villages WHERE user_id = ?', [req.userId], (err, v) => {
    if (err || !v) return res.status(500).json({ error: 'db error' });

    if (v.wood < cost.wood || v.stone < cost.stone || v.food < cost.food) {
      return res.status(400).json({ error: 'not enough resources', cost });
    }

    const newWood = v.wood - cost.wood;
    const newStone = v.stone - cost.stone;
    const newFood = v.food - cost.food;
    const unitField = 'footman';
    const newCount = v[unitField] + 1;

    db.run(
      `UPDATE villages SET wood = ?, stone = ?, food = ?, ${unitField} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [newWood, newStone, newFood, newCount, v.id],
      function (err2) {
        if (err2) return res.status(500).json({ error: 'db error' });
        io.to(`user:${req.userId}`).emit('village_update');
        res.json({ ok: true, unit, count: newCount });
      }
    );
  });
});

// Socket.io — chat a live aktualizace
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('no token'));
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    socket.userId = payload.uid;
    return next();
  } catch (e) {
    return next(new Error('bad token'));
  }
});

io.on('connection', (socket) => {
  const room = `user:${socket.userId}`;
  socket.join(room);

  socket.on('chat_message', (msg) => {
    const safe = String(msg).slice(0, 300);
    io.emit('chat_message', { userId: socket.userId, message: safe, ts: Date.now() });
  });
});

// Serverový tick – produkce surovin
setInterval(() => {
  db.all('SELECT * FROM villages', (err, rows) => {
    if (err || !rows) return;
    rows.forEach(v => {
      const addWood = v.sawmill_level * 1;
      const addStone = v.quarry_level * 1;
      const addFood = v.farm_level * 1;

      const newWood = v.wood + addWood;
      const newStone = v.stone + addStone;
      const newFood = v.food + addFood;

      db.run(
        'UPDATE villages SET wood = ?, stone = ?, food = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newWood, newStone, newFood, v.id],
        (e2) => {
          if (!e2) io.to(`user:${v.user_id}`).emit('village_update');
        }
      );
    });
  });
}, TICK_MS);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server běží na http://localhost:${PORT}`);
});
