// --- audio (synthesized arcade-style; no ROM dumps) ---
let audioCtx = null, sirenOsc = null, sirenGain = null, frightTimer = null;
let intermissionAudio = null; // {oscillators:[], gains:[], stopTime}
let audioMuted = localStorage.getItem('mspacman-mute') === 'true';
let audioVolume = parseFloat(localStorage.getItem('mspacman-volume')) || 0.8;
let audioUnlocked = sessionStorage.getItem('audio-unlocked') === 'true';
let lastScoreThreshold = 0;

// --- Audio Context Management ---
async function unlockAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  if (audioCtx.state === 'suspended') { try { await audioCtx.resume(); } catch (_) {} }
  if (!audioUnlocked) {
    audioUnlocked = true;
    sessionStorage.setItem('audio-unlocked', 'true');
    // Confirmation chime: C-E-G, 50ms each
    const notes = [262, 330, 392];
    notes.forEach((f, i) => beep(f, 0.05, 'sine', 0.08, i * 0.05));
  }
  return audioCtx;
}

function setMuted(muted) {
  audioMuted = muted;
  localStorage.setItem('mspacman-mute', muted);
}

function toggleMute() {
  setMuted(!audioMuted);
  return audioMuted;
}

function setVolume(vol) {
  audioVolume = Math.max(0, Math.min(1, vol));
  localStorage.setItem('mspacman-volume', audioVolume);
}

// --- Core Beep Helper ---
function beep(freq, dur, type = 'square', gain = 0.06, when = 0, slideTo = null) {
  if (!audioCtx || audioMuted) return;
  const t0 = audioCtx.currentTime + when;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain * audioVolume, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

// --- Ms. Pac-Man Chomp SFX (Card 2) ---
// Short 80ms burst, ~200Hz square wave with quick pitch dip (200->150Hz)
function playChomp() {
  if (!audioCtx || audioMuted) return;
  const t0 = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(200, t0);
  o.frequency.exponentialRampToValueAtTime(150, t0 + 0.08);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.1 * audioVolume, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(t0); o.stop(t0 + 0.1);
}

// --- Power Pellet SFX (Card 3) ---
// Rising arpeggio: 200->600Hz over 400ms, 4 oscillator steps
function playPowerPellet() {
  if (!audioCtx || audioMuted) return;
  const notes = [200, 350, 500, 600];
  notes.forEach((f, i) => {
    const t0 = audioCtx.currentTime + i * 0.1;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(f, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.08 * audioVolume, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t0); o.stop(t0 + 0.12);
  });
}

// --- Ghost Fright SFX (Card 4) ---
// Descending tone: 800->100Hz over 500ms, sawtooth with slight distortion
function playFright() {
  if (!audioCtx || audioMuted) return;
  const t0 = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(800, t0);
  o.frequency.exponentialRampToValueAtTime(100, t0 + 0.5);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.06 * audioVolume, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(t0); o.stop(t0 + 0.52);
}

// --- Fruit Bonus SFX (Card 5) ---
// 3-note bright chime: 880, 1100, 1320Hz (A5, C#6, E6), 60ms each
function playFruit() {
  if (!audioCtx || audioMuted) return;
  const notes = [880, 1100, 1320];
  notes.forEach((f, i) => {
    const t0 = audioCtx.currentTime + i * 0.06;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.1 * audioVolume, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t0); o.stop(t0 + 0.08);
  });
}

// --- Death SFX (Card 6) ---
// 1-second descending wail: 600->80Hz sawtooth with vibrato
function playDeath() {
  if (!audioCtx || audioMuted) return;
  const t0 = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(600, t0);
  o.frequency.exponentialRampToValueAtTime(80, t0 + 1.0);
  // Vibrato: LFO at 6Hz, +/-20Hz deviation
  const lfo = audioCtx.createOscillator();
  const lfoGain = audioCtx.createGain();
  lfo.frequency.value = 6;
  lfoGain.gain.value = 20;
  lfo.connect(lfoGain);
  lfoGain.connect(o.frequency);
  lfo.start(t0);
  lfo.stop(t0 + 1.05);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.08 * audioVolume, t0 + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.0);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(t0); o.stop(t0 + 1.05);
}

