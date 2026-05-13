// ─── SoundManager ──────────────────────────────────────────────────────────
// All paths are relative to /public so Vite serves them directly.

const BASE = '/assets/Sound_effects/';

// ── Sound definitions ───────────────────────────────────────────────────────
const SOUNDS = {
  start:        [BASE + 'start.mp3'],
  death:        [BASE + 'death.mp3'],          // hero death
  mutantScream: [BASE + 'mutant-scream.mp3'],  // boss death
  attack: [
    BASE + 'attack-1.mp3',
    BASE + 'attack-2.mp3',
    BASE + 'attack-3.mp3',
    BASE + 'attack-4.mp3',
    BASE + 'attack-5.mp3',
  ],
  parry: [
    BASE + 'parry1.mp3',
    BASE + 'parry2.mp3',
    BASE + 'parry4.mp3',
  ],
};

// How many pooled Audio elements to create per multi-sound group
// (lets overlapping hits play without cutting each other)
const POOL_SIZE = 3;

export class SoundManager {
  constructor() {
    this._muted   = false;
    this._volume  = 0.67;
    this._pools   = {};   // key → AudioPool[]
    this._singles = {};   // key → HTMLAudioElement

    this._buildPools();
  }

  // ── Public volume / mute ─────────────────────────────────────────────────
  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    // Update all live audio elements
    for (const pool of Object.values(this._pools)) {
      for (const a of pool) a.volume = this._volume;
    }
    for (const a of Object.values(this._singles)) {
      a.volume = this._volume;
    }
  }

  mute()   { this._muted = true;  }
  unmute() { this._muted = false; }

  // ── Trigger methods (call from game code) ────────────────────────────────

  /** Cinematic arena start fanfare */
  playStart() { this._playSingle('start', 0.85); }

  /** Hero death */
  playDeath() { 
    this.stopStart();
    this._playSingle('death', 0.9); 
  }

  /** Stop start music */
  stopStart() { this._stopSingle('start'); }

  /** Boss death / mutant scream */
  playMutantScream() { this._playSingle('mutantScream', 1.0); }

  /** Random attack whoosh (called on every hero swing) */
  playAttack() { this._playRandom('attack', 0.65); }

  /** Random parry/block clang */
  playParry() { this._playRandom('parry', 0.75); }

  /** Also fires on boss hit (impact sound) – reuses attack pool with lower vol */
  playImpact() { this._playRandom('attack', 0.45); }

  // ── Internal ─────────────────────────────────────────────────────────────
  _buildPools() {
    // Multi-variant groups → pooled for overlap
    for (const key of ['attack', 'parry']) {
      this._pools[key] = SOUNDS[key].map(src => {
        const a = new Audio(src);
        a.volume = this._volume;
        a.preload = 'auto';
        return a;
      });
    }

    // Single-file sounds
    for (const key of ['start', 'death', 'mutantScream']) {
      const a = new Audio(SOUNDS[key][0]);
      a.volume = this._volume;
      a.preload = 'auto';
      this._singles[key] = a;
    }
  }

  /** Pick a random Audio from a pool and play it (clone to allow overlap) */
  _playRandom(key, volume = this._volume) {
    if (this._muted) return;
    const pool = this._pools[key];
    if (!pool || pool.length === 0) return;
    const src = pool[Math.floor(Math.random() * pool.length)].src;
    const a = new Audio(src);
    a.volume = Math.max(0, Math.min(1, volume * this._volume));
    a.play().catch(() => {/* autoplay blocked – silently ignore */});
  }

  /** Play a single-file sound (restarts if already playing) */
  _playSingle(key, volume = this._volume) {
    if (this._muted) return;
    const a = this._singles[key];
    if (!a) return;
    a.volume = Math.max(0, Math.min(1, volume * this._volume));
    a.currentTime = 0;
    a.play().catch(() => {});
  }

  /** Stop a single-file sound */
  _stopSingle(key) {
    const a = this._singles[key];
    if (!a) return;
    a.pause();
    a.currentTime = 0;
  }
}

// Singleton export – import and use anywhere
export const soundManager = new SoundManager();
