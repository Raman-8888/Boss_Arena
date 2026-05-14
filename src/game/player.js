import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CharacterAnimator, loadGLTF } from './AnimationManager.js';
import { soundManager } from './SoundManager.js';

// ─── Constants ──────────────────────────────────────────────────────────────
const MAX_HP         = 100;
const MAX_STAMINA    = 100;
const STAMINA_REGEN  = 18;
const MOVE_SPEED     = 5;
const RUN_SPEED      = 7.7;
const GROUND_ACCEL   = 34;
const GROUND_DECEL   = 26;
const AIR_CONTROL    = 0.35;
const TURN_RESPONSE  = 8.5;
const ROT_INERTIA    = 10.0;
const DODGE_SPEED    = 16;
const DODGE_DURATION = 0.65;
const IFRAME_DURATION= 0.4;
const PARRY_WINDOW   = 0.28;
const GRAVITY        = -30;
const JUMP_FORCE     = 12;
// ─── Asset Paths ────────────────────────────────────────────────────────────
export const HERO_MODEL = '/assets/hero/character/Paladin WProp J Nordstrom.glb';

export const HERO_ANIMS = {
  // ── Locomotion
  idle:           '/assets/hero/animations/sword and shield idle.glb',
  idleAlt:        '/assets/hero/animations/sword and shield idle (2).glb',
  walk:           '/assets/hero/animations/sword and shield walk.glb',
  run:            '/assets/hero/animations/sword and shield run.glb',
  // ── Blocking locomotion
  block:          '/assets/hero/animations/sword and shield block idle.glb',
  blockWalkFwd:   '/assets/hero/animations/sword and shield walk.glb',
  blockWalkBack:  '/assets/hero/animations/sword and shield walk (2).glb',
  blockStrafeL:   '/assets/hero/animations/sword and shield strafe (2).glb',
  blockStrafeR:   '/assets/hero/animations/sword and shield strafe.glb',
  blockHit:       '/assets/hero/animations/sword and shield block.glb',
  // ── Turn-in-place
  turnLeft:       '/assets/hero/animations/sword and shield turn (2).glb',
  turnRight:      '/assets/hero/animations/sword and shield turn.glb',
  // ── Attacks
  attackLight:    '/assets/hero/animations/sword and shield attack (2).glb',   // HIGH dmg
  attackHeavy:    '/assets/hero/animations/sword and shield slash (2).glb',    // HIGH dmg
  attackCombo:    '/assets/hero/animations/sword and shield attack (3).glb',   // MEDIUM dmg
  // ── Evasion
  dodge:          '/assets/hero/animations/sword and shield crouching.glb',
  jump:           '/assets/hero/animations/sword and shield jump.glb',
  kick:           '/assets/hero/animations/sword and shield kick.glb',
  // ── Damage reactions (tiered)
  hitLight:       '/assets/hero/animations/sword and shield impact.glb',
  hitMedium:      '/assets/hero/animations/sword and shield impact (2).glb',
  hitHeavy:       '/assets/hero/animations/sword and shield impact (3).glb',
  // ── Death (randomised)
  death:          '/assets/hero/animations/sword and shield death.glb',
  death2:         '/assets/hero/animations/sword and shield death (2).glb',
  // ── Cinematic
  intro:          '/assets/hero/animations/sheath sword 2.glb',
  victory:        '/assets/hero/animations/sword and shield casting.glb',
};

// ─── Attack definitions (damage hierarchy: light≈heavy HIGH > combo MEDIUM)
const ATTACKS = {
  // HIGH damage — strongest stagger, heavier cam shake, longer recovery
  light: { damage: 55, staminaCost: 18, duration: 0.65, cooldown: 0.55, anim: 'attackLight', traceStart: 0.22, traceEnd: 0.72, weight: 1.6, shakeStrength: 0.55, staggerForce: 'high'   },
  heavy: { damage: 60, staminaCost: 35, duration: 0.80, cooldown: 1.0,  anim: 'attackHeavy', traceStart: 0.28, traceEnd: 0.84, weight: 1.8, shakeStrength: 0.70, staggerForce: 'high'   },
  // MEDIUM damage — faster, versatile combo attack
  combo: { damage: 28, staminaCost: 14, duration: 0.50, cooldown: 0.40, anim: 'attackCombo', traceStart: 0.18, traceEnd: 0.62, weight: 1.0, shakeStrength: 0.30, staggerForce: 'medium' },
  parry: { damage: 0,  staminaCost: 10, duration: 0.25, cooldown: 0.6,  anim: 'block' },
};

