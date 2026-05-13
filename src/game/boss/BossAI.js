// ─── BossAI — Mutant Boss ───────────────────────────────────────────────────
// Uses the villan/character/Mutant.glb model and villan/animations/*.glb
// Same per-file animation system as the Player.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CharacterAnimator, loadGLTF } from '../AnimationManager.js';
import { BOSS_WORLD_SCALE, CAPSULE_BOSS, CAPSULE_PLAYER } from '../CombatWorld.js';

// ─── States ─────────────────────────────────────────────────────────────────
const S = {
  IDLE:      'IDLE',
  AGGRO:     'AGGRO',
  TELEGRAPH: 'TELEGRAPH',
  ATTACK:    'ATTACK',
  RECOVER:   'RECOVER',
  STAGGER:   'STAGGER',
  CRIT:      'CRIT',
  POWERUP:   'POWERUP',   // cinematic power-up surge
  DEAD:      'DEAD',
};

// ─── Phase Config ────────────────────────────────────────────────────────────
const PHASES = [
  { num: 1, hpFrac: 1.00, speed: 7.0,  aggr: 0.30, telegraphMult: 1.0  },
  { num: 2, hpFrac: 0.60, speed: 10.0, aggr: 0.55, telegraphMult: 0.75 },
  { num: 3, hpFrac: 0.30, speed: 14.0, aggr: 0.85, telegraphMult: 0.5  },
];

// ─── Attack pool (4 moves only) — tiers: 1 = gap closer, 2 = heavy, 3 = bread‑and‑butter, 4 = interrupt kick
// maxCommitEdge / idealStoppingEdge are authored at scale=1; CombatWorld multiplies by BOSS_WORLD_SCALE.
const ATTACKS = [
  {
    id: 'jumpSlam', tier: 1, dmg: 52, telegraph: 680, aoe: true,
    minRange: 2.2, maxRange: 24, name: 'Run+Jump Slam', anim: 'bossSlam',
    animDuration: 1.35, aoeRadius: 2.9, activeStart: 0.4, activeEnd: 0.82,
    arcDotMin: -0.72, bladeLength: 1.9, maxCommitEdge: 2.35, idealStoppingEdge: 1.05,
    lungeSpeed: 10, maxLungeDist: 3.2, cooldown: 3.0,
  },
  {
    id: 'runStrike', tier: 2, dmg: 40, telegraph: 520, aoe: false,
    minRange: 1.2, maxRange: 15, name: 'Heavy Combo (3)', anim: 'bossAttack3',
    animDuration: 1.22, activeStart: 0.32, activeEnd: 0.7, arcDotMin: -0.55,
    bladeLength: 1.75, maxCommitEdge: 1.05, idealStoppingEdge: 0.48,
    forwardRootMotion: 0.42, bladeReachFactor: 0.52, lungeSpeed: 6.2, maxLungeDist: 1.55,
    handForward: 0.34, windupBladeFactor: 0.8, cooldown: 2.0,
  },
  {
    id: 'attack2', tier: 3, dmg: 28, telegraph: 440, aoe: false,
    minRange: 0, maxRange: 8, name: 'Sword Slash (2)', anim: 'bossAttack2',
    animDuration: 1.12, activeStart: 0.28, activeEnd: 0.66, arcDotMin: -0.82,
    bladeLength: 1.7, maxCommitEdge: 0.7, idealStoppingEdge: 0.26,
    forwardRootMotion: 0.32, bladeReachFactor: 0.52, lungeSpeed: 4.6, maxLungeDist: 1.12,
    handForward: 0.32, windupBladeFactor: 0.76, cooldown: 0.85,
  },
  {
    id: 'kick', tier: 4, dmg: 11, telegraph: 340, aoe: false,
    minRange: 0, maxRange: 4.2, name: 'Spartan Kick', anim: 'bossKick',
    animDuration: 1.05, activeStart: 0.38, activeEnd: 0.64, arcDotMin: -0.48,
    bladeLength: 0.88, maxCommitEdge: 0.54, idealStoppingEdge: 0.2,
    forwardRootMotion: 0.28, bladeReachFactor: 0.46, lungeSpeed: 4.2, maxLungeDist: 0.85,
    handForward: 0.22, windupBladeFactor: 0.64, windupTorsoClearance: 0.72,
    cooldown: 5.5,
  },
];

/** Local axes tested for blade tip direction (weapon bone alignment varies by rig). */
const BLADE_DIR_LOCALS = [
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
];

// ─── Assets ──────────────────────────────────────────────────────────────────
export const BOSS_MODEL = '/assets/villan/character/Mutant.glb';

export const BOSS_ANIMS = {
  // ── Locomotion
  bossIdle:     '/assets/villan/animations/sword and shield idle.glb',
  bossWalk:     '/assets/villan/animations/sword and shield walk.glb',
  bossRun:      '/assets/villan/animations/sword and shield run.glb',
  // ── Core attack set (4)
  bossAttack2:  '/assets/villan/animations/sword and shield attack (2).glb',
  bossAttack3:  '/assets/villan/animations/sword and shield attack (3).glb',
  bossKick:     '/assets/villan/animations/sword and shield kick.glb',
  bossSlam:     '/assets/villan/animations/sword and shield slash.glb',
  // ── Hit reactions (tiered)
  bossHit:      '/assets/villan/animations/sword and shield impact.glb',
  bossHitMed:   '/assets/villan/animations/sword and shield impact (2).glb',
  bossHitHeavy: '/assets/villan/animations/sword and shield impact (3).glb',
  // ── Death (randomised)
  bossDeath:    '/assets/villan/animations/sword and shield death.glb',
  bossDeath2:   '/assets/villan/animations/sword and shield death (2).glb',
  // ── Cinematic
  bossPowerUp:  '/assets/villan/animations/sword and shield power up.glb',
};

