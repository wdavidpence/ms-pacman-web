// --- audio (synthesized arcade-style; no ROM dumps) ---
let audioCtx = null, sirenOsc = null, sirenGain = null, frightTimer = null;
let intermissionAudio = null; // {oscillators:[], gains:[], stopTime}
let audioMuted = localStorage.getItem('mspacman-mute') === 'true';
let audioVolume = parseFloat(localStorage.getItem('mspacman-volume')) || 0.8;
let audioUnlocked = sessionStorage.getItem('audio-unlocked') === 'true';
let lastScoreThreshold = 0;

// Cabinet speaker filter (simulates arcade speaker response)
let speakerFilter = null, masterGain = null;

// Ambient hum for cabinet atmosphere
let ambientHumOsc = null, ambientHumGain = null;

// --- Audio Context Management ---
async function unlockAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  if (audioCtx.state === 'suspended') { try { await audioCtx.resume(); } catch (_) {} }
  // Set up cabinet speaker filter (lowpass to simulate arcade speaker response)
  if (!speakerFilter && audioCtx) {
    // Master gain for all audio
    masterGain = audioCtx.createGain();
    masterGain.gain.value = audioVolume;

    // Cabinet speaker simulation: lowpass filter (arcade speakers roll off high end)
    speakerFilter = audioCtx.createBiquadFilter();
    speakerFilter.type = 'lowpass';
    speakerFilter.frequency.value = 6000; // Roll off above 6kHz for authentic cabinet sound
    speakerFilter.Q.value = 0.7;

    // Sub-bass boost for that arcade thump
    const bassBoost = audioCtx.createBiquadFilter();
    bassBoost.type = 'lowshelf';
    bassBoost.frequency.value = 200;
    bassBoost.gain.value = 3; // +3dB sub-bass

    // Routing: masterGain -> bassBoost -> speakerFilter -> destination
    masterGain.connect(bassBoost);
    bassBoost.connect(speakerFilter);
    speakerFilter.connect(audioCtx.destination);

    // Start ambient hum (arcade cabinet low-frequency rumble)
    startAmbientHum();
  }
  if (!audioUnlocked) {
    audioUnlocked = true;
    sessionStorage.setItem('audio-unlocked', 'true');
    // Confirmation chime: C-E-G, 50ms each (through cabinet filter)
    const notes = [262, 330, 392];
    notes.forEach((f, i) => beep(f, 0.05, 'sine', 0.08, i * 0.05));
  }
  return audioCtx;
}
// --- Ambient Hum (single oscillator to prevent leak) ---
function startAmbientHum() {
  stopAmbientHum();
  if (!audioCtx || audioMuted || !masterGain) return;
  // Low arcade cabinet hum (single oscillator for simplicity and safety)
  ambientHumOsc = audioCtx.createOscillator();
  ambientHumGain = audioCtx.createGain();
  const humFilter = audioCtx.createBiquadFilter();

  ambientHumOsc.type = 'sine';
  ambientHumOsc.frequency.value = 50; // Mains hum

  humFilter.type = 'lowpass';
  humFilter.frequency.value = 100;

  ambientHumGain.gain.setValueAtTime(0, audioCtx.currentTime);
  ambientHumGain.gain.linearRampToValueAtTime(0.012 * audioVolume, audioCtx.currentTime + 2);

  ambientHumOsc.connect(ambientHumGain);
  ambientHumGain.connect(humFilter);
  humFilter.connect(masterGain);

  ambientHumOsc.start();
  // Auto-stop after 3 seconds (ambient hum is just for cabinet atmosphere)
  ambientHumOsc.stop(audioCtx.currentTime + 3);
}



