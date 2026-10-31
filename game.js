const canvas = document.querySelector('#gameCanvas');
const ctx = canvas.getContext('2d');

// Рисуем всю сцену в половинном разрешении: при увеличении получается
// настоящий пиксельный растр, как у спрайтов волнистых попугайчиков.
const RENDER_SCALE = 0.5;
ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
ctx.imageSmoothingEnabled = false;

const W = 1100;
const H = 620;
const TAU = Math.PI * 2;

const ui = {
  score: document.querySelector('#score'),
  best: document.querySelector('#bestScore'),
  lives: document.querySelector('#lives'),
  lifeIcons: [...document.querySelectorAll('.life')],
  startScreen: document.querySelector('#startScreen'),
  pauseScreen: document.querySelector('#pauseScreen'),
  gameOverScreen: document.querySelector('#gameOverScreen'),
  startButton: document.querySelector('#startButton'),
  restartButton: document.querySelector('#restartButton'),
  pauseRestartButton: document.querySelector('#pauseRestartButton'),
  resumeButton: document.querySelector('#resumeButton'),
  homeButton: document.querySelector('#homeButton'),
  pauseButton: document.querySelector('#pauseButton'),
  soundButton: document.querySelector('#soundButton'),
  helpButton: document.querySelector('#helpButton'),
  helpDialog: document.querySelector('#helpDialog'),
  closeHelpButton: document.querySelector('#closeHelpButton'),
  readyButton: document.querySelector('#readyButton'),
  finalScore: document.querySelector('#finalScore'),
  finalWord: document.querySelector('#finalWord'),
  newRecord: document.querySelector('#newRecord'),
  gameOverTitle: document.querySelector('#gameOverTitle'),
  levelText: document.querySelector('#levelText'),
  toast: document.querySelector('#toast'),
};

const LANES = [
  { side: 'left', level: 'top', start: { x: 172, y: 158 }, control: { x: 298, y: 171 }, end: { x: 402, y: 273 }, cage: { x: 42, y: 67, w: 142, h: 153 }, color: '#e95e45' },
  { side: 'right', level: 'top', start: { x: 928, y: 158 }, control: { x: 802, y: 171 }, end: { x: 698, y: 273 }, cage: { x: 916, y: 67, w: 142, h: 153 }, color: '#e95e45' },
  { side: 'left', level: 'bottom', start: { x: 172, y: 327 }, control: { x: 298, y: 349 }, end: { x: 402, y: 416 }, cage: { x: 42, y: 237, w: 142, h: 153 }, color: '#e95e45' },
  { side: 'right', level: 'bottom', start: { x: 928, y: 327 }, control: { x: 802, y: 349 }, end: { x: 698, y: 416 }, cage: { x: 916, y: 237, w: 142, h: 153 }, color: '#e95e45' },
];

const BIRD_COLORS = [
  { sprite: 'yellow', body: '#f4d51c', wing: '#a99220', belly: '#fff083', tail: '#6b6127' },
  { sprite: 'green', body: '#61bd27', wing: '#2c783c', belly: '#e1dc65', tail: '#244c3d' },
  { sprite: 'blue', body: '#1ba9dc', wing: '#16708e', belly: '#f4d64b', tail: '#263f55' },
];

const SPRITE_CELL = { width: 128, height: 143 };
const FLIGHT_FRAMES = [[1, 4], [1, 5], [1, 6], [1, 7]];
const PERCHED_FRAMES = [[0, 4]];
const parrotImages = {};
const playerImage = new Image();
playerImage.src = `${import.meta.env.BASE_URL}assets/player.png?v=4`;

const PLAYER_POSES = {
  neutral: { row: 0, column: 0, anchor: { x: 64, y: 137 }, scale: 2.8, bodyX: 64, facing: 'left' },
  upper: { row: 0, column: 4, anchor: { x: 30, y: 36 }, scale: 2.8, bodyX: 82, facing: 'left' },
  lower: { row: 2, column: 3, anchor: { x: 107, y: 83 }, scale: 2.8, bodyX: 65, facing: 'right' },
};

for (const color of ['yellow', 'green', 'blue']) {
  const image = new Image();
  image.src = `${import.meta.env.BASE_URL}assets/parrots/${color}.png?v=4`;
  parrotImages[color] = image;
}

