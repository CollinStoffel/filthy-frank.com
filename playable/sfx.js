// sfx.js
// Lightweight playable SFX:
// - Reuses uzi.ogg via small audio pool for shots
// - Adds tiny WebAudio "beeps" for hit/death/pickups
// IMPORTANT: Must be loaded before game.js

(() => {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  const SHOT_SRC = "./assets/sfx/uzi.ogg";
  const UI_CLICK_SRC = "./assets/sfx/ui_click.ogg";

  // Music
  const MENU_MUSIC_SRC = "./assets/sfx/music_menu.ogg"; // (ad build trims to 21s loop)
  const GAME_MUSIC_SRC = "./assets/sfx/music_game.ogg";
  // Use a sanitized filename (no '#') so browsers don't treat it as a URL fragment.
  const FOOTSTEP_SRC = "./assets/sfx/footstep.ogg";
  // Upgrade pick sounds (sanitized copies; ad build internalizes)
  const UPGRADE_RARE_SRC = "./assets/sfx/upgrade_rare.ogg";
  const UPGRADE_EPIC_SRC = "./assets/sfx/upgrade_epic.ogg";
  const UPGRADE_LEGENDARY_SRC = "./assets/sfx/upgrade_legendary.ogg";
  const POOL_SIZE = 4;
  const SHOT_VOLUME = 0.12; // tiny but audible
  const SHOT_MIN_INTERVAL_MS = 70; // rate limit to avoid spam

  let unlocked = false;
  let lastShotMs = -1e9;
  let lastEnemyHitMs = -1e9;
  let lastEnemyDeathMs = -1e9;
  let lastPlayerHitMs = -1e9;
  let lastCashMs = -1e9;
  let lastUiClickMs = -1e9;
  let idx = 0;
  let uiIdx = 0;

  /** @type {HTMLAudioElement[]} */
  const pool = [];
  /** @type {HTMLAudioElement[]} */
  const uiPool = [];
  /** @type {HTMLAudioElement[]} */
  const footPool = [];
  /** @type {Record<string, HTMLAudioElement[]>} */
  const upgradePools = { rare: [], epic: [], legendary: [] };

  /** @type {HTMLAudioElement | null} */
  let menuMusic = null;
  /** @type {HTMLAudioElement | null} */
  let gameMusic = null;
  let musicMode = "menu"; // "menu" | "game"
  let footIdx = 0;
  let footStepT = 0;

  /** @type {AudioContext | null} */
  let actx = null;
  /** @type {GainNode | null} */
  let master = null;

  function ensurePool() {
    if (pool.length > 0) return;
    for (let i = 0; i < POOL_SIZE; i++) {
      const a = new Audio(SHOT_SRC);
      a.preload = "auto";
      a.volume = SHOT_VOLUME;
      pool.push(a);
    }
  }

  function ensureUiPool() {
    if (uiPool.length > 0) return;
    for (let i = 0; i < 3; i++) {
      const a = new Audio(UI_CLICK_SRC);
      a.preload = "auto";
      a.volume = 0.45;
      uiPool.push(a);
    }
  }

  function ensureFootPool() {
    if (footPool.length > 0) return;
    for (let i = 0; i < 4; i++) {
      const a = new Audio(FOOTSTEP_SRC);
      a.preload = "auto";
      a.volume = 0.16;
      footPool.push(a);
    }
  }

  function ensureUpgradePools() {
    if (upgradePools.rare.length === 0) {
      for (let i = 0; i < 2; i++) {
        const a = new Audio(UPGRADE_RARE_SRC);
        a.preload = "auto";
        a.volume = 0.55;
        upgradePools.rare.push(a);
      }
    }
    if (upgradePools.epic.length === 0) {
      for (let i = 0; i < 2; i++) {
        const a = new Audio(UPGRADE_EPIC_SRC);
        a.preload = "auto";
        a.volume = 0.55;
        upgradePools.epic.push(a);
      }
    }
    if (upgradePools.legendary.length === 0) {
      for (let i = 0; i < 2; i++) {
        const a = new Audio(UPGRADE_LEGENDARY_SRC);
        a.preload = "auto";
        a.volume = 0.62;
        upgradePools.legendary.push(a);
      }
    }
  }

  function ensureMusic() {
    if (!menuMusic) {
      menuMusic = new Audio(MENU_MUSIC_SRC);
      menuMusic.preload = "auto";
      menuMusic.loop = true;
      menuMusic.volume = 0.0;
    }
    if (!gameMusic) {
      gameMusic = new Audio(GAME_MUSIC_SRC);
      gameMusic.preload = "auto";
      gameMusic.loop = true;
      gameMusic.volume = 0.0;
    }
  }

  function stopMusic() {
    for (const a of [menuMusic, gameMusic]) {
      if (!a) continue;
      try {
        a.pause();
      } catch (_e) {}
    }
  }

  function setMusicMode(mode) {
    musicMode = mode === "game" ? "game" : "menu";
    if (!unlocked) return;
    ensureMusic();

    const targetMenu = musicMode === "menu" ? 0.16 : 0.0;
    const targetGame = musicMode === "game" ? 0.18 : 0.0;

    // Start both if needed so we can crossfade volumes; keep it simple + robust.
    for (const a of [menuMusic, gameMusic]) {
      if (!a) continue;
      if (a.paused) a.play().catch(() => {});
    }
    menuMusic.volume = targetMenu;
    gameMusic.volume = targetGame;
  }

  function ensureWebAudio() {
    if (actx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    actx = new Ctx();
    master = actx.createGain();
    master.gain.value = 0.42;
    master.connect(actx.destination);
  }

  async function unlock() {
    if (unlocked) return;
    // Mark unlocked immediately so callers can switch music mode synchronously.
    unlocked = true;
    ensurePool();
    ensureUiPool();
    ensureFootPool();
    ensureUpgradePools();
    ensureWebAudio();
    ensureMusic();
    try {
      // Do NOT await here. Some browsers delay awaited media/audio promises until touchend.
      if (actx && actx.state === "suspended") actx.resume().catch(() => {});
    } catch (_e) {
      // ignore
    }

    // Try a silent warm-up play/pause on one element (some browsers require this).
    try {
      const a = pool[0];
      a.muted = true;
      // Do NOT await here for the same reason. Best-effort only.
      a.play()
        .then(() => {
          a.pause();
          a.currentTime = 0;
          a.muted = false;
        })
        .catch(() => {
          a.muted = false;
        });
    } catch (_e) {
      // ignore
    }

    // Start in menu mode by default (volume is low; only plays after user gesture).
    setMusicMode("menu");
  }

  function _beep({ type, f0, f1, dur, gain, detune = 0, delay = 0 }) {
    if (!unlocked || !actx || !master) return;
    if (actx.state === "suspended") actx.resume().catch(() => {});

    const osc = actx.createOscillator();
    const g = actx.createGain();
    osc.type = type;
    osc.detune.value = detune;

    const t0 = actx.currentTime + Math.max(0, delay);
    const t1 = t0 + Math.max(0.01, dur);
    osc.frequency.setValueAtTime(Math.max(20, f0), t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t1);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t1);

    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  }

  function playShot(nowMs) {
    if (!unlocked) return;
    if (nowMs - lastShotMs < SHOT_MIN_INTERVAL_MS) return;
    lastShotMs = nowMs;
    ensurePool();
    const a = pool[idx++ % pool.length];
    try {
      a.currentTime = 0;
    } catch (_e) {
      // ignore
    }
    a.play().catch(() => {});
  }

  function playEnemyHit(nowMs) {
    if (!unlocked) return;
    if (nowMs - lastEnemyHitMs < 55) return;
    lastEnemyHitMs = nowMs;
    _beep({ type: "triangle", f0: 320, f1: 210, dur: 0.04, gain: 0.06, detune: rand(-12, 12) });
  }

  function playEnemyDeath(nowMs) {
    if (!unlocked) return;
    if (nowMs - lastEnemyDeathMs < 90) return;
    lastEnemyDeathMs = nowMs;
    _beep({ type: "square", f0: 210, f1: 70, dur: 0.11, gain: 0.12, detune: rand(-16, 16) });
  }

  function playPlayerHit(nowMs) {
    if (!unlocked) return;
    if (nowMs - lastPlayerHitMs < 180) return;
    lastPlayerHitMs = nowMs;
    _beep({ type: "square", f0: 140, f1: 80, dur: 0.09, gain: 0.11, detune: rand(-10, 10) });
  }

  function playCashPickup(nowMs) {
    if (!unlocked) return;
    if (nowMs - lastCashMs < 60) return;
    lastCashMs = nowMs;
    // Louder + "suctiony" 2-step chirp
    _beep({ type: "triangle", f0: 720, f1: 1040, dur: 0.06, gain: 0.32, detune: rand(-7, 7) });
    _beep({ type: "sine", f0: 1040, f1: 1480, dur: 0.05, gain: 0.28, detune: rand(-5, 5), delay: 0.016 });
  }

  function playUiClick(nowMs) {
    if (!unlocked) return;
    if (nowMs - lastUiClickMs < 50) return;
    lastUiClickMs = nowMs;
    ensureUiPool();
    if (uiPool.length === 0) return;
    const a = uiPool[uiIdx++ % uiPool.length];
    try {
      a.currentTime = 0;
    } catch (_e) {}
    a.play().catch(() => {});
  }

  function updateFootsteps(dt, move01) {
    if (!unlocked) return;
    ensureFootPool();
    if (footPool.length === 0) return;

    const m = clamp(move01 || 0, 0, 1);
    if (m <= 0.12) {
      footStepT = Math.max(0, footStepT - dt * 0.8);
      return;
    }

    const stepsPerSec = 1.6 + m * 2.4; // ~1.6..4.0
    footStepT += dt * stepsPerSec;
    if (footStepT < 1.0) return;
    footStepT -= 1.0;

    const a = footPool[footIdx++ % footPool.length];
    a.volume = clamp(0.10 + m * 0.14, 0, 0.26);
    a.playbackRate = clamp(0.94 + Math.random() * 0.12, 0.85, 1.15);
    try {
      a.currentTime = 0;
    } catch (_e) {}
    a.play().catch(() => {});
  }

  function playUpgradePick(tier, nowMs) {
    if (!unlocked) return;
    ensureUpgradePools();
    const key = tier === "legendary" ? "legendary" : tier === "epic" ? "epic" : "rare";
    const arr = upgradePools[key];
    if (!arr || arr.length === 0) return;
    const i = ((nowMs / 1000) | 0) % arr.length;
    const a = arr[i];
    if (!a) return;
    try {
      a.currentTime = 0;
    } catch (_e) {}
    a.play().catch(() => {});
  }

  window.PlayableSFX = {
    unlock,
    playShot,
    playEnemyHit,
    playEnemyDeath,
    playPlayerHit,
    playCashPickup,
    playUiClick,
    setMusicMode,
    stopMusic,
    updateFootsteps,
    playUpgradePick,
  };
})();



