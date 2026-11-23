const SUPABASE_URL = "https://supabase.co";
const SUPABASE_KEY = "sb_publishable_UL-vGDHR1WNwUkOAFGni0Q_W2Q_u63k";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const gridSize = 20;
const tileCount = canvas.width / gridSize;

const hudName = document.getElementById("hud-name");
const hudScore = document.getElementById("hud-score");
const hudCombo = document.getElementById("hud-combo");
const hudLevel = document.getElementById("hud-level");
const hudLives = document.getElementById("hud-lives");
const comboBar = document.getElementById("combo-bar");
const slowIndicator = document.getElementById("slow-indicator");

const startModal = document.getElementById("start-modal");
const gameoverModal = document.getElementById("gameover-modal");
const leaderboardModal = document.getElementById("leaderboard-modal");
const playerNameInput = document.getElementById("player-name");

playerNameInput.value = localStorage.getItem("cs_player_name") || "";
let snakeColor = localStorage.getItem("cs_snake_color") || "#00f3ff";

document.querySelectorAll(".swatch").forEach(btn => {
  if (btn.dataset.color === snakeColor) {
    document.querySelector(".swatch.active")?.classList.remove("active");
    btn.classList.add("active");
  }
  btn.addEventListener("click", () => {
    document.querySelector(".swatch.active")?.classList.remove("active");
    btn.classList.add("active");
    snakeColor = btn.dataset.color;
    localStorage.setItem("cs_snake_color", snakeColor);
  });
});

let audioCtx = null;
let musicEnabled = true;
let musicInterval = null;
let noteIndex = 0;
const bassNotes = [110, 110, 130.81, 146.83, 110, 110, 164.81, 146.83];
const leadNotes = [440, 523.25, 659.25, 587.33, 440, 392, 329.63, 392];

function initAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function playTone(freq, type = "sine", duration = 0.15, vol = 0.16) {
  if (!audioCtx || !musicEnabled) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}

function startMusic() {
  stopMusic();
  if (!musicEnabled) return;
  musicInterval = setInterval(() => {
    if (!gameRunning || !musicEnabled) return;
    const bass = bassNotes[noteIndex % bassNotes.length];
    const lead = leadNotes[noteIndex % leadNotes.length];
    playTone(bass, "triangle", 0.24, 0.14);
    if (noteIndex % 2 === 0) playTone(lead, "sine", 0.18, 0.09);
    noteIndex++;
  }, 250);
}

function stopMusic() {
  if (musicInterval) clearInterval(musicInterval);
}

document.getElementById("btn-music").addEventListener("click", (e) => {
  musicEnabled = !musicEnabled;
  e.target.textContent = musicEnabled ? "🎵" : "🔇";
  if (musicEnabled && gameRunning) startMusic();
  else stopMusic();
});

let snake = [];
let dx = 1, dy = 0, nextDx = 1, nextDy = 0;
let food = { x: 15, y: 15 };
let bonus = null;
let walls = [];
let spikes = [];
let portals = [];
let worldPortal = null;
let currentWorld = 1;

let score = 0;
let level = 1;
let lives = 3;
let combo = 1;
let comboTimer = 0;
let slowTimer = 0;
let magnetTimer = 0;
let invulnTimer = 0;
let isBoosting = false;
let gameRunning = false;
let gameLoopTimeout = null;
let animFrame = 0;
let floatingTexts = [];
function addFloatingText(x, y, text, color = "#fff") {
  floatingTexts.push({ x: x * gridSize + 10, y: y * gridSize, text, color, life: 22 });
}

function isCellOccupied(x, y) {
  if (snake.some(s => s.x === x && s.y === y)) return true;
  if (walls.some(w => w.x === x && w.y === y)) return true;
  if (spikes.some(sp => sp.x === x && sp.y === y)) return true;
  if (portals.some(p => p.x === x && p.y === y)) return true;
  if (worldPortal && x >= worldPortal.x && x <= worldPortal.x + 1 && y >= worldPortal.y && y <= worldPortal.y + 1) return true;
  return false;
}

