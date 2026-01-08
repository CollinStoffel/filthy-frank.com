// game.js
// Extremely small HTML5 "survive the wave" playable:
// - Drag to move (virtual joystick region)
// - Auto-fire at nearest enemy
// - 20s wave, three mid-run upgrades (stacking power spikes)
// - End card with Install CTA

(() => {
  /** @type {HTMLCanvasElement} */
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const hudTime = document.getElementById("hud-time");
  const hudHp = document.getElementById("hud-hp");
  const hudMoney = document.getElementById("hud-money");
  const hint = document.getElementById("hint");

  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlaySubtitle = document.getElementById("overlay-subtitle");
  const overlayContent = document.getElementById("overlay-content");
  const overlayActions = document.getElementById("overlay-actions");

  const W = canvas.width;
  const H = canvas.height;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const len = (x, y) => Math.hypot(x, y);

  const rand = (a, b) => a + Math.random() * (b - a);

  // ------------------------------------------------------------
  // Asset loading (uses existing repo images)
  // NOTE: These paths work when opening playable_ad/index.html directly,
  // because they are relative to playable_ad/. For TikTok upload later,
  // you should copy these image files into the playable zip and update paths.
  // ------------------------------------------------------------

  const assets = {
    bg: { img: null, ready: false, src: "./assets/img/bg.webp" },
    frank: { img: null, ready: false, src: "./assets/img/frank.webp" },
    frankDamaged: { img: null, ready: false, src: "./assets/img/frank_damaged.webp" },
    uzi: { img: null, ready: false, src: "./assets/img/uzi.webp" },
    beatcop: { img: null, ready: false, src: "./assets/img/beatcop.webp" },
    guncop: { img: null, ready: false, src: "./assets/img/guncop.webp" },
    cash1: { img: null, ready: false, src: "./assets/img/cash.webp" },
  };

  function loadImage(asset) {
    const img = new Image();
    img.onload = () => {
      asset.img = img;
      asset.ready = true;
    };
    img.onerror = () => {
      asset.ready = false;
    };
    img.src = asset.src;
  }

  for (const k of Object.keys(assets)) loadImage(assets[k]);

  // SFX is provided by playable_ad/sfx.js (loaded before this file)
  const SFX = window.PlayableSFX;

  // ------------------------------------------------------------
  // Game state
  // ------------------------------------------------------------

  const WAVE_DURATION = 20.0;

  const state = {
    running: true,
    paused: false, // used for upgrade overlay
    started: false,
    timeLeft: WAVE_DURATION,
    kills: 0,
    money: 0,
    waveStartedAt: performance.now(),
    upgradeShown1: false,
    upgradeShown2: false,
    upgradeShown3: false,
    ended: false,
    win: false,
  };

  const player = {
    x: W * 0.5,
    y: H * 0.58,
    r: 12,
    hp: 3,
    speed: 220, // px/s
    invulnT: 0,
  };

  const weapon = {
    // Uzi baseline: start VERY weak, grow via upgrades + late-game ramp
    fireCd: 0.28, // seconds
    fireT: 0,
    bulletSpeed: 640,
    bulletDamage: 1,
    spread: 0, // radians
    burst: 1, // bullets per shot
    pierce: 0, // extra enemies bullet can pass through
    explosionRadius: 0, // AoE radius on hit (0 disables)
  };

  const enemies = [];
  const bullets = [];
  const particles = [];
  const cashDrops = [];

  // Vacuum range: only nearby bills get pulled in (prevents whole-screen insta-vacuum).
  const CASH_MAGNET_RADIUS = 200;
  const CASH_COLLECT_RADIUS = 14;

  // NOTE: Collision radii are intentionally a bit generous so hits feel consistent on mobile.
  const enemyTypes = {
    beatcop: { r: 15, hp: 2, spd: 74, color: "#8fd3ff", spriteKey: "beatcop" },
    guncop: { r: 14, hp: 2, spd: 102, color: "#ffd24c", spriteKey: "guncop" },
  };

  const spawner = {
    t: 0,
    interval: 0.55,
    intensityRamp: 0,
    maxEnemies: 42,
  };

  // Early-game pacing: give a brief moment to learn, then ramp hard.
  const START_GRACE_SEC = 1.4;
  const START_DRAG_THRESHOLD_PX = 7;

  // Aim state (used for weapon rotation + muzzle spawn)
  let aimAngle = 0;

  // ------------------------------------------------------------
  // Input (touch + mouse)
  // ------------------------------------------------------------

  const input = {
    active: false,
    id: null,
    baseX: 0,
    baseY: 0,
    x: 0,
    y: 0,
    dx: 0,
    dy: 0,
    // Full-screen joystick (drag anywhere)
    region: { x: 0, y: 0, w: W, h: H },
  };

  function canvasPosFromEvent(ev) {
    const rect = canvas.getBoundingClientRect();
    const sx = W / rect.width;
    const sy = H / rect.height;
    return {
      x: (ev.clientX - rect.left) * sx,
      y: (ev.clientY - rect.top) * sy,
    };
  }

  function isInMoveRegion(p) {
    const r = input.region;
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  function startInput(pointerId, p) {
    input.active = true;
    input.id = pointerId;
    input.baseX = p.x;
    input.baseY = p.y;
    input.x = p.x;
    input.y = p.y;
  }

  function _startGameNow() {
    if (state.started) return;
    state.started = true;
    state.waveStartedAt = performance.now();
    // Reset spawner + aim so start feels clean
    spawner.t = 0;
    aimAngle = 0;
    hint.style.display = "none";
    if (SFX && SFX.setMusicMode) SFX.setMusicMode("game");
  }

  function moveInput(p) {
    input.x = p.x;
    input.y = p.y;
    const dx = input.x - input.baseX;
    const dy = input.y - input.baseY;
    const mag = len(dx, dy);
    const maxMag = 42;
    const k = mag > maxMag ? maxMag / mag : 1;
    input.dx = dx * k;
    input.dy = dy * k;

    // Start only after a real drag, not a tap.
    if (!state.started && mag >= START_DRAG_THRESHOLD_PX) {
      _startGameNow();
    }
  }

  function endInput() {
    input.active = false;
    input.id = null;
    input.dx = 0;
    input.dy = 0;
  }

  // Input handlers:
  // Prefer Pointer Events when available (often unlocks audio earlier in ad webviews).
  const USE_POINTER = typeof window !== "undefined" && "PointerEvent" in window;

  if (USE_POINTER) {
    canvas.addEventListener(
      "pointerdown",
      (e) => {
        // Unlock audio on first gesture (required by mobile browsers)
        if (SFX && typeof SFX.unlock === "function") SFX.unlock();
        // Set immediately (do NOT wait). This must happen during the user gesture.
        if (SFX && SFX.setMusicMode) SFX.setMusicMode(state.started ? "game" : "menu");

        if (!state.running || state.paused) return;
        const p = canvasPosFromEvent(e);
        if (!input.active && isInMoveRegion(p)) {
          try {
            canvas.setPointerCapture(e.pointerId);
          } catch (_e) {
            // ignore
          }
          startInput(e.pointerId, p);
          e.preventDefault();
        }
      },
      { passive: false }
    );

    canvas.addEventListener(
      "pointermove",
      (e) => {
        if (!state.running || state.paused) return;
        if (input.active && e.pointerId === input.id) {
          moveInput(canvasPosFromEvent(e));
          e.preventDefault();
        }
      },
      { passive: false }
    );

    canvas.addEventListener(
      "pointerup",
      (e) => {
        if (input.active && e.pointerId === input.id) {
          endInput();
          e.preventDefault();
        }
      },
      { passive: false }
    );

    canvas.addEventListener(
      "pointercancel",
      (e) => {
        if (input.active && e.pointerId === input.id) {
          endInput();
          e.preventDefault();
        }
      },
      { passive: false }
    );
  } else {
    // Touch
    canvas.addEventListener(
      "touchstart",
      (e) => {
        // Unlock audio on first gesture (required by mobile browsers)
        if (SFX && typeof SFX.unlock === "function") SFX.unlock();
        // Set immediately (do NOT wait). This must happen during the user gesture.
        if (SFX && SFX.setMusicMode) SFX.setMusicMode(state.started ? "game" : "menu");
        if (!state.running || state.paused) return;
        for (const t of e.changedTouches) {
          const p = canvasPosFromEvent(t);
          if (!input.active && isInMoveRegion(p)) {
            startInput(t.identifier, p);
            e.preventDefault();
            return;
          }
        }
      },
      { passive: false }
    );

    canvas.addEventListener(
      "touchmove",
      (e) => {
        if (!state.running || state.paused) return;
        for (const t of e.changedTouches) {
          if (input.active && t.identifier === input.id) {
            const p = canvasPosFromEvent(t);
            moveInput(p);
            e.preventDefault();
            return;
          }
        }
      },
      { passive: false }
    );

    canvas.addEventListener(
      "touchend",
      (e) => {
        for (const t of e.changedTouches) {
          if (input.active && t.identifier === input.id) {
            endInput();
            e.preventDefault();
            return;
          }
        }
      },
      { passive: false }
    );

    // Mouse
    canvas.addEventListener("mousedown", (e) => {
      // Unlock audio on first gesture (required by browsers)
      if (SFX && typeof SFX.unlock === "function") SFX.unlock();
      // Set immediately (do NOT wait). This must happen during the user gesture.
      if (SFX && SFX.setMusicMode) SFX.setMusicMode(state.started ? "game" : "menu");
      if (!state.running || state.paused) return;
      const pos = canvasPosFromEvent(e);
      if (!input.active && isInMoveRegion(pos)) {
        startInput("mouse", pos);
      }
    });
    window.addEventListener("mousemove", (e) => {
      if (!state.running || state.paused) return;
      if (input.active && input.id === "mouse") {
        moveInput(canvasPosFromEvent(e));
      }
    });
    window.addEventListener("mouseup", () => {
      if (input.active && input.id === "mouse") endInput();
    });
  }

  // ------------------------------------------------------------
  // Entities
  // ------------------------------------------------------------

  function getNearestEnemy() {
    if (enemies.length === 0) return null;
    let nearest = null;
    let best = Infinity;
    for (const e of enemies) {
      const d = (e.x - player.x) ** 2 + (e.y - player.y) ** 2;
      if (d < best) {
        best = d;
        nearest = e;
      }
    }
    return nearest;
  }

  function spawnEnemy() {
    if (enemies.length >= spawner.maxEnemies) return;
    // Weighted types: more guncops late-game to overwhelm
    const guncopChance = state.timeLeft <= 7.0 ? 0.48 : 0.22;
    const typeName = Math.random() < guncopChance ? "guncop" : "beatcop";
    const t = enemyTypes[typeName];
    // Spawn around edges
    const edge = Math.floor(Math.random() * 4);
    let x = 0,
      y = 0;
    const pad = 24;
    if (edge === 0) {
      x = rand(pad, W - pad);
      y = -pad;
    } else if (edge === 1) {
      x = W + pad;
      y = rand(pad, H - pad);
    } else if (edge === 2) {
      x = rand(pad, W - pad);
      y = H + pad;
    } else {
      x = -pad;
      y = rand(pad, H - pad);
    }
    // Scale difficulty toward the end (harder + tankier in final seconds)
    const late = state.timeLeft <= 6.0;
    const hpBoost = late ? 1 : spawner.intensityRamp > 0.75 ? 1 : 0;
    const spdBoost = (spawner.intensityRamp * 28) + (late ? 28 : 0);

    enemies.push({
      type: typeName,
      x,
      y,
      r: t.r,
      hp: t.hp + hpBoost,
      spd: t.spd + spdBoost,
      hitT: 0,
    });
  }

  function spawnBullet(ax, ay, vx, vy) {
    bullets.push({
      x: ax,
      y: ay,
      vx,
      vy,
      // Slightly larger bullet hit radius for "aim assist" feel.
      r: 6.0,
      life: 1.25,
      pierceLeft: weapon.pierce,
      explosionRadius: weapon.explosionRadius,
    });
  }

  function burstParticles(x, y, color) {
    for (let i = 0; i < 8; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(40, 160);
      particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(0.18, 0.4),
        color,
      });
    }
  }

  function spawnCash(x, y) {
    // Every enemy drops $1
    cashDrops.push({
      x,
      y,
      // Less floaty: smaller initial scatter so vacuum reads as intentional.
      vx: rand(-18, 18),
      vy: rand(-28, 14),
      r: 10,
      spin: rand(-4, 4),
      a: rand(-0.5, 0.5),
      age: 0,
    });
  }

  // ------------------------------------------------------------
  // Upgrade + end card overlays
  // ------------------------------------------------------------

  function showOverlay({ title, subtitle, contentHtml, actions, pickSfxTier = null, mode = "" }) {
    overlayTitle.textContent = title;
    overlaySubtitle.textContent = subtitle || "";
    overlayContent.innerHTML = contentHtml || "";
    overlayActions.innerHTML = "";
    overlay.dataset.mode = mode || "";

    // Style variants (keep end-card readable while making upgrade headers punchy)
    const isPowerupHeader = subtitle === "POWERUP";
    overlayTitle.classList.toggle("powerup-title", isPowerupHeader);
    overlaySubtitle.classList.toggle("powerup-subtitle", isPowerupHeader);

    for (const a of actions) {
      const btn = document.createElement("button");
      btn.className = `btn ${a.variant || ""}`.trim();
      if (mode === "endcard" && (a.variant === "primary" || /install/i.test(a.text))) {
        btn.classList.add("cta");
      }
      if (a.iconSrc) {
        const img = document.createElement("img");
        img.className = "btn-icon";
        img.alt = "";
        img.src = a.iconSrc;
        btn.appendChild(img);
      }
      const label = document.createElement("span");
      label.textContent = a.text;
      btn.appendChild(label);
      btn.addEventListener(
        "click",
        () => {
          const now = performance.now();
          if (pickSfxTier && SFX && SFX.playUpgradePick) {
            SFX.playUpgradePick(pickSfxTier, now);
          } else if (SFX && SFX.playUiClick) {
            SFX.playUiClick(now);
          }
          a.onClick();
        },
        { once: true }
      );
      overlayActions.appendChild(btn);
    }

    overlay.classList.remove("hidden");
    state.paused = true;
  }

  function hideOverlay() {
    overlay.classList.add("hidden");
    state.paused = false;
    overlay.dataset.mode = "";
  }

  function showUpgrade() {
    showOverlay({
      title: "PICK A",
      subtitle: "POWERUP",
      contentHtml: "",
      pickSfxTier: "rare",
      mode: "upgrade",
      actions: [
        {
          text: "+ Fire Rate",
          iconSrc: "./assets/ui/rapid_fire.webp",
          variant: "primary",
          onClick: () => {
            weapon.fireCd = Math.max(0.085, weapon.fireCd * 0.55);
            hideOverlay();
          },
        },
        {
          text: "+ Spread Shot",
          iconSrc: "./assets/ui/bullet.webp",
          variant: "",
          onClick: () => {
            weapon.burst = 3;
            weapon.spread = 0.32;
            hideOverlay();
          },
        },
      ],
    });
  }

  function showUpgrade2() {
    showOverlay({
      title: "PICK A",
      subtitle: "POWERUP",
      contentHtml: "",
      pickSfxTier: "epic",
      mode: "upgrade",
      actions: [
        {
          text: "+ Piercing",
          iconSrc: "./assets/ui/pierce.webp",
          variant: "primary",
          onClick: () => {
            weapon.pierce = Math.max(weapon.pierce, 2);
            hideOverlay();
          },
        },
        {
          text: "+ More Bullets",
          iconSrc: "./assets/ui/uzi2.webp",
          variant: "",
          onClick: () => {
            weapon.burst = Math.max(weapon.burst, 5);
            weapon.spread = Math.max(weapon.spread, 0.42);
            hideOverlay();
          },
        },
      ],
    });
  }

  function showUpgrade3() {
    showOverlay({
      title: "PICK A",
      subtitle: "POWERUP",
      contentHtml: "",
      pickSfxTier: "legendary",
      mode: "upgrade",
      actions: [
        {
          text: "+ Explosive",
          iconSrc: "./assets/ui/explosive.webp",
          variant: "primary",
          onClick: () => {
            weapon.explosionRadius = Math.max(weapon.explosionRadius, 30);
            hideOverlay();
          },
        },
        {
          text: "+ Max RPM",
          iconSrc: "./assets/ui/rapid_fire.webp",
          variant: "",
          onClick: () => {
            weapon.fireCd = Math.max(0.045, weapon.fireCd * 0.45);
            weapon.burst = Math.max(weapon.burst, 4);
            weapon.spread = Math.max(weapon.spread, 0.28);
            hideOverlay();
          },
        },
      ],
    });
  }

  function endGame(win) {
    if (state.ended) return;
    state.ended = true;
    state.running = false;
    state.win = win;
    if (SFX && SFX.setMusicMode) SFX.setMusicMode("menu");

    const title = win ? "WAVE CLEARED!" : "BUSTED!";
    const subtitle = win ? "Install for the full game" : "Install and get stronger";
    const primaryText = "Install";

    showOverlay({
      title,
      subtitle,
      contentHtml: `
        <div class="endcard">
          <button type="button" class="endcard-icon-btn" data-cta="1" aria-label="Install">
            <img class="endcard-icon" src="./assets/ui/app_icon.webp" alt="" />
          </button>
          <div class="endcard-cash" id="endcard-cash" aria-label="Cash earned">$${state.money}</div>
          <div class="endcard-tag">YOU MADE BANK</div>
        </div>
      `,
      mode: "endcard",
      actions: [
        {
          text: primaryText,
          variant: "primary",
          onClick: () => {
            if (window.PlayableBridge) window.PlayableBridge.track("cta_click", { win });
            if (window.PlayableBridge) window.PlayableBridge.openStore();
          },
        },
        {
          text: win ? "Play Again" : "Retry",
          variant: win ? "" : "danger",
          onClick: () => {
            // simplest reload
            window.location.reload();
          },
        },
      ],
    });

    // End-card juice: count-up cash quickly to draw attention to the reward loop.
    try {
      const el = overlayContent.querySelector("#endcard-cash");
      if (el) {
        const target = Math.max(0, Math.floor(state.money || 0));
        const start = 0;
        const durMs = 650;
        const t0 = performance.now();
        const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
        const tick = () => {
          const t = (performance.now() - t0) / durMs;
          const k = t >= 1 ? 1 : easeOutCubic(Math.max(0, Math.min(1, t)));
          const v = Math.round(start + (target - start) * k);
          el.textContent = `$${v}`;
          if (t < 1) requestAnimationFrame(tick);
        };
        // If target is small, don't animate (avoid noise).
        if (target >= 10) requestAnimationFrame(tick);
      }
    } catch (_e) {
      // ignore
    }

    // Make the app icon clickable too (show-don't-tell CTA).
    const ctaEls = overlayContent.querySelectorAll("[data-cta]");
    for (const el of ctaEls) {
      el.addEventListener(
        "click",
        () => {
          if (SFX && SFX.playUiClick) SFX.playUiClick(performance.now());
          if (window.PlayableBridge) window.PlayableBridge.track("cta_click", { win, source: "icon" });
          if (window.PlayableBridge) window.PlayableBridge.openStore();
        },
        { once: true }
      );
    }
  }

  // ------------------------------------------------------------
  // Update + draw
  // ------------------------------------------------------------

  function getUziPose(angle) {
    if (!assets.uzi.ready || !assets.uzi.img) return null;
    const img = assets.uzi.img;
    // Draw size in playable space
    const w = 44;
    const h = (img.height / Math.max(1, img.width)) * w;

    // Weapon base (where it "attaches" to player)
    const baseX = player.x + 12;
    const baseY = player.y - 6;

    // If uzi.png points right, muzzle is near the right edge.
    // These offsets are in local weapon space where (0,0) is the drawImage top-left.
    const muzzleLocal = { x: w * 0.92, y: h * 0.45 };

    // Convert to centered origin at base point (we rotate around a grip point)
    const gripLocal = { x: w * 0.30, y: h * 0.55 }; // approx hand grip

    const ox = muzzleLocal.x - gripLocal.x;
    const oy = muzzleLocal.y - gripLocal.y;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const muzzleX = baseX + ox * cos - oy * sin;
    const muzzleY = baseY + ox * sin + oy * cos;

    return { img, w, h, baseX, baseY, angle, gripLocal, muzzleX, muzzleY };
  }

  function drawUzi(angle) {
    const pose = getUziPose(angle);
    if (!pose) return;
    const { img, w, h, baseX, baseY, angle: a, gripLocal } = pose;

    ctx.save();
    ctx.translate(baseX, baseY);
    ctx.rotate(a);
    ctx.globalAlpha = 0.95;
    // Draw with grip point at (0,0)
    ctx.drawImage(img, -gripLocal.x, -gripLocal.y, w, h);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function update(dt) {
    if (!state.running || state.paused) return;

    // Movement always works (but the wave/timer doesn't start until first drag).
    player.invulnT = Math.max(0, player.invulnT - dt);
    const mvx = input.dx / 42;
    const mvy = input.dy / 42;
    player.x += mvx * player.speed * dt;
    player.y += mvy * player.speed * dt;
    player.x = clamp(player.x, player.r, W - player.r);
    player.y = clamp(player.y, player.r + 42, H - player.r - 10);

    // Footsteps: only when actually moving (rate-limited inside SFX).
    if (SFX && SFX.updateFootsteps) {
      const move01 = clamp(Math.hypot(mvx, mvy), 0, 1);
      SFX.updateFootsteps(dt, move01);
    }

    if (!state.started) {
      // Keep HUD time frozen at 20 until the player drags.
      hudTime.textContent = String(Math.ceil(state.timeLeft));
      return;
    }

    // timers (only after start)
    state.timeLeft = Math.max(0, state.timeLeft - dt);
    const elapsed = WAVE_DURATION - state.timeLeft;
    // Three upgrade beats (stacking power spikes)
    if (!state.upgradeShown1 && state.timeLeft <= WAVE_DURATION - 4.5) {
      state.upgradeShown1 = true;
      showUpgrade();
    } else if (!state.upgradeShown2 && state.timeLeft <= WAVE_DURATION - 9.5) {
      state.upgradeShown2 = true;
      showUpgrade2();
    } else if (!state.upgradeShown3 && state.timeLeft <= WAVE_DURATION - 14.0) {
      state.upgradeShown3 = true;
      showUpgrade3();
    }
    if (state.timeLeft <= 0) {
      endGame(true);
      return;
    }

    // spawner intensity ramp
    spawner.intensityRamp = clamp(1 - state.timeLeft / WAVE_DURATION, 0, 1);
    // Aggressive ramp to overwhelm in the last seconds
    // Early: ~0.58s, Late: ~0.10s
    spawner.interval = 0.58 - spawner.intensityRamp * 0.48;
    spawner.interval = clamp(spawner.interval, 0.10, 0.70);
    spawner.t += dt;
    while (spawner.t >= spawner.interval) {
      spawner.t -= spawner.interval;
      // Spawn bursts late-game to overwhelm
      let count = 1;
      if (elapsed < START_GRACE_SEC) break;
      if (spawner.intensityRamp > 0.55) count += 1;
      if (state.timeLeft <= 5.0) count += 2;
      if (state.timeLeft <= 3.0) count += 2;
      if (state.timeLeft <= 1.6) count += 3;
      count += Math.random() < 0.35 ? 1 : 0;
      for (let i = 0; i < count; i++) spawnEnemy();
    }

    // enemies chase
    for (const e of enemies) {
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const d = Math.max(0.0001, Math.hypot(dx, dy));
      e.x += (dx / d) * e.spd * dt;
      e.y += (dy / d) * e.spd * dt;
      e.hitT = Math.max(0, e.hitT - dt);
    }

    // auto-fire at nearest enemy + update weapon aim
    weapon.fireT -= dt;
    if (weapon.fireT <= 0 && enemies.length > 0) {
      const nearest = getNearestEnemy();
      if (nearest) {
        const baseA = Math.atan2(nearest.y - player.y, nearest.x - player.x);
        aimAngle = baseA;
        const n = weapon.burst;
        // Muzzle position from uzi tip (fallback to player center if missing)
        const pose = getUziPose(aimAngle);
        const mx = pose ? pose.muzzleX : player.x;
        const my = pose ? pose.muzzleY : player.y;

        // Late-game ramp: speeds up firing toward the end (feels like "power fantasy" buildup)
        // Uses a curve so early game stays slow, end game gets dramatic.
        const t01 = clamp((elapsed - START_GRACE_SEC) / Math.max(0.0001, (WAVE_DURATION - START_GRACE_SEC)), 0, 1);
        const curve = Math.pow(t01, 2.6);
        const lateBonus = 1.0 - 0.55 * curve; // up to 55% faster at the end
        const effectiveFireCd = Math.max(0.035, weapon.fireCd * lateBonus);

        for (let i = 0; i < n; i++) {
          const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1; // [-1..1]
          const a = baseA + t * weapon.spread;
          spawnBullet(mx, my, Math.cos(a) * weapon.bulletSpeed, Math.sin(a) * weapon.bulletSpeed);
        }
        // Tiny uzi SFX (rate-limited)
        SFX.playShot(performance.now());
        weapon.fireT = effectiveFireCd;
      }
    }

    // bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30) {
        bullets.splice(i, 1);
      }
    }

    // particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    // cash drops (float + vacuum into Frank)
    for (let i = cashDrops.length - 1; i >= 0; i--) {
      const c = cashDrops[i];
      c.age += dt;

      // vacuum into Frank when in range
      const dx = player.x - c.x;
      const dy = player.y - c.y;
      const d = Math.max(0.0001, Math.hypot(dx, dy));
      // Give a brief moment so the player can visually register the bill before it vacuums in.
      if (d <= CASH_MAGNET_RADIUS && c.age >= 0.12) {
        // Hard vacuum: constant-speed pull (not floaty acceleration)
        const t = 1 - clamp(d / CASH_MAGNET_RADIUS, 0, 1);
        const speed = 255 + t * 368; // +50% vacuum speed
        c.x += (dx / d) * speed * dt;
        c.y += (dy / d) * speed * dt;
        c.a += (c.spin * 2.2) * dt;
      }
      else {
        // float / drift (only when NOT vacuuming)
        c.vx *= 0.96;
        c.vy = c.vy * 0.96 + 12 * dt; // slight downward pull
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.a += c.spin * dt;
      }

      // collect
      const ndx = player.x - c.x;
      const ndy = player.y - c.y;
      const nd = Math.max(0.0001, Math.hypot(ndx, ndy));
      if (nd <= CASH_COLLECT_RADIUS) {
        state.money += 1;
        if (hudMoney) hudMoney.textContent = String(state.money);
        SFX.playCashPickup(performance.now());
        cashDrops.splice(i, 1);
      }
    }

    // collisions: bullets -> enemies
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi];
      let hit = false;
      for (let ei = enemies.length - 1; ei >= 0; ei--) {
        const e = enemies[ei];
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const rr = e.r + b.r;
        if (dx * dx + dy * dy <= rr * rr) {
          e.hp -= weapon.bulletDamage;
          e.hitT = 0.08;
          hit = true;
          // Small polish: subtle impact sound (rate-limited internally)
          SFX.playEnemyHit(performance.now());

          // AoE (explosive rounds)
          if (b.explosionRadius && b.explosionRadius > 0) {
            const rad = b.explosionRadius;
            const rad2 = rad * rad;
            for (let ej = enemies.length - 1; ej >= 0; ej--) {
              const o = enemies[ej];
              const ox = o.x - b.x;
              const oy = o.y - b.y;
              if (ox * ox + oy * oy <= rad2) {
                o.hp -= 1;
                o.hitT = 0.08;
                if (o.hp <= 0) {
                  burstParticles(o.x, o.y, enemyTypes[o.type].color);
                  spawnCash(o.x, o.y);
                  enemies.splice(ej, 1);
                  state.kills += 1;
                  SFX.playEnemyDeath(performance.now());
                }
              }
            }
            burstParticles(b.x, b.y, "#ffd24c");
          }

          if (e.hp <= 0) {
            const color = enemyTypes[e.type].color;
            burstParticles(e.x, e.y, color);
            spawnCash(e.x, e.y);
            enemies.splice(ei, 1);
            state.kills += 1;
            SFX.playEnemyDeath(performance.now());
          }
          break;
        }
      }
      if (hit) {
        if (b.pierceLeft && b.pierceLeft > 0) {
          b.pierceLeft -= 1;
        } else {
          bullets.splice(bi, 1);
        }
      }
    }

    // collisions: enemies -> player (touch damage)
    if (player.invulnT <= 0) {
      for (const e of enemies) {
        const dx = e.x - player.x;
        const dy = e.y - player.y;
        const rr = e.r + player.r;
        if (dx * dx + dy * dy <= rr * rr) {
          player.hp -= 1;
          player.invulnT = 0.8;
          hudHp.textContent = String(player.hp);
          burstParticles(player.x, player.y, "#ff4c6a");
          SFX.playPlayerHit(performance.now());
          if (player.hp <= 0) {
            endGame(false);
          }
          break;
        }
      }
    }

    // HUD
    hudTime.textContent = String(Math.ceil(state.timeLeft));
  }

  function draw() {
    // background (cover-fit)
    if (assets.bg.ready && assets.bg.img) {
      const img = assets.bg.img;
      const iw = img.width || 1;
      const ih = img.height || 1;
      const scale = Math.max(W / iw, H / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const dx = (W - dw) * 0.5;
      const dy = (H - dh) * 0.5;
      ctx.drawImage(img, dx, dy, dw, dh);
    } else {
      ctx.fillStyle = "#0a0f1a";
      ctx.fillRect(0, 0, W, H);
    }

    // particles
    for (const p of particles) {
      const a = clamp(p.life / 0.4, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // bullets
    ctx.fillStyle = "#4cff8a";
    for (const b of bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // cash drops (bills)
    const cashImg = assets.cash1 && assets.cash1.ready ? assets.cash1.img : null;
    for (const c of cashDrops) {
      if (cashImg) {
        const w = 30;
        const h = cashImg.width > 0 ? (cashImg.height / cashImg.width) * w : w * 0.55;
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.a);
        ctx.globalAlpha = 1;
        ctx.drawImage(cashImg, -w * 0.5, -h * 0.5, w, h);
        ctx.restore();
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = "#4cff8a";
        ctx.beginPath();
        ctx.arc(c.x, c.y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // enemies
    for (const e of enemies) {
      const t = enemyTypes[e.type];
      const assetKey = t.spriteKey;
      const sprAsset = assetKey ? assets[assetKey] : null;
      const spr = sprAsset && sprAsset.ready ? sprAsset.img : null;

      if (spr) {
        // Keep enemies upright (no rotation). Mirror left/right to face the player.
        const h = 44;
        const aspect = spr.width > 0 ? spr.height / spr.width : 1;
        const w = h / aspect;
        const faceLeft = player.x < e.x;
        ctx.save();
        ctx.translate(e.x, e.y);
        if (faceLeft) ctx.scale(-1, 1);
        ctx.globalAlpha = e.hitT > 0 ? 0.75 : 1;
        ctx.drawImage(spr, -w * 0.5, -h * 0.6, w, h);
        ctx.restore();
        ctx.globalAlpha = 1;
      } else {
        // Fallback circle if images can't be loaded
        ctx.fillStyle = t.color;
        if (e.hitT > 0) ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // player (Filthy Frank sprite if available)
    const isDamaged = player.invulnT > 0;
    const sprite = isDamaged && assets.frankDamaged.ready ? assets.frankDamaged.img : assets.frank.img;
    const canSprite = sprite && (isDamaged ? assets.frankDamaged.ready : assets.frank.ready);
    if (canSprite) {
      // Draw a readable ~56px Frank (original textures are large)
      const drawH = 56;
      const aspect = sprite.width > 0 ? sprite.height / sprite.width : 1;
      const drawW = drawH / aspect;
      ctx.globalAlpha = isDamaged ? 0.75 : 1;
      ctx.drawImage(sprite, player.x - drawW * 0.5, player.y - drawH * 0.65, drawW, drawH);
      ctx.globalAlpha = 1;
    } else {
      // Fallback circle if images can't be loaded
      const inv = player.invulnT > 0 ? 0.45 : 1;
      ctx.globalAlpha = inv;
      ctx.fillStyle = "#e8f0ff";
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // weapon sprite (uzi) points at enemies
    drawUzi(aimAngle);

    if (input.active) {
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "#e8f0ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(input.baseX, input.baseY, 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = "#e8f0ff";
      ctx.beginPath();
      ctx.arc(input.baseX + input.dx, input.baseY + input.dy, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------
  // Loop
  // ------------------------------------------------------------

  let last = performance.now();
  function frame(now) {
    const dt = clamp((now - last) / 1000, 0, 0.033);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  // Start
  hudTime.textContent = String(Math.ceil(state.timeLeft));
  hudHp.textContent = String(player.hp);
  if (hudMoney) hudMoney.textContent = String(state.money);
  requestAnimationFrame(frame);
})();