const LEVELS = [
  { at: 0, name: 'Разминка крыльев' },
  { at: 15, name: 'Лёгкий переполох' },
  { at: 35, name: 'Птичий час пик' },
  { at: 60, name: 'Пернатый ураган' },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const random = (min, max) => min + Math.random() * (max - min);

function roundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function ellipse(x, y, rx, ry, color, rotation = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rotation, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
}

function line(points, color, width, cap = 'round') {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = cap;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function getSavedNumber(key) {
  try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; }
}

function getSavedBoolean(key) {
  try { return localStorage.getItem(key) === 'true'; } catch { return false; }
}

function saveValue(key, value) {
  try { localStorage.setItem(key, String(value)); } catch { /* Приватный режим может запрещать хранилище. */ }
}

class SoundEngine {
  constructor() {
    this.context = null;
    this.muted = getSavedBoolean('napalchik-muted');
  }

  init() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) this.context = new AudioContext();
    }
    if (this.context?.state === 'suspended') this.context.resume();
  }

  tone(frequency, duration, type = 'sine', volume = 0.05, delay = 0, endFrequency = frequency) {
    if (this.muted || !this.context) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  catch() {
    this.tone(620, 0.11, 'sine', 0.055, 0, 850);
    this.tone(930, 0.13, 'triangle', 0.04, 0.075, 1100);
  }

  miss() {
    this.tone(220, 0.25, 'sawtooth', 0.035, 0, 95);
  }

  start() {
    this.tone(390, 0.12, 'triangle', 0.04);
    this.tone(520, 0.12, 'triangle', 0.04, 0.1);
    this.tone(780, 0.18, 'triangle', 0.04, 0.2);
  }

  toggle() {
    this.muted = !this.muted;
    saveValue('napalchik-muted', this.muted);
    if (!this.muted) {
      this.init();
      this.tone(660, 0.1, 'sine', 0.04);
    }
    return this.muted;
  }
}

const sound = new SoundEngine();
let bestScore = getSavedNumber('napalchik-best');
let bestAtStart = bestScore;
let state = 'start';
let score = 0;
let lives = 3;
let pose = 2;
let birds = [];
let particles = [];
let floaters = [];
let caughtBird = null;
let spawnTimer = 0;
let elapsed = 0;
let shake = 0;
let flash = 0;
let toastTimer = 0;
let levelIndex = 0;
let lastTimestamp = performance.now();
let helpPausedGame = false;
let endTimer = null;

const dust = Array.from({ length: 52 }, (_, index) => ({
  x: (index * 193.7) % W,
  y: 30 + ((index * 89.3) % 440),
  r: 0.5 + (index % 3) * 0.35,
  alpha: 0.025 + (index % 4) * 0.012,
}));

function currentLevel() {
  let index = 0;
  for (let i = 0; i < LEVELS.length; i += 1) {
    if (score >= LEVELS[i].at) index = i;
  }
  return index;
}

function updateHud() {
  ui.score.textContent = score;
  ui.best.textContent = Math.max(bestScore, score);
  ui.lifeIcons.forEach((icon, index) => icon.classList.toggle('lost', index >= lives));
  ui.lives.setAttribute('aria-label', `${lives} ${lives === 1 ? 'попытка' : 'попытки'}`);
  const nextLevel = currentLevel();
  if (nextLevel !== levelIndex) {
    levelIndex = nextLevel;
    ui.levelText.textContent = LEVELS[levelIndex].name;
    showToast(LEVELS[levelIndex].name);
  } else {
    ui.levelText.textContent = LEVELS[levelIndex].name;
  }
}

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 1600);
}

function setPose(nextPose, withSound = false) {
  if (state !== 'playing') return;
  pose = nextPose;
  if (withSound) sound.tone(300, 0.035, 'sine', 0.012);
}

function resetWorld() {
  clearTimeout(endTimer);
  score = 0;
  lives = 3;
  pose = 2;
  birds = [];
  particles = [];
  floaters = [];
  caughtBird = null;
  spawnTimer = 0.65;
  elapsed = 0;
  shake = 0;
  flash = 0;
  levelIndex = 0;
  bestAtStart = bestScore;
  updateHud();
}

function startGame() {
  sound.init();
  sound.start();
  resetWorld();
  state = 'playing';
  ui.startScreen.classList.add('hidden');
  ui.pauseScreen.classList.add('hidden');
  ui.gameOverScreen.classList.add('hidden');
  ui.pauseButton.disabled = false;
  ui.pauseButton.classList.remove('is-paused');
  ui.pauseButton.setAttribute('aria-label', 'Пауза');
  lastTimestamp = performance.now();
}