function getFreeCell() {
  for (let i = 0; i < 150; i++) {
    const x = Math.floor(Math.random() * tileCount);
    const y = Math.floor(Math.random() * tileCount);
    if (!isCellOccupied(x, y)) return { x, y };
  }
  return { x: 5, y: 5 };
}

function generateWallsForLevel(lvl) {
  walls = [];
  if (lvl < 2) return;

  const head = snake || { x: 10, y: 15 };
  const isSafeFromHead = (x, y) => Math.abs(x - head.x) > 3 || Math.abs(y - head.y) > 3;

  const layout = currentWorld === 1 ? ((lvl - 2) % 4) : ((lvl + 1) % 4);

  if (layout === 0) {
    for (let x = 7; x <= 22; x++) {
      if (isSafeFromHead(x, 7)) walls.push({ x, y: 7 });
      if (isSafeFromHead(x, 22)) walls.push({ x, y: 22 });
    }
  } else if (layout === 1) {
    for (let y = 6; y <= 23; y++) {
      if (isSafeFromHead(6, y)) walls.push({ x: 6, y });
      if (isSafeFromHead(23, y)) walls.push({ x: 23, y });
    }
  } else if (layout === 2) {
    for (let x = 4; x <= 13; x++) {
      if (isSafeFromHead(x, 9)) walls.push({ x, y: 9 });
    }
    for (let x = 16; x <= 25; x++) {
      if (isSafeFromHead(x, 20)) walls.push({ x, y: 20 });
    }
  } else {
    for (let i = 5; i <= 11; i++) {
      if (isSafeFromHead(i, 6)) walls.push({ x: i, y: 6 });
      if (isSafeFromHead(29 - i, 23)) walls.push({ x: 29 - i, y: 23 });
      if (isSafeFromHead(6, i)) walls.push({ x: 6, y: i });
      if (isSafeFromHead(23, 29 - i)) walls.push({ x: 23, y: 29 - i });
    }
  }

  if (currentWorld === 2) {
    for (let i = 13; i <= 16; i++) {
      if (isSafeFromHead(i, 15)) walls.push({ x: i, y: 15 });
      if (isSafeFromHead(15, i)) walls.push({ x: 15, y: i });
    }
  }
}

function setupLevelObjects() {
  generateWallsForLevel(level);

  spikes = [];
  if (level >= 3) {
    const spikeCount = currentWorld === 2 ? 3 : 2;
    for (let i = 0; i < spikeCount; i++) {
      const yPos = 4 + i * 10;
      spikes.push({ x: 4 + i * 5, y: yPos, dir: i % 2 === 0 ? 1 : -1 });
    }
  }

  portals = [];
  if (level >= 4) {
    const p1 = getFreeCell();
    const p2 = getFreeCell();
    portals = [p1, p2];
  }

  if (currentWorld === 1 && score >= 400 && !worldPortal) {
    worldPortal = { x: 14, y: 3 };
    walls = walls.filter(w => !(w.x >= 13 && w.x <= 16 && w.y >= 2 && w.y <= 5));
    addFloatingText(14, 3, "ПОРТАЛ В МИР 2!", "#d946ef");
    playTone(880, "sine", 0.4, 0.25);
  }
}

function enterWorld2() {
  currentWorld = 2;
  worldPortal = null;
  document.body.classList.add("world-2");
  invulnTimer = 25;
  score += 100;
  addFloatingText(snake.x, snake.y, "МИР 2: КИБЕР-ЯДРО! +100", "#ffd700");
  playTone(523.25, "triangle", 0.15, 0.25);
  setTimeout(() => playTone(659.25, "triangle", 0.15, 0.25), 120);
  setTimeout(() => playTone(1046.5, "sine", 0.35, 0.3), 240);
  setupLevelObjects();
  food = getFreeCell();
  spawnBonus();
}

function spawnBonus() {
  const pos = getFreeCell();
  const types = currentWorld === 2
    ? ["coin", "magnet", "energy", "shield", "slow", "bomb"]
    : ["coin", "shield", "slow", "magnet", "bomb"];
  const type = types[Math.floor(Math.random() * types.length)];
  bonus = { ...pos, type, timer: 110 };
}

