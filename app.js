/**
 * FlashFlips Web v1 — local-only, no backend
 */
(function () {
  "use strict";

  const STORAGE_STUDENTS = "FlashFlips_Students";
  const STORAGE_PIN_ENABLED = "FlashFlips_TeacherPinEnabled";
  const STORAGE_PIN = "FlashFlips_TeacherPin";
  const STORAGE_CHALLENGE = "FlashFlips_ChallengeMode";

  const SCHEMA_VERSION = 3;

  // Tables 1–12 are the core set. 13–20 only appear in Challenge mode.
  const CORE_MAX = 12;
  const CHALLENGE_MAX = 20;

  /**
   * Mastery thresholds.
   *
   * A card is "fast enough" if it was answered within baseMs + (perDigitMs x
   * number of digits in the answer). The per-digit allowance exists because the
   * measured time includes tapping the answer in: 6 is one tap, 56 is two, 238
   * is three. Without it, the tables with bigger answers look slower than they
   * are.
   *
   * A "clean pass" is a first-round-only run with no errors where every card
   * came in under its own threshold. A table is mastered once passesNeeded of
   * the last windowSize sessions on it were clean passes.
   *
   * These numbers are a starting point. Export the card times, look at what
   * genuinely secure students actually score, and tune. Mastery is recalculated
   * from stored attempt times every time it is displayed, never written into a
   * session, so changing these values re-scores every session already recorded.
   */
  const MASTERY = {
    baseMs: 1500,
    perDigitMs: 500,
    passesNeeded: 2,
    windowSize: 3,
    challengeMultiplier: 1.6, // 13–20 need working out, not recall — allow longer
  };

  /**
   * The card's flight from the deck into its pile.
   *
   * easeY's first control point is deliberately negative: that makes the
   * vertical travel go backwards (upward) before it heads down, so the card
   * lifts, tips over and settles like one dealt onto a table rather than
   * sliding sideways. Tune spinDeg for how far it tips; make easeY's -0.52
   * more negative for a higher lift.
   */
  const ARC = {
    easeX: "cubic-bezier(0.55, 0, 0.72, 1)",
    easeY: "cubic-bezier(0.34, -0.52, 0.4, 1)",
    spinDeg: 14,
  };

  const MESSAGES = {
    perfect: [
      "🌟 Perfect Score! You're a Maths Superstar!",
      "🏆 Amazing! Every single one correct!",
      "🎉 Incredible! You know your tables!",
    ],
    great: [
      "⭐ Brilliant work! Almost perfect!",
      "🎊 Great job! Keep it up!",
      "🚀 So close to perfect — you're on fire!",
    ],
    good: [
      "👍 Good try! Practice makes perfect!",
      "💪 Keep going — you're getting there!",
      "⚡ Give it another flip — you've got this!",
    ],
  };

  const AVATAR_COLORS = [
    "#FF6B6B", "#FF9800", "#4CAF50", "#5C35CC",
    "#E91E63", "#00BCD4", "#FF5722", "#9C27B0",
  ];

  // --- State ---
  let students = [];
  let currentStudentId = null;
  let assignStudentId = null;
  let assignSelectedTable = 2;

  const game = {
    cards: [],
    index: 0,
    typed: "",
    correct: [],
    incorrect: [],
    isFlipping: false,
    roundNumber: 1,
    totalAttempts: 0,
    totalIncorrect: 0,
    missedFacts: [],
    elapsedId: null,
    gameStart: 0,
    elapsed: 0,
    mixTables: false,
    selectedTable: 2,
    menuLocked: false,
    cardStartedAt: 0,
    attempts: [],
    lastInputMethod: "unknown",
    challenge: false,
    streak: 0,
    results: [],
  };

  // Challenge mode is a per-device setting: at school each child has their own
  // 1:1 device, so the device is effectively the player. Players still exist
  // for shared/home use (siblings), but the toggle is not stored per player.
  function challengeEnabled() {
    return localStorage.getItem(STORAGE_CHALLENGE) === "true";
  }

  function setChallengeEnabled(on) {
    localStorage.setItem(STORAGE_CHALLENGE, on ? "true" : "false");
    document.body.classList.toggle("challenge-mode", !!on);
  }

  // --- DOM ---
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const screens = {
    home: $("#screen-home"),
    menu: $("#screen-menu"),
    game: $("#screen-game"),
    summary: $("#screen-summary"),
  };

  // --- Utils ---
  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random();
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function median(nums) {
    if (!nums || nums.length === 0) return null;
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  function dominantValue(arr) {
    if (!arr || arr.length === 0) return null;
    const counts = {};
    let best = null;
    let bestN = -1;
    arr.forEach((v) => {
      counts[v] = (counts[v] || 0) + 1;
      if (counts[v] > bestN) {
        bestN = counts[v];
        best = v;
      }
    });
    return best;
  }

  function hexToRgba(hex, alpha) {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function range(from, to) {
    const out = [];
    for (let i = from; i <= to; i++) out.push(i);
    return out;
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function avatarColor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) | 0;
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
  }

  function initials(name) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("");
  }

  function encouragingMessage(accuracy) {
    if (accuracy >= 100) return pick(MESSAGES.perfect);
    if (accuracy >= 70) return pick(MESSAGES.great);
    return pick(MESSAGES.good);
  }

  function starCount(rounds) {
    if (rounds <= 1) return "⭐⭐⭐";
    if (rounds === 2) return "⭐⭐";
    return "⭐";
  }

  function parseBulkNames(text) {
    return text
      .replace(/\r\n/g, "\n")
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function getUrlTable() {
    const p = new URLSearchParams(location.search).get("table");
    const n = parseInt(p, 10);
    return n >= 1 && n <= CHALLENGE_MAX ? n : null;
  }

  // --- Celebration ---
  const CELEBRATIONS = ["fireworks", "bubbles", "confetti", "stars", "lasers"];
  let celebrationStop = null;

  function stopCelebration() {
    if (celebrationStop) celebrationStop();
  }

  function startCelebration() {
    stopCelebration();

    const layer = $("#celebration");
    const canvas = $("#celebration-canvas");
    if (!layer || !canvas) return;

    layer.classList.remove("hidden");
    const ctx = canvas.getContext("2d");

    const resize = () => {
      const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const type = pick(CELEBRATIONS);
    const startedAt = performance.now();
    const durationMs = 5600;

    const W = () => window.innerWidth;
    const H = () => window.innerHeight;

    let particles = [];

    const addConfetti = () => {
      const count = 200;
      for (let i = 0; i < count; i++) {
        particles.push({
          kind: "confetti",
          x: Math.random() * W(),
          y: -30 - Math.random() * H() * 0.2,
          vx: (Math.random() - 0.5) * 0.8,
          vy: 1.4 + Math.random() * 2.5,
          r: 3 + Math.random() * 6,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.25,
          color: ["#FF6B35", "#7C3AED", "#22C55E", "#06B6D4", "#EC4899", "#FACC15"][i % 6],
        });
      }
    };

    const addBubbles = () => {
      const count = 60;
      const tints = ["#06B6D4", "#22C55E", "#7C3AED", "#EC4899", "#FF6B35"];
      for (let i = 0; i < count; i++) {
        particles.push({
          kind: "bubble",
          x: Math.random() * W(),
          y: H() + 50 + Math.random() * H() * 0.35,
          vx: (Math.random() - 0.5) * 0.25,
          vy: -(0.9 + Math.random() * 1.8),
          r: 8 + Math.random() * 22,
          alpha: 0.35 + Math.random() * 0.30,
          color: tints[i % tints.length],
        });
      }
    };

    const addStars = () => {
      const count = 80;
      const hues = [48, 320, 265, 190, 16];
      for (let i = 0; i < count; i++) {
        particles.push({
          kind: "star",
          x: Math.random() * W(),
          y: Math.random() * H() * 0.8,
          r: 7 + Math.random() * 12,
          tw: Math.random() * Math.PI * 2,
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.10,
          hue: hues[i % hues.length],
        });
      }
    };

    const addFireworks = () => {
      const bursts = 5;
      for (let b = 0; b < bursts; b++) {
        particles.push({
          kind: "burst",
          bx: W() * (0.2 + Math.random() * 0.6),
          by: H() * (0.18 + Math.random() * 0.35),
          delay: b * 240 + Math.random() * 120,
          done: false,
        });
      }
    };

    const addLasers = () => {
      const beams = 14;
      for (let i = 0; i < beams; i++) {
        particles.push({
          kind: "laser",
          phase: Math.random() * Math.PI * 2,
          speed: 0.8 + Math.random() * 1.3,
          thickness: 3 + Math.random() * 4.5,
          hue: Math.floor(Math.random() * 360),
          alpha: 0.55 + Math.random() * 0.4,
          offset: Math.random(),
        });
      }
    };

    if (type === "confetti") addConfetti();
    else if (type === "bubbles") addBubbles();
    else if (type === "stars") addStars();
    else if (type === "lasers") addLasers();
    else addFireworks();

    let raf = 0;
    const tick = (now) => {
      const t = now - startedAt;
      ctx.clearRect(0, 0, W(), H());

      const fade = Math.max(0, Math.min(1, (durationMs - t) / 450));
      ctx.globalAlpha = fade;

      // Fireworks bursts
      for (const p of particles) {
        if (p.kind !== "burst" || p.done) continue;
        if (t < p.delay) continue;
        p.done = true;
        const pieces = 56;
        const burstColor = pick(["#FF6B35", "#7C3AED", "#22C55E", "#06B6D4", "#FACC15", "#EC4899"]);
        for (let i = 0; i < pieces; i++) {
          const ang = (i / pieces) * Math.PI * 2;
          const sp = 1.8 + Math.random() * 3.6;
          particles.push({
            kind: "spark",
            x: p.bx,
            y: p.by,
            vx: Math.cos(ang) * sp,
            vy: Math.sin(ang) * sp,
            life: 1100 + Math.random() * 800,
            born: now,
            r: 2.5 + Math.random() * 2.6,
            color: Math.random() < 0.5 ? burstColor : pick(["#FF6B35", "#7C3AED", "#22C55E", "#06B6D4", "#FACC15", "#EC4899"]),
          });
        }
      }
      particles = particles.filter((p) => p.kind !== "burst" || !p.done);

      // Draw particles
      for (const p of particles) {
        if (p.kind === "confetti") {
          p.x += p.vx;
          p.y += p.vy;
          p.rot += p.vr;
          if (p.y > H() + 60) p.y = -30;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 8;
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.r, -p.r, p.r * 2.2, p.r * 1.4);
          ctx.restore();
        } else if (p.kind === "bubble") {
          p.x += p.vx;
          p.y += p.vy;
          if (p.y < -80) p.y = H() + 80;
          ctx.save();
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.fillStyle = hexToRgba(p.color, p.alpha);
          ctx.strokeStyle = `rgba(255,255,255,${Math.min(1, p.alpha + 0.35)})`;
          ctx.lineWidth = 2.5;
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // bright highlight
          ctx.beginPath();
          ctx.fillStyle = "rgba(255,255,255,0.55)";
          ctx.arc(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.22, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else if (p.kind === "star") {
          p.tw += 0.09;
          p.x += p.vx;
          p.y += p.vy;
          const a = 0.65 + (Math.sin(p.tw) + 1) * 0.175;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.tw * 0.2);
          ctx.shadowColor = `hsl(${p.hue}, 100%, 60%)`;
          ctx.shadowBlur = 16;
          ctx.beginPath();
          const r = p.r;
          for (let i = 0; i < 10; i++) {
            const ang = (i * Math.PI) / 5;
            const rr = i % 2 === 0 ? r : r * 0.45;
            ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
          }
          ctx.closePath();
          ctx.fillStyle = `hsla(${p.hue}, 100%, 65%, ${a})`;
          ctx.fill();
          ctx.restore();
        } else if (p.kind === "spark") {
          const age = now - p.born;
          const lifeP = 1 - Math.min(1, age / p.life);
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.985;
          p.vy = p.vy * 0.985 + 0.02;
          ctx.save();
          ctx.beginPath();
          ctx.globalAlpha = fade * lifeP;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 12;
          ctx.fillStyle = p.color;
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          ctx.globalAlpha = fade;
        } else if (p.kind === "laser") {
          // Laser show: sweeping colored beams with subtle glow.
          const time = (now - startedAt) / 1000;
          const sweep = Math.sin(time * p.speed + p.phase) * 0.5 + 0.5; // 0..1
          const y = (p.offset * 0.9 + 0.05) * H();
          const x0 = -W() * 0.1;
          const x1 = W() * (0.6 + sweep * 0.6);

          ctx.save();
          ctx.globalAlpha = fade * p.alpha;
          ctx.lineCap = "round";
          ctx.shadowColor = `hsl(${p.hue}, 100%, 60%)`;
          ctx.shadowBlur = 22;

          // glow
          ctx.strokeStyle = `hsla(${p.hue}, 100%, 60%, 0.85)`;
          ctx.lineWidth = p.thickness * 3.6;
          ctx.beginPath();
          ctx.moveTo(x0, y);
          ctx.lineTo(x1, y);
          ctx.stroke();

          // core
          ctx.strokeStyle = `hsla(${p.hue}, 100%, 80%, 1)`;
          ctx.lineWidth = p.thickness;
          ctx.beginPath();
          ctx.moveTo(x0, y);
          ctx.lineTo(x1, y);
          ctx.stroke();

          ctx.restore();
        }
      }

      ctx.globalAlpha = 1;
      if (t < durationMs) raf = requestAnimationFrame(tick);
      else stopCelebration();
    };

    raf = requestAnimationFrame(tick);

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    celebrationStop = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      layer.classList.add("hidden");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      celebrationStop = null;
    };
  }

  // --- Mastery ---

  /**
   * How long this answer is allowed to take. Longer answers need more taps, so
   * they get more time. Challenge tables get a further multiplier because a
   * child partitioning 17×8 is doing a different job from one recalling 6×7,
   * and holding both to the same bar would leave every challenge square amber
   * forever.
   */
  function thresholdFor(answer, isChallenge) {
    const digits = String(answer).length;
    const base = MASTERY.baseMs + MASTERY.perDigitMs * digits;
    return isChallenge ? base * MASTERY.challengeMultiplier : base;
  }

  /**
   * A clean pass: finished in one round, nothing wrong, and every card inside
   * its own threshold. Sessions recorded before attempt-level timing existed
   * (schema v1) can't be judged, so they don't count either way.
   */
  function isCleanPass(session) {
    if (!Array.isArray(session.attempts) || session.attempts.length === 0) return false;
    if (session.roundsNeeded !== 1) return false;
    return session.attempts.every((a) => {
      if (!a.correct) return false;
      const answer = a.answer != null ? a.answer : 10; // pre-v3 sessions stored no answer
      return a.ms <= thresholdFor(answer, !!a.challenge);
    });
  }

  /**
   * Mastery state for one table: "none" (never practised), "practising", or
   * "mastered". Derived from the stored attempt times every time it is asked
   * for, so retuning MASTERY re-scores the whole history at once.
   */
  function masteryFor(student, table) {
    const key = String(table);
    const sessions = (student.sessions || [])
      .filter((s) => s.tableKey === key)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (sessions.length === 0) return { state: "none", sessions: 0, cleanPasses: 0 };

    const window = sessions.slice(-MASTERY.windowSize);
    const cleanPasses = window.filter(isCleanPass).length;

    return {
      state: cleanPasses >= MASTERY.passesNeeded ? "mastered" : "practising",
      sessions: sessions.length,
      cleanPasses,
      history: sessions,
    };
  }

  /** Median first-pass time per session, for the per-table trend graph. */
  function trendFor(student, table) {
    const key = String(table);
    return (student.sessions || [])
      .filter((s) => s.tableKey === key)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((s) => {
        if (s.firstPassMedianMs != null) return s.firstPassMedianMs;
        if (!Array.isArray(s.attempts)) return null;
        return median(s.attempts.filter((a) => a.round === 1).map((a) => a.ms));
      })
      .filter((v) => v != null);
  }

  // --- Storage ---
  function loadStudents() {
    try {
      const raw = localStorage.getItem(STORAGE_STUDENTS);
      students = raw ? JSON.parse(raw) : [];
    } catch {
      students = [];
    }
  }

  function saveStudents() {
    localStorage.setItem(STORAGE_STUDENTS, JSON.stringify(students));
  }

  function pinEnabled() {
    return localStorage.getItem(STORAGE_PIN_ENABLED) === "true";
  }

  function verifyPin(pin) {
    if (!pinEnabled()) return true;
    return localStorage.getItem(STORAGE_PIN) === String(pin).trim();
  }

  function currentStudent() {
    return students.find((s) => s.id === currentStudentId) || null;
  }

  // --- Navigation ---
  // Set when a challenge deck starts; the night palette carries through the
  // round and its summary, then drops away on the way back to menu or home.
  let challengePalette = false;

  function showScreen(name) {
    Object.entries(screens).forEach(([key, el]) => {
      if (!el) return;
      el.classList.toggle("active", key === name);
      el.hidden = key !== name;
    });
    const dark = challengePalette && (name === "game" || name === "summary");
    document.body.classList.toggle("playing-challenge", dark);
  }

  // --- Home ---
  function renderStudents() {
    const grid = $("#student-grid");
    const empty = $("#empty-students");
    grid.innerHTML = "";
    if (students.length === 0) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");
    students
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((s) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "student-card";
        btn.innerHTML = `
          <div class="student-avatar" style="background:${avatarColor(s.name)}">${initials(s.name)}</div>
          <div class="student-name">${escapeHtml(s.name)}</div>`;
        btn.addEventListener("click", () => selectStudent(s.id));
        grid.appendChild(btn);
      });
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function selectStudent(id) {
    currentStudentId = id;
    const s = currentStudent();
    if (!s) return;
    applyStudentAssignment(s);
    showScreen("menu");
    refreshMenu();
  }

  function applyStudentAssignment(s) {
    // Pre-select the player's last/assigned table as a convenience, but never lock it.
    game.mixTables = !!s.assignedMixMode;
    game.selectedTable = (s.assignedTables && s.assignedTables[0]) || 2;
    game.menuLocked = false;
  }

  function startGuestPractice(table) {
    // Used by QR/direct links: straight into a table, no profile, nothing locked.
    currentStudentId = null;
    game.menuLocked = false;
    game.mixTables = false;
    game.selectedTable = table;
    startGame();
  }

  // --- Menu ---
  function refreshMenu() {
    const s = currentStudent();
    $("#menu-playing-as").textContent = s ? `Playing as ${s.name}` : "";
    $("#mix-tables").checked = game.mixTables;

    const hint = $("#assigned-hint");
    if (game.menuLocked && s) {
      hint.classList.remove("hidden");
    } else {
      hint.classList.add("hidden");
    }

    $("#challenge-toggle").checked = game.challenge;
    // The wall is built from saved sessions, so it is meaningless for a guest.
    $("#btn-wall").classList.toggle("hidden", !s);
    updateMixLabel();
    renderTableGrid();
  }

  function updateMixLabel() {
    const label = $("#mix-label");
    if (!label) return;
    label.textContent = game.challenge
      ? "Mix the challenge tables together 🎲"
      : "Mix all tables together 🎲";
  }

  function makeTableButton(n, locked) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "table-btn";
    if (isChallengeTable(n)) btn.classList.add("challenge");
    btn.textContent = `${n}×`;
    if (!game.mixTables && game.selectedTable === n) btn.classList.add("selected");
    btn.disabled = locked;
    btn.addEventListener("click", () => {
      if (locked) return;
      game.selectedTable = n;
      game.mixTables = false;
      $("#mix-tables").checked = false;
      renderTableGrid();
    });
    return btn;
  }

  function renderTableGrid() {
    const grid = $("#table-grid");
    const challengeWrap = $("#challenge-group");
    const challengeGrid = $("#challenge-grid");
    grid.innerHTML = "";
    challengeGrid.innerHTML = "";
    const locked = game.menuLocked && !game.mixTables;

    range(1, CORE_MAX).forEach((n) => grid.appendChild(makeTableButton(n, locked)));

    // 13–20 only exist once Challenge mode is on, so a younger child never sees
    // 18× as an option.
    challengeWrap.classList.toggle("hidden", !game.challenge);
    if (game.challenge) {
      range(CORE_MAX + 1, CHALLENGE_MAX).forEach((n) =>
        challengeGrid.appendChild(makeTableButton(n, locked))
      );
    }

    $("#mix-tables").disabled = game.menuLocked;
  }

  // --- Game ---
  const MIX_DECK_SIZE = 20;

  function isChallengeTable(table) {
    return table > CORE_MAX;
  }

  /**
   * Core tables (1–12) run ×1–×12, as they always have.
   *
   * Challenge tables (13–20) run up to their own square: 13 goes to 13×13, 17
   * to 17×17, and so on. Anything past the square is just the commutative twin
   * of a fact already covered by a lower table — 17×14 lives in the 17 deck,
   * so the 14 deck has no reason to carry it. Decks therefore grow from 13 to
   * 20 cards with no fact appearing twice anywhere.
   */
  function maxFactorFor(table) {
    return isChallengeTable(table) ? table : CORE_MAX;
  }

  function buildDeck() {
    const cards = [];
    let tables;
    if (game.mixTables) {
      // Challenge mix draws only from 13–20; the standard mix stays on 1–12 so
      // a 2× never lands in the same deck as a 19×.
      tables = game.challenge
        ? range(CORE_MAX + 1, CHALLENGE_MAX)
        : range(1, CORE_MAX);
    } else {
      tables = [game.selectedTable];
    }
    tables.forEach((t) => {
      const maxFactor = maxFactorFor(t);
      for (let i = 1; i <= maxFactor; i++) {
        cards.push({
          id: uid(),
          multiplier: t,
          multiplicand: i,
          question: `${t} × ${i}`,
          answer: t * i,
          challenge: isChallengeTable(t),
        });
      }
    });
    const shuffled = shuffle(cards);
    // Mix mode draws from every table, so keep rounds to a manageable 20 cards.
    return game.mixTables ? shuffled.slice(0, MIX_DECK_SIZE) : shuffled;
  }

  function startGame() {
    game.cards = buildDeck();
    game.index = 0;
    game.typed = "";
    game.correct = [];
    game.incorrect = [];
    game.isFlipping = false;
    game.roundNumber = 1;
    game.totalAttempts = 0;
    game.totalIncorrect = 0;
    game.missedFacts = [];
    game.attempts = [];
    game.streak = 0;
    game.results = [];
    game.gameStart = Date.now();
    game.elapsed = 0;

    stopTimers();
    startElapsed();

    // The whole game screen picks up challenge colours when a challenge table
    // is in play, so a teacher can see from across the room who is on 17× and
    // ask why, if they are meant to be on their 4s.
    challengePalette = game.mixTables
      ? game.challenge
      : isChallengeTable(game.selectedTable);
    $("#challenge-chip").classList.toggle("hidden", !challengePalette);

    showScreen("game");
    $("#game-table-label").textContent = game.mixTables
      ? game.challenge
        ? "Challenge Mix"
        : "Mixed Tables"
      : `${game.selectedTable}× Tables`;
    renderGame();
  }

  function stopTimers() {
    if (game.elapsedId) clearInterval(game.elapsedId);
    game.elapsedId = null;
  }

  function startElapsed() {
    // Session duration is still recorded (never displayed) for later analysis.
    game.elapsedId = setInterval(() => {
      game.elapsed = (Date.now() - game.gameStart) / 1000;
    }, 100);
  }

  function formatTime(sec) {
    const s = Math.floor(sec);
    const t = Math.floor((sec - s) * 10);
    const m = Math.floor(s / 60);
    const rs = s % 60;
    if (m > 0) return `${m}:${String(rs).padStart(2, "0")}.${t}`;
    return `${rs}.${t}s`;
  }

  function renderGame() {
    const card = game.cards[game.index];
    const left = Math.max(0, game.cards.length - game.index);
    $("#cards-left").textContent = `Card ${Math.min(game.index + 1, game.cards.length)} of ${game.cards.length}`;
    $("#pile-correct-count").textContent = game.correct.length;
    $("#pile-incorrect-count").textContent = game.incorrect.length;

    renderStreak();
    renderRail();
    renderPileStacks();

    const fc = $("#flash-card");
    if (!card) {
      fc.classList.add("hidden");
      return;
    }
    fc.classList.remove("hidden");
    fc.dataset.state = "question";
    fc.classList.remove("incorrect");
    $("#card-question").textContent = card.question;
    $("#card-answer").textContent = card.answer;
    $("#flying-card").classList.add("hidden");

    // The typed answer goes on the card itself, straight after the equals,
    // so the feedback is where the eye already is.
    const typed = $("#card-typed");
    typed.textContent = game.typed;
    typed.classList.toggle("is-empty", !game.typed);

    // Start the per-card timer only when a fresh card is on screen (not mid-flip,
    // and not on the re-renders that happen while a digit is being typed — those
    // have game.typed set — otherwise the measured time would reset each keypress).
    if (!game.isFlipping && game.typed === "") {
      game.cardStartedAt = performance.now();
    }
  }

  function renderStreak() {
    const pill = $("#streak-pill");
    $("#streak-count").textContent = game.streak;
    pill.classList.toggle("is-zero", game.streak === 0);
  }

  /** One pip per card in this round, filled behind the current card. */
  function renderRail() {
    const rail = $("#rail");
    const total = game.cards.length;
    if (rail.childElementCount !== total) {
      rail.innerHTML = "";
      for (let i = 0; i < total; i++) rail.appendChild(document.createElement("i"));
    }
    Array.from(rail.children).forEach((pip, i) => {
      const result = game.results[i];
      pip.className =
        result === true ? "is-correct"
        : result === false ? "is-wrong"
        : i === game.index ? "is-current"
        : "";
    });
  }

  function renderPileStacks() {
    ["correct", "incorrect"].forEach((side) => {
      const list = side === "correct" ? game.correct : game.incorrect;
      const stack = $(`#stack-${side}`);
      stack.innerHTML = "";
      stack.classList.toggle("has-cards", list.length > 0);
      // Only the top few are drawn; the rest would never be seen anyway.
      list.slice(-5).forEach((c, i) => {
        const el = document.createElement("div");
        el.className = "mini-card";
        el.style.transform = `translateY(${-i * 4}px)`;
        el.style.zIndex = i;
        el.textContent = c.answer;
        stack.appendChild(el);
      });
    });
  }

  function appendDigit(d) {
    if (game.isFlipping || game.typed.length >= 3) return;
    game.typed += d;
    renderGame();
  }

  function deleteDigit() {
    if (game.isFlipping || !game.typed) return;
    game.typed = game.typed.slice(0, -1);
    renderGame();
  }

  function submitAnswer() {
    if (game.isFlipping) return;
    const card = game.cards[game.index];
    if (!card || !game.typed) return;
    const elapsedMs = performance.now() - game.cardStartedAt;
    const ok = parseInt(game.typed, 10) === card.answer;
    resolveCard(ok, elapsedMs);
  }

  function resolveCard(correct, elapsedMs) {
    if (game.isFlipping) return;
    game.isFlipping = true;

    const card = game.cards[game.index];
    const fc = $("#flash-card");
    fc.classList.toggle("incorrect", !correct);

    flashScreen(correct);

    // Flip to answer
    requestAnimationFrame(() => {
      fc.dataset.state = "answer";
    });

    const slideDelay = 860;
    const slideDuration = 780;

    setTimeout(() => {
      const flying = $("#flying-card");
      const flyingY = flying.querySelector(".flying-y");
      const pileEl = correct ? $("#pile-correct") : $("#pile-incorrect");
      const stackEl = correct ? $("#stack-correct") : $("#stack-incorrect");
      const cardRect = fc.getBoundingClientRect();
      const pileRect = stackEl.getBoundingClientRect();

      fc.style.visibility = "hidden";
      flying.classList.remove("hidden");
      flying.classList.toggle("incorrect", !correct);
      $("#flying-answer").textContent = card.answer;

      const dx = (pileRect.left + pileRect.width / 2) - (cardRect.left + cardRect.width / 2);
      const dy = (pileRect.top + pileRect.height / 2) - (cardRect.top + cardRect.height / 2);
      const scale = cardRect.width ? pileRect.width / cardRect.width : 0.43;
      const spin = correct ? -ARC.spinDeg : ARC.spinDeg;

      // Reset both layers with no transition, force a reflow so the browser
      // takes the reset as the starting point, then animate.
      flying.style.transition = "none";
      flyingY.style.transition = "none";
      flying.style.transform = "translateX(0px)";
      flyingY.style.transform = "translateY(0px) rotate(0deg) scale(1)";
      void flying.offsetWidth;

      requestAnimationFrame(() => {
        // The outer layer runs the horizontal move on an ordinary ease. The
        // inner one runs the drop on a curve whose first control point is
        // NEGATIVE, which sends the card up before it comes down. The two
        // disagreeing is the whole trick — that is the arc.
        flying.style.transition = `transform ${slideDuration}ms ${ARC.easeX}`;
        flyingY.style.transition = `transform ${slideDuration}ms ${ARC.easeY}`;
        flying.style.transform = `translateX(${dx}px)`;
        flyingY.style.transform =
          `translateY(${dy}px) rotate(${spin}deg) scale(${scale})`;
      });

      setTimeout(finishResolve, slideDuration + 70, correct, card, elapsedMs);
    }, slideDelay);
  }

  function flashScreen(correct) {
    let el = document.querySelector(".flash-overlay");
    if (!el) {
      el = document.createElement("div");
      el.className = "flash-overlay";
      document.body.appendChild(el);
    }
    el.className = "flash-overlay " + (correct ? "show-correct" : "show-wrong");
    setTimeout(() => {
      el.className = "flash-overlay";
    }, 200);
  }

  function finishResolve(correct, card, elapsedMs) {
    game.attempts.push({
      q: card.question,
      // The answer drives the per-digit time allowance, and the challenge flag
      // keeps the two kinds of card comparable when the data is analysed.
      answer: card.answer,
      challenge: !!card.challenge,
      ms: Math.round(elapsedMs),
      correct: correct,
      round: game.roundNumber,
      input: game.lastInputMethod,
    });

    game.results[game.index] = correct;
    game.streak = correct ? game.streak + 1 : 0;

    if (correct) {
      game.correct.push(card);
    } else {
      game.incorrect.push(card);
      game.missedFacts.push(card.question);
      game.totalIncorrect++;
    }
    game.totalAttempts++;

    game.index++;
    game.typed = "";
    game.isFlipping = false;

    const fc = $("#flash-card");
    const inner = fc.querySelector(".card-inner");
    // Snap back to the question side with NO animation while the card is still
    // hidden, otherwise the next card briefly flashes its answer (back face)
    // as it flips from answer -> question.
    inner.style.transition = "none";
    fc.dataset.state = "question";
    void inner.offsetWidth; // force reflow so the instant reset takes effect
    inner.style.transition = "";
    fc.style.visibility = "";
    const flyingEl = $("#flying-card");
    const flyingYEl = flyingEl.querySelector(".flying-y");
    flyingEl.classList.add("hidden");
    flyingEl.style.transform = "";
    flyingEl.style.transition = "";
    if (flyingYEl) { flyingYEl.style.transform = ""; flyingYEl.style.transition = ""; }

    if (game.index >= game.cards.length) {
      if (game.incorrect.length === 0) {
        endGame();
        return;
      }
      game.cards = shuffle(game.incorrect);
      game.incorrect = [];
      game.index = 0;
      game.results = [];
      game.roundNumber++;
    }

    renderGame();
  }

  function endGame() {
    stopTimers();
    const elapsed = (Date.now() - game.gameStart) / 1000;
    const accuracy =
      game.totalAttempts > 0
        ? ((game.totalAttempts - game.totalIncorrect) / game.totalAttempts) * 100
        : 100;

    saveSession({
      accuracy,
      elapsed,
      rounds: game.roundNumber,
    });

    $("#summary-stars").textContent = starCount(game.roundNumber);
    $("#summary-accuracy").textContent = `Accuracy: ${Math.round(accuracy)}%`;
    $("#summary-rounds").textContent = `Rounds needed: ${game.roundNumber}`;

    const medMs = median(game.attempts.map((a) => a.ms));
    const timeEl = $("#summary-time");
    if (medMs != null) {
      timeEl.classList.remove("hidden");
      timeEl.textContent = `Average time per card: ${(medMs / 1000).toFixed(1)}s`;
    } else {
      timeEl.classList.add("hidden");
    }

    $("#summary-message").textContent = encouragingMessage(accuracy);

    // Show the wall link only when there is a player to have a wall, and flag
    // a table that has just tipped over into mastered.
    const s = currentStudent();
    const wallBtn = $("#btn-summary-wall");
    wallBtn.classList.toggle("hidden", !s);
    if (s && !game.mixTables) {
      const m = masteryFor(s, game.selectedTable);
      $("#summary-mastered").classList.toggle("hidden", m.state !== "mastered");
      if (m.state === "mastered") {
        $("#summary-mastered").textContent = `★ ${game.selectedTable}× table mastered!`;
      }
    } else {
      $("#summary-mastered").classList.add("hidden");
    }

    startCelebration();
    showScreen("summary");
  }

  function saveSession({ accuracy, elapsed, rounds }) {
    const s = currentStudent();
    if (!s) return;
    // Challenge mix is kept as its own key so it never averages in with the
    // core mix — they are different decks doing different work.
    const tableKey = game.mixTables
      ? game.challenge
        ? "mix-challenge"
        : "mix"
      : String(game.selectedTable);
    const tableName = game.mixTables
      ? game.challenge
        ? "Challenge Mix"
        : "Mixed Tables"
      : `${game.selectedTable}× Tables`;
    const firstPassMs = game.attempts
      .filter((a) => a.round === 1)
      .map((a) => a.ms);
    const session = {
      id: uid(),
      date: new Date().toISOString(),
      tableKey,
      tableName,
      totalCards: game.totalAttempts,
      correctCount: game.totalAttempts - game.totalIncorrect,
      roundsNeeded: rounds,
      completionTime: elapsed,
      missedFacts: [...game.missedFacts],
      schemaVersion: SCHEMA_VERSION,
      cleanFirstPass: rounds === 1,
      challenge: game.mixTables
        ? game.challenge
        : isChallengeTable(game.selectedTable),
      attempts: [...game.attempts],
      firstPassMedianMs: median(firstPassMs),
      dominantInput: dominantValue(game.attempts.map((a) => a.input)),
    };
    s.sessions = s.sessions || [];
    s.sessions.push(session);
    saveStudents();
  }

  // --- Mastery wall ---

  function openMasteryWall() {
    const s = currentStudent();
    if (!s) return;
    $("#wall-title").textContent = `${s.name}'s tables`;
    renderMasteryWall(s);
    $("#wall-detail").classList.add("hidden");
    $("#dialog-wall").showModal();
  }

  function renderMasteryWall(student) {
    const coreGrid = $("#wall-core");
    const challengeGrid = $("#wall-challenge");
    coreGrid.innerHTML = "";
    challengeGrid.innerHTML = "";

    let mastered = 0;
    range(1, CORE_MAX).forEach((n) => {
      const m = masteryFor(student, n);
      if (m.state === "mastered") mastered++;
      coreGrid.appendChild(makeWallTile(student, n, m));
    });

    // Challenge squares only appear once the mode is on, matching the menu.
    $("#wall-challenge-group").classList.toggle("hidden", !game.challenge);
    if (game.challenge) {
      range(CORE_MAX + 1, CHALLENGE_MAX).forEach((n) => {
        const m = masteryFor(student, n);
        challengeGrid.appendChild(makeWallTile(student, n, m));
      });
    }

    $("#wall-summary").textContent =
      mastered === CORE_MAX
        ? "🏆 Every table mastered. Outstanding."
        : `${mastered} of ${CORE_MAX} tables mastered`;
  }

  function makeWallTile(student, table, m) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `wall-tile wall-${m.state}`;
    if (isChallengeTable(table)) btn.classList.add("challenge");

    const num = document.createElement("span");
    num.className = "wall-num";
    num.textContent = `${table}×`;
    btn.appendChild(num);

    const mark = document.createElement("span");
    mark.className = "wall-mark";
    mark.textContent =
      m.state === "mastered" ? "★" : m.state === "practising" ? "•" : "";
    btn.appendChild(mark);

    const label =
      m.state === "mastered"
        ? "mastered"
        : m.state === "practising"
        ? `${m.cleanPasses} of ${MASTERY.passesNeeded} clean`
        : "not started";
    btn.setAttribute("aria-label", `${table} times table, ${label}`);

    btn.addEventListener("click", () => showWallDetail(student, table, m));
    return btn;
  }

  function showWallDetail(student, table, m) {
    const box = $("#wall-detail");
    box.classList.remove("hidden");
    $("#wall-detail-title").textContent = `${table}× table`;

    if (m.state === "none") {
      $("#wall-detail-status").textContent = "Not practised yet — give it a go!";
      $("#wall-graph").innerHTML = "";
      return;
    }

    const statusText =
      m.state === "mastered"
        ? `★ Mastered — ${m.cleanPasses} clean runs out of your last ${Math.min(
            m.sessions,
            MASTERY.windowSize
          )}`
        : `${m.cleanPasses} clean run${m.cleanPasses === 1 ? "" : "s"} out of your last ${Math.min(
            m.sessions,
            MASTERY.windowSize
          )} — ${MASTERY.passesNeeded} needed to master it`;
    $("#wall-detail-status").textContent = statusText;

    renderTrendGraph(trendFor(student, table));
  }

  /**
   * Inline SVG line graph of median card time per session. Built by hand rather
   * than with a chart library so the app keeps working offline with no CDN.
   */
  function renderTrendGraph(points) {
    const wrap = $("#wall-graph");
    wrap.innerHTML = "";
    if (points.length < 2) {
      wrap.innerHTML =
        '<p class="wall-graph-empty">Play this table again to see your times improve.</p>';
      return;
    }

    const W = 300;
    const H = 120;
    const padX = 34;
    const padY = 20;

    const max = Math.max(...points);
    const min = Math.min(...points);
    const span = max - min || 1;

    const xFor = (i) =>
      padX + (i / (points.length - 1)) * (W - padX * 2);
    // Y is deliberately inverted: a FASTER time plots HIGHER. A child reads a
    // rising line as "getting better", and on a raw time axis that would be
    // exactly backwards. The axis is labelled so the direction is explicit.
    const yFor = (v) =>
      padY + ((v - min) / span) * (H - padY * 2);

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("class", "trend-svg");
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      `Your speed over ${points.length} sessions. Started at ${(
        points[0] / 1000
      ).toFixed(1)} seconds per card, now ${(
        points[points.length - 1] / 1000
      ).toFixed(1)} seconds per card. Higher on the chart means faster.`
    );

    const ns = "http://www.w3.org/2000/svg";

    // Axis hint, so "up" is never ambiguous.
    const fastLabel = document.createElementNS(ns, "text");
    fastLabel.setAttribute("x", 4);
    fastLabel.setAttribute("y", padY - 6);
    fastLabel.setAttribute("class", "trend-axis");
    fastLabel.textContent = "faster ↑";
    svg.appendChild(fastLabel);

    const line = document.createElementNS(ns, "polyline");
    line.setAttribute(
      "points",
      points.map((v, i) => `${xFor(i)},${yFor(v)}`).join(" ")
    );
    line.setAttribute("class", "trend-line");
    svg.appendChild(line);

    points.forEach((v, i) => {
      const dot = document.createElementNS(ns, "circle");
      dot.setAttribute("cx", xFor(i));
      dot.setAttribute("cy", yFor(v));
      dot.setAttribute("r", i === points.length - 1 ? 5 : 3.5);
      dot.setAttribute(
        "class",
        i === points.length - 1 ? "trend-dot trend-dot-last" : "trend-dot"
      );
      svg.appendChild(dot);
    });

    wrap.appendChild(svg);

    const first = points[0];
    const last = points[points.length - 1];
    const caption = document.createElement("p");
    caption.className = "wall-graph-caption";
    const diff = (first - last) / 1000;
    caption.textContent =
      diff > 0.2
        ? `⚡ ${diff.toFixed(1)}s faster than when you started — ${(last / 1000).toFixed(1)}s per card now`
        : `${(last / 1000).toFixed(1)}s per card`;
    wrap.appendChild(caption);
  }

  // --- Numpad ---
  function buildNumpad() {
    const pad = $("#numpad");
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "✓"];
    keys.forEach((k) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = k;
      if (k === "✓") {
        b.classList.add("pad-submit");
        b.setAttribute("aria-label", "Submit answer");
        b.addEventListener("click", submitAnswer);
      } else if (k === "⌫") {
        b.setAttribute("aria-label", "Delete");
        b.addEventListener("click", deleteDigit);
      } else {
        b.setAttribute("aria-label", `Number ${k}`);
        b.addEventListener("click", () => appendDigit(k));
      }
      pad.appendChild(b);
    });

    // Record the input device (touch vs mouse) per attempt; keyboard entry
    // overrides this in the document keydown handler.
    pad.addEventListener("pointerdown", (e) => {
      game.lastInputMethod = e.pointerType === "touch" ? "touch" : "mouse";
    });
  }

  // --- Teacher ---
  function openGate() {
    const dlg = $("#dialog-gate");
    const enabled = pinEnabled();
    $("#gate-help").textContent = enabled
      ? "Enter your teacher PIN to continue."
      : "PIN is off. Tap Continue to open Manage Players.";
    $("#gate-pin-wrap").classList.toggle("hidden", !enabled);
    $("#gate-pin").value = "";
    dlg.showModal();
  }

  function openManage() {
    renderManageList();
    renderAssignList();
    $("#dialog-manage").showModal();
  }

  function renderManageList() {
    const ul = $("#manage-list");
    ul.innerHTML = "";
    students
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((s) => {
        const li = document.createElement("li");
        li.innerHTML = `<span>${escapeHtml(s.name)}</span>`;
        const del = document.createElement("button");
        del.type = "button";
        del.className = "btn btn-secondary";
        del.textContent = "Remove";
        del.addEventListener("click", () => {
          students = students.filter((x) => x.id !== s.id);
          if (currentStudentId === s.id) currentStudentId = null;
          saveStudents();
          renderStudents();
          renderManageList();
        });
        li.appendChild(del);
        ul.appendChild(li);
      });
  }

  function renderAssignList() {
    const ul = $("#assign-list");
    ul.innerHTML = "";
    students
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((s) => {
        const li = document.createElement("li");
        const label =
          s.assignedMixMode
            ? "Mix all tables"
            : `Table ${(s.assignedTables && s.assignedTables[0]) || 2}×`;
        li.innerHTML = `<span>${escapeHtml(s.name)}<br><small>${label}</small></span>`;
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "btn btn-secondary";
        edit.textContent = "Edit";
        edit.addEventListener("click", () => openAssignDialog(s.id));
        li.appendChild(edit);
        ul.appendChild(li);
      });
  }

  function openAssignDialog(id) {
    assignStudentId = id;
    const s = students.find((x) => x.id === id);
    if (!s) return;
    $("#assign-title").textContent = `Practice for ${s.name}`;
    $("#assign-mix").checked = !!s.assignedMixMode;
    assignSelectedTable = (s.assignedTables && s.assignedTables[0]) || 2;
    renderAssignGrid();
    $("#dialog-assign").showModal();
  }

  function renderAssignGrid() {
    const wrap = $("#assign-tables-wrap");
    const grid = $("#assign-table-grid");
    grid.innerHTML = "";
    const mix = $("#assign-mix").checked;
    wrap.classList.toggle("hidden", mix);
    // Teacher-side grid: shows the challenge tables only when the device has
    // challenge mode on, matching what the child can actually pick.
    const top = game.challenge ? CHALLENGE_MAX : CORE_MAX;
    range(1, top).forEach((n) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "table-btn";
      if (isChallengeTable(n)) btn.classList.add("challenge");
      btn.textContent = `${n}×`;
      if (assignSelectedTable === n) btn.classList.add("selected");
      btn.addEventListener("click", () => {
        assignSelectedTable = n;
        renderAssignGrid();
      });
      grid.appendChild(btn);
    });
  }

  function exportCSV() {
    const rows = [
      "Player,Date,Table,Challenge,Total Cards,Correct,Incorrect,Correct %,Rounds,Time (s),Clean Pass,Missed Facts",
    ];
    students.forEach((st) => {
      (st.sessions || []).forEach((sess) => {
        const d = new Date(sess.date).toLocaleString();
        const inc = sess.totalCards - sess.correctCount;
        const pct = sess.totalCards
          ? Math.round((sess.correctCount / sess.totalCards) * 100)
          : 0;
        const time = sess.completionTime != null ? sess.completionTime.toFixed(1) : "";
        const missed = (sess.missedFacts || []).join("; ");
        rows.push(
          [
            `"${st.name.replace(/"/g, '""')}"`,
            `"${d}"`,
            `"${sess.tableName}"`,
            sess.challenge ? "Yes" : "No",
            sess.totalCards,
            sess.correctCount,
            inc,
            `${pct}%`,
            sess.roundsNeeded,
            time,
            isCleanPass(sess) ? "Yes" : "No",
            `"${missed.replace(/"/g, '""')}"`,
          ].join(",")
        );
      });
    });
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "FlashFlips-export.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /**
   * Card-level export — this is the file to calibrate MASTERY against. Answer
   * and Digits are included because the time includes tapping the answer in,
   * so a three-digit answer is legitimately slower than a one-digit one.
   * Threshold/Under Threshold show what the current settings would score.
   */
  function exportAttemptsCSV() {
    const rows = [
      "Player,Date,Table,Challenge,Question,Answer,Digits,Time (ms),Threshold (ms),Under Threshold,Correct,Round,Input",
    ];
    students.forEach((st) => {
      (st.sessions || []).forEach((sess) => {
        // Older sessions (schema v1) have no attempts array — skip them.
        if (!Array.isArray(sess.attempts)) return;
        const d = new Date(sess.date).toLocaleString();
        sess.attempts.forEach((att) => {
          const answer = att.answer != null ? att.answer : "";
          const digits = answer === "" ? "" : String(answer).length;
          const thr =
            answer === "" ? "" : Math.round(thresholdFor(answer, !!att.challenge));
          rows.push(
            [
              `"${st.name.replace(/"/g, '""')}"`,
              `"${d}"`,
              `"${sess.tableName}"`,
              att.challenge ? "Yes" : "No",
              `"${String(att.q).replace(/"/g, '""')}"`,
              answer,
              digits,
              att.ms,
              thr,
              thr === "" ? "" : att.ms <= thr ? "Yes" : "No",
              att.correct ? "Yes" : "No",
              att.round,
              att.input,
            ].join(",")
          );
        });
      });
    });
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "FlashFlips-card-times.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function setupManageButton() {
    const btn = $("#btn-manage-hold");
    btn.addEventListener("click", () => openManage());
  }

  // --- Init / events ---
  function init() {
    loadStudents();

    // Default student shape
    students.forEach((s) => {
      if (!s.assignedTables) s.assignedTables = [2];
      if (s.assignedMixMode == null) s.assignedMixMode = false;
      if (!s.sessions) s.sessions = [];
    });

    // Restore the challenge setting for this device.
    game.challenge = challengeEnabled();
    setChallengeEnabled(game.challenge);

    const urlTable = getUrlTable();

    buildNumpad();
    setupManageButton();
    renderStudents();

    if (urlTable) {
      // QR / direct link (e.g. ?table=3): jump straight into that table as a guest, nothing locked.
      startGuestPractice(urlTable);
    } else {
      showScreen("home");
    }

    $("#mix-tables").addEventListener("change", (e) => {
      if (game.menuLocked) return;
      game.mixTables = e.target.checked;
      renderTableGrid();
    });

    $("#challenge-toggle").addEventListener("change", (e) => {
      game.challenge = e.target.checked;
      setChallengeEnabled(game.challenge);
      // Turning challenge off while sitting on 17× would leave an invisible
      // table selected, so fall back to a core one.
      if (!game.challenge && isChallengeTable(game.selectedTable)) {
        game.selectedTable = 2;
      }
      updateMixLabel();
      renderTableGrid();
    });

    $("#btn-wall").addEventListener("click", openMasteryWall);
    $("#btn-summary-wall").addEventListener("click", openMasteryWall);

    $("#btn-start").addEventListener("click", () => {
      game.mixTables = $("#mix-tables").checked;
      if (!game.mixTables) {
        const sel = document.querySelector(".table-btn.selected");
        if (sel) game.selectedTable = parseInt(sel.textContent, 10);
      }
      startGame();
    });

    $("#btn-quick-practise").addEventListener("click", () => {
      // Play without a profile (progress won't be saved).
      currentStudentId = null;
      game.menuLocked = false;
      showScreen("menu");
      refreshMenu();
    });

    $("#btn-home").addEventListener("click", () => {
      currentStudentId = null;
      showScreen("home");
      renderStudents();
    });

    $("#btn-menu").addEventListener("click", () => {
      stopTimers();
      showScreen("menu");
      refreshMenu();
    });

    $("#btn-play-again").addEventListener("click", startGame);
    $("#btn-summary-menu").addEventListener("click", () => {
      showScreen("menu");
      refreshMenu();
    });

    $("#btn-gate-continue").addEventListener("click", () => {
      if (!verifyPin($("#gate-pin").value)) {
        alert("Incorrect PIN. Please try again.");
        return;
      }
      $("#dialog-gate").close();
      openManage();
    });

    $("#btn-gate-settings").addEventListener("click", () => {
      $("#pin-enabled").checked = pinEnabled();
      $("#pin-set-wrap").classList.toggle("hidden", !pinEnabled());
      $("#dialog-settings").showModal();
    });

    $("#pin-enabled").addEventListener("change", (e) => {
      $("#pin-set-wrap").classList.toggle("hidden", !e.target.checked);
      if (!e.target.checked) {
        localStorage.setItem(STORAGE_PIN_ENABLED, "false");
        localStorage.removeItem(STORAGE_PIN);
      }
    });

    $("#btn-set-pin").addEventListener("click", () => {
      const a = $("#pin-new").value.trim();
      const b = $("#pin-confirm").value.trim();
      if (a !== b || a.length < 4 || a.length > 6 || !/^\d+$/.test(a)) {
        alert("PIN must be 4–6 digits and match confirmation.");
        return;
      }
      localStorage.setItem(STORAGE_PIN, a);
      localStorage.setItem(STORAGE_PIN_ENABLED, "true");
      $("#dialog-settings").close();
      alert("PIN enabled.");
    });

    $("#btn-clear-pin").addEventListener("click", () => {
      localStorage.setItem(STORAGE_PIN_ENABLED, "false");
      localStorage.removeItem(STORAGE_PIN);
      $("#pin-enabled").checked = false;
      $("#pin-set-wrap").classList.add("hidden");
      alert("PIN disabled.");
    });

    $$(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        $$(".tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        $("#tab-students").classList.toggle("hidden", tab.dataset.tab !== "students");
        $("#tab-assignments").classList.toggle("hidden", tab.dataset.tab !== "assignments");
      });
    });

    $("#btn-add-one").addEventListener("click", () => {
      $("#new-student-name").value = "";
      $("#dialog-add-student").showModal();
    });

    $("#btn-save-student").addEventListener("click", () => {
      const name = $("#new-student-name").value.trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (students.some((s) => s.name.toLowerCase() === key)) {
        alert("Player already exists.");
        return;
      }
      students.push({
        id: uid(),
        name,
        assignedTables: [2],
        assignedMixMode: false,
        sessions: [],
        dateAdded: new Date().toISOString(),
      });
      students.sort((a, b) => a.name.localeCompare(b.name));
      saveStudents();
      renderStudents();
      renderManageList();
      $("#dialog-add-student").close();
    });

    $("#btn-bulk-add").addEventListener("click", () => {
      const names = parseBulkNames($("#bulk-names").value);
      const existing = new Set(students.map((s) => s.name.toLowerCase()));
      let added = 0;
      names.forEach((name) => {
        const key = name.toLowerCase();
        if (existing.has(key)) return;
        existing.add(key);
        students.push({
          id: uid(),
          name,
          assignedTables: [2],
          assignedMixMode: false,
          sessions: [],
          dateAdded: new Date().toISOString(),
        });
        added++;
      });
      students.sort((a, b) => a.name.localeCompare(b.name));
      saveStudents();
      renderStudents();
      renderManageList();
      $("#bulk-names").value = "";
      alert(added ? `Added ${added} player(s).` : "No new names to add.");
    });

    $("#assign-mix").addEventListener("change", renderAssignGrid);

    $("#btn-save-assign").addEventListener("click", () => {
      const s = students.find((x) => x.id === assignStudentId);
      if (!s) return;
      s.assignedMixMode = $("#assign-mix").checked;
      s.assignedTables = s.assignedMixMode ? [2] : [assignSelectedTable];
      saveStudents();
      if (currentStudentId === s.id) applyStudentAssignment(s);
      renderAssignList();
      $("#dialog-assign").close();
    });

    $("#btn-export-csv").addEventListener("click", exportCSV);
    $("#btn-export-attempts").addEventListener("click", exportAttemptsCSV);

    $$("[data-close]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-close");
        const dlg = document.getElementById(id);
        if (dlg) dlg.close();
      });
    });

    document.addEventListener("keydown", (e) => {
      // Never hijack typing while a dialog or text field is focused.
      if (document.querySelector("dialog[open]")) return;
      const ae = document.activeElement;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) return;
      // Only act during active play.
      if (!screens.game.classList.contains("active")) return;

      if (e.key >= "0" && e.key <= "9") {
        game.lastInputMethod = "keyboard";
        appendDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        game.lastInputMethod = "keyboard";
        deleteDigit();
      } else if (e.key === "Enter") {
        game.lastInputMethod = "keyboard";
        submitAnswer();
      }
    });
  }

  init();
})();
