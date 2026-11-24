const SUPABASE_URL = "https://" + "ngqugdrerexqgzcwhnnm.supabase.co/rest/v1/scores";
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
const mobileControls = document.getElementById("mobile-controls");
const fireBtn = document.getElementById("btn-fire");
const mobileAmmoEl = document.getElementById("mobile-ammo");

const startModal = document.getElementById("start-modal");
const pauseModal = document.getElementById("pause-modal");
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
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  } catch (e) {}
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
    if (!gameRunning || isPaused || !musicEnabled) return;
    playTone(bassNotes[noteIndex % bassNotes.length], "triangle", 0.24, 0.14);
    if (noteIndex % 2 === 0) playTone(leadNotes[noteIndex % leadNotes.length], "sine", 0.18, 0.09);
    noteIndex++;
  }, 250);
}

function stopMusic() {
  if (musicInterval) clearInterval(musicInterval);
}

document.getElementById("btn-music").addEventListener("click", (e) => {
  musicEnabled = !musicEnabled;
  e.target.textContent = musicEnabled ? "🎵" : "🔇";
  if (musicEnabled && gameRunning && !isPaused) startMusic();
  else stopMusic();
});

let snake = [];
let dx = 1, dy = 0;
let inputQueue = [];
let food = { x: 15, y: 15 };
let bonus = null;
let walls = [];
let spikes = [];
let projectiles = [];
let particles = [];
let portals = [];
let worldPortal = null;
let currentWorld = 1;
let worldTransitionFlash = 0;

let score = 0;
let level = 1;
let lives = 3;
let combo = 1;
let laserAmmo = 0;

let comboEndTime = 0;
let slowEndTime = 0;
let magnetEndTime = 0;
let shieldEndTime = 0;
let invulnEndTime = 0;
const COMBO_DURATION = 6500;

let isBoosting = false;
let gameRunning = false;
let isPaused = false;
let pauseStartTime = 0;
let lastFrameTime = 0;
let moveAccumulator = 0;
let animFrame = 0;
let floatingTexts = [];
function addFloatingText(x, y, text, color = "#fff") {
  floatingTexts.push({ x: x * gridSize + 10, y: y * gridSize, text, color, life: 45 });
}

function spawnExplosion(gx, gy, color) {
  const cx = gx * gridSize + gridSize / 2;
  const cy = gy * gridSize + gridSize / 2;
  for (let i = 0; i < 14; i++) {
    const angle = (Math.PI * 2 * i) / 14;
    const speed = 1.5 + Math.random() * 2.5;
    particles.push({ x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, color, life: 24 });
  }
}

function isCellOccupied(x, y, avoidWallsMargin = false) {
  if (snake.some(s => s.x === x && s.y === y)) return true;
  if (walls.some(w => avoidWallsMargin ? (Math.abs(w.x - x) <= 1 && Math.abs(w.y - y) <= 1) : (w.x === x && w.y === y))) return true;
  if (spikes.some(sp => sp.x === x && sp.y === y)) return true;
  if (portals.some(p => Math.abs(p.x - x) <= 2 && Math.abs(p.y - y) <= 2)) return true;
  if (worldPortal && x >= worldPortal.x - 1 && x <= worldPortal.x + 2 && y >= worldPortal.y - 1 && y <= worldPortal.y + 2) return true;
  if (food && food.x === x && food.y === y) return true;
  if (bonus && bonus.x === x && bonus.y === y) return true;
  return false;
}

function getSafeSpawnCell() {
  for (let i = 0; i < 200; i++) {
    const x = 2 + Math.floor(Math.random() * (tileCount - 4));
    const y = 2 + Math.floor(Math.random() * (tileCount - 4));
    if (!isCellOccupied(x, y, true)) return { x, y };
  }
  return { x: 10, y: 10 };
}