export class Player {
  constructor(scene, camera, id = 'p1') {
    this.scene  = scene;
    this.camera = camera;
    this.id     = id;

    // ── Stats
    this.hp         = MAX_HP;
    this.maxHp      = MAX_HP;
    this.stamina    = MAX_STAMINA;
    this.maxStamina = MAX_STAMINA;
    this.isAlive    = true;
    this.isDowned   = false;

    // ── Physics State
    this.velocity    = new THREE.Vector3();
    this.moveDir     = new THREE.Vector3();
    this.isGrounded  = true;
    this.isDodging   = false;
    this.hasIframes  = false;
    this.isBlocking  = false;

    // ── Combat State
    this.isAttacking    = false;
    this.isParrying     = false;
    this.currentAttack  = null;
    this.attackTimer    = 0;
    this.attackCooldown = 0;
    this.dodgeTimer     = 0;
    this.iframeTimer    = 0;

    // ── Cinematic / intro
    this._introPlaying  = false;
    this._introDone     = false;
    this._turnDir       = 0;   // -1 left, 0 none, 1 right
    this._prevRotY      = 0;

    // ── Dodge vector
    this.dodgeDir = new THREE.Vector3();
    this._desiredVelocity = new THREE.Vector3();
    this._groundNormal = new THREE.Vector3(0, 1, 0);
    this._smoothedGroundY = 0;
    this._groundRay = new THREE.Raycaster();
    this._groundProbeOrigin = new THREE.Vector3();
    this._footOffsetL = 0;
    this._footOffsetR = 0;
    this._bodyTilt = new THREE.Euler();
    this._turnVelocity = 0;
    this._lookDir = new THREE.Vector3(0, 0, 1);
    this._colliders = [];

    // ── Camera (Souls-style free orbit)
    this.cameraYaw    = Math.PI;
    this.cameraPitch  = 0.25;
    this._targetYaw   = Math.PI;
    this._targetPitch = 0.25;
    this._mouseSensitivity = 0.0022;
    this._lastMouseMove    = 0;
    this.isPointerLocked   = false;

    // Cached camera vectors (zero GC)
    this._camLookTarget = new THREE.Vector3();
    this._camPosTarget  = new THREE.Vector3();
    this._shoulderRight  = 0.65;
    this._lookHeadHeight = 1.5;
    this._camRaycaster   = new THREE.Raycaster();
    this._camColliders   = [];

    // ── Input
    this.keys = {};

    // ── Animation
    this._animator    = null;
    this._animState   = 'idle';

    // ── Scene group
    this.group = new THREE.Group();
    this.group.position.set(0, 0, 6);
    this.group.rotation.y = Math.PI; // face -Z toward boss spawn (z=-10)
    this.scene.add(this.group);

    // ── Callbacks
    this.onAttack = null;
    this.onDodge  = null;
    this.onHit    = null;
    this.onParry  = null;
    this.onDeath  = null;
    this.onWeaponImpact = null;

    this._weaponSource = null;
    this._weaponTip = new THREE.Vector3();
    this._weaponBase = new THREE.Vector3();
    this._prevWeaponTip = null;
    this._prevWeaponBase = null;
    this._weaponHitSet = new WeakSet();
    this._weaponTracePointCount = 6;
    this._attackElapsed = 0;
    this._combatTargets = [];
    /** @type {import('./CombatWorld.js').CombatWorld | null} */
    this.combatWorld = null;
    this._footSnapBox = new THREE.Box3();
    this._footSnapTimer = 0;
    this._footContactOffset = 0;
    this._proceduralPelvisOffset = 0;
    this._leftFootBone = null;
    this._rightFootBone = null;
    this._leftFootBaseLocal = null;
    this._rightFootBaseLocal = null;
    this._footRay = new THREE.Raycaster();
    this._footTmp = new THREE.Vector3();
    this._footTmp2 = new THREE.Vector3();
    this._footPelvisAdjust = 0;

    // Start async load
    this._loadModel();
    this._setupInput();
  }

  // ─── Load GLTF ─────────────────────────────────────────────────────────────
  async _loadModel() {
    try {
      const gltf  = await loadGLTF(HERO_MODEL);
      const model = gltf.scene;

      // ── Fix materials (MeshBasicMaterial → MeshStandardMaterial)
      model.traverse(child => {
        if (!child.isMesh && !child.isSkinnedMesh) return;
        child.castShadow    = true;
        child.receiveShadow = true;
        child.frustumCulled = false;

        const wasArray = Array.isArray(child.material);
        const mats = wasArray ? child.material : [child.material];
        const newMats = mats.map(m => {
          if (m.isMeshStandardMaterial) {
            m.transparent = false;
            m.opacity = 1.0;
            m.depthWrite = true;
            return m;
          }
          const std = new THREE.MeshStandardMaterial({
            map:       m.map ?? null,
            color:     m.color ?? new THREE.Color(0xffffff),
            roughness: 0.6,
            metalness: 0.3,
          });
          if (m.dispose) m.dispose();
          return std;
        });
        child.material = wasArray ? newMats : newMats[0];
      });

      // Scale the hero model (no forced rotation so they face the right way)
      model.scale.setScalar(1);
      
      // Auto-snap to floor: calculate the bind-pose bounding box and offset Y so feet touch 0
      const box = new THREE.Box3().setFromObject(model);
      model.position.y = -box.min.y;
      this._baseModelY = model.position.y;

      this.group.add(model);
      this._model = model;
      this._resolveWeaponBones();
      this._resolveFootBones();

      // ── Create animator and preload core anims
      this._animator = new CharacterAnimator(model, HERO_ANIMS);
      await this._animator.preload(['idle', 'walk', 'run', 'intro']);

      // ── Cinematic intro: play sheath sword then crossfade to idle
      this._introPlaying = true;
      this._animator.play('intro');
      const introDur = this._animator.getClipDuration('intro') ?? 1.8;
      setTimeout(() => {
        this._introPlaying = false;
        this._introDone    = true;
        if (this._animator) this._animator.crossfade('idle', 0.45);
      }, introDur * 1000);

      // Preload rest in background
      this._animator.preload(Object.keys(HERO_ANIMS));

      console.log('[Player] Hero loaded ✓');
    } catch (err) {
      console.error('[Player] Model load failed:', err);
    }
  }

