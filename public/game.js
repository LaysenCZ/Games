// ====== Pomocné ======
const $ = (sel) => document.querySelector(sel);
const state = {
  token: null,
  me: null,
  socket: null,
  musicOn: true,
  sfxOn: true,
  audio: null,
  sfx: null,
  faction: "humans",
  world: null,
  players: []
};

// ====== Hudba & Zvuky (WebAudio, bez souborů) ======
class MusicEngine {
  constructor() {
    this.ctx = null;
    this.gain = null;
    this.oscs = [];
    this.playing = false;
  }
  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0.05; // příjemné tiché pozadí
    this.gain.connect(this.ctx.destination);
  }
  start() {
    if (this.playing) return;
    this.init();
    // jednoduchá ambient smyčka: akordy + arpeggio
    const notes = [220, 277, 330, 415]; // A3, C#4, E4, G#4 (mystická nálada)
    const now = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const o = this.ctx.createOscillator();
      o.type = i < 3 ? "sine" : "triangle";
      o.frequency.value = notes[i];
      const g = this.ctx.createGain();
      g.gain.value = i < 3 ? 0.02 : 0.01;
      o.connect(g).connect(this.gain);
      o.start(now + i * 0.05);
      this.oscs.push(o);
    }
    this.playing = true;
  }
  stop() {
    if (!this.playing) return;
    this.oscs.forEach(o => { try { o.stop(); } catch(_){} });
    this.oscs = [];
    this.playing = false;
  }
  toggle(on) { on ? this.start() : this.stop(); }
}

class Sfx {
  constructor(ctx) { this.ctx = ctx; }
  beep(freq = 880, dur = 0.08) {
    if (!state.sfxOn) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.value = freq; o.type = "square";
    g.gain.value = 0.06;
    o.connect(g).connect(this.ctx.destination);
    o.start();
    o.stop(this.ctx.currentTime + dur);
  }
  whoosh() {
    if (!state.sfxOn) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sawtooth"; o.frequency.value = 120;
    g.gain.value = 0.04;
    o.connect(g).connect(this.ctx.destination);
    const now = this.ctx.currentTime;
    o.frequency.exponentialRampToValueAtTime(40, now + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    o.start(); o.stop(now + 0.31);
  }
}

function ensureAudio() {
  if (!state.audio) {
    state.audio = new MusicEngine();
  }
  if (!state.sfx && state.audio && state.audio.ctx) {
    state.sfx = new Sfx(state.audio.ctx);
  }
}

// ====== UI: Přepínání login/registrace ======
const tabLogin = $("#tab-login");
const tabRegister = $("#tab-register");
const loginForm = $("#login-form");
const registerForm = $("#register-form");
const loginError = $("#login-error");
const registerError = $("#register-error");
const avatarInput = $("#avatar-file");
const avatarPreview = $("#avatar-preview");
const useSampleBtn = $("#use-sample");
const factionSelect = $("#reg-faction");

tabLogin.addEventListener("click", () => {
  tabLogin.classList.add("active");
  tabRegister.classList.remove("active");
  loginForm.classList.remove("hidden");
  registerForm.classList.add("hidden");
});
tabRegister.addEventListener("click", () => {
  tabRegister.classList.add("active");
  tabLogin.classList.remove("active");
  registerForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
});

avatarInput.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    avatarPreview.src = r.result;
    avatarPreview.style.display = "block";
  };
  r.readAsDataURL(file);
});