function showHome() {
  clearTimeout(endTimer);
  state = 'start';
  birds = [];
  particles = [];
  floaters = [];
  caughtBird = null;
  score = 0;
  lives = 3;
  levelIndex = 0;
  updateHud();
  ui.startScreen.classList.remove('hidden');
  ui.pauseScreen.classList.add('hidden');
  ui.gameOverScreen.classList.add('hidden');
  ui.pauseButton.disabled = true;
  ui.pauseButton.classList.remove('is-paused');
}

function togglePause(forcePause = false) {
  if (state === 'playing') {
    state = 'paused';
    ui.pauseScreen.classList.remove('hidden');
    ui.pauseButton.classList.add('is-paused');
    ui.pauseButton.setAttribute('aria-label', 'Продолжить');
  } else if (state === 'paused' && !forcePause) {
    state = 'playing';
    ui.pauseScreen.classList.add('hidden');
    ui.pauseButton.classList.remove('is-paused');
    ui.pauseButton.setAttribute('aria-label', 'Пауза');
    lastTimestamp = performance.now();
  }
}

function pluralizeParrots(value) {
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'попугаев';
  if (mod10 === 1) return 'попугай';
  if (mod10 >= 2 && mod10 <= 4) return 'попугая';
  return 'попугаев';
}

function endGame() {
  state = 'gameover';
  const isRecord = score > bestAtStart && score > 0;
  if (score > bestScore) {
    bestScore = score;
    saveValue('napalchik-best', bestScore);
  }
  updateHud();
  ui.finalScore.textContent = score;
  ui.finalWord.textContent = pluralizeParrots(score);
  ui.newRecord.classList.toggle('hidden', !isRecord);
  ui.gameOverTitle.innerHTML = isRecord ? 'Вот это<br />мастерство!' : 'Вот это<br />переполох!';
  ui.gameOverScreen.classList.remove('hidden');
  ui.pauseButton.disabled = true;
  ui.pauseButton.classList.remove('is-paused');
}

function spawnBird() {
  const available = LANES.map((_, index) => index).filter((index) => !birds.some((bird) => bird.lane === index));
  if (!available.length) return;
  const lane = available[Math.floor(Math.random() * available.length)];
  birds.push({
    lane,
    t: 0,
    speed: 0.255 + Math.min(score * 0.0036, 0.22) + random(-0.008, 0.008),
    palette: BIRD_COLORS[Math.floor(Math.random() * BIRD_COLORS.length)],
    phase: random(0, TAU),
    scale: random(0.93, 1.08),
  });
}

function pathPosition(laneIndex, t) {
  const lane = LANES[laneIndex];
  const inv = 1 - t;
  return {
    x: inv * inv * lane.start.x + 2 * inv * t * lane.control.x + t * t * lane.end.x,
    y: inv * inv * lane.start.y + 2 * inv * t * lane.control.y + t * t * lane.end.y,
  };
}

function burst(x, y, palette, count = 8, force = 1) {
  for (let i = 0; i < count; i += 1) {
    particles.push({
      x: x + random(-8, 8),
      y: y + random(-5, 5),
      vx: random(-85, 85) * force,
      vy: random(-135, -35) * force,
      life: random(0.45, 0.85),
      maxLife: 0.85,
      rotation: random(0, TAU),
      spin: random(-8, 8),
      color: [palette.body, palette.wing, palette.belly][i % 3],
      size: random(3, 6),
    });
  }
}

function catchBird(bird) {
  const lane = LANES[bird.lane];
  score += 1;
  caughtBird = { lane: bird.lane, palette: bird.palette, age: 0, phase: bird.phase };
  burst(lane.end.x, lane.end.y, bird.palette, 7, 0.65);
  floaters.push({ x: lane.end.x, y: lane.end.y - 34, age: 0, text: '+1' });
  sound.catch();
  updateHud();
}

function missBird(bird) {
  const lane = LANES[bird.lane];
  lives -= 1;
  shake = 0.42;
  flash = 0.3;
  burst(lane.end.x, lane.end.y + 18, bird.palette, 13, 1.35);
  floaters.push({ x: lane.end.x, y: lane.end.y - 25, age: 0, text: 'упс!', miss: true });
  sound.miss();
  updateHud();
  if (lives <= 0) {
    state = 'ending';
    ui.pauseButton.disabled = true;
    endTimer = setTimeout(endGame, 550);
  }
}

