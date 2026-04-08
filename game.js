'use strict';

/* ─── Constants ──────────────────────────────────────────────── */

const AVATARS = [
  '🧑‍🌾', '👩‍🍳', '🧙', '🧛', '🤠', '🥷',
  '🧜', '🧚', '👾', '🤖', '🎅', '🦸',
];

const COLORS = [
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71',
  '#1abc9c', '#3498db', '#9b59b6', '#e91e63',
  '#ff5722', '#00bcd4', '#8bc34a', '#ff9800',
];

/* ─── State ──────────────────────────────────────────────────── */

/** @type {Array<Contestant>} */
let contestants = [];

/** @type {'setup'|'countdown'|'racing'|'finished'} */
let gameState = 'setup';

let animationId = null;
let lastTimestamp = 0;

/** @type {Contestant|null} */
let winner = null;

/**
 * @typedef {Object} Contestant
 * @property {number}  id
 * @property {string}  name
 * @property {string}  avatar
 * @property {string}  color
 * @property {number}  position        – 0–100 (%)
 * @property {number}  speed           – % per second
 * @property {number}  speedTimer      – ms since last speed change
 * @property {number}  nextSpeedChange – ms until next speed change
 * @property {boolean} finished
 * @property {HTMLElement|null} el         – .racer element
 * @property {HTMLElement|null} trackEl    – .lane-track element
 */

/* ─── DOM refs ───────────────────────────────────────────────── */

const setupScreen   = document.getElementById('setup-screen');
const raceScreen    = document.getElementById('race-screen');
const resultsScreen = document.getElementById('results-screen');

const nameInput  = document.getElementById('name-input');
const addBtn     = document.getElementById('add-btn');
const startBtn   = document.getElementById('start-btn');
const errorMsg   = document.getElementById('add-error');
const listEl     = document.getElementById('contestant-list');
const lanesEl    = document.getElementById('lanes-container');

const countdownOverlay = document.getElementById('countdown-overlay');
const countdownNum     = document.getElementById('countdown-num');

const winnerPotatoEl = document.getElementById('winner-potato');
const winnerNameEl   = document.getElementById('winner-name');
const resetBtn       = document.getElementById('reset-btn');
const confettiEl     = document.getElementById('confetti-container');

/* ─── Screen switching ───────────────────────────────────────── */

function showScreen(id) {
  [setupScreen, raceScreen, resultsScreen].forEach(s => s.classList.remove('active'));
  document.getElementById(`${id}-screen`).classList.add('active');
}

/* ─── Setup helpers ──────────────────────────────────────────── */

function setError(msg) {
  errorMsg.textContent = msg || '\u00a0';
}

function addContestant() {
  const name = nameInput.value.trim();

  if (!name) {
    nameInput.focus();
    return;
  }

  if (contestants.length >= 12) {
    setError('Maximum 12 contestants reached.');
    return;
  }

  if (contestants.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    setError('That name is already taken — try another!');
    nameInput.classList.add('shake');
    nameInput.addEventListener('animationend', () => nameInput.classList.remove('shake'), { once: true });
    return;
  }

  setError('');

  const idx = contestants.length;
  contestants.push({
    id: idx,
    name,
    avatar: AVATARS[idx % AVATARS.length],
    color:  COLORS[idx % COLORS.length],
    position: 0,
    speed: 0,
    speedTimer: 0,
    nextSpeedChange: 0,
    finished: false,
    el: null,
    trackEl: null,
  });

  nameInput.value = '';
  nameInput.focus();
  renderList();
  startBtn.disabled = contestants.length < 2;

  if (contestants.length >= 12) {
    addBtn.disabled    = true;
    nameInput.disabled = true;
    nameInput.placeholder = 'Max 12 contestants reached';
  }
}

