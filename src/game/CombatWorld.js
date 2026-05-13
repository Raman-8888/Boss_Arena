import * as THREE from 'three';

/** Pillar centers must match `arena.js` _buildPillars() */
const PILLAR_POSITIONS = [
  [-12, -12], [12, -12], [-12, 12], [12, 12],
  [-17, 0], [17, 0], [0, -17], [0, 17],
];
/** Visual cylinder: radius 0.6 top / 0.85 bottom — use conservative blocking radius */
const PILLAR_RADIUS = 0.92;
/** Match legacy arena clamp; capsule center must stay inside so feet stay in arena */
export const ARENA_EDGE = 18.5;

export const CAPSULE_PLAYER = { radius: 0.38, height: 1.85, yOffset: 0.92 };

/** Uniform scale for the mutant boss mesh + combat capsule + reach tuning. */
export const BOSS_WORLD_SCALE = 2;
const _BOSS_CAP = { radius: 0.62, height: 2.35, yOffset: 1.12 };
export const CAPSULE_BOSS = {
  radius:  _BOSS_CAP.radius  * BOSS_WORLD_SCALE,
  height:  _BOSS_CAP.height * BOSS_WORLD_SCALE,
  yOffset: _BOSS_CAP.yOffset * BOSS_WORLD_SCALE,
};

/**
 * Soulslike arena collision: upright capsules (XZ circles) + static cylinders + wall slabs.
 */
export class CombatWorld {
  constructor(scene) {
    this.scene = scene;
    this.pillars = PILLAR_POSITIONS.map(([x, z]) => ({
      x, z, r: PILLAR_RADIUS, yMin: 0, yMax: 8,
    }));
    this.debugGroup = new THREE.Group();
    this.debugGroup.name = 'combatWorldDebug';
    scene.add(this.debugGroup);
    this.hurtDebugGroup = new THREE.Group();
    this.hurtDebugGroup.name = 'playerHurtDebug';
    scene.add(this.hurtDebugGroup);
    this.debugEnabled = false;
    this._playerMesh = null;
    this._bossMesh = null;
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
  }

  setDebug(enabled) {
    this.debugEnabled = !!enabled;
    this.debugGroup.visible = this.debugEnabled;
    this.hurtDebugGroup.visible = this.debugEnabled;
    while (this.debugGroup.children.length) {
      this.debugGroup.remove(this.debugGroup.children[0]);
    }
    while (this.hurtDebugGroup.children.length) {
      const ch = this.hurtDebugGroup.children[0];
      this.hurtDebugGroup.remove(ch);
      ch.geometry?.dispose();
      ch.material?.dispose();
    }
    if (!this.debugEnabled) return;
    this._drawCapsuleWire(0x00ff88, CAPSULE_PLAYER.radius, CAPSULE_PLAYER.height);
    this._drawCapsuleWire(0xff8844, CAPSULE_BOSS.radius, CAPSULE_BOSS.height);
    for (const p of this.pillars) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(p.r - 0.02, p.r + 0.02, 32),
        new THREE.MeshBasicMaterial({ color: 0xffee00, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.x, 0.04, p.z);
      this.debugGroup.add(ring);
    }
  }