function updateEffects(dt) {
  for (const particle of particles) {
    particle.life -= dt;
    particle.vy += 230 * dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.rotation += particle.spin * dt;
  }
  particles = particles.filter((particle) => particle.life > 0);
  for (const floater of floaters) floater.age += dt;
  floaters = floaters.filter((floater) => floater.age < 0.75);
  if (caughtBird) {
    caughtBird.age += dt;
    if (caughtBird.age > 0.72) caughtBird = null;
  }
}

function update(dt) {
  elapsed += dt;
  shake = Math.max(0, shake - dt);
  flash = Math.max(0, flash - dt);
  updateEffects(dt);

  if (state !== 'playing') return;

  spawnTimer -= dt;
  const maxBirds = Math.min(1 + Math.floor(score / 12), 4);
  if (spawnTimer <= 0 && birds.length < maxBirds) {
    spawnBird();
    const baseInterval = Math.max(0.61, 1.48 - score * 0.016);
    spawnTimer = baseInterval * random(0.82, 1.18);
  }

  for (let i = birds.length - 1; i >= 0; i -= 1) {
    const bird = birds[i];
    bird.t += bird.speed * dt;
    if (bird.t >= 0.91 && bird.t < 1 && pose === bird.lane) {
      catchBird(bird);
      birds.splice(i, 1);
    } else if (bird.t >= 1) {
      missBird(bird);
      birds.splice(i, 1);
      if (state !== 'playing') break;
    }
  }
}