// --- Ghost Eat SFX (Card 7) ---
// Quick ascending blip: 300->900Hz, 150ms
function playGhostEat() {
  if (!audioCtx || audioMuted) return;
  const t0 = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(300, t0);
  o.frequency.exponentialRampToValueAtTime(900, t0 + 0.15);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.1 * audioVolume, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(t0); o.stop(t0 + 0.17);
}

// --- Tunnel SFX (Card 36) ---
// Low whoosh: filtered noise sweep 100->400Hz, 200ms
function playTunnel() {
  if (!audioCtx || audioMuted) return;
  const t0 = audioCtx.currentTime;
  // Create noise buffer
  const bufferSize = audioCtx.sampleRate * 0.2;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 3;
  filter.frequency.setValueAtTime(100, t0);
  filter.frequency.exponentialRampToValueAtTime(400, t0 + 0.2);

  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.05 * audioVolume, t0 + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);

  noise.connect(filter);
  filter.connect(g);
  g.connect(audioCtx.destination);
  noise.start(t0);
  noise.stop(t0 + 0.22);
}

// --- Fruit Spawn SFX (Card 37) ---
// Short pop: 400Hz sine, 50ms
function playFruitSpawn() {
  if (!audioCtx || audioMuted) return;
  const t0 = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(400, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.06 * audioVolume, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(t0); o.stop(t0 + 0.07);
}

// --- Fruit Despawn SFX (Card 38) ---
// Quick descending blip: 300->150Hz, 100ms
function playFruitDespawn() {
  if (!audioCtx || audioMuted) return;
  const t0 = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(300, t0);
  o.frequency.exponentialRampToValueAtTime(150, t0 + 0.1);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.05 * audioVolume, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(t0); o.stop(t0 + 0.12);
}

// --- Ghost Scatter Transition (Card 39) ---
// Brief tone: 400Hz sine, 100ms
function playScatterTransition() {
  if (!audioCtx || audioMuted) return;
  const t0 = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(400, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.03 * audioVolume, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(t0); o.stop(t0 + 0.12);
}

// --- Extra Life Chime (Card 40) ---
// 5-note ascending: C4-D4-E4-G4-C5, 120ms each
function playExtraLife() {
  if (!audioCtx || audioMuted) return;
  const notes = [262, 294, 330, 392, 523];
  notes.forEach((f, i) => {
    const t0 = audioCtx.currentTime + i * 0.12;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.06 * audioVolume, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t0); o.stop(t0 + 0.14);
  });
}

// --- Game Over SFX (Card 41) ---
// Extended death wail: 2 seconds, sawtooth 600->60Hz with reverb tail
function playGameOver() {
  if (!audioCtx || audioMuted) return;
  const t0 = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(600, t0);
  o.frequency.exponentialRampToValueAtTime(60, t0 + 2.0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.08 * audioVolume, t0 + 0.1);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.0);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(t0); o.stop(t0 + 2.1);

  // Reverb tail: delayed copy with feedback
  const delay = audioCtx.createDelay();
  delay.delayTime.value = 0.2;
  const feedback = audioCtx.createGain();
  feedback.gain.value = 0.3;
  const reverbGain = audioCtx.createGain();
  reverbGain.gain.value = 0.4 * audioVolume;
  g.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(reverbGain);
  reverbGain.connect(audioCtx.destination);
}

// --- New High Score Fanfare (Card 42) ---
// 5-note triumphant: C4-E4-G4-C5-E5, quarter notes
function playHighScoreFanfare() {
  if (!audioCtx || audioMuted) return;
  const notes = [262, 330, 392, 523, 659];
  notes.forEach((f, i) => {
    const t0 = audioCtx.currentTime + i * 0.5;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.06 * audioVolume, t0 + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t0); o.stop(t0 + 0.55);
  });
}

