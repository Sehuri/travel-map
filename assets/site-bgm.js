(function () {
  "use strict";

  const preferenceKey = "sehuri.siteBgm.enabled";
  const positionKey = "sehuri.siteBgm.position";
  const configured = Array.isArray(window.TRAVEL_SITE_BGM_TRACKS) ? window.TRAVEL_SITE_BGM_TRACKS : [];
  const tracks = configured.filter((track) => typeof track.audioUrl === "string" && /^https?:\/\/|^\.\//.test(track.audioUrl));

  const player = document.createElement("aside");
  player.id = "site-bgm";
  player.className = "site-bgm";
  player.setAttribute("aria-label", "网站背景音乐");
  player.innerHTML = '<button id="site-bgm-toggle" class="site-bgm-toggle" type="button" aria-pressed="false"><span class="site-bgm-icon" aria-hidden="true">♫</span><span id="site-bgm-action">播放背景音乐</span></button><div class="site-bgm-copy"><span class="site-bgm-eyebrow">SITE SOUNDTRACK</span><span id="site-bgm-label" aria-live="polite"></span></div>';
  document.body.append(player);

  const button = player.querySelector("#site-bgm-toggle");
  const action = player.querySelector("#site-bgm-action");
  const label = player.querySelector("#site-bgm-label");

  if (!tracks.length) {
    button.disabled = true;
    action.textContent = "背景音乐待开放";
    label.textContent = "两首音源待添加";
    player.classList.add("site-bgm-unavailable");
    return;
  }

  const audio = new Audio();
  audio.preload = "none";
  audio.volume = 0.6;
  let enabled = false;
  let index = 0;
  let pendingTime = 0;
  let errorCount = 0;

  function readStorage(storage, key) {
    try { return storage.getItem(key); } catch { return null; }
  }

  function writeStorage(storage, key, value) {
    try { storage.setItem(key, value); } catch { /* Storage may be unavailable. */ }
  }

  function savePosition() {
    writeStorage(sessionStorage, positionKey, JSON.stringify({ index, time: Number.isFinite(audio.currentTime) ? audio.currentTime : 0 }));
  }

  function setState(message) {
    const playing = enabled && !audio.paused;
    button.setAttribute("aria-pressed", String(playing));
    action.textContent = playing ? "关闭背景音乐" : enabled ? "继续播放音乐" : "播放背景音乐";
    button.setAttribute("aria-label", action.textContent);
    label.textContent = message || `${tracks[index].title} · ${tracks[index].artist}`;
    player.classList.toggle("is-playing", playing);
  }

  function loadTrack(nextIndex, time = 0) {
    index = nextIndex;
    audio.src = tracks[index].audioUrl;
    pendingTime = time;
    if (pendingTime > 0) {
      audio.addEventListener("loadedmetadata", function restoreTime() {
        audio.removeEventListener("loadedmetadata", restoreTime);
        try { audio.currentTime = Math.min(pendingTime, Math.max(0, audio.duration - 0.5)); } catch { /* Ignore unseekable media. */ }
        pendingTime = 0;
      });
    }
    savePosition();
    setState();
  }

  async function play() {
    enabled = true;
    writeStorage(localStorage, preferenceKey, "1");
    try {
      await audio.play();
      errorCount = 0;
      setState();
    } catch {
      // Browsers require a user gesture before audible autoplay.
      setState("点击继续播放 · 浏览器需要你先确认");
    }
  }

  function pause() {
    enabled = false;
    writeStorage(localStorage, preferenceKey, "0");
    audio.pause();
    savePosition();
    setState();
  }

  button.addEventListener("click", () => {
    if (enabled && !audio.paused) pause();
    else play();
  });

  audio.addEventListener("ended", () => {
    loadTrack((index + 1) % tracks.length);
    if (enabled) play();
  });
  audio.addEventListener("error", () => {
    if (!enabled) return;
    errorCount += 1;
    if (errorCount >= tracks.length) {
      pause();
      label.textContent = "音源暂时无法播放";
      return;
    }
    loadTrack((index + 1) % tracks.length);
    play();
  });
  audio.addEventListener("timeupdate", savePosition);
  window.addEventListener("pagehide", savePosition);

  try {
    const saved = JSON.parse(readStorage(sessionStorage, positionKey) || "null");
    if (Number.isInteger(saved?.index) && saved.index >= 0 && saved.index < tracks.length) {
      index = saved.index;
      pendingTime = Number.isFinite(saved.time) ? Math.max(0, saved.time) : 0;
    }
  } catch { /* Ignore malformed saved position. */ }
  const restoreTime = pendingTime;
  loadTrack(index, restoreTime);
  if (readStorage(localStorage, preferenceKey) === "1") play();
})();
