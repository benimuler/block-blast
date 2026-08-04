const SETTINGS_KEY = 'blockblast_settings';

const defaults = {
  sound: true,
  music: true,
  theme: 'dark',
  tutorialSeen: false
};

let settings = { ...defaults };
let audioCtx = null;
let musicNodes = null;

export function loadSettings() {
  try {
    settings = { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) };
  } catch { /* defaults */ }
  applyTheme();
  if (settings.music) startMusic();
  return settings;
}

export function getSettings() {
  return settings;
}

export function updateSettings(partial) {
  settings = { ...settings, ...partial };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  if (partial.theme) applyTheme();
  if ('music' in partial) {
    if (settings.music) startMusic();
    else stopMusic();
  }
}

function applyTheme() {
  document.body.dataset.theme = settings.theme;
}

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function startMusic() {
  if (!settings.music || musicNodes) return;
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 110;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    musicNodes = { osc, gain, ctx };
  } catch { /* no audio */ }
}

function stopMusic() {
  if (!musicNodes) return;
  try {
    const { osc, gain, ctx } = musicNodes;
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.stop(ctx.currentTime + 0.35);
  } catch { /* already stopped */ }
  musicNodes = null;
}

export function playSound(type) {
  if (!settings.sound && !settings.music) return;
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    if (settings.music && !musicNodes) startMusic();
    if (!settings.sound) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const freqs = {
      place: 440,
      clear: 660,
      combo: 880,
      win: 523,
      lose: 220,
      click: 350,
      achievement: 784
    };
    osc.frequency.value = freqs[type] || 440;
    osc.type = type === 'lose' ? 'sawtooth' : 'sine';
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  } catch { /* no audio */ }
}

export function shouldShowTutorial() {
  return !settings.tutorialSeen;
}

export function markTutorialSeen() {
  updateSettings({ tutorialSeen: true });
}