const MAX_HP      = 2000;
const MAX_POSTURE = 100;
const POSTURE_REGEN = 6;
export class BossAI {
  constructor(scene, players, combatWorld) {
    this.scene   = scene;
    this.players = players;
    this.combatWorld = combatWorld;

    // Stats
    this.hp         = MAX_HP;
    this.maxHp      = MAX_HP;
    this.posture    = 0;
    this.maxPosture = MAX_POSTURE;
    this.isAlive    = true;

    // State machine
    this.state      = S.IDLE;
    this.phase      = PHASES[0];
    this.phaseNum   = 1;
    this.isEnraged  = false;
    this.stateTimer = 0;
    this._lockRotation = false;
    this._strafeSign = Math.random() > 0.5 ? 1 : -1;
    this._spacingTimer = 0;
    this.velocity = new THREE.Vector3();
    this.reactionVelocity = new THREE.Vector3();
    this.balance = 1;

    // ── Anti-spam / cooldown tracking ─────────────────────────────────────────
    this._attackCooldowns = {};   // { [attackId]: remainingSeconds }
    this._lastAttackId    = null;
    this._sameAttackCount = 0;
    this._recentAttackHistory = []; // last N attack ids (diversity / kick pressure)
    this._lastPlayerDist = null;
    this._playerApproachSpeed = 0; // + = player closing, − = fleeing
    this._pendingHitReaction = 0;
    this._attackElapsed = 0;
    this._attackClipDuration = 1.12;
    this._alreadyHitTargets = new WeakSet();
    this._weaponTraceSamples = 16;
    this._bladeHitThickness = 0.1;
    this._bestBladeDir = new THREE.Vector3();
    this._bladeCand = new THREE.Vector3();
    this._bladeTipCand = new THREE.Vector3();
    this._bladeTargetPt = new THREE.Vector3();
    this._weaponSource = null;
    this._weaponBase = new THREE.Vector3();
    this._weaponMid = new THREE.Vector3();
    this._weaponTip = new THREE.Vector3();
    this._prevWeaponMid = null;
    this._prevWeaponBase = null;
    this._prevWeaponTip = null;
    this._debugTraceGroup = new THREE.Group();
    this._debugEnabled = false;
    this.scene.add(this._debugTraceGroup);
    this._activeFrameRing = null;
    this._footSnapBox = new THREE.Box3();
    this._footSnapTimer = 0;
    this._footContactOffset = 0;
    this._leftFootBone = null;
    this._rightFootBone = null;
    this._leftFootBaseLocal = null;
    this._rightFootBaseLocal = null;
    this._footRay = new THREE.Raycaster();
    this._footTmp = new THREE.Vector3();
    this._footTmp2 = new THREE.Vector3();
    this._footPelvisAdjust = 0;
    this._groundColliders = [];
    this._lungeConsumed = 0;

    // Current attack
    this.currentAttack = null;
    this.attackDamageDealt = false;

    // Timers
    this._aggroDelay = 2.0; // wait before first aggro

    // Callbacks
    this.onAttack      = null;
    this.onPhaseChange = null;
    this.onStagger     = null;
    this.onDeath       = null;
    this.onScreenShake = null;
    this.onPowerUp     = null;   // fires when power-up starts

    // ── Power-up system
    this._powerUpCooldown  = 22 + Math.random() * 14; // first trigger 22–36 s in
    this._isPoweredUp      = false;
    this._powerUpDuration  = 0;
    this._powerUpAggrBonus = 0;

    // Scene
    this.group = new THREE.Group();
    this.group.position.set(0, 0, -10);
    this.scene.add(this.group);

    // Animator
    this._animator = null;

    // Telegraph ring
    this._buildTelegraphRing();
    this._buildActiveFrameDebugRing();

    // Load model
    this._loadModel();
  }