  _drawCapsuleWire(color, radius, height) {
    const g = new THREE.CylinderGeometry(radius, radius, height, 16, 1, true);
    const m = new THREE.MeshBasicMaterial({
      color, wireframe: true, transparent: true, opacity: 0.35, depthTest: true,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.name = 'debugCapsule';
    this.debugGroup.add(mesh);
  }

  _updateDebugMeshes(player, boss) {
    if (!this.debugEnabled) return;
    const children = this.debugGroup.children.filter(c => c.name === 'debugCapsule');
    if (children[0] && player) {
      children[0].position.copy(player.group.position);
      children[0].position.y = CAPSULE_PLAYER.yOffset;
    }
    if (children[1] && boss) {
      children[1].position.copy(boss.group.position);
      children[1].position.y = CAPSULE_BOSS.yOffset;
    }
  }

  /** Edge-to-edge horizontal distance between two character capsules (centers on XZ). */
  edgeDistanceXZ(aGroup, capA, bGroup, capB) {
    const dx = aGroup.position.x - bGroup.position.x;
    const dz = aGroup.position.z - bGroup.position.z;
    const centerDist = Math.hypot(dx, dz);
    return Math.max(0, centerDist - capA.radius - capB.radius);
  }

  /**
   * Legacy name — now uses REAL melee reach: surface gap the blade+arm+committed motion can bridge.
   * Capsule radii are NOT added again; `edge` is already hull-to-hull clearance on XZ.
   */
  maxWeaponReachWorld(bladeLength) {
    return this.getMaxCommitEdgeForStats(bladeLength, 0.28, 0.48) * BOSS_WORLD_SCALE;
  }

  /**
   * Max hull-to-hull edge distance where a slash can still connect (conservative arc, not full thrust).
   * Tuned so the boss must close to sword-contact distance — not “orange ring” fantasy range.
   */
  getMaxCommitEdgeForStats(bladeLength, forwardMotion = 0.28, bladeFactor = 0.48) {
    const arm = 0.26;
    const contact = 0.04;
    return arm + bladeLength * bladeFactor + forwardMotion + contact;
  }

  /** Per-attack commit edge from attack definition (see BossAI ATTACKS). */
  getMaxCommitEdgeForAttack(atk) {
    if (!atk) return 0.85 * BOSS_WORLD_SCALE;
    if (typeof atk.maxCommitEdge === 'number') return atk.maxCommitEdge * BOSS_WORLD_SCALE;
    const motion = atk.forwardRootMotion ?? 0.28;
    const bf = atk.bladeReachFactor ?? 0.52;
    return this.getMaxCommitEdgeForStats(atk.bladeLength ?? 1.5, motion, bf) * BOSS_WORLD_SCALE;
  }

  getIdealStoppingEdgeForAttack(atk) {
    if (atk?.idealStoppingEdge != null) return atk.idealStoppingEdge * BOSS_WORLD_SCALE;
    const b = atk?.bladeLength ?? 1.5;
    return THREE.MathUtils.clamp(0.14 + b * 0.12, 0.22, 0.55) * BOSS_WORLD_SCALE;
  }

  /** True if swing can plausibly connect (edge distance vs weapon reach). */
  canBossMeleeConnect(bossGroup, playerGroup, bladeLength, arcDotMin = -0.45, atk = null) {
    const edge = this.edgeDistanceXZ(bossGroup, CAPSULE_BOSS, playerGroup, CAPSULE_PLAYER);
    const reach = atk
      ? this.getMaxCommitEdgeForAttack(atk)
      : this.getMaxCommitEdgeForStats(bladeLength, 0.28, 0.48) * BOSS_WORLD_SCALE;
    if (edge > reach) return false;
    const toPlayer = this._tmp.set(
      playerGroup.position.x - bossGroup.position.x,
      0,
      playerGroup.position.z - bossGroup.position.z,
    );
    const tlen = Math.hypot(toPlayer.x, toPlayer.z);
    if (tlen < 1e-5) return true;
    toPlayer.multiplyScalar(1 / tlen);
    const forward = this._tmp2.set(
      Math.sin(bossGroup.rotation.y),
      0,
      Math.cos(bossGroup.rotation.y),
    ).normalize();
    return forward.dot(toPlayer) >= arcDotMin;
  }

  /** Line segment vs cylinder (XZ), Y ignored for blocking weapon horizontally. */
  segmentBlockedByPillar(ax, az, bx, bz, pillar) {
    const samples = 8;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const px = ax + (bx - ax) * t;
      const pz = az + (bz - az) * t;
      const dx = px - pillar.x;
      const dz = pz - pillar.z;
      if (dx * dx + dz * dz < pillar.r * pillar.r) return true;
    }
    return false;
  }

  segmentBlockedByAnyPillar(a, b) {
    for (const p of this.pillars) {
      if (this.segmentBlockedByPillar(a.x, a.z, b.x, b.z, p)) return true;
    }
    return false;
  }

  /** Ray from `from` toward `to` blocked by pillar (not floor). */
  losBlockedByPillar(from, to) {
    return this.segmentBlockedByAnyPillar(from, to);
  }

  /**
   * Push (x,z) out of static cylinders and wall planes. Mutates outVec {x,z}.
   */
  resolveStatics(x, z, radius) {
    let cx = x;
    let cz = z;
    for (const p of this.pillars) {
      const dx = cx - p.x;
      const dz = cz - p.z;
      const d = Math.hypot(dx, dz);
      const minD = p.r + radius + 0.02;
      if (d < minD && d > 1e-6) {
        const push = (minD - d) / d;
        cx += dx * push;
        cz += dz * push;
      }
    }
    const limit = ARENA_EDGE - radius;
    if (cx > limit) cx = limit;
    if (cx < -limit) cx = -limit;
    if (cz > limit) cz = limit;
    if (cz < -limit) cz = -limit;
    return { x: cx, z: cz };
  }

  /**
   * Separate two capsules on XZ; returns position corrections for A and B (add to positions).
   */
  resolvePair(posAx, posAz, rA, posBx, posBz, rB, penetrationSlop = 0.02) {
    const dx = posBx - posAx;
    const dz = posBz - posAz;
    const dist = Math.hypot(dx, dz);
    const minDist = rA + rB + penetrationSlop;
    if (dist >= minDist) {
      return { pushAx: 0, pushAz: 0, pushBx: 0, pushBz: 0 };
    }
    let nx = 1;
    let nz = 0;
    if (dist >= 1e-8) {
      nx = dx / dist;
      nz = dz / dist;
    }
    const overlap = minDist - dist;
    const half = overlap * 0.5;
    return {
      pushAx: -nx * half,
      pushAz: -nz * half,
      pushBx: nx * half,
      pushBz: nz * half,
    };
  }

  /**
   * Full resolve for player after integration. Mutates player.group.position x,z.
   */
  resolvePlayer(player, boss) {
    if (!player?.isAlive) return;
    let x = player.group.position.x;
    let z = player.group.position.z;
    const r = CAPSULE_PLAYER.radius;
    for (let iter = 0; iter < 4; iter++) {
      const s = this.resolveStatics(x, z, r);
      x = s.x;
      z = s.z;
      if (boss?.isAlive) {
        const pair = this.resolvePair(
          x, z, r,
          boss.group.position.x, boss.group.position.z, CAPSULE_BOSS.radius,
        );
        x += pair.pushAx;
        z += pair.pushAz;
        boss.group.position.x += pair.pushBx;
        boss.group.position.z += pair.pushBz;
      }
    }
    player.group.position.x = x;
    player.group.position.z = z;
  }

  /**
   * Resolve boss vs static + player. Call after boss integrates velocity.
   */
  resolveBoss(boss, player) {
    if (!boss?.isAlive) return;
    let x = boss.group.position.x;
    let z = boss.group.position.z;
    const r = CAPSULE_BOSS.radius;
    for (let iter = 0; iter < 4; iter++) {
      const s = this.resolveStatics(x, z, r);
      x = s.x;
      z = s.z;
      if (player?.isAlive) {
        const pair = this.resolvePair(
          x, z, r,
          player.group.position.x, player.group.position.z, CAPSULE_PLAYER.radius,
        );
        x += pair.pushAx;
        z += pair.pushAz;
        player.group.position.x += pair.pushBx;
        player.group.position.z += pair.pushBz;
      }
    }
    boss.group.position.x = x;
    boss.group.position.z = z;
  }

  /** Optional: call each frame to refresh debug capsule positions */
  syncDebug(player, boss) {
    this._updateDebugMeshes(player, boss);
    this._updateHurtDebug(player);
  }

  _updateHurtDebug(player) {
    while (this.hurtDebugGroup.children.length) {
      const ch = this.hurtDebugGroup.children[0];
      this.hurtDebugGroup.remove(ch);
      ch.geometry?.dispose();
      ch.material?.dispose();
    }
    if (!this.debugEnabled || !player?.isAlive || typeof player.getHitRegions !== 'function') return;
    for (const r of player.getHitRegions()) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(r.radius, 14, 14),
        new THREE.MeshBasicMaterial({
          color: 0x55ccff,
          wireframe: true,
          transparent: true,
          opacity: 0.42,
          depthTest: true,
        }),
      );
      mesh.position.copy(r.center);
      this.hurtDebugGroup.add(mesh);
    }
  }
}