function stopAmbientHum() {
  if (ambientHumOsc) {
    try { ambientHumOsc.stop(); } catch (_) {}
    ambientHumOsc = null;
  }
  if (ambientHumGain) {
    try { ambientHumGain.disconnect(); } catch (_) {}
    ambientHumGain = null;
  }
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

// --- Core Beep Helper (routed through cabinet speaker) ---
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
  o.connect(g);
  g.connect(masterGain || audioCtx.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

// --- Ms. Pac-Man Chomp SFX (simplified: 1 oscillator + throttle to prevent audio context exhaustion) ---
// Mobile Safari freezes when too many oscillators accumulate (~100+ in 5-10 seconds)
let lastChompTime = 0;
function playChomp() {
  if (!audioCtx || audioMuted) return;
  // Throttle: max 1 chomp per 80ms to prevent oscillator buildup on mobile
  const now = audioCtx.currentTime;
  if (now - lastChompTime < 0.08) return;
  lastChompTime = now;
  const t0 = audioCtx.currentTime;
  // Single oscillator: square wave with frequency sweep for arcade chomp feel
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(220, t0);
  o.frequency.exponentialRampToValueAtTime(140, t0 + 0.1);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.12 * audioVolume, t0 + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
  o.connect(g); g.connect(masterGain || audioCtx.destination);
  o.start(t0); o.stop(t0 + 0.12);
}


// --- Power Pellet SFX (AAA enhanced: brighter arpeggio with tremolo) ---
// Rising arpeggio: 200->700Hz over 500ms, 4 oscillator steps with tremolo
function playPowerPellet() {
  if (!audioCtx || audioMuted) return;
  const notes = [200, 380, 540, 700];
  notes.forEach((f, i) => {
    const t0 = audioCtx.currentTime + i * 0.125;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(f, t0);
    // Tremolo effect
    const trem = audioCtx.createOscillator();
    const tremG = audioCtx.createGain();
    trem.frequency.value = 12;
    tremG.gain.value = f * 0.15;
    trem.connect(tremG); tremG.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.1 * audioVolume, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.13);
    o.connect(g); g.connect(masterGain || audioCtx.destination);
    o.start(t0); o.stop(t0 + 0.15);
    trem.start(t0); trem.stop(t0 + 0.15);
  });
}

// --- Ghost Fright SFX (AAA enhanced: deeper descending with distortion) ---
// Descending tone: 900->80Hz over 600ms, sawtooth with slight distortion
function playFright() {
  if (!audioCtx || audioMuted) return;
  const t0 = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(900, t0);
  o.frequency.exponentialRampToValueAtTime(80, t0 + 0.6);
  // Subtle distortion via waveshaper
  const shaper = audioCtx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i=0;i<256;i++){const x=(i*2)/256-1;curve[i]=Math.tanh(x*3);}
  shaper.curve = curve;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.06 * audioVolume, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
  o.connect(g); g.connect(shaper); shaper.connect(masterGain || audioCtx.destination);
  o.start(t0); o.stop(t0 + 0.62);
}

// --- Fruit Bonus SFX (AAA enhanced: brighter 3-note chime with reverb) ---
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
    g.gain.exponentialRampToValueAtTime(0.12 * audioVolume, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
    o.connect(g); g.connect(masterGain || audioCtx.destination);
    o.start(t0); o.stop(t0 + 0.08);
    // Subtle reverb tail
    const rev = audioCtx.createGain();
    rev.gain.value = 0.15 * audioVolume;
    const delay = audioCtx.createDelay();
    delay.delayTime.value = 0.03;
    o.connect(delay); delay.connect(rev); rev.connect(masterGain || audioCtx.destination);
  });
}

// --- Death SFX (AAA enhanced: deeper wail with richer vibrato and sub-bass) ---
// 1.2-second descending wail: 650->60Hz sawtooth with vibrato + sub-bass
function playDeath() {
  if (!audioCtx || audioMuted) return;
  const t0 = audioCtx.currentTime;
  // Main wail
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(650, t0);
  o.frequency.exponentialRampToValueAtTime(60, t0 + 1.2);
  // Vibrato: LFO at 6Hz, +/-25Hz deviation
  const lfo = audioCtx.createOscillator();
  const lfoGain = audioCtx.createGain();
  lfo.frequency.value = 6;
  lfoGain.gain.value = 25;
  lfo.connect(lfoGain);
  lfoGain.connect(o.frequency);
  // Sub-bass layer for cabinet thump
  const sub = audioCtx.createOscillator();
  const subG = audioCtx.createGain();
  sub.type = 'sine';
  sub.frequency.value = 60;
  subG.gain.setValueAtTime(0.0001, t0);
  subG.gain.exponentialRampToValueAtTime(0.1 * audioVolume, t0 + 0.1);
  subG.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
  sub.connect(subG); subG.connect(masterGain || audioCtx.destination);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.1 * audioVolume, t0 + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
  o.connect(g); g.connect(masterGain || audioCtx.destination);
  o.start(t0); o.stop(t0 + 1.25);
  lfo.start(t0); lfo.stop(t0 + 1.3);
  sub.start(t0); sub.stop(t0 + 1.3);
}