  // ─── Input ─────────────────────────────────────────────────────────────────
  _setupInput() {
    window.addEventListener('keydown', e => {
      if (e.code === 'Space') e.preventDefault();
      this.keys[e.code] = true;
      this._handleAction(e.code);
    });
    window.addEventListener('keyup', e => {
      this.keys[e.code] = false;
    });

    const canvas = document.querySelector('canvas');

    canvas.addEventListener('click', () => {
      if (!this.isPointerLocked) canvas.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === canvas;
    });

    document.addEventListener('mousemove', e => {
      if (!this.isPointerLocked) return;
      this._targetYaw   -= e.movementX * this._mouseSensitivity;
      this._targetPitch  = Math.max(-0.5, Math.min(1.3,
        this._targetPitch + e.movementY * this._mouseSensitivity
      ));
      this._lastMouseMove = performance.now();
    });

    // Left-click = heavy attack, Right-click = block
    document.addEventListener('mousedown', e => {
      if (!this.isPointerLocked) return;
      if (!this.isAlive) return;
      if (e.button === 0) this._tryAttack('heavy');
      if (e.button === 2) {
        this.isBlocking = true;
        this._tryParry();
      }
    });
    document.addEventListener('mouseup', e => {
      if (e.button === 2) this.isBlocking = false;
    });
    document.addEventListener('contextmenu', e => e.preventDefault());
  }

  _handleAction(code) {
    if (!this.isAlive || this.isDowned || this.isHit) return;
    if (code === 'KeyJ') this._tryAttack('light');  // HIGH damage
    if (code === 'KeyK') this._tryAttack('combo');  // MEDIUM damage (fast combo)
    if (code === 'KeyL') this._tryParry();
    if (code === 'KeyQ') this._tryDodge();
    if (code === 'Space') this._tryJump();
  }

  requestPointerLock() {
    const canvas = document.querySelector('canvas');
    if (canvas && !this.isPointerLocked) canvas.requestPointerLock();
  }

  // ─── Update ────────────────────────────────────────────────────────────────
  update(delta, camera) {
    if (!this.isAlive) {
      if (this._animator) this._animator.update(delta);
      return;
    }

    // Track rotation delta for turn-in-place detection
    this._prevRotY = this.group.rotation.y;

    this._updateTimers(delta);
    this._updateGroundProbe();
    this._updateMovement(delta, camera);
    this._updateWeaponTrace(delta);
    this._updateProceduralPose(delta);
    this._updateCamera(camera, delta);
    this._updateTurnDir(delta);
    this._updateAnimState();

    if (this._animator) this._animator.update(delta);
    this._updateFootIK(delta);
    this._updateFootGroundContact(delta);
  }

  // Detect in-place turning for turn animation selection
  _updateTurnDir(delta) {
    const rotDelta = this.group.rotation.y - this._prevRotY;
    if (!this._isMoving && !this.isAttacking && !this.isDodging) {
      if (Math.abs(rotDelta) > 0.002) {
        this._turnDir = rotDelta > 0 ? 1 : -1;
        this._turnDirTimer = 0.18;
      }
    }
    if (this._turnDirTimer > 0) {
      this._turnDirTimer -= delta;
    } else {
      this._turnDir = 0;
    }
  }

  // ─── Timers ────────────────────────────────────────────────────────────────
  _updateTimers(delta) {
    // Stamina regen (only when not attacking/dodging)
    if (!this.isAttacking && !this.isDodging) {
      this.stamina = Math.min(this.maxStamina, this.stamina + STAMINA_REGEN * delta);
    }

    if (this.attackTimer > 0) {
      this._attackElapsed += delta;
      this.attackTimer -= delta;
      if (this.attackTimer <= 0) {
        this.isAttacking = false;
        this.currentAttack = null;
        this._weaponHitSet = new WeakSet();
        this._attackElapsed = 0;
      }
    }

    if (this.attackCooldown > 0) this.attackCooldown -= delta;

    if (this.dodgeTimer > 0) {
      this.dodgeTimer -= delta;
      if (this.dodgeTimer <= 0) this.isDodging = false;
    }

    if (this.iframeTimer > 0) {
      this.iframeTimer -= delta;
      if (this.iframeTimer <= 0) this.hasIframes = false;
    }

    if (this.isParrying) {
      if (!this._parryTimer) this._parryTimer = PARRY_WINDOW;
      this._parryTimer -= delta;
      if (this._parryTimer <= 0) {
        this.isParrying = false;
        this._parryTimer = 0;
      }
    }

    if (this.hitTimer > 0) {
      this.hitTimer -= delta;
      if (this.hitTimer <= 0) {
        this.isHit = false;
        this.hasIframes = false;
      }
    }
  }

