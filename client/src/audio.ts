// Synthesised UI sounds: no assets, and nothing plays until the user has
// interacted with the page (browser autoplay rules).
let ctx: AudioContext | null = null;
addEventListener('pointerdown', () => { ctx ??= new AudioContext(); }, { once: true, capture: true });
addEventListener('keydown', () => { ctx ??= new AudioContext(); }, { once: true, capture: true });

function tone(freq: number, start: number, dur: number, gain: number, type: OscillatorType = 'sine') {
  if (!ctx) return;
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

let lastBell = 0;

/** Terminal/X bell. Rate-limited: `yes $'\a'` should not melt your speakers. */
export function bell(volume = 0.5) {
  const now = performance.now();
  if (now - lastBell < 120) return;
  lastBell = now;
  tone(880, 0, 0.18, 0.12 * volume, 'triangle');
  tone(1320, 0.02, 0.22, 0.05 * volume);
}

export function chime(urgent = false) {
  tone(urgent ? 988 : 784, 0, 0.35, 0.08);
  tone(urgent ? 1319 : 1175, 0.11, 0.5, 0.07);
}