function removeContestant(idx) {
  contestants.splice(idx, 1);

  // Re-index colours/avatars so they stay consistent
  contestants.forEach((c, i) => {
    c.id     = i;
    c.color  = COLORS[i % COLORS.length];
    c.avatar = AVATARS[i % AVATARS.length];
  });

  addBtn.disabled    = false;
  nameInput.disabled = false;
  nameInput.placeholder = 'Enter contestant name…';
  setError('');
  renderList();
  startBtn.disabled = contestants.length < 2;
}

function renderList() {
  listEl.innerHTML = '';
  contestants.forEach((c, i) => {
    const div = document.createElement('div');
    div.className = 'contestant-entry';
    div.style.setProperty('--c-color', c.color);

    div.innerHTML = `
      <div class="entry-potato">
        <span class="entry-avatar">${c.avatar}</span>
        <div class="entry-potato-body"></div>
      </div>
      <span class="entry-name">${escHtml(c.name)}</span>
      <button class="entry-remove" aria-label="Remove ${escHtml(c.name)}">✕</button>
    `;

    div.querySelector('.entry-remove').addEventListener('click', () => removeContestant(i));
    listEl.appendChild(div);
  });
}

/* ─── Race setup ─────────────────────────────────────────────── */

function startRace() {
  winner    = null;
  gameState = 'countdown';
  showScreen('race');
  buildTrack();
  runCountdown();
}

function buildTrack() {
  lanesEl.innerHTML = '';

  contestants.forEach((c, i) => {
    c.position        = 0;
    c.speed           = randomBetween(8, 14);
    c.speedTimer      = 0;
    c.nextSpeedChange = randomBetween(400, 1100);
    c.finished        = false;

    const lane = document.createElement('div');
    lane.className = 'lane';

    const label = document.createElement('div');
    label.className  = 'lane-label';
    label.style.color = c.color;
    label.textContent = c.name;

    const track = document.createElement('div');
    track.className = 'lane-track';

    const racer = document.createElement('div');
    racer.className = 'racer';
    racer.id        = `racer-${i}`;
    racer.innerHTML = `
      <span class="racer-avatar">${c.avatar}</span>
      <div class="racer-potato" style="background:${c.color}"></div>
    `;

    track.appendChild(racer);
    lane.appendChild(label);
    lane.appendChild(track);
    lanesEl.appendChild(lane);

    c.el      = racer;
    c.trackEl = track;
  });
}

/* ─── Countdown ──────────────────────────────────────────────── */

function runCountdown() {
  countdownOverlay.classList.remove('hidden');
  let count = 3;

  function tick() {
    if (count > 0) {
      countdownNum.textContent = count;
      reflow(countdownNum);
      countdownNum.className = 'pop';
      count--;
      setTimeout(tick, 1000);
    } else {
      countdownNum.textContent = 'GO! 🚀';
      reflow(countdownNum);
      countdownNum.className = 'go';
      setTimeout(() => {
        countdownOverlay.classList.add('hidden');
        countdownNum.className = '';
        beginRacing();
      }, 900);
    }
  }

  tick();
}

/** Force a style recalculation to restart CSS animations */
function reflow(el) {
  // eslint-disable-next-line no-unused-expressions
  el.offsetWidth;
}

/* ─── Race loop ──────────────────────────────────────────────── */

function beginRacing() {
  gameState     = 'racing';
  lastTimestamp = 0;
  animationId   = requestAnimationFrame(raceLoop);
}