function generateWallsForLevel(lvl) {
  walls = [];
  if (lvl < 2) return;
  const head = snake.at(0) || { x: 10, y: 15 };
  const isSafe = (x, y) => Math.abs(x - head.x) > 3 || Math.abs(y - head.y) > 3;
  const layout = currentWorld === 1 ? ((lvl - 2) % 4) : ((lvl + 1) % 4);

  if (layout === 0) {
    for (let x = 7; x <= 22; x++) {
      if (isSafe(x, 7)) walls.push({ x, y: 7 });
      if (isSafe(x, 22)) walls.push({ x, y: 22 });
    }
  } else if (layout === 1) {
    for (let y = 6; y <= 23; y++) {
      if (isSafe(6, y)) walls.push({ x: 6, y });
      if (isSafe(23, y)) walls.push({ x: 23, y });
    }
  } else if (layout === 2) {
    for (let x = 5; x <= 13; x++) if (isSafe(x, 9)) walls.push({ x, y: 9 });
    for (let x = 16; x <= 24; x++) if (isSafe(x, 20)) walls.push({ x, y: 20 });
  } else {
    for (let i = 6; i <= 11; i++) {
      if (isSafe(i, 6)) walls.push({ x: i, y: 6 });
      if (isSafe(29 - i, 23)) walls.push({ x: 29 - i, y: 23 });
      if (isSafe(6, i)) walls.push({ x: 6, y: i });
      if (isSafe(23, 29 - i)) walls.push({ x: 23, y: 29 - i });
    }
  }

  if (currentWorld === 2) {
    for (let i = 12; i <= 17; i++) {
      if (i !== 14 && i !== 15) {
        if (isSafe(i, 15)) walls.push({ x: i, y: 15 });
        if (isSafe(15, i)) walls.push({ x: 15, y: i });
      }
    }
  }
}

function setupLevelObjects() {
  generateWallsForLevel(level);
  spikes = [];
  if (level >= 3) {
    const spikeCount = currentWorld === 2 ? 3 : 2;
    for (let i = 0; i < spikeCount; i++) {
      spikes.push({ x: 5 + i * 5, y: 5 + i * 10, dir: i % 2 === 0 ? 1 : -1 });
    }
  }
  portals = [];
  if (level >= 4) {
    const pTopLeft = { x: 3, y: 3 };
    const pBottomRight = { x: tileCount - 4, y: tileCount - 4 };
    portals = [pTopLeft, pBottomRight];
    walls = walls.filter(w =>
      !(Math.abs(w.x - pTopLeft.x) <= 2 && Math.abs(w.y - pTopLeft.y) <= 2) &&
      !(Math.abs(w.x - pBottomRight.x) <= 2 && Math.abs(w.y - pBottomRight.y) <= 2)
    );
  }
  if (currentWorld === 1 && score >= 400 && !worldPortal) {
    worldPortal = { x: 14, y: 3 };
    walls = walls.filter(w => !(w.x >= 13 && w.x <= 16 && w.y >= 2 && w.y <= 5));
    addFloatingText(14, 3, "ПОРТАЛ В МИР 2!", "#d946ef");
    playTone(880, "sine", 0.4, 0.25);
  }
  if (isCellOccupied(food.x, food.y, true)) food = getSafeSpawnCell();
}

function enterWorld2() {
  currentWorld = 2;
  worldPortal = null;
  worldTransitionFlash = 35;
  document.body.classList.add("world-2");
  invulnEndTime = performance.now() + 2500;
  score += 100;
  const head = snake.at(0);
  addFloatingText(head.x, head.y, "⚡ МИР 2: КИБЕР-ЯДРО! +100 ⚡", "#ffd700");
  playTone(523.25, "triangle", 0.15, 0.25);
  setTimeout(() => playTone(659.25, "triangle", 0.15, 0.25), 120);
  setTimeout(() => playTone(1046.5, "sine", 0.35, 0.3), 240);
  setupLevelObjects();
  food = getSafeSpawnCell();
  spawnBonus();
}

function spawnBonus() {
  const pos = getSafeSpawnCell();
  const types = currentWorld === 2
    ? ["coin", "gun", "shield", "heart", "magnet", "energy", "slow", "bomb"]
    : ["coin", "gun", "shield", "heart", "magnet", "slow", "bomb"];
  bonus = { ...pos, type: types[Math.floor(Math.random() * types.length)], endTime: performance.now() + 14000 };
}