  // ─── Movement ──────────────────────────────────────────────────────────────
  _updateMovement(delta, camera) {
    const k = this.keys;

    // Build camera forward/right (XZ only, no Y)
    const sinY = Math.sin(this.cameraYaw);
    const cosY = Math.cos(this.cameraYaw);
    const fwd  = new THREE.Vector3(-sinY, 0, -cosY).normalize();
    const right = new THREE.Vector3(cosY, 0, -sinY).normalize();

    // WASD input
    const moveInput = new THREE.Vector3();
    if (k['KeyW']) moveInput.addScaledVector(fwd, 1);
    if (k['KeyS']) moveInput.addScaledVector(fwd, -1);
    if (k['KeyA']) moveInput.addScaledVector(right, -1);
    if (k['KeyD']) moveInput.addScaledVector(right, 1);

    const isMoving  = moveInput.lengthSq() > 0.01;
    const isRunning = k['ShiftLeft'] && isMoving;

    if (isMoving) moveInput.normalize();
    this.moveDir.copy(moveInput);

    // Apply movement with inertia and grounded friction (if not in dodge)
    if (!this.isDodging && !this.isAttacking && !this.isHit) {
      let speed = isRunning ? RUN_SPEED : MOVE_SPEED;
      if (this.isBlocking) speed = MOVE_SPEED * 0.5; // Walk slower while blocking

      this._desiredVelocity.set(moveInput.x * speed, 0, moveInput.z * speed);
      const accel = this.isGrounded ? GROUND_ACCEL : GROUND_ACCEL * AIR_CONTROL;
      const decel = this.isGrounded ? GROUND_DECEL : GROUND_DECEL * AIR_CONTROL;
      const blend = (this._desiredVelocity.lengthSq() > 0.001 ? accel : decel) * delta;
      this.velocity.x += (this._desiredVelocity.x - this.velocity.x) * Math.min(1, blend);
      this.velocity.z += (this._desiredVelocity.z - this.velocity.z) * Math.min(1, blend);
    } else if (this.isDodging) {
      this.velocity.x = this.dodgeDir.x * DODGE_SPEED;
      this.velocity.z = this.dodgeDir.z * DODGE_SPEED;
    } else {
      this.velocity.x *= 0.8;
      this.velocity.z *= 0.8;
    }

    // Gravity
    if (!this.isGrounded) {
      this.velocity.y += GRAVITY * delta;
    }

    // Integrate position
    const nx = this.group.position.x + this.velocity.x * delta;
    const ny = this.group.position.y + this.velocity.y * delta;
    const nz = this.group.position.z + this.velocity.z * delta;

    const targetGroundY = this._smoothedGroundY;

    // Floor
    if (ny <= targetGroundY) {
      this.group.position.y = targetGroundY;
      this.velocity.y = 0;
      this.isGrounded = true;
    } else {
      this.group.position.y = ny;
      this.isGrounded = false;
    }

    this.group.position.x = nx;
    this.group.position.z = nz;

    // Rotate character to face movement with inertia
    if (isMoving && !this.isAttacking && !this.isDodging) {
      const targetAngle = Math.atan2(moveInput.x, moveInput.z);
      const diff = Math.atan2(Math.sin(targetAngle - this.group.rotation.y), Math.cos(targetAngle - this.group.rotation.y));
      this._turnVelocity += diff * TURN_RESPONSE * delta;
      this._turnVelocity *= Math.exp(-ROT_INERTIA * delta);
      this.group.rotation.y += this._turnVelocity;
    }

    this._isRunning = isRunning;
    this._isMoving  = isMoving;
  }