useSampleBtn.addEventListener("click", () => {
  // jednoduchý vygenerovaný canvas jako avatar (runic orb)
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64,64,5, 64,64,60);
  const hue = Math.floor(Math.random()*360);
  g.addColorStop(0, `hsl(${hue},90%,70%)`);
  g.addColorStop(1, `hsl(${(hue+180)%360},80%,25%)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(64,64,60,0,Math.PI*2); ctx.fill();
  // runa
  ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(64,25); ctx.lineTo(64,100); ctx.stroke();
  ctx.beginPath(); ctx.arc(64,64,28,0,Math.PI*2); ctx.stroke();
  avatarPreview.src = c.toDataURL("image/png");
  avatarPreview.style.display = "block";
});

factionSelect.addEventListener("change", () => {
  state.faction = factionSelect.value;
});

// ====== API helpery ======
async function api(path, data) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(data || {})
  });
  return res.json();
}
async function me() {
  if (!state.token) return null;
  const res = await fetch("/api/me", {
    headers: { "Authorization": "Bearer " + state.token }
  });
  const j = await res.json();
  return j.ok ? j : null;
}

// ====== Login/Registrace akce ======
$("#login-btn").addEventListener("click", async () => {
  loginError.textContent = "";
  const username = $("#login-username").value.trim();
  const password = $("#login-password").value;
  if (!username || !password) { loginError.textContent = "Vyplň jméno i heslo."; return; }
  const res = await api("/api/login", { username, password });
  if (!res.ok) { loginError.textContent = res.error || "Chyba přihlášení."; return; }
  state.token = res.token;
  localStorage.setItem("token", state.token);
  state.me = { username: res.username, avatarDataUrl: res.avatarDataUrl };
  state.faction = "humans"; // default po loginu
  enterGame();
});

$("#register-btn").addEventListener("click", async () => {
  registerError.textContent = "";
  const username = $("#reg-username").value.trim();
  const password = $("#reg-password").value;
  const avatarDataUrl = avatarPreview.src || null;
  const faction = $("#reg-faction").value;
  if (!username || !password) { registerError.textContent = "Vyplň jméno i heslo."; return; }
  const res = await api("/api/register", { username, password, avatarDataUrl });
  if (!res.ok) { registerError.textContent = res.error || "Chyba registrace."; return; }
  state.token = res.token;
  localStorage.setItem("token", state.token);
  state.me = { username: res.username, avatarDataUrl: res.avatarDataUrl };
  state.faction = faction || "humans";
  enterGame();
});

// ====== Vstup do hry ======
async function enterGame() {
  $("#auth-screen").classList.add("hidden");
  $("#game-ui").classList.remove("hidden");

  // audio
  ensureAudio();
  state.audio.start();

  // sokety
  state.socket = io();
  state.socket.on("connect", () => {
    state.socket.emit("auth", {
      token: state.token,
      avatarDataUrl: state.me?.avatarDataUrl || null,
      faction: state.faction || "humans"
    });
  });
  state.socket.on("auth_error", (err) => {
    alert(err);
    logout();
  });
  state.socket.on("world_init", ({ world }) => {
    state.world = world;
    draw();
  });
  state.socket.on("players", (list) => {
    state.players = list;
    renderPlayersList();
    draw();
  });
  state.socket.on("chat", (m) => addChat(m.from, m.faction, m.text));
  state.socket.on("sfx", ({ type }) => {
    ensureAudio();
    if (type === "join") state.sfx?.beep(1100, 0.09);
    if (type === "leave") state.sfx?.beep(400, 0.09);
  });

  // ovládání
  window.addEventListener("keydown", onKey);
  $("#chat-send").addEventListener("click", sendChat);
  $("#chat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendChat();
  });
  $("#music-toggle").addEventListener("click", () => {
    state.musicOn = !state.musicOn;
    ensureAudio();
    state.audio.toggle(state.musicOn);
  });
  $("#sfx-toggle").addEventListener("click", () => {
    state.sfxOn = !state.sfxOn;
    ensureAudio();
    state.sfx?.beep(600,0.06);
  });
  $("#logout-btn").addEventListener("click", logout);

  // auto-login z localStorage (pokud už byl)
}

function logout() {
  try { state.socket?.disconnect(); } catch(_){}
  localStorage.removeItem("token");
  location.reload();
}

// ====== Vykreslení mapy ======
const canvas = $("#game-canvas");
const ctx = canvas.getContext("2d");

function draw() {
  if (!state.world) return;
  const W = canvas.width, H = canvas.height;

  // pozadí (pláně)
  ctx.fillStyle = "#d6f5d6";
  ctx.fillRect(0,0,W,H);

  // grid pro orientaci
  const grid = 10;
  ctx.strokeStyle = "rgba(0,0,0,.05)";
  for (let i=0;i<=grid;i++){
    const x = (i/grid)*W, y = (i/grid)*H;
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
  }

  // helper: transform svět->canvas
  const tX = (x)=> x/100 * W;
  const tY = (y)=> (100 - y)/100 * H;

  // regiony frakcí (kruhy)
  state.world.regions.forEach(r => {
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.fillStyle = ({
      humans:"#f4e1c1",
      elves:"#7cd992",
      necro:"#9b7ab3",
      orcs:"#e6b566",
      dwarves:"#a9a9a9"
    })[r.faction] || "#cccccc";
    ctx.arc(tX(r.x), tY(r.y), r.r/100*W, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#111";
    ctx.font = "bold 18px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(r.name, tX(r.x), tY(r.y)+6);
  });

  // speciální lokace (hvězdy)
  state.world.specials.forEach(s => {
    ctx.save();
    const x=tX(s.x), y=tY(s.y);
    ctx.translate(x,y);
    drawStar(ctx, 0,0, 8, 18, 8, ({
      dragon:"#ff4444",
      portal:"#a66bff",
      fountain:"#4da3ff",
      ruins:"#8b5a2b",
      shrine:"#ffd700"
    })[s.type] || "#000");
    ctx.restore();
    ctx.fillStyle = "#111";
    ctx.font = "bold 16px system-ui";
    ctx.textAlign = "left";
    ctx.fillText(s.name, x+14, y-10);
  });

  // hráči
  state.players.forEach(p => {
    const x = tX(p.x), y = tY(p.y);
    // avatar kolečko
    if (p.avatarDataUrl){
      const img = new Image(); img.src = p.avatarDataUrl;
      img.onload = ()=> {
        ctx.save();
        ctx.beginPath(); ctx.arc(x,y,14,0,Math.PI*2); ctx.closePath(); ctx.clip();
        ctx.drawImage(img, x-14, y-14, 28, 28);
        ctx.restore();
        drawPlayerLabel(p, x,y);
      };
    } else {
      ctx.fillStyle = "#222";
      ctx.beginPath(); ctx.arc(x,y,14,0,Math.PI*2); ctx.fill();
      drawPlayerLabel(p, x,y);
    }
  });
}

function drawPlayerLabel(p, x,y){
  const col = ({
    humans:"#2d2a26",
    elves:"#0b3d1b",
    necro:"#2f1e3a",
    orcs:"#3f2e12",
    dwarves:"#2c2c2c"
  })[p.faction] || "#222";
  ctx.fillStyle = "rgba(255,255,255,.95)";
  ctx.font = "bold 12px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(p.username, x, y - 18);
  ctx.strokeStyle = col; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x,y,15,0,Math.PI*2); ctx.stroke();
}

function drawStar(ctx, x, y, spikes, outerRadius, innerRadius, color) {
  let rot = Math.PI / 2 * 3;
  let cx = x, cy = y;
  let step = Math.PI / spikes;
  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);
  for (let i = 0; i < spikes; i++) {
    cx = x + Math.cos(rot) * outerRadius;
    cy = y + Math.sin(rot) * outerRadius;
    ctx.lineTo(cx, cy);
    rot += step;

    cx = x + Math.cos(rot) * innerRadius;
    cy = y + Math.sin(rot) * innerRadius;
    ctx.lineTo(cx, cy);
    rot += step;
  }
  ctx.lineTo(x, y - outerRadius);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// ====== Pohyb & Chat ======
function onKey(e){
  const k = e.key.toLowerCase();
  const dir = (k==="arrowup"||k==="w") ? "up"
           : (k==="arrowdown"||k==="s") ? "down"
           : (k==="arrowleft"||k==="a") ? "left"
           : (k==="arrowright"||k==="d") ? "right" : null;
  if (dir) {
    state.socket.emit("move", dir);
    ensureAudio(); state.sfx?.whoosh();
  }
}

function addChat(from, faction, text){
  const box = $("#chat-box");
  const el = document.createElement("div");
  el.className = "chat-msg";
  el.innerHTML = `<span class="chat-name">${escapeHtml(from)}</span> <span class="chat-faction">[${faction}]</span>: ${escapeHtml(text)}`;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}

function sendChat(){
  const input = $("#chat-input");
  const txt = input.value.trim();
  if (!txt) return;
  state.socket.emit("chat", txt);
  input.value = "";
}

function escapeHtml(s){
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

// ====== Auto-login, pokud existuje token ======
(async function init(){
  const saved = localStorage.getItem("token");
  if (saved) {
    state.token = saved;
    const info = await me();
    if (info) {
      state.me = { username: info.username, avatarDataUrl: info.avatarDataUrl };
      // nabídneme rychlý vstup do hry s poslední frakcí (ponecháme humans)
      $("#auth-screen").classList.add("hidden");
      $("#game-ui").classList.remove("hidden");
      enterGame();
      return;
    }
  }
  // jinak zůstaň na auth obrazovce
})();