function fireLaser() {
  if (!gameRunning || isPaused || laserAmmo <= 0) return;
  laserAmmo--;
  const head = snake.at(0);
  projectiles.push({ x: head.x + dx * 0.5, y: head.y + dy * 0.5, vx: dx * 0.45, vy: dy * 0.45 });
  playTone(950, "sawtooth", 0.12, 0.22);
  updateHUD();
}
function updateHUD() {
  const now = performance.now();
  hudScore.textContent = score;
  hudLevel.textContent = currentWorld === 2 ? `${level} 🌌 М2` : level;
  hudLives.textContent = "❤️".repeat(Math.max(0, lives));

  if (now > comboEndTime) combo = 1;
  hudCombo.textContent = "x" + combo;
  hudCombo.classList.toggle("hidden", combo <= 1);
  const comboLeft = Math.max(0, comboEndTime - now);
  comboBar.style.width = Math.min(100, (comboLeft / COMBO_DURATION) * 100) + "%";

  if (laserAmmo > 0) {
    fireBtn.classList.remove("hidden");
    mobileAmmoEl.textContent = laserAmmo;
  } else {
    fireBtn.classList.add("hidden");
  }

  const statuses = [];
  if (now < shieldEndTime) statuses.push(`🛡️ ЩИТ ${Math.ceil((shieldEndTime - now) / 1000)}с`);
  if (laserAmmo > 0) statuses.push(`🔫 ЗАРЯДЫ: ${laserAmmo}`);
  if (now < magnetEndTime) statuses.push(`🧲 МАГНИТ ${Math.ceil((magnetEndTime - now) / 1000)}с`);
  if (now < slowEndTime) statuses.push(`❄️ ЗАМЕДЛ. ${Math.ceil((slowEndTime - now) / 1000)}с`);

  if (statuses.length > 0) {
    slowIndicator.textContent = statuses.join("  |  ");
    slowIndicator.classList.remove("hidden");
  } else {
    slowIndicator.classList.add("hidden");
  }
}

function takeDamage(reason) {
  const now = performance.now();
  if (now < invulnEndTime) return;
  const head = snake.at(0);

  if (now < shieldEndTime) {
    shieldEndTime = 0;
    invulnEndTime = now + 1500;
    spawnExplosion(head.x, head.y, "#00f3ff");
    addFloatingText(head.x, head.y, "ЩИТ СПАС!", "#00f3ff");
    playTone(580, "sine", 0.25, 0.25);
    updateHUD();
    return;
  }

  lives--;
  combo = 1;
  comboEndTime = 0;
  invulnEndTime = now + 1800;
  playTone(140, "sawtooth", 0.3, 0.25);
  addFloatingText(head.x, head.y, reason, "#ff007f");
  updateHUD();
  if (lives <= 0) endGame();
}

function updateProjectiles() {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles.at(i);
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < 0 || p.x >= tileCount || p.y < 0 || p.y >= tileCount) {
      projectiles.splice(i, 1);
      continue;
    }
    const hitSpikeIdx = spikes.findIndex(sp => Math.abs(sp.x - p.x) < 0.85 && Math.abs(sp.y - p.y) < 0.85);
    if (hitSpikeIdx !== -1) {
      const deadSpike = spikes.at(hitSpikeIdx);
      spawnExplosion(deadSpike.x, deadSpike.y, "#ff9900");
      addFloatingText(deadSpike.x, deadSpike.y, "ШИП УНИЧТОЖЕН! +25", "#ffd700");
      playTone(220, "sawtooth", 0.25, 0.25);
      score += 25;
      spikes.splice(hitSpikeIdx, 1);
      projectiles.splice(i, 1);
      updateHUD();
      continue;
    }
    if (walls.some(w => Math.abs(w.x - p.x) < 0.65 && Math.abs(w.y - p.y) < 0.65)) {
      spawnExplosion(p.x, p.y, "#ff1e56");
      projectiles.splice(i, 1);
    }
  }
}