  // ─── AAA Cinematic Camera Rig ────────────────────────────────────────────────
  _updateCamera(cam, delta) {
    if (!cam) return;

    // 1. Collision Solver Setup (Avoid character meshes)
    if (this._camColliders.length === 0) {
      this.scene.traverse(o => {
        if (o.isMesh && (o.name === 'floor' || o.geometry?.type === 'BoxGeometry')) {
          this._camColliders.push(o);
        }
      });
    }

    // 2. Input & Rotation Smoothing (Critically damped spring motion)
    const rotSmooth = 1.0 - Math.exp(-18 * delta);
    this.cameraYaw   += (this._targetYaw - this.cameraYaw) * rotSmooth;
    this.cameraPitch += (this._targetPitch - this.cameraPitch) * rotSmooth;

    // 3. State Machine Constraints (Dynamic Zoom/Framing)
    let targetDist = 4.8;
    let targetFov  = 60;
    let lookHeight = 1.35;
    let shoulderOffset = 0.5;
    let followSpeed = 12; // Lower = lazier, heavier camera

    if (this._isRunning) {
      targetDist = 6.2;
      targetFov = 72;
      lookHeight = 1.2;
      shoulderOffset = 0.65;
      followSpeed = 8; // Lazy follow for sense of speed
    } else if (this.isBlocking || this.isParrying) {
      targetDist = 3.6;
      targetFov = 55;
      lookHeight = 1.45;
      shoulderOffset = 0.35; // Tighter focus
      followSpeed = 16;
    } else if (this.isAttacking) {
      targetDist = 4.4;
      targetFov = 64;
      followSpeed = 10;
    } else if (this.isDodging) {
      targetDist = 5.2;
      targetFov = 68;
      followSpeed = 6; // Let character dash away from camera
    }

    // 4. Dynamic FOV Interpolation
    cam.fov += (targetFov - cam.fov) * (1.0 - Math.exp(-6 * delta));
    cam.updateProjectionMatrix();

    // 5. Position Solver (Spring-based tracking)
    const px = this.group.position.x;
    const py = this.group.position.y;
    const pz = this.group.position.z;

    // Predictive look-ahead based on velocity
    const leadX = this.velocity.x * 0.15;
    const leadZ = this.velocity.z * 0.15;

    this._camPosTarget.set(px + leadX, py + lookHeight, pz + leadZ);
    this._camLookTarget.lerp(this._camPosTarget, 1.0 - Math.exp(-followSpeed * delta));

    // Smooth Distance Interpolation
    if (!this._currentCamDist) this._currentCamDist = targetDist;
    this._currentCamDist += (targetDist - this._currentCamDist) * (1.0 - Math.exp(-5 * delta));

    // 6. Camera Rig Orbit Math
    const cosP = Math.cos(this.cameraPitch);
    const sinP = Math.sin(this.cameraPitch);
    const sinY = Math.sin(this.cameraYaw);
    const cosY = Math.cos(this.cameraYaw);

    const orbitDir = new THREE.Vector3(
      sinY * cosP,
      sinP,
      cosY * cosP
    );

    // 7. Collision Solver (Soft recovery)
    let finalDist = this._currentCamDist;
    this._camRaycaster.set(this._camLookTarget, orbitDir);
    const hits = this._camRaycaster.intersectObjects(this._camColliders, false);

    if (hits.length > 0 && hits[0].distance < this._currentCamDist) {
      // Compress instantly to avoid clipping through walls
      finalDist = Math.max(1.2, hits[0].distance - 0.45);
      this._softCollisionDist = finalDist;
    } else {
      // Smoothly expand back out after leaving wall
      if (this._softCollisionDist !== undefined && this._softCollisionDist < this._currentCamDist) {
        this._softCollisionDist += (this._currentCamDist - this._softCollisionDist) * (1.0 - Math.exp(-8 * delta));
        finalDist = this._softCollisionDist;
      }
    }

    // 8. Final Camera Composer
    const finalX = this._camLookTarget.x + orbitDir.x * finalDist;
    const finalY = Math.max(0.4, this._camLookTarget.y + orbitDir.y * finalDist);
    const finalZ = this._camLookTarget.z + orbitDir.z * finalDist;

    // Apply Rule of Thirds shoulder offset
    cam.position.set(
      finalX + cosY * shoulderOffset,
      finalY,
      finalZ - sinY * shoulderOffset
    );
    
    // Look exactly at the spring-dampened target
    cam.lookAt(
      this._camLookTarget.x + cosY * (shoulderOffset * 0.5),
      this._camLookTarget.y,
      this._camLookTarget.z - sinY * (shoulderOffset * 0.5)
    );
  }

  // ─── Animation State ───────────────────────────────────────────────────────
  _updateAnimState() {
    if (!this._animator) return;
    // Once dead, never override the death animation
    if (!this.isAlive) return;
    // Freeze anim updates during intro
    if (this._introPlaying) return;

    const k = this.keys;
    let next = 'idle';

    if (this.isHit) {
      next = this._lastHitAnim || 'hitLight';
    } else if (this.isDodging) {
      next = 'dodge';
    } else if (this.isAttacking) {
      next = this.currentAttack?.anim ?? 'attackLight';
    } else if (this.isBlocking) {
      // ── Guarded locomotion: shield always faces threat
      if (k['KeyW'])      next = 'blockWalkFwd';
      else if (k['KeyS']) next = 'blockWalkBack';
      else if (k['KeyA']) next = 'blockStrafeL';
      else if (k['KeyD']) next = 'blockStrafeR';
      else                next = 'block';
    } else if (this._isRunning) {
      next = 'run';
    } else if (this._isMoving) {
      next = 'walk';
    } else if (this._turnDir !== 0) {
      next = this._turnDir > 0 ? 'turnRight' : 'turnLeft';
    } else {
      next = 'idle';
    }

    if (next !== this._animState) {
      const isOneShot = ['dodge','attackLight','attackHeavy','attackCombo','hitLight','hitMedium','hitHeavy'].includes(next);
      if (isOneShot) {
        this._animator.play(next);
      } else {
        this._animator.crossfade(next, 0.18);
      }
      this._animState = next;
    }
  }