// --- Attract Mode Melody (Card 9) ---
// 8-note descending: E-D-C-B-A-G-E-D, quarter notes at 120 BPM
let attractMelodyInterval = null;
function startAttractMelody() {
  stopAttractMelody();
  if (!audioCtx || audioMuted) return;
  const notes = [330, 294, 262, 233, 208, 196, 165, 147]; // E-D-C-B-A-G-E-D
  attractMelodyInterval = setInterval(() => {
    if (gameState !== 'attract') return;
    notes.forEach((f, i) => {
      beep(f, 0.5, 'triangle', 0.03 * audioVolume, i * 0.5);
    });
  }, 4000); // 8 notes * 0.5s = 4s, then 2s silence
}

function stopAttractMelody() {
  if (attractMelodyInterval) {
    clearInterval(attractMelodyInterval);
    attractMelodyInterval = null;
  }
}

// --- Attract Mode Chomp Loop (Card 10) ---
let attractChompInterval = null;
function startAttractChomp() {
  stopAttractChomp();
  if (!audioCtx || audioMuted) return;
  attractChompInterval = setInterval(() => {
    if (gameState !== 'attract') return;
    playChomp();
  }, 1500);
}

function stopAttractChomp() {
  if (attractChompInterval) {
    clearInterval(attractChompInterval);
    attractChompInterval = null;
  }
}

// --- Attract Mode Power Pellet Cycle (Card 11) ---
let attractPowerInterval = null;
function startAttractPowerCycle() {
  stopAttractPowerCycle();
  if (!audioCtx || audioMuted) return;
  attractPowerInterval = setInterval(() => {
    if (gameState !== 'attract') return;
    playPowerPellet();
  }, 6000);
}

function stopAttractPowerCycle() {
  if (attractPowerInterval) {
    clearInterval(attractPowerInterval);
    attractPowerInterval = null;
  }
}

// --- Attract Mode Ghost Moan (Card 12) ---
let ghostMoanOsc = null, ghostMoanGain = null;
function startGhostMoan() {
  stopGhostMoan();
  if (!audioCtx || audioMuted) return;
  const bufferSize = audioCtx.sampleRate * 2;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 80;
  filter.Q.value = 5;

  ghostMoanGain = audioCtx.createGain();
  ghostMoanGain.gain.value = 0.0; // Start silent for fade in

  noise.connect(filter);
  filter.connect(ghostMoanGain);
  ghostMoanGain.connect(audioCtx.destination);
  noise.start();

  // Track the noise source for cleanup
  ghostMoanOsc = noise;

  // Fade in over 500ms
  ghostMoanGain.gain.linearRampToValueAtTime(0.01 * audioVolume, audioCtx.currentTime + 0.5);
}

function stopGhostMoan() {
  if (!ghostMoanGain || !audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    ghostMoanGain.gain.linearRampToValueAtTime(0.0, t + 0.5);
    setTimeout(() => {
      if (ghostMoanOsc) { try { ghostMoanOsc.stop(); } catch (_) {} ghostMoanOsc = null; }
      ghostMoanGain = null;
    }, 600);
  } catch (_) {}
}

// --- Intermission Music Stinger (Card 14) ---
function playIntermissionStinger() {
  if (!audioCtx || audioMuted) return;
  stopAttractMelody();
  stopAttractChomp();
  stopAttractPowerCycle();
  const notes = [262, 330, 392]; // C-E-G
  notes.forEach((f, i) => {
    const t0 = audioCtx.currentTime + i * 1.0;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.06 * audioVolume, t0 + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.0);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t0); o.stop(t0 + 1.05);
  });
}