function stepSnake() {
  const now = performance.now();
  if (inputQueue.length > 0) {
    const nextDir = inputQueue.shift();
    dx = nextDir.dx;
    dy = nextDir.dy;
  }

  const currentHead = snake.at(0);
  let head = { x: currentHead.x + dx, y: currentHead.y + dy };

  if (head.x < 0 || head.x >= tileCount || head.y < 0 || head.y >= tileCount) {
    takeDamage("СТЕНА!");
    if (!gameRunning) return;
    head = { x: Math.floor(tileCount / 2), y: Math.floor(tileCount / 2) };
    dx = 1; dy = 0; inputQueue = [];
  }

  if (worldPortal && head.x >= worldPortal.x && head.x <= worldPortal.x + 1 && head.y >= worldPortal.y && head.y <= worldPortal.y + 1) {
    snake.unshift(head);
    enterWorld2();
    return;
  }

  if (portals.length === 2) {
    const pTopLeft = portals.at(0);
    const pBottomRight = portals.at(1);
    if (head.x === pTopLeft.x && head.y === pTopLeft.y) {
      dx = -1; dy = 0; inputQueue = [];
      head = { x: pBottomRight.x - 1, y: pBottomRight.y };
      playTone(660, "sine", 0.15, 0.2);
    } else if (head.x === pBottomRight.x && head.y === pBottomRight.y) {
      dx = 1; dy = 0; inputQueue = [];
      head = { x: pTopLeft.x + 1, y: pTopLeft.y };
      playTone(660, "sine", 0.15, 0.2);
    }
  }

  const hitSpikeBefore = spikes.some(sp => sp.x === head.x && sp.y === head.y);
  spikes.forEach(sp => {
    sp.x += sp.dir;
    if (sp.x <= 1 || sp.x >= tileCount - 2) sp.dir *= -1;
  });
  const hitSpikeAfter = spikes.some(sp => sp.x === head.x && sp.y === head.y);

  const hitSelf = snake.some((seg, i) => i > 0 && seg.x === head.x && seg.y === head.y);
  const hitWall = walls.some(w => w.x === head.x && w.y === head.y);

  if (hitSelf || hitWall || hitSpikeBefore || hitSpikeAfter) {
    takeDamage((hitSpikeBefore || hitSpikeAfter) ? "ШИП!" : "УДАР!");
    if (!gameRunning) return;
  }

  snake.unshift(head);

  if (now < magnetEndTime) {
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
    if (now > comboEndTime) combo = 1;
    const pts = 10 * combo;
    score += pts;
    combo = Math.min(5, combo + 1);
    comboEndTime = now + COMBO_DURATION;
    playTone(520 + combo * 60, "sine", 0.12, 0.18);
    addFloatingText(head.x, head.y, `+${pts}`, "#39ff14");
    food = getSafeSpawnCell();

    const newLevel = Math.floor(score / 100) + 1;
    if (newLevel > level) {
      level = newLevel;
      invulnEndTime = now + 1500;
      addFloatingText(head.x, head.y, `УРОВЕНЬ ${level}!`, "#00f3ff");
      playTone(780, "triangle", 0.25, 0.22);
      setupLevelObjects();
    } else if (currentWorld === 1 && score >= 400 && !worldPortal) {
      setupLevelObjects();
    }

    if (!bonus && Math.random() < 0.5) spawnBonus();
  } else {
    snake.pop();
  }

  if (bonus) {
    if (now > bonus.endTime) {
      bonus = null;
    } else if (head.x === bonus.x && head.y === bonus.y) {
      if (bonus.type === "coin") {
        score += 30;
        addFloatingText(head.x, head.y, "+30$", "#ffd700");
        playTone(880, "sine", 0.18, 0.2);
      } else if (bonus.type === "energy") {
        score += 50;
        addFloatingText(head.x, head.y, "+50 ЭНЕРГИЯ!", "#d946ef");
        playTone(980, "sine", 0.22, 0.22);
      } else if (bonus.type === "heart") {
        lives = Math.min(5, lives + 1);
        addFloatingText(head.x, head.y, "+1 ЖИЗНЬ ❤️", "#ff007f");
        playTone(660, "triangle", 0.2, 0.2);
      } else if (bonus.type === "shield") {
        shieldEndTime = now + 8000;
        addFloatingText(head.x, head.y, "ЭНЕРГО-ЩИТ 8с!", "#00f3ff");
        playTone(740, "sine", 0.25, 0.22);
      } else if (bonus.type === "gun") {
        laserAmmo += 5;
        addFloatingText(head.x, head.y, "ПУШКА +5 ЗАРЯДОВ!", "#ffd700");
        playTone(860, "sawtooth", 0.2, 0.2);
      } else if (bonus.type === "slow") {
        slowEndTime = now + 7000;
        addFloatingText(head.x, head.y, "ЗАМЕДЛЕНИЕ 7с", "#00f3ff");
        playTone(330, "sine", 0.25, 0.2);
      } else if (bonus.type === "magnet") {
        magnetEndTime = now + 8000;
        addFloatingText(head.x, head.y, "МАГНИТ 8с!", "#ffd700");
        playTone(720, "triangle", 0.25, 0.2);
      } else if (bonus.type === "bomb") {
        takeDamage("БОМБА!");
      }
      bonus = null;
    }
  }
}
function getCurrentStepInterval() {
  const now = performance.now();
  let interval = Math.max(95, 165 - (level - 1) * 4 - (currentWorld === 2 ? 5 : 0));
  if (now < slowEndTime) interval += 55;
  if (isBoosting) interval = Math.max(60, interval * 0.58);
  return interval;
}