  // ─── Combat ────────────────────────────────────────────────────────────────
  _tryAttack(type) {
    if (this.isAttacking || this.isDodging) return;
    if (this.attackCooldown > 0) return;

    const atk = ATTACKS[type];
    if (!atk) return;
    if (this.stamina < atk.staminaCost) return;

    this.stamina       -= atk.staminaCost;
    this.isAttacking    = true;
    this.currentAttack  = atk;
    this.attackTimer    = atk.duration;
    this.attackCooldown = atk.cooldown;
    this._attackElapsed = 0;
    this._weaponHitSet = new WeakSet();

    // ── Random attack whoosh
    soundManager.playAttack();

    if (this.onAttack) this.onAttack({ type, attack: atk });
  }

  _tryParry() {
    if (this.isAttacking || this.isDodging || this.isParrying) return;
    if (this.stamina < ATTACKS.parry.staminaCost) return;

    this.stamina   -= ATTACKS.parry.staminaCost;
    this.isParrying = true;
    this._parryTimer = PARRY_WINDOW;

    soundManager.playParry();

    if (this.onParry) this.onParry();
    if (this._animator) this._animator.play('block');
  }

  _tryDodge() {
    if (this.isDodging || !this.isGrounded) return;
    if (this.stamina < 20) return;

    this.stamina   -= 20;
    this.isDodging  = true;
    this.hasIframes = true;
    this.dodgeTimer  = DODGE_DURATION;
    this.iframeTimer = IFRAME_DURATION;

    // Dodge in move direction or backward
    if (this.moveDir.lengthSq() > 0.01) {
      this.dodgeDir.copy(this.moveDir);
    } else {
      this.dodgeDir.set(
        -Math.sin(this.group.rotation.y),
        0,
        -Math.cos(this.group.rotation.y)
      ).negate();
    }

    if (this.onDodge) this.onDodge();
  }

  _tryJump() {
    if (!this.isGrounded) return;
    this.velocity.y  = JUMP_FORCE;
    this.isGrounded  = false;
  }