function updateHUD() {
  hudScore.textContent = score;
  hudLevel.textContent = currentWorld === 2 ? `${level} (М2)` : level;
  hudLives.textContent = "❤️".repeat(Math.max(0, lives));

  if (combo > 1) {
    hudCombo.textContent = "x" + combo;
    hudCombo.classList.remove("hidden");
  } else {
    hudCombo.classList.add("hidden");
  }

  comboBar.style.width = Math.min(100, (comboTimer / 45) * 100) + "%";

  if (magnetTimer > 0) {
    slowIndicator.textContent = "🧲 МАГНИТ АКТИВЕН";
    slowIndicator.classList.remove("hidden");
  } else if (slowTimer > 0) {
    slowIndicator.textContent = "❄️ ЗАМЕДЛЕНИЕ АКТИВНО";
    slowIndicator.classList.remove("hidden");
  } else {
    slowIndicator.classList.add("hidden");
  }
}

function takeDamage(reason) {
  if (invulnTimer > 0) return;
  lives--;
  combo = 1;
  comboTimer = 0;
  invulnTimer = 18;
  playTone(140, "sawtooth", 0.3, 0.25);
  addFloatingText(snake.x, snake.y, reason, "#ff007f");
  updateHUD();
  if (lives <= 0) {
    endGame();
  }
}

function stepGame() {
  if (!gameRunning) return;

  dx = nextDx;
  dy = nextDy;

  let head = { x: snake.x + dx, y: snake.y + dy };
  if (head.x < 0) head.x = tileCount - 1;
  if (head.x >= tileCount) head.x = 0;
  if (head.y < 0) head.y = tileCount - 1;
  if (head.y >= tileCount) head.y = 0;

  if (worldPortal && head.x >= worldPortal.x && head.x <= worldPortal.x + 1 && head.y >= worldPortal.y && head.y <= worldPortal.y + 1) {
    snake.unshift(head);
    enterWorld2();
    draw();
    scheduleNextStep();
    return;
  }

  if (portals.length === 2) {
    if (head.x === portals.x && head.y === portals.y) {
      head = { x: portals.x + dx, y: portals.y + dy };
      playTone(660, "sine", 0.15, 0.2);
    } else if (head.x === portals.x && head.y === portals.y) {
      head = { x: portals.x + dx, y: portals.y + dy };
      playTone(660, "sine", 0.15, 0.2);
    }
    head.x = (head.x + tileCount) % tileCount;
    head.y = (head.y + tileCount) % tileCount;
  }

  spikes.forEach(sp => {
    sp.x += sp.dir;
    if (sp.x <= 1 || sp.x >= tileCount - 2) sp.dir *= -1;
  });

  const hitSelf = snake.some((seg, i) => i > 0 && seg.x === head.x && seg.y === head.y);
  const hitWall = walls.some(w => w.x === head.x && w.y === head.y);
  const hitSpikeHead = spikes.some(sp => sp.x === head.x && sp.y === head.y);

  if (hitSelf || hitWall || hitSpikeHead) {
    takeDamage(hitSpikeHead ? "ШИП!" : "УДАР!");
    if (!gameRunning) return;
  }

  snake.unshift(head);

  if (magnetTimer > 0) {
    if (Math.abs(food.x - head.x) <= 5 && Math.abs(food.y - head.y) <= 5) {
      food.x += Math.sign(head.x - food.x);
      food.y += Math.sign(head.y - food.y);
    }
    if (bonus && bonus.type !== "bomb" && Math.abs(bonus.x - head.x) <= 5 && Math.abs(bonus.y - head.y) <= 5) {
      bonus.x += Math.sign(head.x - bonus.x);
      bonus.y += Math.sign(head.y - bonus.y);
    }
  }

  if (head.x === food.x && head.y === food.y) {
    const pts = 10 * combo;
    score += pts;
    combo = Math.min(5, combo + 1);
    comboTimer = 45;
    playTone(520 + combo * 60, "sine", 0.12, 0.18);
    addFloatingText(head.x, head.y, `+${pts}`, "#39ff14");
    food = getFreeCell();

    const newLevel = Math.floor(score / 100) + 1;
    if (newLevel > level) {
      level = newLevel;
      invulnTimer = 14;
      addFloatingText(head.x, head.y, `УРОВЕНЬ ${level}!`, "#00f3ff");
      playTone(780, "triangle", 0.25, 0.22);
      setupLevelObjects();
    } else if (currentWorld === 1 && score >= 400 && !worldPortal) {
      setupLevelObjects();
    }

    if (!bonus && Math.random() < 0.45) spawnBonus();
  } else {
    snake.pop();
  }

  if (bonus) {
    bonus.timer--;
    if (head.x === bonus.x && head.y === bonus.y) {
      if (bonus.type === "coin") {
        score += 30;
        addFloatingText(head.x, head.y, "+30$", "#ffd700");
        playTone(880, "sine", 0.18, 0.2);
      } else if (bonus.type === "energy") {
        score += 50;
        addFloatingText(head.x, head.y, "+50 ЭНЕРГИЯ!", "#d946ef");
        playTone(980, "sine", 0.22, 0.22);
      } else if (bonus.type === "shield") {
        lives = Math.min(5, lives + 1);
        addFloatingText(head.x, head.y, "+1 ЖИЗНЬ", "#ff007f");
        playTone(660, "triangle", 0.2, 0.2);
      } else if (bonus.type === "slow") {
        slowTimer = 55;
        addFloatingText(head.x, head.y, "ЗАМЕДЛЕНИЕ", "#00f3ff");
        playTone(330, "sine", 0.25, 0.2);
      } else if (bonus.type === "magnet") {
        magnetTimer = 60;
        addFloatingText(head.x, head.y, "МАГНИТ!", "#ffd700");
        playTone(720, "triangle", 0.25, 0.2);
      } else if (bonus.type === "bomb") {
        takeDamage("БОМБА!");
      }
      bonus = null;
    } else if (bonus.timer <= 0) {
      bonus = null;
    }
  }

  if (comboTimer > 0) {
    comboTimer--;
    if (comboTimer === 0) combo = 1;
  }
  if (slowTimer > 0) slowTimer--;
  if (magnetTimer > 0) magnetTimer--;
  if (invulnTimer > 0) invulnTimer--;

  updateHUD();
  draw();
  scheduleNextStep();
}