function drawRoundedCell(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function draw() {
  animFrame++;
  const now = performance.now();

  if (currentWorld === 2) {
    const grad = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 30, canvas.width / 2, canvas.height / 2, 360);
    grad.addColorStop(0, "#1f0836");
    grad.addColorStop(1, "#090212");
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = "#080b16";
  }
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = currentWorld === 2 ? "rgba(217, 70, 239, 0.16)" : "rgba(0, 243, 255, 0.06)";
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

  if (currentWorld === 2) {
    ctx.fillStyle = "rgba(255, 215, 0, 0.18)";
    for (let x = 3; x < tileCount; x += 4) {
      for (let y = 3; y < tileCount; y += 4) {
        ctx.fillRect(x * gridSize - 1, y * gridSize - 1, 3, 3);
      }
    }
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(animFrame * 0.015);
    ctx.strokeStyle = "rgba(217, 70, 239, 0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(-14, -14, 28, 28);
    ctx.rotate(Math.PI / 4);
    ctx.strokeStyle = "rgba(255, 215, 0, 0.35)";
    ctx.strokeRect(-14, -14, 28, 28);
    ctx.restore();
  }

  portals.forEach((p, idx) => {
    ctx.save();
    const cx = p.x * gridSize + gridSize / 2;
    const cy = p.y * gridSize + gridSize / 2;
    const color = idx === 0 ? "#00f3ff" : "#ff007f";
    const pulse = Math.sin(animFrame * 0.08) * 3;

    ctx.fillStyle = idx === 0 ? "rgba(0, 243, 255, 0.25)" : "rgba(255, 0, 127, 0.25)";
    ctx.beginPath();
    ctx.arc(cx, cy, gridSize * 0.8 + pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(cx, cy);
    ctx.rotate(animFrame * 0.04 * (idx === 0 ? 1 : -1));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 14;
    ctx.shadowColor = color;
    ctx.strokeRect(-gridSize * 0.55, -gridSize * 0.55, gridSize * 1.1, gridSize * 1.1);
    ctx.rotate(Math.PI / 4);
    ctx.strokeRect(-gridSize * 0.45, -gridSize * 0.45, gridSize * 0.9, gridSize * 0.9);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = color;
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(idx === 0 ? "→" : "←", idx === 0 ? cx + 22 : cx - 22, cy);
    ctx.restore();
  });

  if (worldPortal) {
    ctx.save();
    const px = worldPortal.x * gridSize;
    const py = worldPortal.y * gridSize;
    const size = gridSize * 2;
    const pulse = Math.sin(animFrame * 0.08) * 4;
    ctx.strokeStyle = "#d946ef";
    ctx.lineWidth = 4;
    ctx.shadowBlur = 22;
    ctx.shadowColor = "#d946ef";
    ctx.strokeRect(px - pulse / 2, py - pulse / 2, size + pulse, size + pulse);
    ctx.fillStyle = "rgba(217, 70, 239, 0.28)";
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

  projectiles.forEach(p => {
    ctx.save();
    const px = p.x * gridSize + gridSize / 2;
    const py = p.y * gridSize + gridSize / 2;
    ctx.fillStyle = "#ffd700";
    ctx.shadowBlur = 14;
    ctx.shadowColor = "#ff007f";
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
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
    const bx = bonus.x * gridSize + gridSize / 2;
    const by = bonus.y * gridSize + gridSize / 2;
    if (bonus.type === "coin") {
      const r = gridSize * 0.44 + Math.sin(animFrame * 0.1) * 0.8;
      const grad = ctx.createRadialGradient(bx - 3, by - 3, 1, bx, by, r);
      grad.addColorStop(0, "#fff7b2");
      grad.addColorStop(0.5, "#ffd700");
      grad.addColorStop(1, "#b8860b");
      ctx.fillStyle = grad;
      ctx.shadowBlur = 14;
      ctx.shadowColor = "#ffd700";
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#4a3200";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String.fromCharCode(36), bx, by + 1);
    } else {
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const icons = { heart: "❤️", shield: "🛡️", gun: "🔫", slow: "❄️", bomb: "💀", magnet: "🧲", energy: "⚡" };
      ctx.fillText(icons[bonus.type] || "⭐", bx, by + 1);
    }
    ctx.restore();
  }

  const hasShield = now < shieldEndTime;
  const isInvuln = now < invulnEndTime;
  snake.forEach((seg, idx) => {
    ctx.save();
    if (isInvuln && Math.floor(animFrame / 4) % 2 === 0) ctx.globalAlpha = 0.45;
    if (currentWorld === 2) {
      ctx.fillStyle = idx === 0 ? "#ffd700" : (idx % 2 === 0 ? "#d946ef" : snakeColor);
      ctx.shadowBlur = idx === 0 ? 18 : 10;
      ctx.shadowColor = "#d946ef";
    } else {
      ctx.fillStyle = idx === 0 ? "#ffffff" : snakeColor;
      ctx.shadowBlur = idx === 0 ? 16 : 8;
      ctx.shadowColor = snakeColor;
    }
    drawRoundedCell(seg.x * gridSize + 1, seg.y * gridSize + 1, gridSize - 2, gridSize - 2, idx === 0 ? 6 : 4);

    if (hasShield && idx === 0) {
      ctx.strokeStyle = "#00f3ff";
      ctx.lineWidth = 2.5;
      ctx.shadowBlur = 16;
      ctx.shadowColor = "#00f3ff";
      ctx.beginPath();
      ctx.arc(seg.x * gridSize + gridSize / 2, seg.y * gridSize + gridSize / 2, gridSize * 0.85, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  });

  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles.at(i);
    ctx.save();
    ctx.fillStyle = pt.color;
    ctx.globalAlpha = pt.life / 24;
    ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
    pt.x += pt.vx;
    pt.y += pt.vy;
    pt.life--;
    ctx.restore();
    if (pt.life <= 0) particles.splice(i, 1);
  }

  if (worldTransitionFlash > 0) {
    ctx.save();
    ctx.fillStyle = `rgba(217, 70, 239, ${worldTransitionFlash / 45})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    worldTransitionFlash--;
    ctx.restore();
  }

  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts.at(i);
    ctx.save();
    ctx.fillStyle = ft.color;
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(ft.text, ft.x, ft.y);
    ft.y -= 0.45;
    ft.life--;
    ctx.restore();
    if (ft.life <= 0) floatingTexts.splice(i, 1);
  }
}

function gameLoop(timestamp) {
  if (!gameRunning) return;
  if (!lastFrameTime) lastFrameTime = timestamp;
  const delta = timestamp - lastFrameTime;
  lastFrameTime = timestamp;

  if (!isPaused) {
    moveAccumulator += delta;
    updateProjectiles();
    const stepInterval = getCurrentStepInterval();
    if (moveAccumulator >= stepInterval) {
      moveAccumulator %= stepInterval;
      stepSnake();
    }
    updateHUD();
    draw();
  }
  requestAnimationFrame(gameLoop);
}
function queueDirection(dir) {
  const lastDir = inputQueue.length > 0 ? inputQueue.at(-1) : { dx, dy };
  let ndx = 0, ndy = 0;
  if (dir === "UP") { ndx = 0; ndy = -1; }
  if (dir === "DOWN") { ndx = 0; ndy = 1; }
  if (dir === "LEFT") { ndx = -1; ndy = 0; }
  if (dir === "RIGHT") { ndx = 1; ndy = 0; }

  if (ndx === -lastDir.dx && ndy === -lastDir.dy) return;
  if (ndx === lastDir.dx && ndy === lastDir.dy) return;
  if (inputQueue.length < 2) inputQueue.push({ dx: ndx, dy: ndy });
}

function togglePause() {
  if (!gameRunning) return;
  const now = performance.now();
  if (!isPaused) {
    isPaused = true;
    pauseStartTime = now;
    pauseModal.classList.remove("hidden");
  } else {
    const pausedDuration = now - pauseStartTime;
    if (comboEndTime > 0) comboEndTime += pausedDuration;
    if (slowEndTime > 0) slowEndTime += pausedDuration;
    if (magnetEndTime > 0) magnetEndTime += pausedDuration;
    if (shieldEndTime > 0) shieldEndTime += pausedDuration;
    if (invulnEndTime > 0) invulnEndTime += pausedDuration;
    if (bonus) bonus.endTime += pausedDuration;
    isPaused = false;
    lastFrameTime = now;
    pauseModal.classList.add("hidden");
  }
}

document.addEventListener("keydown", (e) => {
  if (document.activeElement === playerNameInput) return;
  if (e.code === "KeyP" || e.code === "Escape") { e.preventDefault(); togglePause(); return; }
  if (isPaused) return;
  if (e.code === "ArrowUp" || e.code === "KeyW") { e.preventDefault(); queueDirection("UP"); }
  if (e.code === "ArrowDown" || e.code === "KeyS") { e.preventDefault(); queueDirection("DOWN"); }
  if (e.code === "ArrowLeft" || e.code === "KeyA") { e.preventDefault(); queueDirection("LEFT"); }
  if (e.code === "ArrowRight" || e.code === "KeyD") { e.preventDefault(); queueDirection("RIGHT"); }
  if (e.code === "Space") { e.preventDefault(); isBoosting = true; }
  if (e.code === "KeyF" || e.code === "Enter") {
    if (gameRunning) { e.preventDefault(); fireLaser(); }
  }
});

document.addEventListener("keyup", (e) => {
  if (e.code === "Space") isBoosting = false;
});

document.querySelectorAll(".dpad-btn").forEach(btn => {
  const handleDir = (e) => {
    if (e.cancelable) e.preventDefault();
    queueDirection(btn.dataset.dir);
  };
  btn.addEventListener("touchstart", handleDir, { passive: false });
  btn.addEventListener("mousedown", handleDir);
});

let touchStartX = 0, touchStartY = 0;
canvas.addEventListener("touchstart", (e) => {
  const touch = e.touches.item(0);
  if (touch) { touchStartX = touch.clientX; touchStartY = touch.clientY; }
}, { passive: true });

canvas.addEventListener("touchmove", (e) => {
  const touch = e.touches.item(0);
  if (!gameRunning || isPaused || !touch) return;
  const diffX = touch.clientX - touchStartX;
  const diffY = touch.clientY - touchStartY;
  if (Math.abs(diffX) > 22 || Math.abs(diffY) > 22) {
    if (Math.abs(diffX) > Math.abs(diffY)) queueDirection(diffX > 0 ? "RIGHT" : "LEFT");
    else queueDirection(diffY > 0 ? "DOWN" : "UP");
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  }
}, { passive: true });

const boostBtn = document.getElementById("btn-boost");
boostBtn.addEventListener("touchstart", (e) => { if (e.cancelable) e.preventDefault(); isBoosting = true; }, { passive: false });
boostBtn.addEventListener("touchend", () => { isBoosting = false; });
boostBtn.addEventListener("touchcancel", () => { isBoosting = false; });
boostBtn.addEventListener("mousedown", () => { isBoosting = true; });
boostBtn.addEventListener("mouseup", () => { isBoosting = false; });

fireBtn.addEventListener("touchstart", (e) => { if (e.cancelable) e.preventDefault(); fireLaser(); }, { passive: false });
fireBtn.addEventListener("mousedown", (e) => { e.preventDefault(); fireLaser(); });

function startGame() {
  initAudio();
  const rawName = playerNameInput.value.trim() || "Игрок_" + Math.floor(100 + Math.random() * 899);
  localStorage.setItem("cs_player_name", rawName);
  hudName.textContent = rawName;

  snake = [{ x: 10, y: 15 }, { x: 9, y: 15 }, { x: 8, y: 15 }];
  dx = 1; dy = 0; inputQueue = [];
  score = 0;
  level = 1;
  lives = 3;
  combo = 1;
  laserAmmo = 0;
  comboEndTime = 0;
  slowEndTime = 0;
  magnetEndTime = 0;
  shieldEndTime = 0;
  invulnEndTime = 0;
  currentWorld = 1;
  worldPortal = null;
  worldTransitionFlash = 0;
  bonus = null;
  walls = [];
  spikes = [];
  projectiles = [];
  particles = [];
  portals = [];
  floatingTexts = [];
  isPaused = false;
  isBoosting = false;
  moveAccumulator = 0;
  lastFrameTime = 0;
  document.body.classList.remove("world-2");

  food = getSafeSpawnCell();
  updateHUD();

  startModal.classList.add("hidden");
  pauseModal.classList.add("hidden");
  gameoverModal.classList.add("hidden");
  leaderboardModal.classList.add("hidden");
  mobileControls.classList.remove("hidden");

  gameRunning = true;
  startMusic();
  draw();
  requestAnimationFrame(gameLoop);
}
async function fetchWithTimeout(url, options = {}, timeoutMs = 6000) {
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
    }, 6000);

    if (res.ok) {
      statusEl.textContent = "✅ Рекорд сохранён в облачный Топ-10!";
      statusEl.style.color = "#39ff14";
    } else {
      statusEl.textContent = `⚠️ Ошибка базы (${res.status})`;
      statusEl.style.color = "#ff007f";
    }
  } catch (err) {
    statusEl.textContent = "📱 Сохранено локально";
    statusEl.style.color = "#ffd700";
  }
}

async function openLeaderboard() {
  if (gameRunning && !isPaused) togglePause();
  leaderboardModal.classList.remove("hidden");
  const listEl = document.getElementById("leaderboard-list");
  listEl.innerHTML = `<p class="loading-text">Загрузка рекордов...</p>`;

  let rows = JSON.parse(localStorage.getItem("cs_local_scores") || "[]");

  try {
    const res = await fetchWithTimeout(`${SUPABASE_URL}?select=name,score,level&order=score.desc&limit=10`, {
      headers: { "apikey": SUPABASE_KEY }
    }, 6000);
    if (res.ok) {
      const cloudRows = await res.json();
      if (Array.isArray(cloudRows) && cloudRows.length > 0) rows = cloudRows;
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
  stopMusic();
  mobileControls.classList.add("hidden");

  const playerName = hudName.textContent;
  document.getElementById("end-name").textContent = playerName;
  document.getElementById("end-score").textContent = score;
  document.getElementById("end-level").textContent = currentWorld === 2 ? `${level} (Мир 2)` : level;
  gameoverModal.classList.remove("hidden");

  saveScore(playerName, score, level);
}

document.getElementById("btn-start").addEventListener("click", startGame);
document.getElementById("btn-restart").addEventListener("click", startGame);
document.getElementById("btn-pause").addEventListener("click", togglePause);
document.getElementById("btn-resume").addEventListener("click", togglePause);
document.getElementById("btn-leaderboard").addEventListener("click", openLeaderboard);
document.getElementById("btn-open-top").addEventListener("click", openLeaderboard);
document.getElementById("btn-end-top").addEventListener("click", openLeaderboard);
document.getElementById("btn-close-top").addEventListener("click", () => leaderboardModal.classList.add("hidden"));