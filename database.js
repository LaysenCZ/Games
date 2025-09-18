// database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');


const DB_PATH = path.join(__dirname, 'mmo.db');


function getDb() {
const db = new sqlite3.Database(DB_PATH);
return db;
}


function init() {
const db = getDb();
db.serialize(() => {
db.run(`CREATE TABLE IF NOT EXISTS users (
id INTEGER PRIMARY KEY AUTOINCREMENT,
username TEXT UNIQUE NOT NULL,
password_hash TEXT NOT NULL,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);


db.run(`CREATE TABLE IF NOT EXISTS villages (
id INTEGER PRIMARY KEY AUTOINCREMENT,
user_id INTEGER NOT NULL,
wood INTEGER DEFAULT 100,
stone INTEGER DEFAULT 100,
food INTEGER DEFAULT 100,
sawmill_level INTEGER DEFAULT 1,
quarry_level INTEGER DEFAULT 1,
farm_level INTEGER DEFAULT 1,
warehouse_level INTEGER DEFAULT 1,
barracks_level INTEGER DEFAULT 0,
footman INTEGER DEFAULT 0,
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
FOREIGN KEY(user_id) REFERENCES users(id)
)`);


db.run(`CREATE INDEX IF NOT EXISTS idx_villages_user ON villages(user_id)`);
});
return db;
}


module.exports = { getDb, init };
