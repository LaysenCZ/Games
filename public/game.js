// Socket.io připojení
const socket = io();

// Debug uvítání
socket.on("server:hello", (msg) => {
  console.log("[server]", msg);
});

// UI náhled hry
const rumorInput = document.getElementById("rumor-text");
const rumorList = document.getElementById("rumor-list");
const localRumors = [];

function escapeHTML(s){
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function renderRumors(){
  if (!rumorList) return;
  rumorList.innerHTML = localRumors.map(r => `
    <div class="rumor">
      <div>${escapeHTML(r.text)}</div>
      <div class="meta">🕒 ${new Date(r.time).toLocaleTimeString()} • 🧑 ${escapeHTML(r.author)}</div>
    </div>
  ).join("");
  rumorList.scrollTop = rumorList.scrollHeight;
}

rumorInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter"){
    const text = rumorInput.value.trim();
    if (!text) return;
    socket.emit("client:rumor", { text, author: "Obyvatel" });
    rumorInput.value = "";
  }
});

socket.on("server:rumor", (r) => {
  localRumors.push(r);
  nudgeCityByRumor(r.text);
  renderRumors();
});

// Fake dopad do ukazatelů
const mEco = document.getElementById("m-eco");
const mSta = document.getElementById("m-sta");
const mHap = document.getElementById("m-hap");
const mCha = document.getElementById("m-cha");

function clamp(v){ return Math.max(0, Math.min(100, v)); }

function nudgeCityByRumor(text){
  if (!mEco || !mSta || !mHap || !mCha) return;
  const t = text.toLowerCase();
  let eco = Number(mEco.value), sta = Number(mSta.value), hap = Number(mHap.value), cha = Number(mCha.value);

  if (t.includes("krize") || t.includes("bankrot") || t.includes("zlod")){
    eco -= 4; sta -= 2; cha += 5;
  } else if (t.includes("oslava") || t.includes("festival") || t.includes("vyhra")){
    hap += 6; sta += 2; cha -= 2;
  } else if (t.includes("protest") || t.includes("panika") || t.includes("virus")){
    sta -= 5; hap -= 3; cha += 6;
  } else {
    cha += Math.random() < 0.5 ? 1 : 0;
  }

  mEco.value = clamp(eco);
  mSta.value = clamp(sta);
  mHap.value = clamp(hap);
  mCha.value = clamp(cha);
}