// --- Level Clear Jingle (Card 15) ---
function playLevelClear() {
  if (!audioCtx || audioMuted) return;
  const notes = [523, 587, 659, 784]; // C5-D5-E5-G5
  notes.forEach((f, i) => {
    const t0 = audioCtx.currentTime + i * 0.08;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(f, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.06 * audioVolume, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t0); o.stop(t0 + 0.1);
  });
}

// --- Stop All Audio (Card 1) ---
function stopAll() {
  stopSiren();
  stopIntermissionAudio();
  stopAttractMelody();
  stopAttractChomp();
  stopAttractPowerCycle();
  stopGhostMoan();
}

// --- SFX Dispatcher ---
function sfx(name) {
  switch(name) {
    case 'waka': playChomp(); break;
    case 'power': playPowerPellet(); break;
    case 'fruit': playFruit(); break;
    case 'extra': playHighScoreFanfare(); break;
    case 'ghost': playGhostEat(); break;
    case 'die': playDeath(); break;
    case 'level': playLevelClear(); break;
    case 'start': playJingle(); break;
  }
}


// --- Original SFX (preserved for backward compatibility) ---
function playJingle() {
  const notes = [392, 494, 587, 784, 659, 784, 988, 1175];
  notes.forEach((f, i) => beep(f, 0.11, 'square', 0.07, i * 0.09));
}

function playIntermissionMusic(act) {
  stopIntermissionAudio();
  if (!audioCtx) return;
  const themes = [
    [523, 587, 659, 698, 784, 698, 659, 587],
    [392, 440, 494, 523, 587, 523, 494, 440],
    [659, 698, 784, 880, 784, 698, 659, 523]
  ];
  const n = themes[(act - 1) % 3];
  const oscs = [], gains = [];
  n.forEach((f, i) => {
    const t0 = audioCtx.currentTime + i * 0.15;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t0);
    g.gain.setValueAtTime(0.07, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t0); o.stop(t0 + 0.16);
    oscs.push(o); gains.push(g);
  });
  intermissionAudio = { oscillators: oscs, gains: gains };
}

function stopIntermissionAudio() {
  if (!intermissionAudio) return;
  try {
    const t = audioCtx.currentTime;
    intermissionAudio.gains.forEach(g => {
      try { g.gain.cancelScheduledValues(t); } catch (_) {}
      try { g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t); } catch (_) {}
      try { g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); } catch (_) {}
    });
    intermissionAudio.oscillators.forEach(o => { try { o.stop(t + 0.07); } catch (_) {} });
  } catch (_) {}
  intermissionAudio = null;
}

function startSiren() {
  stopSiren();
  if (!audioCtx) return;
  try {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'triangle';
    o.frequency.value = 180;
    g.gain.value = 0.0001;
    o.connect(g); g.connect(audioCtx.destination);
    g.gain.exponentialRampToValueAtTime(0.025, audioCtx.currentTime + 0.15);
    o.start();
    sirenOsc = o; sirenGain = g;
  } catch (_) {}
}

function updateSiren(state, powerT, eaten, total) {
  if (!sirenOsc || !audioCtx || state !== 'playing') return;
  const remain = Math.max(1, total - eaten);
  const pct = 1 - remain / Math.max(1, total);
  const base = powerT > 0 ? 90 : 160 + pct * 220;
  const wobble = Math.sin(audioCtx.currentTime * 18.85) * 15;
  try { sirenOsc.frequency.setTargetAtTime(base + wobble, audioCtx.currentTime, 0.08); } catch (_) {}
}

function stopSiren() {
  if (!sirenOsc) return;
  try {
    const t = audioCtx.currentTime;
    sirenGain.gain.cancelScheduledValues(t);
    sirenGain.gain.setValueAtTime(Math.max(0.0001, sirenGain.gain.value), t);
    sirenGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    sirenOsc.stop(t + 0.1);
  } catch (_) {}
  sirenOsc = null; sirenGain = null;
}