// --- Ghost Eat SFX (AAA enhanced: multi-layered with combo detection) ---
// Quick ascending blip: 300->1200Hz, 200ms with harmonics
let lastGhostEatTime = 0;
function playGhostEat() {
  if (!audioCtx || audioMuted) return;
  const t0 = audioCtx.currentTime;
  const now = Date.now();
  const comboBonus = (now - lastGhostEatTime) < 800 ? 1.5 : 1; // combo = brighter
  lastGhostEatTime = now;
  const baseFreq = 400 * comboBonus;
  // Main ascending sweep
  const o1 = audioCtx.createOscillator();
  const g1 = audioCtx.createGain();
  o1.type = 'square';
  o1.frequency.setValueAtTime(baseFreq, t0);
  o1.frequency.exponentialRampToValueAtTime(1200 * comboBonus, t0 + 0.18);
  g1.gain.setValueAtTime(0.0001, t0);
  g1.gain.exponentialRampToValueAtTime(0.14 * audioVolume, t0 + 0.005);
  g1.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
  o1.connect(g1); g1.connect(masterGain || audioCtx.destination);
  o1.start(t0); o1.stop(t0 + 0.22);
  // 3rd harmonic for arcade "ping"
  const o2 = audioCtx.createOscillator();
  const g2 = audioCtx.createGain();
  o2.type = 'sawtooth';
  o2.frequency.setValueAtTime(baseFreq*1.5, t0);
  o2.frequency.exponentialRampToValueAtTime(1800 * comboBonus, t0 + 0.1);
  g2.gain.setValueAtTime(0.0001, t0);
  g2.gain.exponentialRampToValueAtTime(0.05 * audioVolume, t0 + 0.003);
  g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
  o2.connect(g2); g2.connect(masterGain || audioCtx.destination);
  o2.start(t0); o2.stop(t0 + 0.17);
}

// --- Tunnel SFX (AAA enhanced: richer noise sweep) ---
// Low whoosh: filtered noise sweep 100->500Hz, 250ms
function playTunnel() {
  if (!audioCtx || audioMuted) return;
  const t0 = audioCtx.currentTime;
  // Create noise buffer
  const bufferSize = audioCtx.sampleRate * 0.25;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 4;
  filter.frequency.setValueAtTime(100, t0);
  filter.frequency.exponentialRampToValueAtTime(500, t0 + 0.25);

  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.06 * audioVolume, t0 + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);

  noise.connect(filter);
  filter.connect(g);
  g.connect(masterGain || audioCtx.destination);
  noise.start(t0);
  noise.stop(t0 + 0.27);
}

// --- Fruit Spawn/Despawn SFX (AAA enhanced: routed through cabinet) ---
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
  o.connect(g); g.connect(masterGain || audioCtx.destination);
  o.start(t0); o.stop(t0 + 0.07);
}

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
  o.connect(g); g.connect(masterGain || audioCtx.destination);
  o.start(t0); o.stop(t0 + 0.12);
}

// --- Ghost Scatter Transition (Card 39) ---
// Brief tone: 400Hz sine, 100ms (routed through cabinet)
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
  o.connect(g); g.connect(masterGain || audioCtx.destination);
  o.start(t0); o.stop(t0 + 0.12);
}

// --- Extra Life Chime (AAA enhanced: richer with harmonics) ---
// 5-note ascending: C4-D4-E4-G4-C5, 120ms each with cabinet routing
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
    o.connect(g); g.connect(masterGain || audioCtx.destination);
    o.start(t0); o.stop(t0 + 0.14);
  });
}

// --- Game Over SFX (AAA enhanced: routed through cabinet, deeper wail) ---
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
  o.connect(g); g.connect(masterGain || audioCtx.destination);
  o.start(t0); o.stop(t0 + 2.1);

  // Reverb tail: delayed copy with feedback (routed through cabinet)
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
  reverbGain.connect(masterGain || audioCtx.destination);
}

// --- New High Score Fanfare (AAA enhanced: brighter with cabinet routing) ---
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
    o.connect(g); g.connect(masterGain || audioCtx.destination);
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

// --- Attract Mode Ghost Moan (Card 12) (AAA enhanced: routed through cabinet) ---
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
  ghostMoanGain.connect(masterGain || audioCtx.destination);
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

// --- Intermission Music Stinger (Card 14) (AAA enhanced: cabinet routing) ---
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
    o.connect(g); g.connect(masterGain || audioCtx.destination);
    o.start(t0); o.stop(t0 + 1.05);
  });
}

// --- Level Clear Jingle (AAA enhanced: brighter with cabinet routing) ---
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
    o.connect(g); g.connect(masterGain || audioCtx.destination);
    o.start(t0); o.stop(t0 + 0.1);
  });
}

// --- Stop All Audio (Card 1) (enhanced: also stops ambient hum) ---
function stopAll() {
  stopSiren();
  stopIntermissionAudio();
  stopAttractMelody();
  stopAttractChomp();
  stopAttractPowerCycle();
  stopGhostMoan();
  stopAmbientHum();
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

// --- Intermission Music (AAA enhanced: cabinet routing) ---
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
    o.connect(g); g.connect(masterGain || audioCtx.destination);
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
    // Ensure oscillator is stopped when game state changes (prevents leak)
    o.addEventListener('ended', () => { sirenOsc = null; sirenGain = null; });
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
