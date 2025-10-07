// --- UI přepínání pohledů
const views = document.querySelectorAll(".view");
const navBtns = document.querySelectorAll(".nav-btn");
const audioMenu = document.getElementById("audio-menu");
const audioGame = document.getElementById("audio-game");
const sfxClick = document.getElementById("sfx-click");
const btnPlay = document.getElementById("btn-play");

let musicEnabled = true;
let sfxEnabled = true;

function showView(id){
  views.forEach(v => v.classList.toggle("visible", v.id === `view-${id}`));
  navBtns.forEach(b => b.classList.toggle("active", b.dataset.view === id));
  if (sfxEnabled) try{ sfxClick.currentTime = 0; sfxClick.play(); }catch{}
  // auto přepnutí hudby
  if (id === "game"){
    fadeToGameMusic();
  } else {
    fadeToMenuMusic();
  }
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-view]");
  if (!btn) return;
  const v = btn.getAttribute("data-view");
  showView(v);
});

btnPlay?.addEventListener("click", () => showView("game"));

// --- Hudba & nastavení
const musicVolume = document.getElementById("music-volume");
const sfxVolume = document.getElementById("sfx-volume");
const musicToggle = document.getElementById("music-toggle");
const sfxToggle = document.getElementById("sfx-toggle");

function initAudio(){
  audioMenu.volume = Number(localStorage.getItem("vol_music") ?? 0.6);
  audioGame.volume = Number(localStorage.getItem("vol_music") ?? 0.6);
  sfxClick.volume = Number(localStorage.getItem("vol_sfx") ?? 0.9);

  musicVolume.value = audioMenu.volume;
  sfxVolume.value = sfxClick.volume;

  musicEnabled = (localStorage.getItem("music_enabled") ?? "1") === "1";
  sfxEnabled = (localStorage.getItem("sfx_enabled") ?? "1") === "1";
  musicToggle.checked = musicEnabled;
  sfxToggle.checked = sfxEnabled;

  if (musicEnabled) {
    audioMenu.currentTime = 0;
    audioMenu.play().catch(()=>{});
  }
}
function fadeToMenuMusic(){
  if (!musicEnabled) return;
  try{
    audioGame.pause();
    audioMenu.play().catch(()=>{});
  }catch{}
}
function fadeToGameMusic(){
  if (!musicEnabled) return;
  try{
    audioMenu.pause();
    audioGame.currentTime = 0;
    audioGame.play().catch(()=>{});
  }catch{}
}

musicVolume.addEventListener("input", () => {
  const v = Number(musicVolume.value);
  audioMenu.volume = v; audioGame.volume = v;
  localStorage.setItem("vol_music", String(v));
});
sfxVolume.addEventListener("input", () => {
  const v = Number(sfxVolume.value);
  sfxClick.volume = v;
  localStorage.setItem("vol_sfx", String(v));
});
musicToggle.addEventListener("change", () => {
  musicEnabled = musicToggle.checked;
  localStorage.setItem("music_enabled", musicEnabled ? "1" : "0");
  if (!musicEnabled){ audioMenu.pause(); audioGame.pause(); }
  else {
    // Zahraj tu, která patří k aktuálnímu view
    const visible = document.querySelector(".view.visible")?.id || "view-menu";
    if (visible === "view-game") fadeToGameMusic(); else fadeToMenuMusic();
  }
});
sfxToggle.addEventListener("change", () => {
  sfxEnabled = sfxToggle.checked;
  localStorage.setItem("sfx_enabled", sfxEnabled ? "1" : "0");
});

initAudio();

// --- Novinky
async function loadNews(){
  const el = document.getElementById("news-list");
  if(!el) return;
  try{
    const res = await fetch("/api/news");
    const data = await res.json();
    el.innerHTML = data.map(n => `<div class="news-item"><b>${n.date}</b> — ${n.text}</div>`).join("");
  }catch{
    el.textContent = "Nepodařilo se načíst novinky.";
  }
}
loadNews();

// --- Feedback
const feedbackForm = document.getElementById("feedback-form");
const feedbackResult = document.getElementById("feedback-result");

feedbackForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(feedbackForm);
  const body = Object.fromEntries(fd.entries());
  feedbackResult.textContent = "Odesílám…";
  try {
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.ok) {
      feedbackResult.textContent = "Díky! Tvůj report byl uložen.";
      feedbackForm.reset();
    } else {
      feedbackResult.textContent = "Chyba při odeslání.";
    }
  } catch (err) {
    feedbackResult.textContent = "Chyba při odeslání.";
  }
});

// --- Navigace klávesami v inputech pro lepší UX na mobilu
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target instanceof HTMLInputElement && e.target.form === feedbackForm) {
    feedbackForm.requestSubmit();
  }
});
