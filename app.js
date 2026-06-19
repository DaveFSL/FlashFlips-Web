/**
 * FlashFlips Web v1 — local-only, no backend
 */
(function () {
  "use strict";

  const STORAGE_STUDENTS = "FlashFlips_Students";
  const STORAGE_PIN_ENABLED = "FlashFlips_TeacherPinEnabled";
  const STORAGE_PIN = "FlashFlips_TeacherPin";

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
    timerEnabled: false,
    timeLimit: 5,
    timeRemaining: 5,
    timerId: null,
    elapsedId: null,
    gameStart: 0,
    elapsed: 0,
    mixTables: false,
    selectedTable: 2,
    menuLocked: false,
  };

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

  function hexToRgba(hex, alpha) {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
    return n >= 1 && n <= 12 ? n : null;
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
  function showScreen(name) {
    Object.entries(screens).forEach(([key, el]) => {
      if (!el) return;
      el.classList.toggle("active", key === name);
      el.hidden = key !== name;
    });
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
    game.mixTables = !!s.assignedMixMode;
    game.selectedTable = (s.assignedTables && s.assignedTables[0]) || 2;
    game.menuLocked = true;
  }

  // --- Menu ---
  function refreshMenu() {
    const s = currentStudent();
    $("#menu-playing-as").textContent = s ? `Playing as ${s.name}` : "";
    $("#mix-tables").checked = game.mixTables;
    $("#timer-enabled").checked = game.timerEnabled;
    $("#timer-limit").value = game.timeLimit;
    updateTimerUI();

    const hint = $("#assigned-hint");
    if (game.menuLocked && s) {
      hint.classList.remove("hidden");
    } else {
      hint.classList.add("hidden");
    }

    renderTableGrid();
  }

  function renderTableGrid() {
    const grid = $("#table-grid");
    grid.innerHTML = "";
    const locked = game.menuLocked && !game.mixTables;
    for (let n = 1; n <= 12; n++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "table-btn";
      btn.textContent = `${n}×`;
      const selected = !game.mixTables && game.selectedTable === n;
      if (selected) btn.classList.add("selected");
      btn.disabled = locked;
      btn.addEventListener("click", () => {
        if (locked) return;
        game.selectedTable = n;
        game.mixTables = false;
        $("#mix-tables").checked = false;
        renderTableGrid();
      });
      grid.appendChild(btn);
    }
    $("#mix-tables").disabled = game.menuLocked;
  }

  function updateTimerUI() {
    const on = $("#timer-enabled").checked;
    game.timerEnabled = on;
    $("#timer-controls").classList.toggle("hidden", !on);
    $("#timer-off-hint").classList.toggle("hidden", on);
    if (on) {
      game.timeLimit = parseFloat($("#timer-limit").value);
      $("#timer-label").textContent = `${game.timeLimit.toFixed(1)} seconds per card`;
    }
  }

  // --- Game ---
  function buildDeck() {
    const cards = [];
    const tables = game.mixTables
      ? Array.from({ length: 12 }, (_, i) => i + 1)
      : [game.selectedTable];
    tables.forEach((t) => {
      for (let i = 1; i <= 12; i++) {
        cards.push({
          id: uid(),
          multiplier: t,
          multiplicand: i,
          question: `${t} × ${i}`,
          answer: t * i,
        });
      }
    });
    return shuffle(cards);
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
    game.gameStart = Date.now();
    game.elapsed = 0;

    stopTimers();
    if (game.timerEnabled) {
      startCountdown();
      startElapsed();
    }

    showScreen("game");
    $("#game-table-label").textContent = game.mixTables
      ? "Mixed Tables"
      : `${game.selectedTable}× Tables`;
    $("#game-elapsed").classList.toggle("hidden", !game.timerEnabled);
    renderGame();
  }

  function stopTimers() {
    if (game.timerId) clearInterval(game.timerId);
    if (game.elapsedId) clearInterval(game.elapsedId);
    game.timerId = null;
    game.elapsedId = null;
  }

  function startCountdown() {
    game.timeRemaining = game.timeLimit;
    updateTimerBar();
    game.timerId = setInterval(() => {
      game.timeRemaining -= 0.1;
      if (game.timeRemaining <= 0) {
        game.timeRemaining = 0;
        resolveCard(false);
      }
      updateTimerBar();
    }, 100);
  }

  function startElapsed() {
    game.elapsedId = setInterval(() => {
      game.elapsed = (Date.now() - game.gameStart) / 1000;
      $("#game-elapsed").textContent = formatTime(game.elapsed);
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

  function updateTimerBar() {
    const wrap = $("#timer-bar-wrap");
    wrap.classList.toggle("hidden", !game.timerEnabled);
    const bar = $("#timer-bar");
    const p = game.timeLimit > 0 ? game.timeRemaining / game.timeLimit : 0;
    bar.style.width = `${Math.max(0, p * 100)}%`;
    bar.style.background =
      p > 0.5 ? "var(--green)" : p > 0.25 ? "#FF9800" : "var(--red)";
  }

  function renderGame() {
    const card = game.cards[game.index];
    const left = Math.max(0, game.cards.length - game.index);
    $("#cards-left").textContent = `${left} cards left`;
    $("#score-correct").textContent = game.correct.length;
    $("#score-wrong").textContent = game.incorrect.length;
    $("#pile-correct-count").textContent = game.correct.length;
    $("#pile-incorrect-count").textContent = game.incorrect.length;

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

    const display = $("#typed-display");
    display.textContent = game.typed || "?";
    display.classList.toggle("empty", !game.typed);
  }

  function renderPileStacks() {
    ["correct", "incorrect"].forEach((side) => {
      const list = side === "correct" ? game.correct : game.incorrect;
      const stack = $(`#stack-${side}`);
      const color = side === "correct" ? "var(--green)" : "var(--red)";
      stack.innerHTML = "";
      const visible = list.slice(-5);
      visible.forEach((c, i) => {
        const el = document.createElement("div");
        el.className = "mini-card";
        el.style.background = color;
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
    const ok = parseInt(game.typed, 10) === card.answer;
    resolveCard(ok);
  }

  function resolveCard(correct) {
    if (game.isFlipping) return;
    game.isFlipping = true;
    stopTimers();

    const card = game.cards[game.index];
    const fc = $("#flash-card");
    fc.classList.toggle("incorrect", !correct);

    flashScreen(correct);

    // Flip to answer
    requestAnimationFrame(() => {
      fc.dataset.state = "answer";
    });

    const slideDelay = 900;
    const slideDuration = 750;

    setTimeout(() => {
      const flying = $("#flying-card");
      const deckArea = document.querySelector(".deck-area");
      const pileEl = correct ? $("#pile-correct") : $("#pile-incorrect");
      const deckRect = deckArea.getBoundingClientRect();
      const pileRect = pileEl.getBoundingClientRect();

      fc.style.visibility = "hidden";
      flying.classList.remove("hidden");
      flying.classList.toggle("incorrect", !correct);
      $("#flying-answer").textContent = card.answer;

      const startX = deckRect.left + deckRect.width / 2;
      const startY = deckRect.top + deckRect.height / 2;
      const endX = pileRect.left + pileRect.width / 2;
      const endY = pileRect.top + pileRect.height / 2;
      const dx = endX - startX;
      const dy = endY - startY;

      flying.style.transform = "translate(0, 0)";
      requestAnimationFrame(() => {
        flying.style.transition = `transform ${slideDuration}ms cubic-bezier(0.25, 0.8, 0.25, 1)`;
        flying.style.transform = `translate(${dx}px, ${dy}px)`;
      });

      setTimeout(finishResolve, slideDuration + 80, correct, card);
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

  function finishResolve(correct, card) {
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
    fc.style.visibility = "";
    fc.dataset.state = "question";
    $("#flying-card").classList.add("hidden");
    $("#flying-card").style.transform = "";
    $("#flying-card").style.transition = "";

    if (game.index >= game.cards.length) {
      if (game.incorrect.length === 0) {
        endGame();
        return;
      }
      game.cards = shuffle(game.incorrect);
      game.incorrect = [];
      game.index = 0;
      game.roundNumber++;
      if (game.timerEnabled) {
        startCountdown();
      }
    } else if (game.timerEnabled) {
      startCountdown();
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
      elapsed: game.timerEnabled ? elapsed : null,
      rounds: game.roundNumber,
    });

    $("#summary-stars").textContent = starCount(game.roundNumber);
    $("#summary-accuracy").textContent = `Accuracy: ${Math.round(accuracy)}%`;
    $("#summary-rounds").textContent = `Rounds needed: ${game.roundNumber}`;
    const timeEl = $("#summary-time");
    if (game.timerEnabled) {
      timeEl.classList.remove("hidden");
      timeEl.textContent = `Time: ${formatTime(elapsed)}`;
    } else {
      timeEl.classList.add("hidden");
    }
    $("#summary-message").textContent = encouragingMessage(accuracy);

    startCelebration();
    showScreen("summary");
  }

  function saveSession({ accuracy, elapsed, rounds }) {
    const s = currentStudent();
    if (!s) return;
    const tableKey = game.mixTables
      ? "mix"
      : String(game.selectedTable);
    const tableName = game.mixTables
      ? "Mixed Tables"
      : `${game.selectedTable}× Tables`;
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
      timerEnabled: game.timerEnabled,
    };
    s.sessions = s.sessions || [];
    s.sessions.push(session);
    saveStudents();
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
  }

  // --- Teacher ---
  function openGate() {
    const dlg = $("#dialog-gate");
    const enabled = pinEnabled();
    $("#gate-help").textContent = enabled
      ? "Enter your teacher PIN to continue."
      : "PIN is off. Tap Continue to open Manage Students.";
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
    for (let n = 1; n <= 12; n++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "table-btn";
      btn.textContent = `${n}×`;
      if (assignSelectedTable === n) btn.classList.add("selected");
      btn.addEventListener("click", () => {
        assignSelectedTable = n;
        renderAssignGrid();
      });
      grid.appendChild(btn);
    }
  }

  function exportCSV() {
    const rows = [
      "Student,Date,Table,Total Cards,Correct,Incorrect,Correct %,Rounds,Time (s),Timer On,Missed Facts",
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
            sess.totalCards,
            sess.correctCount,
            inc,
            `${pct}%`,
            sess.roundsNeeded,
            time,
            sess.timerEnabled ? "Yes" : "No",
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

  function setupHoldButton() {
    const btn = $("#btn-manage-hold");
    let holdTimer = null;
    let didHold = false;

    const start = (e) => {
      e.preventDefault();
      didHold = false;
      holdTimer = setTimeout(() => {
        didHold = true;
        openGate();
      }, 1300);
    };
    const end = () => {
      clearTimeout(holdTimer);
      if (!didHold) {
        alert('Press and hold "Manage Students" to open the teacher area.');
      }
    };
    btn.addEventListener("mousedown", start);
    btn.addEventListener("touchstart", start, { passive: false });
    btn.addEventListener("mouseup", end);
    btn.addEventListener("mouseleave", end);
    btn.addEventListener("touchend", end);
    btn.addEventListener("touchcancel", end);
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

    const urlTable = getUrlTable();
    if (urlTable) game.selectedTable = urlTable;

    buildNumpad();
    setupHoldButton();
    renderStudents();
    showScreen("home");

    $("#mix-tables").addEventListener("change", (e) => {
      if (game.menuLocked) return;
      game.mixTables = e.target.checked;
      renderTableGrid();
    });

    $("#timer-enabled").addEventListener("change", updateTimerUI);
    $("#timer-limit").addEventListener("input", updateTimerUI);

    $("#btn-start").addEventListener("click", () => {
      game.mixTables = $("#mix-tables").checked;
      if (!game.mixTables) {
        const sel = document.querySelector(".table-btn.selected");
        if (sel) game.selectedTable = parseInt(sel.textContent, 10);
      }
      updateTimerUI();
      startGame();
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
        alert("Student already exists.");
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
      alert(added ? `Added ${added} student(s).` : "No new names to add.");
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

    $$("[data-close]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-close");
        const dlg = document.getElementById(id);
        if (dlg) dlg.close();
      });
    });

    document.addEventListener("keydown", (e) => {
      if (screens.game.classList.contains("active") && !game.isFlipping) {
        if (e.key >= "0" && e.key <= "9") appendDigit(e.key);
        if (e.key === "Backspace") deleteDigit();
        if (e.key === "Enter") submitAnswer();
      }
    });
  }

  init();
})();