function drawBackground(time) {
  ctx.fillStyle = '#dce2c5';
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(550, 205, 20, 550, 205, 410);
  glow.addColorStop(0, '#f1e8bd');
  glow.addColorStop(1, 'rgba(241,232,189,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(120, 0, 860, 520);

  // Большая арка придаёт сцене глубину и оставляет центр визуально спокойным.
  ctx.beginPath();
  ctx.moveTo(382, 486);
  ctx.lineTo(382, 225);
  ctx.arc(550, 225, 168, Math.PI, 0);
  ctx.lineTo(718, 486);
  ctx.closePath();
  ctx.fillStyle = 'rgba(246,238,199,.48)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(76,102,73,.09)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#b8c7a8';
  ctx.fillRect(0, 482, W, 11);
  ctx.fillStyle = '#d3b987';
  ctx.fillRect(0, 493, W, 127);
  ctx.fillStyle = '#c6a977';
  ctx.fillRect(0, 493, W, 3);
  for (let y = 535; y < H; y += 42) {
    ctx.fillStyle = 'rgba(106,81,48,.09)';
    ctx.fillRect(0, y, W, 1);
  }
  for (let x = 40; x < W; x += 155) {
    line([{ x, y: 494 }, { x: x - 28, y: 620 }], 'rgba(106,81,48,.07)', 1);
  }

  // Навесные светильники.
  for (const x of [283, 817]) {
    line([{ x, y: 0 }, { x, y: 37 }], '#66806a', 2);
    ctx.beginPath();
    ctx.moveTo(x - 21, 54);
    ctx.quadraticCurveTo(x - 17, 32, x, 32);
    ctx.quadraticCurveTo(x + 17, 32, x + 21, 54);
    ctx.closePath();
    ctx.fillStyle = '#507460';
    ctx.fill();
    ellipse(x, 55, 21, 4, '#f2c45b');
    const light = ctx.createRadialGradient(x, 56, 0, x, 56, 74);
    light.addColorStop(0, 'rgba(251,220,127,.13)');
    light.addColorStop(1, 'rgba(251,220,127,0)');
    ctx.fillStyle = light;
    ctx.fillRect(x - 75, 55, 150, 100);
  }

  // Небольшие этикетки над клетками.
  ctx.textAlign = 'center';
  ctx.font = '800 8px Manrope, sans-serif';
  ctx.fillStyle = 'rgba(42,74,58,.46)';
  ctx.fillText('ЛЕВОЕ КРЫЛО', 113, 45);
  ctx.fillText('ПРАВОЕ КРЫЛО', 987, 45);

  for (const speck of dust) {
    ellipse(speck.x, speck.y + Math.sin(time * 0.25 + speck.x) * 2, speck.r, speck.r, `rgba(48,77,53,${speck.alpha})`);
  }
}

function drawCage(lane, laneIndex, time) {
  const { x, y, w, h } = lane.cage;
  const isLeft = lane.side === 'left';
  ctx.save();

  ellipse(x + w / 2, y + h + 10, w * 0.55, 8, 'rgba(54,66,42,.12)');
  roundedRect(ctx, x - 5, y + 7, w + 10, h - 4, 8);
  ctx.fillStyle = '#66806a';
  ctx.fill();
  roundedRect(ctx, x, y + 10, w, h - 14, 5);
  ctx.fillStyle = '#efdbac';
  ctx.fill();

  ctx.save();
  roundedRect(ctx, x + 3, y + 13, w - 6, h - 20, 3);
  ctx.clip();
  ctx.fillStyle = 'rgba(118,102,65,.09)';
  for (let stripe = -h; stripe < w; stripe += 22) {
    ctx.beginPath();
    ctx.moveTo(x + stripe, y + h);
    ctx.lineTo(x + stripe + h, y);
    ctx.lineTo(x + stripe + h + 8, y);
    ctx.lineTo(x + stripe + 8, y + h);
    ctx.fill();
  }
  ctx.restore();

  // Жёрдочка и сидящая птица видны между прутьями.
  line([{ x: x + 15, y: y + 107 }, { x: x + w - 13, y: y + 91 }], '#987746', 5);
  const idleX = isLeft ? x + 54 : x + w - 54;
  drawParrot(idleX, y + 75 + Math.sin(time * 2 + laneIndex) * 1.5, 0.72, isLeft ? 1 : -1, BIRD_COLORS[(laneIndex + 1) % BIRD_COLORS.length], time + laneIndex, false);

  ctx.strokeStyle = '#496551';
  ctx.lineWidth = 3;
  for (let bar = x + 13; bar < x + w; bar += 18) {
    ctx.beginPath();
    ctx.moveTo(bar, y + 13);
    ctx.lineTo(bar, y + h - 6);
    ctx.stroke();
  }
  ctx.fillStyle = '#3e5e4c';
  ctx.fillRect(x - 4, y + 7, w + 8, 9);
  ctx.fillRect(x - 4, y + h - 8, w + 8, 10);
  ctx.fillStyle = '#82917a';
  ctx.fillRect(x, y + 9, w, 2);

  // Дверца, обращённая к центру игрового поля.
  const doorX = isLeft ? x + w - 5 : x - 12;
  roundedRect(ctx, doorX, y + 48, 17, 61, 5);
  ctx.fillStyle = '#f0ddb1';
  ctx.fill();
  ctx.strokeStyle = '#3e5e4c';
  ctx.lineWidth = 3;
  ctx.stroke();
  ellipse(isLeft ? doorX + 4 : doorX + 13, y + 75, 2.5, 2.5, '#e6b34b');

  // Миска и болтающаяся бирка.
  ctx.beginPath();
  ctx.moveTo(x + 17, y + 124);
  ctx.lineTo(x + 48, y + 124);
  ctx.lineTo(x + 43, y + 139);
  ctx.quadraticCurveTo(x + 32, y + 146, x + 22, y + 139);
  ctx.closePath();
  ctx.fillStyle = laneIndex < 2 ? '#dc7653' : '#d7a947';
  ctx.fill();
  ctx.restore();
}

function drawParrot(x, y, scale, direction, palette, time, flying = true) {
  const image = parrotImages[palette.sprite];
  if (!image?.complete || !image.naturalWidth) return;

  const frames = flying ? FLIGHT_FRAMES : PERCHED_FRAMES;
  const frameRate = flying ? 6 : 1.4;
  const [row, column] = frames[Math.floor(time * frameRate) % frames.length];
  const width = 92 * scale;
  const height = width * (SPRITE_CELL.height / SPRITE_CELL.width);
  // Этот кадр имеет широкое пустое поле справа. Ограничиваем область
  // чтения, чтобы старые JPEG-фрагменты у края ячейки не попали в растр.
  const sourceWidth = flying && column === 6 ? 120 : SPRITE_CELL.width;
  const drawWidth = width * (sourceWidth / SPRITE_CELL.width);

  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(direction, 1);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    image,
    column * SPRITE_CELL.width,
    row * SPRITE_CELL.height,
    sourceWidth,
    SPRITE_CELL.height,
    -drawWidth / 2,
    -height / 2,
    drawWidth,
    height,
  );
  ctx.restore();
}