function scheduleNextStep() {
  if (!gameRunning) return;
  let baseSpeed = Math.max(62, 135 - (level - 1) * 7 - (currentWorld === 2 ? 12 : 0));
  if (slowTimer > 0) baseSpeed += 55;
  if (isBoosting) baseSpeed = Math.max(42, baseSpeed * 0.55);
  gameLoopTimeout = setTimeout(stepGame, baseSpeed);
}
function draw() {
  animFrame++;
  ctx.fillStyle = currentWorld === 2 ? "#0d0618" : "#080b16";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = currentWorld === 2 ? "rgba(217, 70, 239, 0.09)" : "rgba(0, 243, 255, 0.06)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= tileCount; i++) {
    ctx.beginPath();
    ctx.moveTo(i * gridSize, 0);
    ctx.lineTo(i * gridSize, canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * gridSize);
    ctx.lineTo(canvas.width, i * gridSize);
    ctx.stroke();
  }

  portals.forEach((p, idx) => {
    ctx.save();
    ctx.strokeStyle = idx === 0 ? "#00f3ff" : "#ff007f";
    ctx.lineWidth = 3;
    ctx.shadowBlur = 12;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.strokeRect(p.x * gridSize + 2, p.y * gridSize + 2, gridSize - 4, gridSize - 4);
    ctx.restore();
  });

  if (worldPortal) {
    ctx.save();
    const px = worldPortal.x * gridSize;
    const py = worldPortal.y * gridSize;
    const size = gridSize * 2;
    const pulse = Math.sin(animFrame * 0.25) * 4;
    ctx.strokeStyle = "#d946ef";
    ctx.lineWidth = 4;
    ctx.shadowBlur = 20;
    ctx.shadowColor = "#d946ef";
    ctx.strokeRect(px - pulse / 2, py - pulse / 2, size + pulse, size + pulse);
    ctx.fillStyle = "rgba(217, 70, 239, 0.25)";
    ctx.fillRect(px, py, size, size);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("МИР 2", px + size / 2, py + size / 2 + 4);
    ctx.restore();
  }

  walls.forEach(w => {
    ctx.save();
    ctx.fillStyle = currentWorld === 2 ? "#f43f5e" : "#ff1e56";
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#ff1e56";
    ctx.fillRect(w.x * gridSize + 2, w.y * gridSize + 2, gridSize - 4, gridSize - 4);
    ctx.restore();
  });

  spikes.forEach(sp => {
    ctx.save();
    ctx.fillStyle = "#ff9900";
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#ff9900";
    ctx.beginPath();
    ctx.moveTo(sp.x * gridSize + gridSize / 2, sp.y * gridSize + 2);
    ctx.lineTo(sp.x * gridSize + gridSize - 2, sp.y * gridSize + gridSize - 2);
    ctx.lineTo(sp.x * gridSize + 2, sp.y * gridSize + gridSize - 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });

  ctx.save();
  ctx.fillStyle = "#39ff14";
  ctx.shadowBlur = 14;
  ctx.shadowColor = "#39ff14";
  ctx.beginPath();
  ctx.arc(food.x * gridSize + gridSize / 2, food.y * gridSize + gridSize / 2, gridSize / 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (bonus) {
    ctx.save();
    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const icons = { coin: "🪙", shield: "🛡️", slow: "❄️", bomb: "💀", magnet: "🧲", energy: "⚡" };
    ctx.fillText(icons[bonus.type] || "⭐", bonus.x * gridSize + gridSize / 2, bonus.y * gridSize + gridSize / 2 + 1);
    ctx.restore();
  }

  snake.forEach((seg, idx) => {
    ctx.save();
    if (invulnTimer > 0 && animFrame % 2 === 0) ctx.globalAlpha = 0.45;
    ctx.fillStyle = idx === 0 ? "#ffffff" : snakeColor;
    ctx.shadowBlur = idx === 0 ? 16 : 8;
    ctx.shadowColor = snakeColor;
    ctx.beginPath();
    ctx.roundRect(seg.x * gridSize + 1, seg.y * gridSize + 1, gridSize - 2, gridSize - 2, idx === 0 ? 6 : 4);
    ctx.fill();
    ctx.restore();
  });

  floatingTexts.forEach((ft, i) => {
    ctx.save();
    ctx.fillStyle = ft.color;
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(ft.text, ft.x, ft.y);
    ft.y -= 0.8;
    ft.life--;
    ctx.restore();
    if (ft.life <= 0) floatingTexts.splice(i, 1);
  });
}

function setDirection(dir) {
  if (dir === "UP" && dy !== 1) { nextDx = 0; nextDy = -1; }
  if (dir === "DOWN" && dy !== -1) { nextDx = 0; nextDy = 1; }
  if (dir === "LEFT" && dx !== 1) { nextDx = -1; nextDy = 0; }
  if (dir === "RIGHT" && dx !== -1) { nextDx = 1; nextDy = 0; }
}

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") setDirection("UP");
  if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") setDirection("DOWN");
  if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") setDirection("LEFT");
  if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") setDirection("RIGHT");
  if (e.code === "Space") isBoosting = true;
});

