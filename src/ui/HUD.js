// ─── HUD.js — Game Heads-Up Display ─────────────────────────────────────────
// Renders HP bars, stamina, posture, timer, boss health bar, kill feed

export class HUD {
  constructor() {
    this._injectStyles();
    this._buildDOM();
    this.timer      = 0;
    this.timerRunning = false;
    this.killFeedQueue = [];
  }

  // ─── Styles ────────────────────────────────────────────────────────────────
  _injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=JetBrains+Mono:wght@400;700&display=swap');

      #hud {
        position: fixed;
        inset: 0;
        pointer-events: none;
        font-family: 'Rajdhani', sans-serif;
        z-index: 100;
        user-select: none;
      }

      /* ── Boss HP bar (top center) ── */
      #boss-bar-wrapper {
        position: absolute;
        top: 18px;
        left: 50%;
        transform: translateX(-50%);
        width: 580px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }
      #boss-name {
        font-size: 13px;
        font-weight: 600;
        color: #ff4422;
        letter-spacing: 4px;
        text-transform: uppercase;
        text-shadow: 0 0 12px rgba(255, 68, 34, 0.8);
      }
      #boss-hp-track {
        width: 100%;
        height: 12px;
        background: rgba(0,0,0,0.7);
        border: 1px solid rgba(255,68,34,0.4);
        border-radius: 2px;
        overflow: hidden;
        position: relative;
      }
      #boss-hp-bar {
        height: 100%;
        background: linear-gradient(90deg, #8b0000, #ff2200, #ff6600);
        width: 100%;
        transition: width 0.25s ease;
        position: relative;
      }
      #boss-hp-bar::after {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 40%;
        background: rgba(255,255,255,0.15);
      }
      #boss-phase-pip-row {
        display: flex;
        gap: 4px;
      }
      .phase-pip {
        width: 8px; height: 8px;
        border-radius: 50%;
        background: #ff4422;
        opacity: 0.35;
        transition: opacity 0.3s;
      }
      .phase-pip.active { opacity: 1; box-shadow: 0 0 6px #ff4422; }

      #boss-posture-track {
        width: 100%;
        height: 5px;
        background: rgba(0,0,0,0.5);
        border: 1px solid rgba(180,120,255,0.3);
        border-radius: 1px;
        overflow: hidden;
      }
      #boss-posture-bar {
        height: 100%;
        background: linear-gradient(90deg, #5500aa, #cc00ff);
        width: 0%;
        transition: width 0.1s linear;
      }

      /* ── Player stats (bottom left) ── */
      #player-stats {
        position: absolute;
        bottom: 24px;
        left: 24px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .stat-row {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .stat-icon {
        font-size: 15px;
        width: 20px;
        text-align: center;
        filter: drop-shadow(0 0 4px currentColor);
      }
      .stat-label {
        font-size: 11px;
        font-weight: 600;
        color: rgba(255,255,255,0.5);
        letter-spacing: 2px;
        width: 28px;
      }
      .stat-track {
        width: 200px;
        height: 8px;
        background: rgba(0,0,0,0.6);
        border-radius: 2px;
        overflow: hidden;
        position: relative;
        border: 1px solid rgba(255,255,255,0.1);
      }
      #player-hp-bar {
        height: 100%;
        background: linear-gradient(90deg, #004400, #00cc44, #88ff88);
        width: 100%;
        transition: width 0.2s ease;
      }
      #player-stamina-bar {
        height: 100%;
        background: linear-gradient(90deg, #003366, #0088ff, #66ccff);
        width: 100%;
        transition: width 0.08s linear;
      }
      .stat-value {
        font-family: 'JetBrains Mono', monospace;
        font-size: 12px;
        color: rgba(255,255,255,0.7);
        min-width: 40px;
      }

      /* ── Timer (top right) ── */
      #timer {
        position: absolute;
        top: 18px;
        right: 24px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 26px;
        font-weight: 700;
        color: #fff;
        text-shadow: 0 0 12px rgba(255,255,255,0.4);
        letter-spacing: 2px;
      }
      #timer.danger {
        color: #ff4422;
        text-shadow: 0 0 16px rgba(255,68,34,0.8);
        animation: timerPulse 0.5s ease-in-out infinite alternate;
      }
      @keyframes timerPulse {
        from { opacity: 1; } to { opacity: 0.6; }
      }

      /* ── Controls hint (bottom right) ── */
      #controls-hint {
        position: absolute;
        bottom: 24px;
        right: 24px;
        font-size: 11px;
        color: rgba(255,255,255,0.3);
        line-height: 1.8;
        letter-spacing: 1px;
        text-align: right;
      }
      .key-badge {
        display: inline-block;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 3px;
        padding: 0 5px;
        margin-right: 4px;
        font-family: 'JetBrains Mono', monospace;
      }

      /* ── Kill feed / notifications (top left) ── */
      #kill-feed {
        position: absolute;
        top: 24px;
        left: 24px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .feed-item {
        font-size: 13px;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 3px;
        border-left: 3px solid;
        background: rgba(0,0,0,0.6);
        animation: feedIn 0.2s ease, feedOut 0.3s ease 2.7s forwards;
        letter-spacing: 1px;
      }
      @keyframes feedIn  { from { opacity:0; transform:translateX(-12px); } to { opacity:1; transform:translateX(0); } }
      @keyframes feedOut { from { opacity:1; } to { opacity:0; } }

      /* ── SYNC! overlay ── */
      #sync-overlay {
        position: absolute;
        top: 40%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 42px;
        font-weight: 700;
        letter-spacing: 8px;
        color: #fff;
        text-shadow: 0 0 30px #00ccff, 0 0 60px #00ccff;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.1s;
      }

      /* ── Phase announcement ── */
      #phase-announce {
        position: absolute;
        top: 35%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 22px;
        font-weight: 700;
        letter-spacing: 6px;
        text-transform: uppercase;
        color: #ff4422;
        text-shadow: 0 0 20px #ff4422;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s;
      }

      /* ── Crit window ── */
      #crit-overlay {
        position: absolute;
        top: 30%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 28px;
        font-weight: 700;
        letter-spacing: 4px;
        color: #ffcc00;
        text-shadow: 0 0 20px #ffcc00, 0 0 40px #ff8800;
        opacity: 0;
        animation: none;
        pointer-events: none;
      }
      #crit-overlay.active {
        opacity: 1;
        animation: critPulse 0.3s ease-in-out infinite alternate;
      }
      @keyframes critPulse {
        from { text-shadow: 0 0 20px #ffcc00; transform: translate(-50%, -50%) scale(1); }
        to   { text-shadow: 0 0 40px #ff8800, 0 0 80px #ff4400; transform: translate(-50%, -50%) scale(1.06); }
      }

      /* ── Screen flash (damage vignette) ── */
      #screen-flash {
        position: fixed;
        inset: 0;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.05s;
        z-index: 200;
      }
      #screen-flash.red   { background: radial-gradient(ellipse at center, transparent 40%, rgba(255,0,0,0.4) 100%); }
      #screen-flash.white { background: rgba(255,255,255,0.3); }
    `;
    document.head.appendChild(style);
  }

  // ─── DOM Build ─────────────────────────────────────────────────────────────
  _buildDOM() {
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.innerHTML = `
      <!-- Boss bar -->
      <div id="boss-bar-wrapper">
        <div id="boss-name">⚔ BOSS NAME UNKNOWN</div>
        <div id="boss-hp-track"><div id="boss-hp-bar"></div></div>
        <div id="boss-posture-track"><div id="boss-posture-bar"></div></div>
        <div id="boss-phase-pip-row">
          <div class="phase-pip active" id="pip-1"></div>
          <div class="phase-pip" id="pip-2"></div>
          <div class="phase-pip" id="pip-3"></div>
        </div>
      </div>

      <!-- Timer -->
      <div id="timer">00:00.0</div>

      <!-- Player stats -->
      <div id="player-stats">
        <div class="stat-row">
          <span class="stat-icon" style="color:#00ff88">♥</span>
          <span class="stat-label">HP</span>
          <div class="stat-track"><div id="player-hp-bar"></div></div>
          <span class="stat-value" id="hp-value">100</span>
        </div>
        <div class="stat-row">
          <span class="stat-icon" style="color:#0088ff">⚡</span>
          <span class="stat-label">STA</span>
          <div class="stat-track"><div id="player-stamina-bar"></div></div>
          <span class="stat-value" id="sta-value">100</span>
        </div>
      </div>

      <!-- Controls -->
      <div id="controls-hint">
        <span class="key-badge">WASD</span> Move<br>
        <span class="key-badge">Space</span> Jump<br>
        <span class="key-badge">Q+A</span> Dodge Left<br>
        <span class="key-badge">Q+D</span> Dodge Right<br>
        <span class="key-badge">Q+S</span> Dodge Back<br>
        <span class="key-badge">J</span> Light Attack<br>
        <span class="key-badge">K</span> Heavy Attack<br>
        <span class="key-badge">L</span> Parry
      </div>

      <!-- Kill feed -->
      <div id="kill-feed"></div>

      <!-- Overlays -->
      <div id="sync-overlay">⚡ SYNC!</div>
      <div id="phase-announce"></div>
      <div id="crit-overlay">💥 CRITICAL WINDOW</div>
      <div id="screen-flash" class="red"></div>
    `;
    document.body.appendChild(hud);

    // Cache refs
    this.bossHpBar     = document.getElementById('boss-hp-bar');
    this.bossPostureBar = document.getElementById('boss-posture-bar');
    this.playerHpBar   = document.getElementById('player-hp-bar');
    this.playerStaBar  = document.getElementById('player-stamina-bar');
    this.hpValue       = document.getElementById('hp-value');
    this.staValue      = document.getElementById('sta-value');
    this.timerEl       = document.getElementById('timer');
    this.killFeed      = document.getElementById('kill-feed');
    this.syncOverlay   = document.getElementById('sync-overlay');
    this.phaseAnnounce = document.getElementById('phase-announce');
    this.critOverlay   = document.getElementById('crit-overlay');
    this.screenFlash   = document.getElementById('screen-flash');
  }

  // ─── Update ────────────────────────────────────────────────────────────────
  update(delta, playerSnapshot, bossSnapshot) {
    // Timer
    if (this.timerRunning) {
      this.timer += delta;
      this.timerEl.textContent = this._formatTime(this.timer);
    }

    // Player stats
    if (playerSnapshot) {
      const hpPct  = (playerSnapshot.hp  / 100) * 100;
      const staPct = (playerSnapshot.stamina / 100) * 100;
      this.playerHpBar.style.width  = hpPct  + '%';
      this.playerStaBar.style.width = staPct + '%';
      this.hpValue.textContent  = Math.ceil(playerSnapshot.hp);
      this.staValue.textContent = Math.ceil(playerSnapshot.stamina);

      // Low HP warning
      if (hpPct < 25) {
        this.playerHpBar.style.background = 'linear-gradient(90deg, #440000, #ff0000)';
      }
    }

    // Boss stats
    if (bossSnapshot) {
      const bossPct = (bossSnapshot.hp / bossSnapshot.maxHp) * 100;
      this.bossHpBar.style.width = bossPct + '%';

      const posturePct = (bossSnapshot.postureBar / bossSnapshot.maxPosture) * 100;
      this.bossPostureBar.style.width = posturePct + '%';

      // Phase pips
      document.getElementById('pip-1').classList.toggle('active', bossSnapshot.phase >= 1);
      document.getElementById('pip-2').classList.toggle('active', bossSnapshot.phase >= 2);
      document.getElementById('pip-3').classList.toggle('active', bossSnapshot.phase >= 3);

      // Crit window indicator
      const inCrit = bossSnapshot.currentState === 'CRIT' || bossSnapshot.currentState === 'STAGGER';
      this.critOverlay.classList.toggle('active', inCrit);
    }
  }

  // ─── Events ────────────────────────────────────────────────────────────────
  startTimer() {
    this.timerRunning = true;
    this.timer = 0;
  }

  stopTimer() {
    this.timerRunning = false;
    return this.timer;
  }

  showSyncAttack() {
    this.syncOverlay.style.opacity = '1';
    setTimeout(() => { this.syncOverlay.style.opacity = '0'; }, 700);
  }

  showPhaseChange(phase) {
    const msgs = { 2: '— PHASE II —', 3: '— ENRAGE —' };
    const colors = { 2: '#ff8800', 3: '#ff0000' };
    this.phaseAnnounce.textContent = msgs[phase] ?? `— PHASE ${phase} —`;
    this.phaseAnnounce.style.color = colors[phase] ?? '#ff4422';
    this.phaseAnnounce.style.textShadow = `0 0 20px ${colors[phase] ?? '#ff4422'}`;
    this.phaseAnnounce.style.opacity = '1';
    setTimeout(() => { this.phaseAnnounce.style.opacity = '0'; }, 2500);
  }

  showBossAttack(attackName) {
    this.addFeedItem(`⚠ ${attackName.toUpperCase()}`, '#ff4422', '#ff4422');
  }

  showParry() {
    this.addFeedItem('✦ PARRY!', '#00ffcc', '#00ffcc');
    this.flashScreen('white');
  }

  showHit(damage) {
    this.flashScreen('red');
  }

  showVictory(killTimeMs) {
    this.addFeedItem(`🏆 BOSS DEFEATED — ${this._formatTime(killTimeMs / 1000)}`, '#ffcc00', '#ffcc00');
  }

  addFeedItem(text, color = '#ffffff', borderColor = '#ffffff') {
    const item = document.createElement('div');
    item.className = 'feed-item';
    item.textContent = text;
    item.style.color = color;
    item.style.borderLeftColor = borderColor;
    this.killFeed.appendChild(item);
    setTimeout(() => item.remove(), 3000);
  }

  flashScreen(type = 'red') {
    this.screenFlash.className = `red ${type}`;
    this.screenFlash.style.opacity = '1';
    setTimeout(() => { this.screenFlash.style.opacity = '0'; }, 120);
  }

  setBossName(name) {
    document.getElementById('boss-name').textContent = `⚔ ${name.toUpperCase()}`;
  }

  // ─── Utils ─────────────────────────────────────────────────────────────────
  _formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms  = Math.floor((s % 1) * 10);
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${ms}`;
  }
}
