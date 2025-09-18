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
cors: { origin: '*'}
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
db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, password_hash], function(err) {
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
});
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
server.listen(PORT, () => console.log(`Server běží na http://localhost:${PORT}`));