document.addEventListener("keyup", (e) => {
  if (e.code === "Space") isBoosting = false;
});

document.querySelectorAll(".dpad-btn").forEach(btn => {
  const handleDir = (e) => {
    e.preventDefault();
    setDirection(btn.dataset.dir);
  };
  btn.addEventListener("touchstart", handleDir, { passive: false });
  btn.addEventListener("mousedown", handleDir);
});

const boostBtn = document.getElementById("btn-boost");
boostBtn.addEventListener("touchstart", (e) => { e.preventDefault(); isBoosting = true; }, { passive: false });
boostBtn.addEventListener("touchend", () => { isBoosting = false; });
boostBtn.addEventListener("mousedown", () => { isBoosting = true; });
boostBtn.addEventListener("mouseup", () => { isBoosting = false; });

function startGame() {
  initAudio();
  const rawName = playerNameInput.value.trim() || "Игрок_" + Math.floor(100 + Math.random() * 899);
  localStorage.setItem("cs_player_name", rawName);
  hudName.textContent = rawName;

  snake = [{ x: 10, y: 15 }, { x: 9, y: 15 }, { x: 8, y: 15 }];
  dx = 1; dy = 0; nextDx = 1; nextDy = 0;
  score = 0;
  level = 1;
  lives = 3;
  combo = 1;
  comboTimer = 0;
  slowTimer = 0;
  magnetTimer = 0;
  invulnTimer = 0;
  currentWorld = 1;
  worldPortal = null;
  bonus = null;
  walls = [];
  spikes = [];
  portals = [];
  floatingTexts = [];
  document.body.classList.remove("world-2");

  food = getFreeCell();
  updateHUD();

  startModal.classList.add("hidden");
  gameoverModal.classList.add("hidden");
  leaderboardModal.classList.add("hidden");

  gameRunning = true;
  startMusic();
  draw();
  scheduleNextStep();
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 3500) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function saveScore(name, finalScore, finalLevel) {
  const statusEl = document.getElementById("save-status");
  statusEl.textContent = "Сохраняем рекорд...";
  statusEl.style.color = "#00f3ff";

  const localTop = JSON.parse(localStorage.getItem("cs_local_scores") || "[]");
  localTop.push({ name, score: finalScore, level: finalLevel });
  localTop.sort((a, b) => b.score - a.score);
  localStorage.setItem("cs_local_scores", JSON.stringify(localTop.slice(0, 10)));

  try {
    const res = await fetchWithTimeout(SUPABASE_URL, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({ name, score: finalScore, level: finalLevel })
    }, 3500);

    if (res.ok) {
      statusEl.textContent = "✅ Рекорд сохранён в облачный Топ-10!";
      statusEl.style.color = "#39ff14";
    } else {
      throw new Error("HTTP " + res.status);
    }
  } catch (err) {
    statusEl.textContent = "📱 Сохранено локально (облако сейчас не ответило)";
    statusEl.style.color = "#ffd700";
  }
}

