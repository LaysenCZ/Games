// client.js
const API = {
async register(username, password) {
const r = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
if (!r.ok) throw await r.json();
return r.json();
},
async login(username, password) {
const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
if (!r.ok) throw await r.json();
return r.json();
},
async me() {
const token = localStorage.getItem('token');
const r = await fetch('/api/me', { headers: { 'Authorization': `Bearer ${token}` } });
if (!r.ok) throw await r.json();
return r.json();
},
async build(type) {
const token = localStorage.getItem('token');
const r = await fetch('/api/build', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ type }) });
if (!r.ok) throw await r.json();
return r.json();
},
async train(unit) {
const token = localStorage.getItem('token');
const r = await fetch('/api/train', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ unit }) });
if (!r.ok) throw await r.json();
return r.json();
}
};


const els = {
username: document.getElementById('username'),
password: document.getElementById('password'),
loginBtn: document.getElementById('loginBtn'),
registerBtn: document.getElementById('registerBtn'),
logoutBtn: document.getElementById('logoutBtn'),
who: document.getElementById('who'),
logged: document.getElementById('logged'),
authForms: document.getElementById('authForms'),


wood: document.getElementById('wood'),
stone: document.getElementById('stone'),
food: document.getElementById('food'),
lvl: {
sawmill: document.getElementById('lvl-sawmill'),
quarry: document.getElementById('lvl-quarry'),
farm: document.getElementById('lvl-farm'),
warehouse: document.getElementById('lvl-warehouse'),
barracks: document.getElementById('lvl-barracks')
},
unitFootman: document.getElementById('unit-footman'),
buildBtns: document.querySelectorAll('[data-build]'),
trainFootman: document.getElementById('train-footman'),


chat: document.getElementById('chat'),
chatMsg: document.getElementById('chatMsg'),
sendMsg: document.getElementById('sendMsg')
};


function setLoggedIn(username) {
els.authForms.classList.add('hidden');
els.logged.classList.remove('hidden');
els.who.textContent = username;
connectSocket();
refresh();
}


function setLoggedOut() {
els.authForms.classList.remove('hidden');
els.logged.classList.add('hidden');
els.who.textContent = '';
if (window.socket) window.socket.disconnect();
}


// Socket.io
function connectSocket() {
const token = localStorage.getItem('token');
if (!token) return;
const socket = io('/', { auth: { token } });
window.socket = socket;


socket.on('connect', () => {
// console.log('socket connected');
});
socket.on('village_update', () => refresh());
})();