function raceLoop(timestamp) {
  if (gameState !== 'racing') return;

  if (!lastTimestamp) lastTimestamp = timestamp;

  // Cap delta to 50 ms so a hidden/paused tab doesn't cause huge jumps
  const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.05);
  lastTimestamp = timestamp;

  let newWinner = null;

  contestants.forEach(c => {
    if (c.finished) return;

    // Periodically pick a new random speed
    c.speedTimer += dt * 1000;
    if (c.speedTimer >= c.nextSpeedChange) {
      c.speedTimer      = 0;
      c.nextSpeedChange = randomBetween(200, 900);
      applyNewSpeed(c, timestamp);
    }

    c.position += c.speed * dt;

    if (c.position >= 100) {
      c.position = 100;
      c.finished = true;
      if (!newWinner && !winner) newWinner = c;
    }

    positionRacer(c, timestamp);
  });

  if (newWinner) {
    winner    = newWinner;
    gameState = 'finished';
    if (animationId) cancelAnimationFrame(animationId);
    winner.el.classList.add('finished');
    setTimeout(showResults, 1000);
    return;
  }

  animationId = requestAnimationFrame(raceLoop);
}

/**
 * Choose a new speed for a contestant.
 * Bursts happen ~20 % of the time, stumbles ~15 % of the time.
 */
function applyNewSpeed(c, timestamp) {
  const r = Math.random();
  let burst    = false;
  let stumble  = false;

  if (r < 0.20) {
    c.speed = randomBetween(28, 45); // burst
    burst   = true;
  } else if (r < 0.35) {
    c.speed  = randomBetween(1, 4);  // stumble
    stumble  = true;
  } else {
    c.speed = randomBetween(8, 18);  // normal
  }

  if (c.el) {
    c.el.classList.toggle('burst',   burst);
    c.el.classList.toggle('stumble', stumble);
  }
}

/** Move the racer element to its current position with a subtle bounce. */
function positionRacer(c, timestamp) {
  if (!c.el || !c.trackEl) return;

  const trackW  = c.trackEl.clientWidth;
  const racerW  = 50; // px, matches CSS
  const maxPx   = Math.max(0, trackW - racerW - 6);
  const offsetX = (c.position / 100) * maxPx;

  // Different phase per contestant so they don't all bounce together
  const bounce = Math.sin(timestamp / 110 + c.id * 0.9) * 3;

  c.el.style.transform = `translateX(${offsetX}px) translateY(${bounce}px)`;
}

/* ─── Results ────────────────────────────────────────────────── */

function showResults() {
  showScreen('results');

  winnerNameEl.textContent  = winner.name;
  winnerNameEl.style.color  = winner.color;

  winnerPotatoEl.innerHTML = `
    <span class="result-avatar">${winner.avatar}</span>
    <div class="result-potato-body" style="background:${winner.color}"></div>
  `;

  spawnConfetti();
}

function spawnConfetti() {
  confettiEl.innerHTML = '';
  const count = 90;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';

    const size  = 7 + Math.random() * 9;
    const drift = (Math.random() - 0.5) * 220;
    const isCircle = Math.random() > 0.5;

    Object.assign(piece.style, {
      left:            `${Math.random() * 100}%`,
      width:           `${size}px`,
      height:          `${size}px`,
      background:      COLORS[Math.floor(Math.random() * COLORS.length)],
      borderRadius:    isCircle ? '50%' : '2px',
      '--dur':         `${2 + Math.random() * 2}s`,
      '--delay':       `${Math.random() * 2.2}s`,
      '--drift':       `${drift}px`,
    });

    confettiEl.appendChild(piece);
  }
}

/* ─── Reset ──────────────────────────────────────────────────── */

function resetGame() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  contestants        = [];
  winner             = null;
  gameState          = 'setup';
  listEl.innerHTML   = '';
  nameInput.value    = '';
  nameInput.disabled = false;
  nameInput.placeholder = 'Enter contestant name…';
  addBtn.disabled    = false;
  startBtn.disabled  = true;
  setError('');

  showScreen('setup');
  nameInput.focus();
}

/* ─── Utilities ──────────────────────────────────────────────── */

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

/** Minimal HTML-entity escaping to avoid XSS in innerHTML. */
function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ─── Event listeners ────────────────────────────────────────── */

addBtn.addEventListener('click', addContestant);
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') addContestant(); });
startBtn.addEventListener('click', startRace);
resetBtn.addEventListener('click', resetGame);
