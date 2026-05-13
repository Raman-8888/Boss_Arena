import * as THREE from 'three';
import { Arena }  from './game/arena.js';
import { CombatWorld } from './game/CombatWorld.js';
import { Player, HERO_MODEL, HERO_ANIMS } from './game/player.js';
import { BossAI, BOSS_MODEL, BOSS_ANIMS } from './game/boss/BossAI.js';
import { HUD }    from './ui/HUD.js';
import { CharacterAnimator, loadGLTF } from './game/AnimationManager.js';
import { soundManager } from './game/SoundManager.js';

// ─── Renderer ────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.toneMapping       = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;
renderer.outputColorSpace  = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 300);
camera.position.set(0, 8, 14);

// ─── Game Systems ────────────────────────────────────────────────────────────
const arena  = new Arena(scene);
const combatWorld = new CombatWorld(scene);
const player = new Player(scene, camera, 'p1');
player.combatWorld = combatWorld;
const hud    = new HUD();
let   boss   = null;

// ─── Game State ──────────────────────────────────────────────────────────────
let gameStarted = false;
let gameOver    = false;
let killTimeMs  = 0;
let screenShake = 0;

// ─── Start Screen ────────────────────────────────────────────────────────────
function buildStartScreen() {
  const overlay = document.createElement('div');
  overlay.id = 'start-screen';
  overlay.innerHTML = `
    <div class="start-inner">
      <div class="game-logo">
        <span class="logo-boss">BOSS</span><span class="logo-rush">RUSH</span>
      </div>
      <p class="start-sub">Face the Mutant. Survive. Claim the throne.</p>
      <div class="start-controls-grid">
        <div><span class="key">WASD</span><span>Move</span></div>
        <div><span class="key">Shift</span><span>Sprint</span></div>
        <div><span class="key">Space</span><span>Jump</span></div>
        <div><span class="key">Q</span><span>Dodge Roll</span></div>
        <div><span class="key">J</span><span>Heavy Strike</span></div>
        <div><span class="key">K</span><span>Combo Attack</span></div>
        <div><span class="key">L</span><span>Parry</span></div>
        <div><span class="key">RMB</span><span>Block</span></div>
      </div>
      <div id="loading-container">
        <div id="loading-text">LOADING ASSETS... 0%</div>
        <div id="loading-bar-bg"><div id="loading-bar-fill"></div></div>
      </div>
      <button id="start-btn" style="display: none;">ENTER THE ARENA</button>
      <p class="start-note">Click canvas to lock mouse · ESC to release</p>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Rajdhani:wght@500;600;700&family=JetBrains+Mono&display=swap');

    * { box-sizing: border-box; }
    body { margin: 0; overflow: hidden; background: #040008; }
    canvas { display: block; }

    #start-screen {
      position: fixed; inset: 0;
      display: flex; align-items: center; justify-content: center;
      background: radial-gradient(ellipse at 50% 80%, rgba(80,0,0,0.6) 0%, rgba(4,0,12,0.97) 70%);
      backdrop-filter: blur(6px);
      z-index: 500;
      font-family: 'Rajdhani', sans-serif;
      transition: opacity 0.6s;
    }
    .start-inner {
      display: flex; flex-direction: column; align-items: center;
      gap: 22px; text-align: center; max-width: 560px; padding: 0 20px;
    }
    .game-logo {
      font-family: 'Cinzel', serif;
      font-size: 80px; font-weight: 900; letter-spacing: 8px; line-height: 1;
      text-transform: uppercase;
    }
    .logo-boss {
      color: #fff;
      text-shadow: 0 0 40px rgba(255,255,255,0.2), 0 2px 0 rgba(0,0,0,0.8);
    }
    .logo-rush {
      color: #ff2200;
      text-shadow: 0 0 40px rgba(255,34,0,0.8), 0 0 80px rgba(255,34,0,0.4);
    }
    .start-sub {
      color: rgba(255,255,255,0.4); font-size: 13px;
      letter-spacing: 4px; text-transform: uppercase; margin: 0;
    }
    .start-controls-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 10px 28px;
      background: rgba(0,0,0,0.45); border: 1px solid rgba(255,100,0,0.15);
      border-radius: 10px; padding: 18px 28px; width: 100%;
    }
    .start-controls-grid > div {
      display: flex; align-items: center; gap: 10px;
      font-size: 13px; color: rgba(255,255,255,0.55);
    }
    .key {
      display: inline-block;
      background: rgba(255,120,0,0.1);
      border: 1px solid rgba(255,120,0,0.3);
      border-radius: 4px; padding: 2px 10px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px; color: #ffaa44; white-space: nowrap;
    }
    #start-btn {
      margin-top: 6px;
      padding: 16px 56px;
      background: linear-gradient(135deg, #990000 0%, #dd3300 100%);
      color: #fff; border: none; border-radius: 4px;
      font-family: 'Cinzel', serif;
      font-size: 17px; font-weight: 700; letter-spacing: 5px;
      text-transform: uppercase; cursor: pointer;
      box-shadow: 0 0 30px rgba(255,50,0,0.45), 0 2px 0 rgba(0,0,0,0.6);
      transition: all 0.2s;
    }
    #start-btn:hover {
      background: linear-gradient(135deg, #cc0000 0%, #ff4400 100%);
      box-shadow: 0 0 50px rgba(255,68,0,0.7);
      transform: scale(1.04);
    }
    #start-btn:active { transform: scale(0.97); }

    #loading-container {
      width: 100%; max-width: 400px; margin-top: 10px;
    }
    #loading-text {
      color: #ffaa44; font-family: 'JetBrains Mono', monospace; font-size: 13px;
      margin-bottom: 8px; letter-spacing: 2px; text-transform: uppercase;
    }
    #loading-bar-bg {
      width: 100%; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px;
      overflow: hidden;
    }
    #loading-bar-fill {
      width: 0%; height: 100%; background: #ffaa44; transition: width 0.2s ease-out;
      box-shadow: 0 0 10px #ffaa44;
    }
    /* ── You Died overlay ── */
    #game-over {
      position: fixed; inset: 0;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      background: rgba(0,0,0,0);
      z-index: 500;
      font-family: 'Cinzel', serif;
      gap: 22px;
      opacity: 0;
      pointer-events: none;
      transition: background 2s ease, opacity 1s ease;
    }
    #game-over.show {
      opacity: 1;
      pointer-events: auto;
      background: rgba(0,0,0,0.75);
    }
    #go-title { font-size: 58px; font-weight: 900; letter-spacing: 8px; }
    #go-title.win  { color: #ffcc00; text-shadow: 0 0 40px #ff8800; }
    #go-title.lose { color: #ff2200; text-shadow: 0 0 40px #ff0000; }
    #go-time { font-family: 'JetBrains Mono', monospace; font-size: 26px; color: rgba(255,255,255,0.7); }
    #go-restart {
      padding: 14px 44px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.25); border-radius: 4px;
      color: #fff; font-family: 'Cinzel', serif;
      font-size: 15px; letter-spacing: 4px; cursor: pointer;
      transition: all 0.2s;
    }
    #go-restart:hover { background: rgba(255,255,255,0.14); }
  `;
  document.head.appendChild(style);

  const goScreen = document.createElement('div');
  goScreen.id = 'game-over';
  goScreen.innerHTML = `
    <div id="go-title">—</div>
    <div id="go-time"></div>
    <button id="go-restart">TRY AGAIN</button>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(goScreen);

  document.body.appendChild(overlay);
  document.body.appendChild(goScreen);

  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('go-restart').addEventListener('click', () => location.reload());

  // Hook THREE.js global loading manager
  THREE.DefaultLoadingManager.onProgress = function (url, itemsLoaded, itemsTotal) {
    const fill = document.getElementById('loading-bar-fill');
    const text = document.getElementById('loading-text');
    if (fill && text) {
      const pct = Math.floor((itemsLoaded / itemsTotal) * 100);
      fill.style.width = pct + '%';
      text.textContent = `LOADING ASSETS... ${pct}%`;
    }
  };

  THREE.DefaultLoadingManager.onLoad = function () {
    const lc = document.getElementById('loading-container');
    const btn = document.getElementById('start-btn');
    if (lc && btn) {
      lc.style.display = 'none';
      btn.style.display = 'block';
    }
  };

  // Allow pressing R to restart when game over
  window.addEventListener('keydown', e => {
    if ((e.key === 'r' || e.key === 'R') && gameOver) {
      location.reload();
    }
    if (e.code === 'F3') {
      combatWorld.setDebug(!combatWorld.debugEnabled);
    }
  });
}

// ─── Game Start ──────────────────────────────────────────────────────────────
function startGame() {
  const overlay = document.getElementById('start-screen');
  overlay.style.opacity = '0';
  setTimeout(() => overlay.remove(), 600);

  // ── Arena start fanfare
  soundManager.playStart();

  player.requestPointerLock();

  // Boss is already instanced globally so assets preload. Just hook targets.
  player.setCombatTargets([boss]);
  hud.setBossName('The Mutant Overlord');
  hud.startTimer();
  gameStarted = true;

  // Boss events → HUD
  boss.onAttack = ({ attack }) => hud.showBossAttack(attack.name);
  boss.onScreenShake = () => { screenShake = 0.4; };
  boss.onPhaseChange = ({ phaseNum }) => {
    hud.showPhaseChange(phaseNum);
    if (phaseNum === 3) arena.setEnrageMode(true);
  };
  boss.onStagger = () => hud.addFeedItem('✦ STAGGERED!', '#cc00ff', '#cc00ff');
  boss.onDeath   = () => {
    killTimeMs = hud.stopTimer() * 1000;
    gameOver   = true;
    soundManager.playMutantScream();
    // Hero plays cinematic victory pose
    setTimeout(() => player.playVictory?.(), 600);
    setTimeout(() => showGameOver(true), 2500);
  };

  boss.onPowerUp = () => {
    hud.addFeedItem('⚡ POWER SURGE!', '#ff6600', '#ff2200');
    screenShake = 0.6;
  };

  // Player events → HUD
  player.onHit    = ({ damage }) => hud.showHit(damage);
  player.onParry  = ()           => hud.showParry();
  player.onDodge  = ()           => {};

  player.onAttack = () => {};
  player.onWeaponImpact = (hit) => {
    if (!boss?.isAlive) return;
    if (hit.target !== boss) return;
    boss.applyHit(hit);
    hud.showHit(hit.damage);
    soundManager.playImpact(); // weapon-connects impact clang
  };

  player.onDeath = () => {
    gameOver = true;
    setTimeout(() => showGameOver(false), 2500); // Wait for hero to fall
  };
}

function showGameOver(won) {
  const screen = document.getElementById('game-over');
  screen.classList.add('show');
  const title = document.getElementById('go-title');
  const time  = document.getElementById('go-time');
  if (won) {
    title.textContent = 'BOSS SLAIN';
    title.className = 'win';
    time.textContent = `Kill Time: ${fmt(killTimeMs)}`;
    hud.showVictory(killTimeMs);
  } else {
    title.textContent = 'YOU DIED';
    title.className = 'lose';
    time.innerHTML = `Survived: ${fmt(hud.timer * 1000)}<br><span style="font-size:16px;opacity:0.5;display:block;margin-top:10px">Press R to Retry</span>`;
  }
}

function fmt(ms) {
  const s = ms / 1000, m = Math.floor(s / 60);
  return `${m > 0 ? m + 'm ' : ''}${(s % 60).toFixed(1)}s`;
}

// ─── Resize ──────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Game Loop ────────────────────────────────────────────────────────────────
let lastTime = performance.now();

function gameLoop() {
  requestAnimationFrame(gameLoop);

  const now   = performance.now();
  const delta = Math.min((now - lastTime) / 1000, 0.05);
  lastTime    = now;



  arena.update(delta);

  player.update(delta, camera);
  combatWorld.resolvePlayer(player, boss);
  if (gameStarted && boss) {
    boss.update(delta);
    combatWorld.resolveBoss(boss, player);
    combatWorld.syncDebug(player, boss);
    if (!gameOver) hud.update(delta, player.getSnapshot(), boss.getSnapshot());
  }

  if (gameStarted && screenShake > 0) {
    screenShake -= delta;
    const mag = screenShake * 1.5;
    camera.position.x += (Math.random() - 0.5) * mag;
    camera.position.y += (Math.random() - 0.5) * mag;
    camera.position.z += (Math.random() - 0.5) * mag;
  }

  renderer.render(scene, camera);
}

// ─── Boot ────────────────────────────────────────────────────────────────────
// Boss needs to be instantiated early so its models and animations preload 
// via THREE.DefaultLoadingManager before the user hits "ENTER THE ARENA"
boss = new BossAI(scene, [player], combatWorld);

buildStartScreen();
gameLoop();