  _buildTelegraphRing() {
    const geo = new THREE.RingGeometry(0.5, 0.55, 48);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff2200, side: THREE.DoubleSide,
      transparent: true, opacity: 0,
    });
    this._ring = new THREE.Mesh(geo, mat);
    this._ring.position.y = 0.05;
    this.scene.add(this._ring);
  }

  /** Yellow ring: melee ACTIVE frames (F3 combat debug). */
  _buildActiveFrameDebugRing() {
    const geo = new THREE.TorusGeometry(0.92, 0.045, 10, 36);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffee33,
      transparent: true,
      opacity: 0.85,
      depthTest: true,
    });
    this._activeFrameRing = new THREE.Mesh(geo, mat);
    this._activeFrameRing.visible = false;
    this.scene.add(this._activeFrameRing);
  }

  _updateActiveFrameDebug() {
    if (!this._activeFrameRing) return;
    const dbg = !!this.combatWorld?.debugEnabled;
    const active = dbg && this.state === S.ATTACK && this.currentAttack && this._isAttackFrameActive(this.currentAttack);
    this._activeFrameRing.visible = active;
    if (active) {
      this._activeFrameRing.position.copy(this.group.position);
      this._activeFrameRing.position.y = 0.07;
    }
  }

  async _loadModel() {
    try {
      const gltf  = await loadGLTF(BOSS_MODEL);
      const model = gltf.scene;

      // Fix materials + red emissive tint
      model.traverse(child => {
        if (!child.isMesh && !child.isSkinnedMesh) return;
        child.castShadow    = true;
        child.receiveShadow = true;
        child.frustumCulled = false;

        const wasArray = Array.isArray(child.material);
        const mats = wasArray ? child.material : [child.material];
        const newMats = mats.map(m => {
          let std;
          if (m.isMeshStandardMaterial) {
            std = m;
          } else {
            std = new THREE.MeshStandardMaterial({
              map:              m.map ?? null,
              color:            m.color ?? new THREE.Color(0x888888),
              roughness:        0.7,
              metalness:        0.3,
            });
            if (m.dispose) m.dispose();
          }
          std.emissive = new THREE.Color(0x440000);
          std.emissiveIntensity = 0.4;
          std.transparent = false;
          std.opacity = 1.0;
          std.depthWrite = true;
          return std;
        });
        child.material = wasArray ? newMats : newMats[0];
      });

      model.scale.setScalar(BOSS_WORLD_SCALE);

      // Auto-snap to floor: calculate the bind-pose bounding box and offset Y so feet touch 0
      const box = new THREE.Box3().setFromObject(model);
      model.position.y = -box.min.y;
      this._baseModelY = model.position.y;

      this.group.add(model);
      this._model = model;
      this._resolveWeaponBone();
      this._resolveFootBones();

      // Animator
      this._animator = new CharacterAnimator(model, BOSS_ANIMS);
      await this._animator.preload(['bossIdle', 'bossWalk']);
      this._animator.play('bossIdle');
      this._animator.preload(Object.keys(BOSS_ANIMS));

      console.log('[BossAI] Mutant loaded ✓');
    } catch (err) {
      console.error('[BossAI] Model load failed:', err);
    }
  }

  // ─── State Machine ──────────────────────────────────────────────────────────
  update(delta) {
    if (this.combatWorld) this._debugEnabled = this.combatWorld.debugEnabled;

    if (!this.isAlive) {
      if (this._animator) this._animator.update(delta);
      return;
    }

    this._checkPhase();
    this._updateState(delta);
    this._updatePostureRegen(delta);
    this._updateProceduralReaction(delta);
    if (this._animator) this._animator.update(delta);
    this._updateFootIK(delta);
    this._updateFootGroundContact(delta);
    this._updateTelegraph();
    this._updateActiveFrameDebug();
  }

  _checkPhase() {
    const hpFrac = this.hp / this.maxHp;
    for (let i = PHASES.length - 1; i >= 0; i--) {
      if (hpFrac <= PHASES[i].hpFrac && this.phaseNum < PHASES[i].num) {
        this.phase   = PHASES[i];
        this.phaseNum = PHASES[i].num;
        if (this.onPhaseChange) this.onPhaseChange({ phaseNum: this.phaseNum });
        if (this.phaseNum === 3) {
          this.isEnraged = true;
          // Turn red
          this._model?.traverse(c => {
            if (c.isMesh && c.material) {
              const m = c.material;
              if (m.emissive) m.emissive.set(0xff0000);
              if (m.emissiveIntensity !== undefined) m.emissiveIntensity = 0.8;
            }
          });
        }
        break;
      }
    }
  }

  _updateState(delta) {
    this.stateTimer -= delta;
    if (this._aggroDelay > 0) { this._aggroDelay -= delta; return; }

    // Tick cooldowns every frame
    for (const id of Object.keys(this._attackCooldowns)) {
      this._attackCooldowns[id] = Math.max(0, this._attackCooldowns[id] - delta);
    }

    switch (this.state) {
      case S.IDLE:      this._stateIdle(); break;
      case S.AGGRO:     this._stateAggro(delta); break;
      case S.TELEGRAPH: this._stateTelegraph(delta); break;
      case S.ATTACK:    this._stateAttack(delta); break;
      case S.RECOVER:   this._stateRecover(delta); break;
      case S.STAGGER:   this._stateStagger(delta); break;
      case S.CRIT:      this._stateCrit(delta); break;
      case S.POWERUP:   this._statePowerUp(delta); break;
    }
  }

  _stateIdle() {
    this._setState(S.AGGRO);
  }

  _stateAggro(delta) {
    const target = this._nearestPlayer();
    if (!target) return;

    this._faceTarget(target, delta);
    this._updateCombatSpacing(target, delta);

    const dist = this.group.position.distanceTo(target.group.position);
    if (this._lastPlayerDist != null && delta > 1e-5) {
      this._playerApproachSpeed = (this._lastPlayerDist - dist) / delta;
    }
    this._lastPlayerDist = dist;

    // Use run animation when far, walk when near
    const runAnim = dist > 6 * BOSS_WORLD_SCALE ? 'bossRun' : 'bossWalk';
    if (this._animator &&
        !this._animator.isPlaying('bossWalk') &&
        !this._animator.isPlaying('bossRun')) {
      this._animator.crossfade(runAnim, 0.3);
    }

    const aggr = this.phase.aggr + (this._isPoweredUp ? this._powerUpAggrBonus : 0);
    // Base attack cadence — fires more often when close
    const proximityBonus = dist < 6 * BOSS_WORLD_SCALE ? 1.6 : 1.0;
    const mayPick = Math.random() < aggr * delta * 2.2 * proximityBonus;

    // Gate: at least ONE attack must be usable at current distance
    if (mayPick) {
      const s = BOSS_WORLD_SCALE;
      const hasValidAttack = ATTACKS.some(a => dist >= a.minRange * s && dist <= a.maxRange * s);
      if (hasValidAttack) this._pickAndTelegraph();
    }

    // ── Rare power-up trigger (not during phase 1 first 10 s)
    if (this._powerUpCooldown > 0) {
      this._powerUpCooldown -= delta;
    } else if (!this._isPoweredUp && this.state === S.AGGRO) {
      // 15% chance per evaluation when cooldown hits zero
      if (Math.random() < 0.15) {
        this._setState(S.POWERUP);
        const dur = this._animator?.getClipDuration('bossPowerUp') ?? 2.2;
        this.stateTimer = dur;
        if (this._animator) this._animator.play('bossPowerUp');
        this._isPoweredUp = true;
        this._powerUpDuration = 12 + Math.random() * 8;  // 12–20 s aggression boost
        this._powerUpAggrBonus = 0.35;
        this._powerUpCooldown = 40 + Math.random() * 20; // next trigger in 40–60 s
        if (this.onPowerUp) this.onPowerUp();
        if (this.onScreenShake) this.onScreenShake();
      } else {
        // Roll again in 3 s
        this._powerUpCooldown = 3;
      }
    }

    // Tick powered-up duration
    if (this._isPoweredUp) {
      this._powerUpDuration -= delta;
      if (this._powerUpDuration <= 0) {
        this._isPoweredUp = false;
        this._powerUpAggrBonus = 0;
      }
    }
  }

  _statePowerUp(delta) {
    // Hold in power-up animation, then return to aggro
    if (this.stateTimer <= 0) {
      this._setState(S.AGGRO);
    }
  }

  _bossAiLog(...args) {
    if (this._debugEnabled) console.log('[BossAI]', ...args);
  }

  /** Pillar LOS for gap-closer / leap — not floor collision. */
  _pathClearToTarget(target, yLift = 0.55) {
    if (!this.combatWorld || !target?.group) return true;
    const ax = this.group.position.x;
    const az = this.group.position.z;
    const ay = this.group.position.y + yLift;
    const bx = target.group.position.x;
    const bz = target.group.position.z;
    const by = target.group.position.y + yLift;
    const a = this._footTmp.set(ax, ay, az);
    const b = this._footTmp2.set(bx, by, bz);
    return !this.combatWorld.segmentBlockedByAnyPillar(a, b);
  }

  /** Boss forward sprint lane clear for run-up attacks. */
  _forwardDashClear(dist) {
    if (!this.combatWorld) return true;
    const ry = this.group.rotation.y;
    const fx = Math.sin(ry);
    const fz = Math.cos(ry);
    const y = this.group.position.y + 0.5;
    const a = this._footTmp.set(this.group.position.x, y, this.group.position.z);
    const b = this._footTmp2.set(this.group.position.x + fx * dist, y, this.group.position.z + fz * dist);
    return !this.combatWorld.segmentBlockedByAnyPillar(a, b);
  }

  /**
   * Utility score — higher = more desirable. Uses tier priority, spacing, cooldowns,
   * repetition memory, perception (fleeing player boosts gap-closer).
   */
  _computeUtilityScore(target, a, dist, edge, normDist) {
    const s = BOSS_WORLD_SCALE;
    const cd = this._attackCooldowns[a.id] ?? 0;

    const tierBase = { 1: 108, 2: 86, 3: 60, 4: 18 };
    let score = tierBase[a.tier] ?? 50;

    score -= cd * 38;

    const recent = this._recentAttackHistory;
    const sameInWindow = recent.filter(id => id === a.id).length;
    score -= sameInWindow * 24;

    if (a.id === this._lastAttackId) {
      score -= 26 + this._sameAttackCount * 22;
    }

    if (a.id === 'jumpSlam') {
      score += THREE.MathUtils.clamp((normDist - 2.6) * 12, -12, 52);
      if (this._playerApproachSpeed < -1.0) score += 24;
      if (this._pathClearToTarget(target, 0.62) || this._forwardDashClear(3.4 * s)) score += 32;
      else score -= 48;
      if (normDist < 2.2) score -= 28;
    } else if (a.id === 'runStrike') {
      const commit = this.combatWorld.getMaxCommitEdgeForAttack(a);
      score += THREE.MathUtils.clamp((commit * 1.12 - edge) * 48, 0, 36);
      score += THREE.MathUtils.clamp((9 - normDist) * 2.4, -10, 22);
      if (edge > commit * 1.05) score -= 40;
    } else if (a.id === 'attack2') {
      score += 20;
      score += THREE.MathUtils.clamp((7 - normDist) * 2.8, -8, 24);
    } else if (a.id === 'kick') {
      score *= 0.32;
      if (edge < 0.32 * s + 0.08) score += 44;
      else score -= 85;
      if (normDist > 2.6) score -= 55;
      if (this._lastAttackId === 'kick') score -= 130;
      const kickStreak = recent.slice(-4).filter(id => id === 'kick').length;
      score -= kickStreak * 52;
    }

    if (this.phaseNum >= 2 && (a.id === 'jumpSlam' || a.id === 'runStrike')) {
      score += 12 * (this.phaseNum - 1);
    }
    if (this._isPoweredUp) {
      score += 18;
      if (a.id === 'jumpSlam' || a.id === 'runStrike') score += 22;
    }

    return score;
  }

  _pickAndTelegraph() {
    const target = this._nearestPlayer();
    if (!target || !this.combatWorld) return;

    const dist = this.group.position.distanceTo(target.group.position);
    const s = BOSS_WORLD_SCALE;
    const edge = this.combatWorld.edgeDistanceXZ(this.group, CAPSULE_BOSS, target.group, CAPSULE_PLAYER);
    const normDist = dist / s;

    let candidates = ATTACKS.filter(a => dist >= a.minRange * s && dist <= a.maxRange * s);

    const rejections = [];
    candidates = candidates.filter(a => {
      if (a.aoe) {
        const pathOk = this._pathClearToTarget(target, 0.62);
        const fwdOk = this._forwardDashClear(3.2 * s);
        if (!pathOk && !fwdOk) {
          rejections.push(`${a.id}:pillar_and_forward_blocked`);
          return false;
        }
        return true;
      }
      if (a.id === 'kick') {
        if (edge > 0.34 * s + 0.12) {
          rejections.push(`${a.id}:kick_not_close(edge=${edge.toFixed(2)})`);
          return false;
        }
      } else {
        const commit = this.combatWorld.getMaxCommitEdgeForAttack(a);
        if (edge > commit * 1.2) {
          rejections.push(`${a.id}:out_of_commit(edge=${edge.toFixed(2)}>${(commit * 1.2).toFixed(2)})`);
          return false;
        }
      }
      if (!this.combatWorld.canBossMeleeConnect(
        this.group, target.group, a.bladeLength, a.arcDotMin ?? -0.65, a,
      )) {
        rejections.push(`${a.id}:facing_arc`);
        return false;
      }
      if (!this._windupReachOk(target, a)) {
        rejections.push(`${a.id}:windup_clearance`);
        return false;
      }
      return true;
    });

    if (candidates.length === 0) {
      this._bossAiLog('pick rejected — no valid attacks', { dist: dist.toFixed(2), edge: edge.toFixed(2), normDist: normDist.toFixed(2), reasons: rejections });
      return;
    }

    const scored = candidates.map(a => ({
      atk: a,
      score: this._computeUtilityScore(target, a, dist, edge, normDist),
    }));

    scored.forEach(({ atk, score }) => {
      this._bossAiLog(`score ${atk.name}`, { id: atk.id, score: +score.toFixed(1), cd: +(this._attackCooldowns[atk.id] ?? 0).toFixed(2), edge: +edge.toFixed(2), normDist: +normDist.toFixed(2) });
    });

    scored.sort((x, y) => y.score - x.score);
    const temp = 14;
    const weights = scored.map(e => Math.exp(e.score / temp));
    const wSum = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * wSum;
    let chosen = scored[0].atk;
    for (let i = 0; i < scored.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        chosen = scored[i].atk;
        break;
      }
    }

    const wasSame = chosen.id === this._lastAttackId;
    if (wasSame) this._sameAttackCount++;
    else this._sameAttackCount = 0;
    this._lastAttackId = chosen.id;
    this._recentAttackHistory.push(chosen.id);
    if (this._recentAttackHistory.length > 8) this._recentAttackHistory.shift();

    this._attackCooldowns[chosen.id] = chosen.cooldown * this.phase.telegraphMult;

    this.currentAttack = chosen;
    this.stateTimer = (chosen.telegraph * this.phase.telegraphMult) / 1000;
    this.attackDamageDealt = false;
    this._setState(S.TELEGRAPH);

    this._bossAiLog('▶ committed', { attack: chosen.name, id: chosen.id, dmg: chosen.dmg, edge: +edge.toFixed(2), dist: +dist.toFixed(2) });
    if (this.onAttack) this.onAttack({ attack: chosen, telegraphMs: chosen.telegraph * this.phase.telegraphMult });
  }

  _stateTelegraph(delta) {
    const target = this._nearestPlayer();

    // AOE leaping attacks skip commit re-validation — the lunge closes the gap
    const skipRevalidate = this.currentAttack?.aoe === true;

    if (!skipRevalidate && target && this.currentAttack && this.combatWorld &&
        !this._validateAttackCommit(target, this.currentAttack)) {
      this._setState(S.AGGRO);
      this.stateTimer = 0;
      this.currentAttack = null;
      return;
    }
    if (this._animator) this._animator.crossfade('bossIdle', 0.15);
    if (this.stateTimer <= 0) {
      if (!skipRevalidate && target && this.currentAttack && this.combatWorld &&
          !this._validateAttackCommit(target, this.currentAttack)) {
        this._setState(S.AGGRO);
        this.stateTimer = 0;
        this.currentAttack = null;
        return;
      }
      this._setState(S.ATTACK);
      const atk0 = this.currentAttack;
      const anim = atk0?.anim;
      const fallback = atk0?.animDuration ?? 1.12;
      this._attackClipDuration = (this._animator && anim)
        ? (this._animator.getClipDuration(anim) ?? fallback)
        : fallback;
      this.stateTimer = this._attackClipDuration + 0.22;
      this._attackElapsed = 0;
      this._alreadyHitTargets = new WeakSet();
      this._prevWeaponBase = null;
      this._prevWeaponMid = null;
      this._prevWeaponTip = null;
      this._lungeConsumed = 0;
      if (this._animator && atk0 && anim) {
        this._animator.play(anim);
        this._animator.ensureClipLoaded(anim).then(() => {
          const d = this._animator.getClipDuration(anim);
          if (!d || this.state !== S.ATTACK || this.currentAttack?.anim !== anim) return;
          const prev = this._attackClipDuration;
          this._attackClipDuration = d;
          this.stateTimer += Math.max(0, d - prev);
        });
      }
    }
  }

  _validateAttackCommit(target, atk) {
    if (!atk || atk.aoe) return true;
    const commit = this.combatWorld.getMaxCommitEdgeForAttack(atk);
    const edge = this.combatWorld.edgeDistanceXZ(this.group, CAPSULE_BOSS, target.group, CAPSULE_PLAYER);
    if (edge > commit * 0.98) return false;
    if (!this.combatWorld.canBossMeleeConnect(
      this.group, target.group, atk.bladeLength, atk.arcDotMin ?? -0.65, atk,
    )) return false;
    return this._windupReachOk(target, atk);
  }

  /** Synthetic blade line (hand → tip) along facing; must pass near torso before AI commits. */
  _windupReachOk(target, atk) {
    if (!target?.group || atk.aoe) return true;
    const clear = this._bladeToTorsoClearance(target, atk);
    const lim = (atk.windupTorsoClearance ?? 0.58) * BOSS_WORLD_SCALE;
    return clear < lim;
  }

  _bladeToTorsoClearance(target, atk) {
    const s = BOSS_WORLD_SCALE;
    const L = (atk.bladeLength ?? 1.3) * s;
    const ry = this.group.rotation.y;
    const fx = Math.sin(ry);
    const fz = Math.cos(ry);
    const hf = (atk.handForward ?? 0.32) * s;
    const bf = atk.windupBladeFactor ?? 0.76;
    const base = new THREE.Vector3(
      this.group.position.x + fx * (CAPSULE_BOSS.radius + hf),
      this.group.position.y + 1.12 * s,
      this.group.position.z + fz * (CAPSULE_BOSS.radius + hf),
    );
    const tip = new THREE.Vector3(
      base.x + fx * L * bf,
      base.y + 0.04,
      base.z + fz * L * bf,
    );
    const torso = new THREE.Vector3(
      target.group.position.x,
      target.group.position.y + 1.12, // player capsule-relative, not boss scale
      target.group.position.z,
    );
    return this._distancePointToSegment(torso, base, tip);
  }

  _distancePointToSegment(p, a, b) {
    const ab = new THREE.Vector3().subVectors(b, a);
    const t = THREE.MathUtils.clamp(
      new THREE.Vector3().subVectors(p, a).dot(ab) / Math.max(1e-6, ab.lengthSq()),
      0, 1,
    );
    const q = new THREE.Vector3().copy(a).addScaledVector(ab, t);
    return q.distanceTo(p);
  }

  _stateAttack(delta) {
    const atk    = this.currentAttack;
    if (!atk) { this._setState(S.RECOVER); return; }

    const target = this._nearestPlayer();
    if (!target) { this._setState(S.RECOVER); return; }

    this._attackElapsed += delta;

    // Gap closing — jumpSlam sprints aggressively the entire approach window
    if (atk.id === 'jumpSlam' && this.stateTimer > 0.25) {
      this._lockRotation = true;
      this._faceTarget(target, delta * 6);
      this._moveToward(target, delta * 44); // 2x fast aggressive sprint
    } else if (atk.id === 'runStrike' && this.stateTimer > 0.35) {
      this._lockRotation = true;
      this._faceTarget(target, delta * 4);
      this._moveToward(target, delta * 28);
    }

    if (this._isAttackFrameActive(atk)) {
      this._applyAttackRootMotionLunge(atk, target, delta);
      if (atk.aoe) this._traceAoeAgainstPlayers(atk);
      else this._traceWeaponAgainstPlayers(atk, delta);
    } else {
      this._prevWeaponBase = null;
      this._prevWeaponMid = null;
      this._prevWeaponTip = null;
    }

    if (this.stateTimer <= 0) {
      this._setState(S.RECOVER);
      this.stateTimer = 1.0;
    }
  }

  _stateRecover(delta) {
    if (this._animator) this._animator.crossfade('bossIdle', 0.3);
    this._lockRotation = false;
    if (this.stateTimer <= 0) this._setState(S.AGGRO);
  }

  _stateStagger(delta) {
    if (this.stateTimer <= 0) {
      this.posture = 0;
      this._setState(S.AGGRO);
    }
  }

  _stateCrit(delta) {
    if (this.stateTimer <= 0) {
      this._setState(S.AGGRO);
    }
  }

  _setState(s) {
    this.state = s;
    if (s !== S.ATTACK) {
      this._prevWeaponBase = null;
      this._prevWeaponMid = null;
      this._prevWeaponTip = null;
      this._attackElapsed = 0;
    }
  }

  _updatePostureRegen(delta) {
    if (this.state === S.RECOVER || this.state === S.IDLE) {
      this.posture = Math.max(0, this.posture - POSTURE_REGEN * delta);
    }
  }

  _updateProceduralReaction(delta) {
    if (this._pendingHitReaction > 0) {
      this._pendingHitReaction -= delta;
      if (this.state !== S.ATTACK && this.state !== S.TELEGRAPH && this._animator) {
        this._animator.play('bossHit');
      }
    }
    this.balance += (1 - this.balance) * Math.min(1, delta * 1.8);
  }

  _faceTarget(target, delta) {
    if (this._lockRotation && this.state === S.ATTACK && this.stateTimer < 0.42) return;
    const dx   = target.group.position.x - this.group.position.x;
    const dz   = target.group.position.z - this.group.position.z;
    const tgt  = Math.atan2(dx, dz);
    const diff = tgt - this.group.rotation.y;
    this.group.rotation.y += Math.atan2(Math.sin(diff), Math.cos(diff)) * Math.min(1, delta * 5);
  }

  _applyAttackRootMotionLunge(atk, target, delta) {
    const speed = (atk.lungeSpeed ?? 0) * BOSS_WORLD_SCALE;
    const maxDist = (atk.maxLungeDist ?? 0) * BOSS_WORLD_SCALE;
    if (speed <= 0 || maxDist <= 0) return;
    if (this._lungeConsumed >= maxDist) return;
    const step = Math.min(speed * delta, maxDist - this._lungeConsumed);
    const ry = this.group.rotation.y;
    const forward = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    const toP = new THREE.Vector3(
      target.group.position.x - this.group.position.x,
      0,
      target.group.position.z - this.group.position.z,
    );
    if (toP.lengthSq() < 1e-4) return;
    toP.normalize();
    const dir = forward.multiplyScalar(0.72).addScaledVector(toP, 0.28).normalize();
    this.group.position.x += dir.x * step;
    this.group.position.z += dir.z * step;
    this._lungeConsumed += step;
  }

  _moveToward(target, dist) {
    if (!this.combatWorld) return;
    const dx = target.group.position.x - this.group.position.x;
    const dz = target.group.position.z - this.group.position.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    const edge = this.combatWorld.edgeDistanceXZ(this.group, CAPSULE_BOSS, target.group, CAPSULE_PLAYER);
    if (len > 0.05 && edge > 0.18 * BOSS_WORLD_SCALE) {
      this.velocity.x += ((dx / len) * (dist / Math.max(0.001, 1 / 60)) - this.velocity.x) * 0.28;
      this.velocity.z += ((dz / len) * (dist / Math.max(0.001, 1 / 60)) - this.velocity.z) * 0.28;
      this._integrateBody(1 / 60);
    }
  }

  _updateCombatSpacing(target, delta) {
    if (!this.combatWorld) return;
    this._spacingTimer -= delta;
    if (this._spacingTimer <= 0) {
      this._spacingTimer = 1.1 + Math.random() * 0.7;
      this._strafeSign = Math.random() > 0.5 ? 1 : -1;
    }

    const toPlayer = new THREE.Vector3().subVectors(target.group.position, this.group.position);
    const dist = toPlayer.length();
    if (dist < 0.001) return;
    toPlayer.normalize();

    const edge = this.combatWorld.edgeDistanceXZ(this.group, CAPSULE_BOSS, target.group, CAPSULE_PLAYER);
    const refAtk = ATTACKS.find(a => a.id === 'attack2') ?? ATTACKS[2];
    const desiredEdge = this.combatWorld.getIdealStoppingEdgeForAttack(refAtk);
    const commitLimit = this.combatWorld.getMaxCommitEdgeForAttack(refAtk);
    const radialError = edge - desiredEdge;
    const mustClose = edge > commitLimit * 0.94;
    const closeIn = radialError > 0.04 ? 1 : radialError < -0.1 ? -1 : 0;
    const radial = toPlayer.clone().multiplyScalar(THREE.MathUtils.clamp(radialError * 2.2, -1.55, 1.55));
    if (mustClose || closeIn > 0) radial.multiplyScalar(1.65);
    const tangent = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).multiplyScalar(
      this._strafeSign * (mustClose ? 0.35 : closeIn === 0 ? 1.0 : 0.5),
    );

    let speedMul = this.phase.speed;
    if (mustClose) speedMul *= 1.35;

    const desired = radial.add(tangent);
    if (desired.lengthSq() > 0.01) desired.normalize().multiplyScalar(speedMul);
    this.velocity.x += (desired.x - this.velocity.x) * Math.min(1, delta * 8);
    this.velocity.z += (desired.z - this.velocity.z) * Math.min(1, delta * 8);
    this._integrateBody(delta);
  }

  _integrateBody(delta) {
    this.velocity.addScaledVector(this.reactionVelocity, delta);
    this.reactionVelocity.multiplyScalar(Math.exp(-8 * delta));

    this.group.position.x += this.velocity.x * delta;
    this.group.position.z += this.velocity.z * delta;
    this.velocity.multiplyScalar(Math.exp(-5.5 * delta));

  }

  _resolveWeaponBone() {
    if (!this._model) return;
    const candidates = [];
    this._model.traverse(n => {
      const lower = (n.name || '').toLowerCase();
      if (lower.includes('sword') || lower.includes('weapon') || lower.includes('blade') || lower.includes('hand_r')) {
        candidates.push(n);
      }
    });
    const rank = (name) => {
      const s = (name || '').toLowerCase();
      if (s.includes('sword') || s.includes('weapon') || s.includes('blade')) return 0;
      if (s.includes('hand_r')) return 2;
      return 1;
    };
    candidates.sort((a, b) => rank(a.name) - rank(b.name));
    this._weaponSource = candidates[0] ?? this._model;
  }

  _resolveFootBones() {
    if (!this._model) return;
    this._model.traverse(n => {
      if (!n.isBone) return;
      const lower = (n.name || '').toLowerCase();
      if (!this._leftFootBone && (lower.includes('foot_l') || lower.includes('leftfoot') || lower.includes('left_foot'))) {
        this._leftFootBone = n;
      }
      if (!this._rightFootBone && (lower.includes('foot_r') || lower.includes('rightfoot') || lower.includes('right_foot'))) {
        this._rightFootBone = n;
      }
    });
    if (this._leftFootBone) this._leftFootBaseLocal = this._leftFootBone.position.clone();
    if (this._rightFootBone) this._rightFootBaseLocal = this._rightFootBone.position.clone();
  }

  _updateFootIK(delta) {
    if (!this._leftFootBone || !this._rightFootBone) {
      this._footPelvisAdjust += (0 - this._footPelvisAdjust) * Math.min(1, delta * 8);
      return;
    }
    if (this._groundColliders.length === 0) {
      this.scene.traverse(o => {
        if (!o.isMesh) return;
        const t = o.geometry?.type;
        if (o.name === 'floor' || t === 'PlaneGeometry' || t === 'BoxGeometry' || t === 'CylinderGeometry') {
          this._groundColliders.push(o);
        }
      });
    }
    const leftOffset = this._solveFootBoneToGround(this._leftFootBone, this._leftFootBaseLocal);
    const rightOffset = this._solveFootBoneToGround(this._rightFootBone, this._rightFootBaseLocal);
    const desiredPelvis = Math.min(0, Math.min(leftOffset, rightOffset)) * 0.45;
    this._footPelvisAdjust += (desiredPelvis - this._footPelvisAdjust) * Math.min(1, delta * 8);
  }

  _solveFootBoneToGround(footBone, baseLocal) {
    if (!footBone || !baseLocal) return 0;
    footBone.position.copy(baseLocal);
    footBone.getWorldPosition(this._footTmp);
    this._footTmp2.copy(this._footTmp);
    this._footTmp2.y += 0.5;
    this._footRay.set(this._footTmp2, new THREE.Vector3(0, -1, 0));
    this._footRay.far = 1.6;
    const hits = this._footRay.intersectObjects(this._groundColliders, false);
    if (hits.length === 0) return 0;

    const targetY = hits[0].point.y + 0.015;
    const worldLift = targetY - this._footTmp.y;
    const parent = footBone.parent;
    if (!parent) return worldLift;
    const parentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(parent.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const localLift = worldLift / Math.max(0.2, parentUp.y);
    footBone.position.y += THREE.MathUtils.clamp(localLift, -0.16, 0.24);
    return worldLift;
  }

  _buildWeaponSegment(atk) {
    const s = BOSS_WORLD_SCALE;
    const L = (atk.bladeLength ?? 1.3) * s;
    const target = this._nearestPlayer();
    if (!this._weaponSource) {
      const forward = new THREE.Vector3(Math.sin(this.group.rotation.y), 0.06, Math.cos(this.group.rotation.y)).normalize();
      this._weaponBase.copy(this.group.position).add(new THREE.Vector3(0, 1.3 * s, 0)).addScaledVector(forward, 0.35 * s);
      if (target) {
        const toT = this._bladeCand.subVectors(target.group.position, this._weaponBase);
        toT.y *= 0.45;
        if (toT.lengthSq() > 1e-5) toT.normalize();
        else toT.copy(forward);
        this._weaponTip.copy(this._weaponBase).addScaledVector(toT, L);
      } else {
        this._weaponTip.copy(this._weaponBase).addScaledVector(forward, L);
      }
      this._weaponMid.lerpVectors(this._weaponBase, this._weaponTip, 0.5);
      return;
    }
    this._weaponSource.getWorldPosition(this._weaponBase);
    const q = this._weaponSource.getWorldQuaternion(new THREE.Quaternion());
    const handR = new THREE.Vector3(0.08 * s, 0, 0).applyQuaternion(q);
    this._weaponBase.add(handR);

    const tx = target ? target.group.position.x : this.group.position.x + Math.sin(this.group.rotation.y);
    const ty = target ? target.group.position.y + 1.05 : this.group.position.y + 1.12;
    const tz = target ? target.group.position.z : this.group.position.z + Math.cos(this.group.rotation.y);
    this._bladeTargetPt.set(tx, ty, tz);

    let bestScore = -Infinity;
    this._bestBladeDir.copy(BLADE_DIR_LOCALS[0]).applyQuaternion(q).normalize();
    for (let i = 0; i < BLADE_DIR_LOCALS.length; i++) {
      const dir = this._bladeCand.copy(BLADE_DIR_LOCALS[i]).applyQuaternion(q).normalize();
      if (dir.lengthSq() < 1e-4) continue;
      this._bladeTipCand.copy(this._weaponBase).addScaledVector(dir, L);
      const horiz = Math.hypot(this._bladeTipCand.x - tx, this._bladeTipCand.z - tz);
      const vert = Math.abs(this._bladeTipCand.y - ty);
      const score = -horiz - vert * 0.35;
      if (score > bestScore) {
        bestScore = score;
        this._bestBladeDir.copy(dir);
      }
    }
    this._weaponTip.copy(this._weaponBase).addScaledVector(this._bestBladeDir, L);
    this._weaponMid.lerpVectors(this._weaponBase, this._weaponTip, 0.5);
  }

  _isAttackFrameActive(atk) {
    if (!atk) return false;
    const dur = Math.max(0.04, this._attackClipDuration || atk.animDuration || 1.0);
    const normalized = Math.min(1, this._attackElapsed / dur);
    return normalized >= atk.activeStart && normalized <= atk.activeEnd;
  }

  _traceWeaponAgainstPlayers(atk, delta) {
    this._buildWeaponSegment(atk);
    if (!this._prevWeaponBase || !this._prevWeaponTip || !this._prevWeaponMid) {
      this._prevWeaponBase = this._weaponBase.clone();
      this._prevWeaponMid = this._weaponMid.clone();
      this._prevWeaponTip = this._weaponTip.clone();
      return;
    }

    this._clearDebugTraces();

    const traceA = new THREE.Vector3();
    const traceB = new THREE.Vector3();
    const samples = Math.max(this._weaponTraceSamples, 14);
    const bladeSpans = [
      [this._prevWeaponBase, this._prevWeaponMid, this._weaponBase, this._weaponMid],
      [this._prevWeaponMid, this._prevWeaponTip, this._weaponMid, this._weaponTip],
    ];
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      let hitRegistered = false;
      for (const [pa0, pa1, pb0, pb1] of bladeSpans) {
        traceA.lerpVectors(pa0, pa1, t);
        traceB.lerpVectors(pb0, pb1, t);
        if (this.combatWorld?.segmentBlockedByAnyPillar(traceA, traceB)) {
          this._drawDebugSegment(traceA, traceB, 0xffcc00);
          continue;
        }

        for (const target of this.players) {
          if (!target?.isAlive || this._alreadyHitTargets.has(target)) continue;
          if (!this._isTargetInsideArc(target, atk)) continue;
          if (!this._isTargetDistanceValid(target, atk)) continue;

          const hurtRegions = typeof target.getHitRegions === 'function' ? target.getHitRegions() : [];
          for (const region of hurtRegions) {
            const closest = this._closestPointOnSegment(region.center, traceA, traceB);
            const hitTol = region.radius + this._bladeHitThickness;
            if (closest.distanceTo(region.center) > hitTol) continue;
            if (this._isObstructed(traceA, closest)) continue;

            const damage = Math.round(atk.dmg * (region.damageMult ?? 1));
            if (!target.hasIframes) {
              target.takeDamage(damage);
            }
            this._alreadyHitTargets.add(target);
            this.attackDamageDealt = true;
            hitRegistered = true;
            this._drawDebugSegment(traceA, traceB, 0x22ff22, closest);
            if (atk.aoe && this.onScreenShake) this.onScreenShake();
            break;
          }
          if (hitRegistered) break;
        }
        if (hitRegistered) break;
      }

      if (!hitRegistered) {
        traceA.lerpVectors(this._prevWeaponBase, this._prevWeaponTip, t);
        traceB.lerpVectors(this._weaponBase, this._weaponTip, t);
        if (!this.combatWorld?.segmentBlockedByAnyPillar(traceA, traceB)) {
          this._drawDebugSegment(traceA, traceB, 0xff3333);
        }
      }
    }

    this._prevWeaponBase.copy(this._weaponBase);
    this._prevWeaponMid.copy(this._weaponMid);
    this._prevWeaponTip.copy(this._weaponTip);
  }

  /** Ground / shockwave hits: active frames only, horizontal reach from boss root. */
  _traceAoeAgainstPlayers(atk) {
    const R = (atk.aoeRadius ?? 2.65) * BOSS_WORLD_SCALE;
    const bossX = this.group.position.x;
    const bossZ = this.group.position.z;
    const bossY = this.group.position.y;
    const bossProbe = this._footTmp.set(bossX, bossY + 0.2, bossZ);

    if (this._debugEnabled) this._clearDebugTraces();

    for (const target of this.players) {
      if (!target?.isAlive || this._alreadyHitTargets.has(target)) continue;
      if (!this._isTargetInsideArc(target, atk)) continue;

      const px = target.group.position.x;
      const pz = target.group.position.z;
      const horiz = Math.hypot(px - bossX, pz - bossZ);
      if (horiz > R + CAPSULE_PLAYER.radius * 0.92) continue;

      const targetProbe = this._footTmp2.set(px, bossY + 0.2, pz);
      if (this.combatWorld?.segmentBlockedByAnyPillar(bossProbe, targetProbe)) continue;

      const hurtRegions = typeof target.getHitRegions === 'function' ? target.getHitRegions() : [];
      let registered = false;
      for (const region of hurtRegions) {
        const rdx = region.center.x - bossX;
        const rdz = region.center.z - bossZ;
        if (Math.hypot(rdx, rdz) > R + region.radius + 0.08) continue;
        if (region.center.y < bossY - 0.35 || region.center.y > bossY + 4.2) continue;

        const damage = Math.round(atk.dmg * (region.damageMult ?? 1));
        if (!target.hasIframes) {
          target.takeDamage(damage);
        }
        this._alreadyHitTargets.add(target);
        this.attackDamageDealt = true;
        registered = true;
        if (this._debugEnabled) {
          this._drawDebugSegment(bossProbe, region.center, 0x22ff22, region.center);
        }
        if (this.onScreenShake) this.onScreenShake();
        break;
      }
      if (!registered && this._debugEnabled) {
        this._drawDebugSegment(bossProbe, targetProbe, 0xff3333);
      }
    }

    if (this._debugEnabled && atk.aoe) {
      const segs = 48;
      for (let i = 0; i < segs; i++) {
        const t0 = (i / segs) * Math.PI * 2;
        const t1 = ((i + 1) / segs) * Math.PI * 2;
        const a = this._bladeCand.set(bossX + Math.cos(t0) * R, 0.08, bossZ + Math.sin(t0) * R);
        const b = this._bladeTipCand.set(bossX + Math.cos(t1) * R, 0.08, bossZ + Math.sin(t1) * R);
        this._drawDebugSegment(a, b, 0xffcc00);
      }
    }
  }

  _isTargetInsideArc(target, atk) {
    const toTarget = new THREE.Vector3().subVectors(target.group.position, this.group.position).normalize();
    const forward = new THREE.Vector3(Math.sin(this.group.rotation.y), 0, Math.cos(this.group.rotation.y)).normalize();
    return forward.dot(toTarget) >= (atk.arcDotMin ?? -0.4);
  }

  _isTargetDistanceValid(target, atk) {
    if (!this.combatWorld) return true;
    const commit = this.combatWorld.getMaxCommitEdgeForAttack(atk);
    const edge = this.combatWorld.edgeDistanceXZ(this.group, CAPSULE_BOSS, target.group, CAPSULE_PLAYER);
    const lungeHeadroom = (atk.lungeSpeed > 0 ? (atk.maxLungeDist ?? 0) * 0.35 : 0);
    return edge <= commit * 1.08 + lungeHeadroom;
  }

  _isObstructed(from, to) {
    if (!this.combatWorld) return false;
    return this.combatWorld.losBlockedByPillar(from, to);
  }

  _closestPointOnSegment(point, a, b) {
    const ab = new THREE.Vector3().subVectors(b, a);
    const t = Math.max(0, Math.min(1, new THREE.Vector3().subVectors(point, a).dot(ab) / Math.max(1e-5, ab.lengthSq())));
    return new THREE.Vector3().copy(a).addScaledVector(ab, t);
  }

  _clearDebugTraces() {
    if (!this._debugEnabled) return;
    while (this._debugTraceGroup.children.length) {
      this._debugTraceGroup.remove(this._debugTraceGroup.children[0]);
    }
  }

  _drawDebugSegment(a, b, color, point = null) {
    if (!this._debugEnabled) return;
    const g = new THREE.BufferGeometry().setFromPoints([a, b]);
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(g, m);
    this._debugTraceGroup.add(line);
    if (point) {
      const s = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffff66 })
      );
      s.position.copy(point);
      this._debugTraceGroup.add(s);
    }
  }

  _updateFootGroundContact(delta) {
    if (!this._model) return;
    this._footSnapTimer -= delta;
    if (this._footSnapTimer > 0) return;
    this._footSnapTimer = 0.05;

    this._footSnapBox.setFromObject(this._model);
    const footWorldMinY = this._footSnapBox.min.y;
    const targetMinY = this.group.position.y + 0.005;
    const correction = targetMinY - footWorldMinY;
    this._footContactOffset += (correction - this._footContactOffset) * 0.45;
    this._model.position.y = (this._baseModelY ?? 0) + this._footContactOffset + this._footPelvisAdjust;
  }

  _nearestPlayer() {
    let nearest = null, bestDist = Infinity;
    for (const p of this.players) {
      if (!p.isAlive) continue;
      const d = this.group.position.distanceTo(p.group.position);
      if (d < bestDist) { bestDist = d; nearest = p; }
    }
    return nearest;
  }

  _updateTelegraph() {
    if (this.state === S.TELEGRAPH && this.currentAttack && this.combatWorld) {
      this._ring.position.copy(this.group.position);
      this._ring.position.y = 0.05;
      this._ring.material.opacity = 0.7 + Math.sin(Date.now() * 0.01) * 0.3;

      const commit = this.combatWorld.getMaxCommitEdgeForAttack(this.currentAttack);
      this._ring.scale.setScalar(Math.max(0.35, commit * 2.15));

      const target = this._nearestPlayer();
      if (target) {
        const edge = this.combatWorld.edgeDistanceXZ(this.group, CAPSULE_BOSS, target.group, CAPSULE_PLAYER);
        const ok = edge <= commit * 1.02;
        this._ring.material.color.setHex(ok ? 0x22ff44 : 0xff4422);
      } else {
        this._ring.material.color.setHex(0xff4422);
      }
    } else {
      this._ring.material.opacity = 0;
    }
  }

  // ─── Damage API ────────────────────────────────────────────────────────────
  takeDamage(amount, isParried = false) {
    if (!this.isAlive) return;

    this.hp = Math.max(0, this.hp - amount);

    if (isParried) {
      this.posture += 30;
    } else {
      this.posture += amount * 0.3;
    }

    // Flash
    this._model?.traverse(c => {
      if (c.isMesh && c.material?.emissive) {
        c.material.emissive.set(0xff0000);
        c.material.emissiveIntensity = 2.0;
        setTimeout(() => {
          if (c.material?.emissive) {
            c.material.emissive.set(this.isEnraged ? 0xff0000 : 0x440000);
            c.material.emissiveIntensity = this.isEnraged ? 0.8 : 0.4;
          }
        }, 120);
      }
    });

    if (this.hp <= 0) {
      this._die();
      return;
    }

    // ── Tiered hit reaction based on damage
    const hitAnim = amount >= 45 ? 'bossHitHeavy'
                  : amount >= 22 ? 'bossHitMed'
                  : 'bossHit';

    // Stagger check (posture break)
    if (this.posture >= this.maxPosture) {
      this.state = S.STAGGER;
      this.stateTimer = 2.5;
      this.posture = 0;
      if (this._animator) this._animator.play('bossHitHeavy');
      if (this.onStagger) this.onStagger();
    } else if (this.state !== S.ATTACK && this.state !== S.TELEGRAPH) {
      if (this._animator) this._animator.play(hitAnim);
    }
  }

  _die() {
    this.isAlive = false;
    this.state   = S.DEAD;
    this._ring.material.opacity = 0;
    // ── Random death animation
    const deathAnim = Math.random() < 0.5 ? 'bossDeath' : 'bossDeath2';
    if (this._animator) this._animator.play(deathAnim);
    if (this.onDeath) this.onDeath();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────
  getHitRegions() {
    const s = BOSS_WORLD_SCALE;
    const base = this.group.position.clone();
    return [
      { name: 'head', center: base.clone().add(new THREE.Vector3(0, 1.75 * s, 0)), radius: 0.32 * s, damageMult: 1.35, postureMult: 1.4 },
      { name: 'torso', center: base.clone().add(new THREE.Vector3(0, 1.15 * s, 0)), radius: 0.58 * s, damageMult: 1.0, postureMult: 1.0 },
      { name: 'leg', center: base.clone().add(new THREE.Vector3(0, 0.62 * s, 0)), radius: 0.46 * s, damageMult: 0.82, postureMult: 0.7 },
    ];
  }

  applyHit(hit) {
    if (!this.isAlive) return;
    const postureBonus = hit.attackWeight * 12 * (hit.region === 'head' ? 1.35 : 1);
    this.posture += postureBonus;

    const directionalForce = hit.attackDirection.clone().multiplyScalar(2.2 * hit.attackWeight);
    this.reactionVelocity.add(directionalForce);
    this.balance = Math.max(0, this.balance - 0.18 * hit.attackWeight);
    this._pendingHitReaction = 0.15 + 0.08 * hit.attackWeight;

    this.group.rotation.y += Math.atan2(hit.attackDirection.x, hit.attackDirection.z) * 0.06;
    this.takeDamage(hit.damage, false);
  }

  getSnapshot() {
    return {
      hp:         this.hp,
      maxHp:      this.maxHp,
      posture:    this.posture,
      maxPosture: this.maxPosture,
      isAlive:    this.isAlive,
      phase:      this.phaseNum,
    };
  }
}
