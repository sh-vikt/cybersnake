const SUPABASE_URL = "https://" + "ngqugdrerexqgzcwhnnm" + ".supabase.co/rest/v1/scores";
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
  initAudio();
  musicEnabled = !musicEnabled;
  e.target.textContent = musicEnabled ? "🎵" : "🔇";
  if (musicEnabled && gameRunning) startMusic();
  else stopMusic();
});

function saveLocalBackup(name, score, level) {
  const list = JSON.parse(localStorage.getItem("cs_local_top") || "[]");
  list.push({ name, score, level });
  list.sort((a, b) => b.score - a.score);
  localStorage.setItem("cs_local_top", JSON.stringify(list.slice(0, 10)));
}

async function saveScoreToCloud(name, score, level) {
  const statusEl = document.getElementById("save-status");
  if (score <= 0) {
    statusEl.textContent = "Набери больше 0 очков, чтобы попасть в рейтинг!";
    return;
  }
  saveLocalBackup(name, score, level);
  statusEl.textContent = "Сохраняем рекорд в облако...";
  try {
    const res = await fetch(SUPABASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        name: String(name),
        score: Number(score),
        level: Number(level)
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Код ${res.status}: ${errText}`);
    }
    statusEl.textContent = "✅ Рекорд сохранён в общий Зал славы!";
  } catch (err) {
    console.error("Ошибка Supabase:", err);
    statusEl.textContent = `⚠️ ${err.message}`;
  }
}

async function openLeaderboard() {
  leaderboardModal.classList.remove("hidden");
  const listEl = document.getElementById("leaderboard-list");
  listEl.innerHTML = `<p class="loading-text">Загрузка рекордов...</p>`;
  let records = [];

  try {
    const res = await fetch(`${SUPABASE_URL}?select=name,score,level&order=score.desc&limit=10`, {
      headers: { "apikey": SUPABASE_KEY }
    });
    if (!res.ok) throw new Error("Supabase fetch error");
    records = await res.json();
  } catch (err) {
    records = JSON.parse(localStorage.getItem("cs_local_top") || "[]");
  }

  if (!records || records.length === 0) {
    listEl.innerHTML = `<p class="loading-text">Пока нет рекордов. Будь первым!</p>`;
    return;
  }

  listEl.innerHTML = "";
  records.forEach((item, index) => {
    const rank = index + 1;
    const row = document.createElement("div");
    row.className = `leader-row ${rank <= 3 ? "top-" + rank : ""}`;
    const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;
    row.innerHTML = `
      <span><strong>${medal} ${item.name}</strong> <small style="color:#8a99b5">(Ур. ${item.level || 1})</small></span>
      <span class="cyan"><strong>${item.score}</strong></span>
    `;
    listEl.appendChild(row);
  });
}
let snake = [];
let dx = 1, dy = 0;
let nextDx = 1, nextDy = 0;
let score = 0;
let level = 1;
let lives = 3;
let invulnTimer = 0;
let slowTimer = 0;
let comboCount = 1;
let comboTimer = 0;
let isBoosting = false;
let gameRunning = false;
let lastStepTime = 0;
let animFrame = 0;

let apple = { x: 15, y: 15 };
let bonusItem = null;
let walls = [];
let spikes = [];
let portals = [];
let particles = [];

function spawnParticles(x, y, color, count = 14) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x: x * gridSize + gridSize / 2,
      y: y * gridSize + gridSize / 2,
      vx: (Math.random() - 0.5) * 7,
      vy: (Math.random() - 0.5) * 7,
      life: 1,
      color
    });
  }
}

function isCellOccupied(x, y) {
  if (snake.some(s => s.x === x && s.y === y)) return true;
  if (walls.some(w => w.x === x && w.y === y)) return true;
  if (spikes.some(sp => Math.round(sp.x) === x && Math.round(sp.y) === y)) return true;
  if (portals.some(p => p.x === x && p.y === y)) return true;
  return false;
}

function getFreeCell() {
  let x, y, tries = 0;
  do {
    x = Math.floor(Math.random() * (tileCount - 2)) + 1;
    y = Math.floor(Math.random() * (tileCount - 2)) + 1;
    tries++;
  } while (isCellOccupied(x, y) && tries < 200);
  return { x, y };
}

function setupLevelObjects(lvl) {
  walls = [];
  spikes = [];
  portals = [];

  if (lvl >= 2) {
    for (let i = 9; i <= 20; i++) {
      walls.push({ x: i, y: 7 });
      walls.push({ x: i, y: 22 });
    }
  }
  if (lvl >= 3) {
    spikes.push({ x: 5, y: 12, dirX: 1, min: 3, max: 26, speed: 0.25 });
    spikes.push({ x: 24, y: 17, dirX: -1, min: 3, max: 26, speed: 0.25 });
  }
  if (lvl >= 4) {
    portals = [
      { x: 4, y: 4, color: "#00f3ff" },
      { x: 25, y: 25, color: "#ff007f" }
    ];
  }
}

function spawnBonus() {
  if (bonusItem) return;
  const types = ["coin", "coin", "shield", "slow", "bomb"];
  const type = types[Math.floor(Math.random() * types.length)];
  const pos = getFreeCell();
  bonusItem = { x: pos.x, y: pos.y, type, ttl: 65 };
}

function updateHUD() {
  hudScore.textContent = score;
  hudLevel.textContent = level;
  hudLives.textContent = "❤️".repeat(Math.max(0, lives)) + "🖤".repeat(Math.max(0, 3 - lives));
  if (comboCount > 1) {
    hudCombo.textContent = `x${comboCount}`;
    hudCombo.classList.remove("hidden");
  } else {
    hudCombo.classList.add("hidden");
  }
  comboBar.style.width = `${Math.max(0, (comboTimer / 40) * 100)}%`;
  slowIndicator.classList.toggle("hidden", slowTimer <= 0);
}

function startGame() {
  const rawName = playerNameInput.value.trim() || "Игрок_" + Math.floor(Math.random() * 999);
  localStorage.setItem("cs_player_name", rawName);
  hudName.textContent = rawName;

  initAudio();
  snake = [{ x: 10, y: 15 }, { x: 9, y: 15 }, { x: 8, y: 15 }];
  dx = 1; dy = 0; nextDx = 1; nextDy = 0;
  score = 0;
  level = 1;
  lives = 3;
  invulnTimer = 0;
  slowTimer = 0;
  comboCount = 1;
  comboTimer = 0;
  bonusItem = null;
  particles = [];

  setupLevelObjects(1);
  apple = getFreeCell();
  updateHUD();

  startModal.classList.add("hidden");
  gameoverModal.classList.add("hidden");
  gameRunning = true;
  startMusic();
  requestAnimationFrame(gameLoop);
}

function takeDamage() {
  if (invulnTimer > 0) return;
  lives--;
  playTone(130, "sawtooth", 0.35, 0.22);
  spawnParticles(snake[0].x, snake[0].y, "#ff007f", 24);
  updateHUD();

  if (lives <= 0) {
    gameOver();
  } else {
    invulnTimer = 18;
    const head = snake[0];
    if (head.x <= 0 || head.x >= tileCount - 1 || head.y <= 0 || head.y >= tileCount - 1) {
      snake[0] = { x: 15, y: 15 };
      dx = 1; dy = 0; nextDx = 1; nextDy = 0;
    }
  }
}

function gameOver() {
  gameRunning = false;
  stopMusic();
  const playerName = hudName.textContent;
  document.getElementById("end-name").textContent = playerName;
  document.getElementById("end-score").textContent = score;
  document.getElementById("end-level").textContent = level;
  gameoverModal.classList.remove("hidden");
  saveScoreToCloud(playerName, score, level);
}
function stepGame() {
  dx = nextDx;
  dy = nextDy;

  if (invulnTimer > 0) invulnTimer--;
  if (slowTimer > 0) slowTimer--;
  if (comboTimer > 0) {
    comboTimer--;
    if (comboTimer === 0) comboCount = 1;
  }

  let spikeHitBody = false;
  spikes.forEach(sp => {
    sp.x += sp.dirX * (slowTimer > 0 ? sp.speed * 0.5 : sp.speed);
    if (sp.x >= sp.max || sp.x <= sp.min) sp.dirX *= -1;
    const sx = Math.round(sp.x);
    const sy = Math.round(sp.y);
    if (snake.some(seg => seg.x === sx && seg.y === sy)) {
      spikeHitBody = true;
    }
  });

  if (spikeHitBody) {
    takeDamage();
    return;
  }

  const head = { x: snake[0].x + dx, y: snake[0].y + dy };

  if (portals.length === 2) {
    if (head.x === portals[0].x && head.y === portals[0].y) { head.x = portals[1].x + dx; head.y = portals[1].y + dy; playTone(620, "sine", 0.18, 0.16); spawnParticles(portals[1].x, portals[1].y, portals[1].color, 15); } else if (head.x === portals[1].x && head.y === portals[1].y) { head.x = portals[0].x + dx; head.y = portals[0].y + dy; playTone(620, "sine", 0.18, 0.16); spawnParticles(portals[0].x, portals[0].y, portals[0].color, 15); }
  }

  const hitBorder = head.x < 0 || head.x >= tileCount || head.y < 0 || head.y >= tileCount;
  const hitWall = walls.some(w => w.x === head.x && w.y === head.y);
  const hitSpike = spikes.some(sp => Math.round(sp.x) === head.x && Math.round(sp.y) === head.y);
  const hitSelf = snake.some(s => s.x === head.x && s.y === head.y);

  if (hitBorder || hitWall || hitSpike || hitSelf) {
    takeDamage();
    return;
  }

  snake.unshift(head);

  if (head.x === apple.x && head.y === apple.y) {
    score += 10 * comboCount;
    comboCount = Math.min(5, comboCount + 1);
    comboTimer = 40;
    playTone(520 + comboCount * 60, "sine", 0.14, 0.16);
    spawnParticles(apple.x, apple.y, "#00f3ff", 16);
    apple = getFreeCell();

    const newLevel = Math.floor(score / 100) + 1;
    if (newLevel > level) {
      level = newLevel;
      setupLevelObjects(level);
      playTone(880, "triangle", 0.3, 0.18);
    }

    if (Math.random() < 0.55) spawnBonus();
  } else {
    snake.pop();
  }

  if (bonusItem) {
    bonusItem.ttl--;
    if (head.x === bonusItem.x && head.y === bonusItem.y) {
      if (bonusItem.type === "coin") {
        score += 30 * comboCount;
        playTone(980, "sine", 0.2, 0.18);
        spawnParticles(bonusItem.x, bonusItem.y, "#ffd700", 18);
      } else if (bonusItem.type === "shield") {
        lives = Math.min(3, lives + 1);
        playTone(700, "triangle", 0.22, 0.18);
        spawnParticles(bonusItem.x, bonusItem.y, "#39ff14", 18);
      } else if (bonusItem.type === "slow") {
        slowTimer = 35;
        playTone(400, "sine", 0.25, 0.18);
        spawnParticles(bonusItem.x, bonusItem.y, "#00f3ff", 18);
      } else if (bonusItem.type === "bomb") {
        if (snake.length > 3) snake.pop();
        takeDamage();
      }
      bonusItem = null;
    } else if (bonusItem && bonusItem.ttl <= 0) {
      bonusItem = null;
    }
  }

  updateHUD();
}

function drawGame() {
  animFrame++;
  ctx.fillStyle = "#080b16";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(0, 243, 255, 0.05)";
  for (let i = 0; i < tileCount; i++) {
    ctx.beginPath(); ctx.moveTo(i * gridSize, 0); ctx.lineTo(i * gridSize, canvas.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * gridSize); ctx.lineTo(canvas.width, i * gridSize); ctx.stroke();
  }

  portals.forEach(p => {
    const px = p.x * gridSize;
    const py = p.y * gridSize;
    const pulse = Math.sin(animFrame * 0.12) * 2.5;
    ctx.save();
    ctx.shadowBlur = 18;
    ctx.shadowColor = p.color;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(px - 2 - pulse / 2, py - 2 - pulse / 2, gridSize + 4 + pulse, gridSize + 4 + pulse);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(px + 3, py + 3, gridSize - 6, gridSize - 6);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(px + 8, py + 8, 4, 4);
    ctx.restore();
  });

  ctx.fillStyle = "#ff0055";
  ctx.shadowBlur = 10; ctx.shadowColor = "#ff0055";
  walls.forEach(w => ctx.fillRect(w.x * gridSize + 2, w.y * gridSize + 2, gridSize - 4, gridSize - 4));

  ctx.fillStyle = "#ffae00";
  ctx.shadowBlur = 12; ctx.shadowColor = "#ffae00";
  spikes.forEach(sp => {
    const px = sp.x * gridSize;
    const py = sp.y * gridSize;
    ctx.beginPath();
    ctx.moveTo(px + 10, py + 2);
    ctx.lineTo(px + 18, py + 18);
    ctx.lineTo(px + 2, py + 18);
    ctx.closePath();
    ctx.fill();
  });

  ctx.fillStyle = "#ff2a6d";
  ctx.shadowBlur = 14; ctx.shadowColor = "#ff2a6d";
  ctx.beginPath();
  ctx.arc(apple.x * gridSize + 10, apple.y * gridSize + 10, 7, 0, Math.PI * 2);
  ctx.fill();

  if (bonusItem) {
    const bx = bonusItem.x * gridSize + 10;
    const by = bonusItem.y * gridSize + 10;

    if (bonusItem.type === "coin") {
      ctx.save();
      ctx.shadowBlur = 14;
      ctx.shadowColor = "#ffd700";
      ctx.fillStyle = "#ffd700";
      ctx.beginPath();
      ctx.arc(bx, by, 8.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#b8860b";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#080b16";
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("$", bx, by + 0.5);
      ctx.restore();
    } else {
      ctx.shadowBlur = 0;
      ctx.font = "16px Segoe UI Emoji, Apple Color Emoji, Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const icons = { shield: "🛡️", slow: "❄️", bomb: "💀" };
      ctx.fillText(icons[bonusItem.type], bx, by + 1);
    }
  }

  if (invulnTimer === 0 || invulnTimer % 2 === 0) {
    snake.forEach((seg, idx) => {
      ctx.fillStyle = idx === 0 ? "#ffffff" : snakeColor;
      ctx.shadowBlur = idx === 0 ? 16 : 8;
      ctx.shadowColor = snakeColor;
      ctx.fillRect(seg.x * gridSize + 1, seg.y * gridSize + 1, gridSize - 2, gridSize - 2);
    });
  }

  ctx.shadowBlur = 0;
  particles.forEach((p, idx) => {
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.04;
    if (p.life <= 0) {
      particles.splice(idx, 1);
      return;
    }
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 4, 4);
  });
  ctx.globalAlpha = 1;
}

function gameLoop(timestamp) {
  if (!gameRunning) return;
  let speed = Math.max(85, 155 - (level - 1) * 12);
  if (slowTimer > 0) speed *= 1.5;
  if (isBoosting) speed *= 0.55;

  if (timestamp - lastStepTime > speed) {
    stepGame();
    lastStepTime = timestamp;
  }
  drawGame();
  requestAnimationFrame(gameLoop);
}

function setDirection(dir) {
  if (dir === "UP" && dy === 0) { nextDx = 0; nextDy = -1; }
  if (dir === "DOWN" && dy === 0) { nextDx = 0; nextDy = 1; }
  if (dir === "LEFT" && dx === 0) { nextDx = -1; nextDy = 0; }
  if (dir === "RIGHT" && dx === 0) { nextDx = 1; nextDy = 0; }
}

window.addEventListener("keydown", (e) => {
  if (["ArrowUp", "w", "W", "ц", "Ц"].includes(e.key)) setDirection("UP");
  if (["ArrowDown", "s", "S", "ы", "Ы"].includes(e.key)) setDirection("DOWN");
  if (["ArrowLeft", "a", "A", "ф", "Ф"].includes(e.key)) setDirection("LEFT");
  if (["ArrowRight", "d", "D", "в", "В"].includes(e.key)) setDirection("RIGHT");
  if (e.code === "Space") isBoosting = true;
});

window.addEventListener("keyup", (e) => {
  if (e.code === "Space") isBoosting = false;
});

document.querySelectorAll(".dpad-btn").forEach(btn => {
  btn.addEventListener("touchstart", (e) => { e.preventDefault(); setDirection(btn.dataset.dir); });
  btn.addEventListener("mousedown", () => setDirection(btn.dataset.dir));
});

const boostBtn = document.getElementById("btn-boost");
boostBtn.addEventListener("touchstart", (e) => { e.preventDefault(); isBoosting = true; });
boostBtn.addEventListener("touchend", () => { isBoosting = false; });
boostBtn.addEventListener("mousedown", () => { isBoosting = true; });
boostBtn.addEventListener("mouseup", () => { isBoosting = false; });

document.getElementById("btn-start").addEventListener("click", startGame);
document.getElementById("btn-restart").addEventListener("click", startGame);
document.getElementById("btn-leaderboard").addEventListener("click", openLeaderboard);
document.getElementById("btn-open-top").addEventListener("click", openLeaderboard);
document.getElementById("btn-end-top").addEventListener("click", openLeaderboard);
document.getElementById("btn-close-top").addEventListener("click", () => leaderboardModal.classList.add("hidden"));