function drawCharacter(time) {
  if (!playerImage.complete || !playerImage.naturalWidth) return;

  const neutral = state === 'start';
  const isLeft = pose === 0 || pose === 2;
  const frame = neutral ? PLAYER_POSES.neutral : PLAYER_POSES[pose < 2 ? 'upper' : 'lower'];
  const direction = neutral ? 1 : (isLeft === (frame.facing === 'left') ? 1 : -1);
  const lane = LANES[pose];
  const target = neutral
    ? { x: 550, y: 575 }
    : { x: lane.end.x, y: lane.end.y + 20 };
  const bob = Math.sin(time * 2.1) * 1.1;
  const width = SPRITE_CELL.width * frame.scale;
  const height = SPRITE_CELL.height * frame.scale;
  const shadowX = neutral ? 550 : target.x - direction * (frame.anchor.x - frame.bodyX) * frame.scale;

  ellipse(shadowX, 577, neutral ? 62 : 70, 11, 'rgba(56,65,40,.18)');
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (direction === 1) {
    ctx.drawImage(
      playerImage,
      frame.column * SPRITE_CELL.width,
      frame.row * SPRITE_CELL.height,
      SPRITE_CELL.width,
      SPRITE_CELL.height,
      Math.round(target.x - frame.anchor.x * frame.scale),
      Math.round(target.y + bob - frame.anchor.y * frame.scale),
      width,
      height,
    );
  } else {
    ctx.translate(Math.round(target.x), Math.round(target.y + bob));
    ctx.scale(-1, 1);
    ctx.drawImage(
      playerImage,
      frame.column * SPRITE_CELL.width,
      frame.row * SPRITE_CELL.height,
      SPRITE_CELL.width,
      SPRITE_CELL.height,
      -frame.anchor.x * frame.scale,
      -frame.anchor.y * frame.scale,
      width,
      height,
    );
  }
  ctx.restore();
}

function drawCaughtBird() {
  if (!caughtBird) return;
  const lane = LANES[caughtBird.lane];
  const lift = caughtBird.age > 0.5 ? (caughtBird.age - 0.5) * 75 : 0;
  const alpha = caughtBird.age > 0.55 ? 1 - (caughtBird.age - 0.55) / 0.17 : 1;
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  drawParrot(lane.end.x, lane.end.y - 12 - lift + Math.sin(caughtBird.age * 13) * 0.7, 0.94, lane.side === 'left' ? 1 : -1, caughtBird.palette, 0, caughtBird.age > 0.5);
  ctx.restore();
}

function drawEffects() {
  for (const particle of particles) {
    ctx.save();
    ctx.translate(particle.x, particle.y);
    ctx.rotate(particle.rotation);
    ctx.globalAlpha = clamp(particle.life / 0.35, 0, 1);
    ctx.beginPath();
    ctx.moveTo(0, -particle.size);
    ctx.quadraticCurveTo(particle.size, 0, 0, particle.size);
    ctx.quadraticCurveTo(-particle.size * 0.4, 0, 0, -particle.size);
    ctx.fillStyle = particle.color;
    ctx.fill();
    ctx.restore();
  }
  for (const floater of floaters) {
    const progress = floater.age / 0.75;
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.textAlign = 'center';
    ctx.font = `700 ${floater.miss ? 20 : 27}px "Pixelify Sans", monospace`;
    ctx.fillStyle = floater.miss ? '#b54536' : '#fff9df';
    ctx.strokeStyle = floater.miss ? '#fff0d5' : '#42634e';
    ctx.lineWidth = 4;
    const y = floater.y - progress * 45;
    ctx.strokeText(floater.text, floater.x, y);
    ctx.fillText(floater.text, floater.x, y);
    ctx.restore();
  }
}

function drawForegroundPlants(time) {
  for (const side of [-1, 1]) {
    const baseX = side === -1 ? 13 : 1087;
    ctx.save();
    ctx.translate(baseX, 609);
    ctx.scale(side, 1);
    for (let i = 0; i < 5; i += 1) {
      const angle = -1.25 + i * 0.22 + Math.sin(time * 0.8 + i) * 0.015;
      const length = 65 + (i % 3) * 18;
      const end = { x: Math.cos(angle) * length, y: Math.sin(angle) * length };
      line([{ x: 0, y: 0 }, end], '#55745a', 3);
      ctx.save();
      ctx.translate(end.x, end.y);
      ctx.rotate(angle + 0.3);
      ellipse(0, 0, 20, 8, i % 2 ? '#6d8a63' : '#496f58');
      ctx.restore();
    }
    ctx.restore();
  }
}