async function openLeaderboard() {
  leaderboardModal.classList.remove("hidden");
  const listEl = document.getElementById("leaderboard-list");
  listEl.innerHTML = `<p class="loading-text">Загрузка рекордов...</p>`;

  let rows = JSON.parse(localStorage.getItem("cs_local_scores") || "[]");

  try {
    const res = await fetchWithTimeout(`${SUPABASE_URL}?select=name,score,level&order=score.desc&limit=10`, {
      headers: { "apikey": SUPABASE_KEY }
    }, 3500);
    if (res.ok) {
      const cloudRows = await res.json();
      if (Array.isArray(cloudRows) && cloudRows.length > 0) {
        rows = cloudRows;
      }
    }
  } catch (e) {}

  if (!rows.length) {
    listEl.innerHTML = `<p class="loading-text">Пока нет рекордов. Стань первым!</p>`;
    return;
  }

  listEl.innerHTML = rows.slice(0, 10).map((r, idx) => {
    const topClass = idx === 0 ? "top-1" : idx === 1 ? "top-2" : idx === 2 ? "top-3" : "";
    const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`;
    return `
      <div class="leader-row ${topClass}">
        <span><strong>${medal}</strong> ${r.name}</span>
        <span>Ур.${r.level || 1} — <strong class="cyan">${r.score}</strong></span>
      </div>
    `;
  }).join("");
}

function endGame() {
  gameRunning = false;
  clearTimeout(gameLoopTimeout);
  stopMusic();

  const playerName = hudName.textContent;
  document.getElementById("end-name").textContent = playerName;
  document.getElementById("end-score").textContent = score;
  document.getElementById("end-level").textContent = currentWorld === 2 ? `${level} (Мир 2)` : level;
  gameoverModal.classList.remove("hidden");

  saveScore(playerName, score, level);
}

document.getElementById("btn-start").addEventListener("click", startGame);
document.getElementById("btn-restart").addEventListener("click", startGame);
document.getElementById("btn-leaderboard").addEventListener("click", openLeaderboard);
document.getElementById("btn-open-top").addEventListener("click", openLeaderboard);
document.getElementById("btn-end-top").addEventListener("click", openLeaderboard);
document.getElementById("btn-close-top").addEventListener("click", () => leaderboardModal.classList.add("hidden"));