  // ─── Damage API ────────────────────────────────────────────────────────────
  takeDamage(amount, isParried = false, attackerPos = null) {
    if (!this.isAlive || this.hasIframes || this.isHit) return { hit: false };

    let blocked = false;
    let parried = false;

    if (this.isBlocking || this.isParrying) {
      let validAngle = true;
      if (attackerPos) {
        const toAttacker = new THREE.Vector3().subVectors(attackerPos, this.group.position);
        toAttacker.y = 0;
        if (toAttacker.lengthSq() > 0.001) {
          toAttacker.normalize();
          const forward = new THREE.Vector3(Math.sin(this.group.rotation.y), 0, Math.cos(this.group.rotation.y));
          validAngle = forward.dot(toAttacker) > 0.2; // roughly 150 deg front cone
        }
      }

      if (validAngle) {
        if (this.isParrying) {
          parried = true;
        } else {
          blocked = true;
        }
      }
    }

    if (parried) {
      if (this._animator) this._animator.play('blockHit');
      soundManager.playParry(); 
      if (this.onParrySuccess) this.onParrySuccess();
      return { hit: true, parried: true, blocked: false };
    }

    if (blocked) {
      const staminaDmg = amount * 0.8;
      this.stamina -= staminaDmg;
      if (this.stamina < 0) {
        this.stamina = 0;
        this.isBlocking = false;
        amount = Math.round(amount * 0.5); // take half damage on guard break
      } else {
        if (this._animator) this._animator.play('blockHit');
        soundManager.playParry();
        
        if (attackerPos) {
          const pushDir = new THREE.Vector3().subVectors(this.group.position, attackerPos);
          pushDir.y = 0;
          if (pushDir.lengthSq() > 0.001) {
            this.velocity.addScaledVector(pushDir.normalize(), amount * 0.15);
          }
        }
        return { hit: true, parried: false, blocked: true };
      }
    }

    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this._die();
    } else {
      let hitAnim = 'hitLight';
      let hitTime = 0.5;
      if      (amount >= 45) { hitAnim = 'hitHeavy'; hitTime = 0.9; }
      else if (amount >= 22) { hitAnim = 'hitMedium'; hitTime = 0.7; }
      
      this.isHit = true;
      this.hitTimer = hitTime;
      this.hasIframes = true;
      this.isAttacking = false;
      this.attackTimer = 0;
      this.isDodging = false;
      this._lastHitAnim = hitAnim;

      if (this._animator) {
        this._animator.play(hitAnim);
      }
      this._animState = hitAnim;
      
      if (this.onHit) this.onHit({ damage: amount });
    }
    return { hit: true, parried: false, blocked: false };
  }

  _die() {
    this.isAlive  = false;
    this.isDowned = true;
    soundManager.playDeath();
    // ── Random death animation
    const deathAnim = Math.random() < 0.5 ? 'death' : 'death2';
    this._animState = deathAnim;
    if (this._animator) this._animator.play(deathAnim);
    if (this.onDeath) this.onDeath();
  }

  // ── Called by main.js when player wins
  playVictory() {
    if (this._animator) this._animator.crossfade('victory', 0.4);
  }

  _updateGroundProbe() {
    if (this._colliders.length === 0) {
      this.scene.traverse(o => {
        if (!o.isMesh) return;
        if (o.name === 'floor' || o.geometry?.type === 'PlaneGeometry' || o.geometry?.type === 'BoxGeometry' || o.geometry?.type === 'CylinderGeometry') {
          this._colliders.push(o);
        }
      });
    }

    this._groundProbeOrigin.copy(this.group.position);
    this._groundProbeOrigin.y += 1.5;
    this._groundRay.set(this._groundProbeOrigin, new THREE.Vector3(0, -1, 0));
    const hits = this._groundRay.intersectObjects(this._colliders, false);
    if (hits.length > 0) {
      this._groundNormal.copy(hits[0].face?.normal ?? new THREE.Vector3(0, 1, 0)).transformDirection(hits[0].object.matrixWorld);
      this._smoothedGroundY += (hits[0].point.y - this._smoothedGroundY) * 0.2;
      return;
    }
    this._groundNormal.set(0, 1, 0);
    this._smoothedGroundY += (0 - this._smoothedGroundY) * 0.2;
  }

  _resolveWeaponBones() {
    if (!this._model) return;
    const swordCandidates = [];
    this._model.traverse(n => {
      const name = (n.name || '').toLowerCase();
      if (name.includes('sword') || name.includes('blade') || name.includes('weapon')) {
        swordCandidates.push(n);
      }
    });
    this._weaponSource = swordCandidates[0] ?? this._model;
  }

  _computeWeaponSegment() {
    if (!this._weaponSource) {
      const forward = new THREE.Vector3(Math.sin(this.group.rotation.y), 0.05, Math.cos(this.group.rotation.y)).normalize();
      this._weaponBase.copy(this.group.position).add(new THREE.Vector3(0, 1.1, 0)).addScaledVector(forward, 0.35);
      this._weaponTip.copy(this._weaponBase).addScaledVector(forward, 1.35);
      return;
    }

    this._weaponSource.getWorldPosition(this._weaponBase);
    const worldQ = this._weaponSource.getWorldQuaternion(new THREE.Quaternion());
    const swingDir = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQ).normalize();
    this._weaponTip.copy(this._weaponBase).addScaledVector(swingDir, 1.15);
  }

  _updateWeaponTrace(delta) {
    if (!this.isAttacking || !this.currentAttack) {
      this._prevWeaponBase = null;
      this._prevWeaponTip = null;
      return;
    }

    const normalized = Math.min(1, this._attackElapsed / Math.max(0.001, this.currentAttack.duration));
    if (normalized < this.currentAttack.traceStart || normalized > this.currentAttack.traceEnd) {
      this._prevWeaponBase = null;
      this._prevWeaponTip = null;
      return;
    }

    this._computeWeaponSegment();
    if (!this._prevWeaponBase || !this._prevWeaponTip) {
      this._prevWeaponBase = this._weaponBase.clone();
      this._prevWeaponTip = this._weaponTip.clone();
      return;
    }

    const tempA = new THREE.Vector3();
    const tempB = new THREE.Vector3();
    for (let i = 0; i <= this._weaponTracePointCount; i++) {
      const t = i / this._weaponTracePointCount;
      tempA.lerpVectors(this._prevWeaponBase, this._prevWeaponTip, t);
      tempB.lerpVectors(this._weaponBase, this._weaponTip, t);

      for (const target of this._combatTargets) {
        if (!target || !target.isAlive || this._weaponHitSet.has(target)) continue;
        if (this.combatWorld?.segmentBlockedByAnyPillar(tempA, tempB)) continue;
        const regions = typeof target.getHitRegions === 'function' ? target.getHitRegions() : [];
        for (const region of regions) {
          const nearest = this._closestPointOnSegment(region.center, tempA, tempB);
          const dist = nearest.distanceTo(region.center);
          if (dist <= region.radius) {
            const attackDir = new THREE.Vector3().subVectors(tempB, tempA).normalize();
            this._weaponHitSet.add(target);
            if (this.onWeaponImpact) {
              this.onWeaponImpact({
                target,
                damage: Math.round(this.currentAttack.damage * (region.damageMult ?? 1)),
                attackType: this.currentAttack.anim,
                attackWeight: this.currentAttack.weight,
                attackDirection: attackDir,
                hitPoint: nearest.clone(),
                region: region.name ?? 'torso',
                attackSpeed: tempA.distanceTo(tempB) / Math.max(delta, 0.001),
              });
            }
            break;
          }
        }
      }
    }

    this._prevWeaponBase.copy(this._weaponBase);
    this._prevWeaponTip.copy(this._weaponTip);
  }

  _closestPointOnSegment(point, a, b) {
    const ab = new THREE.Vector3().subVectors(b, a);
    const t = Math.max(0, Math.min(1, new THREE.Vector3().subVectors(point, a).dot(ab) / Math.max(1e-5, ab.lengthSq())));
    return new THREE.Vector3().copy(a).addScaledVector(ab, t);
  }

  _updateProceduralPose(delta) {
    if (!this._model) return;
    const planarSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const lateral = Math.sin(this.group.rotation.y) * this.velocity.z - Math.cos(this.group.rotation.y) * this.velocity.x;
    const desiredRoll = THREE.MathUtils.clamp(lateral * 0.03, -0.14, 0.14);
    const desiredPitch = THREE.MathUtils.clamp(planarSpeed * 0.01, -0.1, 0.12);
    this._bodyTilt.x += (desiredPitch - this._bodyTilt.x) * Math.min(1, delta * 8);
    this._bodyTilt.z += (desiredRoll - this._bodyTilt.z) * Math.min(1, delta * 8);
    this._model.rotation.x = this._bodyTilt.x;
    this._model.rotation.z = this._bodyTilt.z;

    const gait = performance.now() * 0.008 + planarSpeed;
    const footStrength = THREE.MathUtils.clamp(planarSpeed / RUN_SPEED, 0, 1);
    this._footOffsetL = Math.sin(gait) * 0.03 * footStrength;
    this._footOffsetR = Math.sin(gait + Math.PI) * 0.03 * footStrength;
    const pelvisDown = Math.max(this._footOffsetL, this._footOffsetR) * 0.6;
    this._proceduralPelvisOffset = -pelvisDown;
    this._applyModelYOffset();
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
    this._applyModelYOffset();
  }

  _applyModelYOffset() {
    if (!this._model) return;
    this._model.position.y = (this._baseModelY ?? 0) + this._proceduralPelvisOffset + this._footContactOffset + this._footPelvisAdjust;
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
    if (!this._leftFootBone || !this._rightFootBone || !this.isGrounded) {
      this._footPelvisAdjust += (0 - this._footPelvisAdjust) * Math.min(1, delta * 10);
      return;
    }

    const leftOffset = this._solveFootBoneToGround(this._leftFootBone, this._leftFootBaseLocal);
    const rightOffset = this._solveFootBoneToGround(this._rightFootBone, this._rightFootBaseLocal);
    const desiredPelvis = Math.min(0, Math.min(leftOffset, rightOffset)) * 0.55;
    this._footPelvisAdjust += (desiredPelvis - this._footPelvisAdjust) * Math.min(1, delta * 9);
  }

  _solveFootBoneToGround(footBone, baseLocal) {
    if (!footBone || !baseLocal) return 0;
    footBone.position.copy(baseLocal);
    footBone.getWorldPosition(this._footTmp);
    this._footTmp2.copy(this._footTmp);
    this._footTmp2.y += 0.45;
    this._footRay.set(this._footTmp2, new THREE.Vector3(0, -1, 0));
    this._footRay.far = 1.4;
    const hits = this._footRay.intersectObjects(this._colliders, false);
    if (hits.length === 0) return 0;

    const targetY = hits[0].point.y + 0.015;
    const worldLift = targetY - this._footTmp.y;
    if (Math.abs(worldLift) < 1e-4) return worldLift;

    const parent = footBone.parent;
    if (!parent) return worldLift;
    const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(parent.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const projectedLift = worldLift / Math.max(0.2, localUp.y);
    footBone.position.y += THREE.MathUtils.clamp(projectedLift, -0.12, 0.2);
    return worldLift;
  }

  // ─── Public helpers ────────────────────────────────────────────────────────
  getAttackRange()  { return 2.5; }
  isParryActive()   { return this.isParrying && this._parryTimer > 0; }
  setCombatTargets(targets = []) { this._combatTargets = targets; }
  getHitRegions() {
    const base = this.group.position;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.group.rotation.y);
    const off = new THREE.Vector3();
    const mk = (lx, ly, lz, radius, name, damageMult) => {
      off.set(lx, ly, lz).applyQuaternion(q);
      return {
        name,
        center: new THREE.Vector3(base.x + off.x, base.y + off.y, base.z + off.z),
        radius,
        damageMult,
      };
    };
    return [
      mk(0, 1.7, 0, 0.24, 'head', 1.25),
      mk(0, 1.15, 0, 0.38, 'torso', 1.0),
      mk(-0.24, 1.28, 0, 0.2, 'shoulderL', 0.95),
      mk(0.24, 1.28, 0, 0.2, 'shoulderR', 0.95),
      mk(-0.33, 1.02, 0, 0.18, 'armL', 0.82),
      mk(0.33, 1.02, 0, 0.18, 'armR', 0.82),
      mk(-0.15, 0.55, 0, 0.22, 'legL', 0.75),
      mk(0.15, 0.55, 0, 0.22, 'legR', 0.75),
    ];
  }

  getSnapshot() {
    return {
      hp:         this.hp,
      maxHp:      this.maxHp,
      stamina:    this.stamina,
      maxStamina: this.maxStamina,
      isAlive:    this.isAlive,
    };
  }
}