function render(time) {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (shake > 0) ctx.translate(random(-5, 5) * (shake / 0.42), random(-4, 4) * (shake / 0.42));
  drawBackground(time);
  LANES.forEach((lane, index) => drawCage(lane, index, time));
  drawCharacter(time);

  for (const bird of birds) {
    const position = pathPosition(bird.lane, clamp(bird.t, 0, 1));
    const lane = LANES[bird.lane];
    const hop = Math.abs(Math.sin(bird.t * 34 + bird.phase)) * 4;
    drawParrot(position.x, position.y - hop, bird.scale, lane.side === 'left' ? 1 : -1, bird.palette, time * 2 + bird.phase);
  }
  drawCaughtBird();
  drawEffects();
  drawForegroundPlants(time);
  ctx.restore();

  if (flash > 0) {
    ctx.fillStyle = `rgba(211,73,52,${flash * 0.22})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function frame(timestamp) {
  const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.04);
  lastTimestamp = timestamp;
  if (state === 'playing' || state === 'ending') update(dt);
  render(timestamp / 1000);
  requestAnimationFrame(frame);
}

function openHelp() {
  helpPausedGame = state === 'playing';
  if (helpPausedGame) togglePause(true);
  ui.helpDialog.showModal();
}

function closeHelp() {
  ui.helpDialog.close();
}

ui.startButton.addEventListener('click', startGame);
ui.restartButton.addEventListener('click', startGame);
ui.pauseRestartButton.addEventListener('click', startGame);
ui.resumeButton.addEventListener('click', () => togglePause());
ui.homeButton.addEventListener('click', showHome);
ui.pauseButton.addEventListener('click', () => togglePause());
ui.soundButton.addEventListener('click', () => {
  const muted = sound.toggle();
  ui.soundButton.classList.toggle('is-muted', muted);
  ui.soundButton.setAttribute('aria-label', muted ? 'Включить звук' : 'Выключить звук');
});
ui.helpButton.addEventListener('click', openHelp);
ui.closeHelpButton.addEventListener('click', closeHelp);
ui.readyButton.addEventListener('click', closeHelp);
ui.helpDialog.addEventListener('close', () => {
  if (helpPausedGame && state === 'paused') togglePause();
  helpPausedGame = false;
});
ui.helpDialog.addEventListener('click', (event) => {
  if (event.target !== ui.helpDialog) return;
  const rect = ui.helpDialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeHelp();
});

canvas.addEventListener('pointerdown', (event) => {
  if (state !== 'playing') return;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * W;
  const y = ((event.clientY - rect.top) / rect.height) * H;
  const isLeft = x < W / 2;
  const isTop = y < 305;
  setPose(isLeft ? (isTop ? 0 : 2) : (isTop ? 1 : 3), true);
});

window.addEventListener('keydown', (event) => {
  if (ui.helpDialog.open) return;
  const code = event.code;
  const controlled = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyQ', 'KeyE', 'KeyA', 'KeyD', 'KeyP', 'Escape', 'Space', 'Enter'];
  if (controlled.includes(code)) event.preventDefault();

  if (code === 'KeyP' || code === 'Escape') {
    if (state === 'playing' || state === 'paused') togglePause();
    return;
  }
  if ((code === 'Space' || code === 'Enter') && !event.repeat) {
    if (state === 'start' || state === 'gameover') startGame();
    else if (state === 'paused') togglePause();
    return;
  }
  if (state !== 'playing') return;
  if (code === 'KeyQ') setPose(0);
  else if (code === 'KeyE') setPose(1);
  else if (code === 'KeyA') setPose(2);
  else if (code === 'KeyD') setPose(3);
  else if (code === 'ArrowLeft') setPose(pose < 2 ? 0 : 2);
  else if (code === 'ArrowRight') setPose(pose < 2 ? 1 : 3);
  else if (code === 'ArrowUp') setPose(pose === 0 || pose === 2 ? 0 : 1);
  else if (code === 'ArrowDown') setPose(pose === 0 || pose === 2 ? 2 : 3);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') togglePause(true);
});

ui.soundButton.classList.toggle('is-muted', sound.muted);
ui.soundButton.setAttribute('aria-label', sound.muted ? 'Включить звук' : 'Выключить звук');
updateHud();
requestAnimationFrame(frame);
