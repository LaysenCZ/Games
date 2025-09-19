let token = localStorage.getItem("token") || null;
let socket = null;
let me = null;
let room = null;

const qs = (s)=>document.querySelector(s);
const qsa = (s)=>Array.from(document.querySelectorAll(s));
const show = (el)=>el.classList.remove("hidden");
const hide = (el)=>el.classList.add("hidden");

const authPanel = qs("#authPanel");
const lobbyPanel = qs("#lobbyPanel");
const gamePanel = qs("#gamePanel");
const navAuth = qs("#nav-auth");
const userBox = qs("#userBox");
const who = qs("#who");

const btnShowLogin = qs("#btnShowLogin");
const btnShowRegister = qs("#btnShowRegister");
const loginForm = qs("#loginForm");
const registerForm = qs("#registerForm");
const btnLogout = qs("#btnLogout");

const btnCreateRoom = qs("#btnCreateRoom");
const joinCode = qs("#joinCode");
const btnJoinRoom = qs("#btnJoinRoom");
const btnLeaveRoom = qs("#btnLeaveRoom");
const btnStartGame = qs("#btnStartGame");

const roomInfo = qs("#roomInfo");
const roomName = qs("#roomName");
const roomIdEl = qs("#roomId");
const playersEl = qs("#players");

const board = qs("#board");
const ctx = board.getContext("2d");
const statusBar = qs("#statusBar");
const answersEl = qs("#answers");
const questionText = qs("#questionText");
const timer = qs("#timer");
const btnResolve = qs("#btnResolve");

let cellSize = 100;
let clickEnabled = false;

function setTabs() {
  qsa(".tab").forEach(tab=>{
    tab.addEventListener("click", ()=>{
      qsa(".tab").forEach(t=>t.classList.remove("active"));
      tab.classList.add("active");
      qsa(".tabcontent").forEach(c=>c.classList.remove("show"));
      qs("#"+tab.dataset.tab).classList.add("show");
    });
  });
}
setTabs();

/** ====== Auth UI ====== */
function uiLoggedIn() {
  hide(navAuth); show(userBox); who.textContent = me?.username || "";
  hide(authPanel); show(lobbyPanel);
}
function uiLoggedOut() {
  show(navAuth); hide(userBox); hide(lobbyPanel); hide(gamePanel); show(authPanel);
}

async function api(path, data) {
  const res = await fetch(path, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(data||{}) });
  const js = await res.json();
  if (!res.ok) throw new Error(js.error || "Chyba");
  return js;
}

btnShowLogin.onclick = ()=>{ qsa(".tab")[0].click(); show(authPanel); };
btnShowRegister.onclick = ()=>{ qsa(".tab")[1].click(); show(authPanel); };

registerForm.onsubmit = async (e)=>{
  e.preventDefault();
  const fd = new FormData(registerForm);
  try {
    const out = await api("/api/register", { username: fd.get("username"), password: fd.get("password") });
    token = out.token; localStorage.setItem("token", token); me = { username: out.username };
    connectSocket(); uiLoggedIn();
  } catch(err){ alert(err.message); }
};
loginForm.onsubmit = async (e)=>{
  e.preventDefault();
  const fd = new FormData(loginForm);
  try {
    const out = await api("/api/login", { username: fd.get("username"), password: fd.get("password") });
    token = out.token; localStorage.setItem("token", token); me = { username: out.username };
    connectSocket(); uiLoggedIn();
  } catch(err){ alert(err.message); }
};
btnLogout.onclick = ()=>{
  localStorage.removeItem("token"); token=null; me=null; if (socket) socket.disconnect();
  uiLoggedOut();
};

/** ====== Socket ====== */
function connectSocket() {
  if (!token) return;
  socket = io({ auth: { token } });

  socket.on("connect_error", (e)=> alert("Socket chyba: "+e.message));
  socket.on("room:update", (r)=>{ room = r; renderRoom(); renderBoard(); renderQA(); });
  socket.on("game:correcters", ({ userIds, correct })=>{
    const names = room.players.filter(p=>userIds.includes(p.id)).map(p=>p.username).join(", ");
    statusBar.textContent = `Správně: ${names || "Nikdo"} (odpověď ${correct+1})`;
  });
}

/** ====== Lobby ====== */
btnCreateRoom.onclick = ()=>{
  socket.emit("room:create", { name: `Hra ${Math.random().toString(36).slice(2,6).toUpperCase()}` }, (res)=>{
    if(!res.ok) return alert(res.error);
    room = res.room; renderRoom();
  });
};
btnJoinRoom.onclick = ()=>{
  const code = joinCode.value.trim().toUpperCase();
  if(!code) return;
  socket.emit("room:join", { roomId: code }, (res)=>{
    if(!res.ok) return alert(res.error);
    room = res.room; renderRoom();
  });
};
btnLeaveRoom.onclick = ()=>{
  socket.emit("room:leave", ()=>{ room=null; renderRoom(); });
};
btnStartGame.onclick = ()=>{
  socket.emit("game:start", { roomId: room.id }, (res)=>{
    if(!res.ok) alert(res.error);
  });
};

function renderRoom() {
  if (!room) { hide(roomInfo); show(lobbyPanel); hide(gamePanel); return; }
  show(roomInfo);
  roomName.textContent = room.name;
  roomIdEl.textContent = room.id;
  playersEl.innerHTML = "";
  room.players.forEach(p=>{
    const div = document.createElement("div");
    div.className = "player-chip";
    const dot = document.createElement("span"); dot.className = "player-dot"; dot.style.background = p.color;
    div.appendChild(dot);
    div.append(` ${p.username}`);
    playersEl.appendChild(div);
  });

  const isHost = room.hostUserId && me && room.players.find(p=>p.id===room.hostUserId)?.username===me.username;
  btnStartGame.disabled = !isHost || room.players.length < 2;

  if (room.state?.phase && room.state.phase !== "lobby") {
    hide(lobbyPanel); show(gamePanel);
  } else {
    show(lobbyPanel); hide(gamePanel);
  }
}

/** ====== Game rendering ====== */
function renderBoard() {
  if (!room?.state?.board) return;
  const size = room.state.board.length;
  cellSize = Math.floor(Math.min(board.width, board.height) / size);
  ctx.clearRect(0,0,board.width,board.height);

  for (let y=0; y<size; y++){
    for (let x=0; x<size; x++){
      const cell = room.state.board[y][x];
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(x*cellSize, y*cellSize, cellSize-1, cellSize-1);
      if (cell.owner) {
        const p = room.players.find(p=>p.id===cell.owner);
        ctx.fillStyle = p?.color || "#94a3b8";
        ctx.fillRect(x*cellSize+2, y*cellSize+2, cellSize-4, cellSize-4);
        // strength dots
        for (let i=0;i<cell.strength;i++){
          ctx.fillStyle = "#0b1020";
          ctx.beginPath();
          ctx.arc(x*cellSize+cellSize-12-i*10, y*cellSize+12, 4, 0, Math.PI*2);
          ctx.fill();
        }
      }
    }
  }
  clickEnabled = room.state.phase === "claim" && isMyTurn();
}

board.addEventListener("click", (e)=>{
  if (!clickEnabled) return;
  const rect = board.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const x = Math.floor(mx / cellSize), y = Math.floor(my / cellSize);
  socket.emit("game:claim", { roomId: room.id, x, y }, (res)=>{
    if(!res.ok) alert(res.error);
  });
});

function isMyTurn() {
  if (!room?.state) return false;
  const idx = room.state.turnIndex % room.players.length;
  const p = room.players[idx];
  return p?.username === me?.username;
}

/** ====== QA ====== */
let countdownInt = null;
function renderQA() {
  answersEl.innerHTML = "";
  if (!room?.state) return;

  if (room.state.phase === "question") {
    const q = room.state.currentQuestion;
    questionText.textContent = q ? q.q : "Čekám na otázku…";
    (q?.a || []).forEach((opt, i)=>{
      const btn = document.createElement("button");
      btn.textContent = `${i+1}. ${opt}`;
      btn.onclick = ()=> socket.emit("game:answer", { roomId: room.id, answerIndex: i }, ()=>{});
      answersEl.appendChild(btn);
    });
    btnResolve.disabled = false;
    // timer
    clearInterval(countdownInt);
    countdownInt = setInterval(()=>{
      const left = Math.max(0, Math.floor((room.state.deadlineTs - Date.now())/1000));
      timer.textContent = `Zbývá: ${left}s`;
      if (left <= 0) { clearInterval(countdownInt); btnResolve.click(); }
    }, 250);
  } else if (room.state.phase === "claim") {
    questionText.textContent = isMyTurn() ? "Tvoje tah – klikni na mapu." : "Soupeř dobývá…";
    timer.textContent = "";
    btnResolve.disabled = true;
  } else if (room.state.phase === "end") {
    questionText.textContent = "Konec hry.";
    timer.textContent = "";
    btnResolve.disabled = true;
  } else {
    questionText.textContent = "…";
    timer.textContent = "";
  }
}

btnResolve.onclick = ()=>{
  socket.emit("game:resolve", { roomId: room.id }, ()=>{});
};

/** ====== Init ====== */
(function init(){
  if (token) {
    // „dekód“ jen pro jméno z localStorage není – server pošle u socketu; tady jen UX:
    me = { username: "hráč" };
    connectSocket(); uiLoggedIn();
  } else {
    uiLoggedOut();
  }
})();
