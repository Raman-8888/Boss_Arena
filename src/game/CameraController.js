// CameraController.js – modular AAA‑style third‑person combat camera
// ---------------------------------------------------------------
// This file implements a layered camera system that can be instantiated
// from the Player class.  It follows the architecture requested by the
// user: Input → Rig → Rotation Solver → Position Solver → Collision →
// Framing → State Machine → Procedural Effects → Composer.
// ---------------------------------------------------------------
import * as THREE from 'three';

export class CameraController {
  /**
   * @param {Player} player   The player instance (provides position, yaw/pitch targets, velocity, state flags)
   * @param {THREE.Scene} scene  The scene (used for collision geometry)
   * @param {THREE.PerspectiveCamera} camera The active camera
   */
  constructor(player, scene, camera) {
    this.player = player;
    this.scene = scene;
    this.cam = camera;

    // ---------- Internal state ----------
    this._camColliders = [];
    this._raycaster = new THREE.Raycaster();
    this._softCollisionDist = undefined;
    this._currentCamDist = undefined;
    this._camLookTarget = new THREE.Vector3();
    this._camPosTarget = new THREE.Vector3();

    // Default rig parameters – can be overridden per state
    this.params = {
      baseDist: 5.5,
      shoulder: 0.5,
      lookHeight: 1.35,
      fov: 65,
      followSpeed: 12,
      rotSmooth: 0.92, // ~exp(-18*dt) smoothing factor per frame
    };
  }

  // -----------------------------------------------------------------
  // Input / Rotation Solver – smooth yaw/pitch with critically damped spring
  // -----------------------------------------------------------------
  _solveRotation(delta) {
    const smooth = 1.0 - Math.exp(-18 * delta);
    const p = this.player;
    p.cameraYaw   += (p._targetYaw   - p.cameraYaw)   * smooth;
    p.cameraPitch += (p._targetPitch - p.cameraPitch) * smooth;
  }

  // -----------------------------------------------------------------
  // State‑dependent parameters (zoom, fov, offset, speed)
  // -----------------------------------------------------------------
  _applyStateMachine() {
    const p = this.player;
    const st = this.params;
    // Reset to defaults first
    st.baseDist = 5.5; st.fov = 65; st.lookHeight = 1.35; st.shoulder = 0.5; st.followSpeed = 12;

    if (p._isRunning) {
      st.baseDist = 6.2; st.fov = 72; st.lookHeight = 1.2; st.shoulder = 0.65; st.followSpeed = 8;
    } else if (p.isBlocking || p.isParrying) {
      st.baseDist = 3.6; st.fov = 55; st.lookHeight = 1.45; st.shoulder = 0.35; st.followSpeed = 16;
    } else if (p.isAttacking) {
      st.baseDist = 4.4; st.fov = 64; st.followSpeed = 10;
    } else if (p.isDodging) {
      st.baseDist = 5.2; st.fov = 68; st.followSpeed = 6;
    }
    // Additional states (e.g., lock‑on) could be added here.
  }

  // -----------------------------------------------------------------
  // Position Solver – spring‑based follow with predictive look‑ahead
  // -----------------------------------------------------------------
  _solvePosition(delta) {
    const p = this.player;
    const st = this.params;

    // Predictive lead based on velocity (helps with fast movement)
    const leadX = p.velocity.x * 0.15;
    const leadZ = p.velocity.z * 0.15;
    this._camPosTarget.set(
      p.group.position.x + leadX,
      p.group.position.y + st.lookHeight,
      p.group.position.z + leadZ
    );
    this._camLookTarget.lerp(this._camPosTarget, 1.0 - Math.exp(-st.followSpeed * delta));

    // Smooth distance interpolation
    if (this._currentCamDist === undefined) this._currentCamDist = st.baseDist;
    this._currentCamDist += (st.baseDist - this._currentCamDist) * (1.0 - Math.exp(-5 * delta));
  }

  // -----------------------------------------------------------------
  // Collision Solver – sphere‑cast like behaviour with soft compression
  // -----------------------------------------------------------------
  _setupColliders() {
    if (this._camColliders.length === 0) {
      this.scene.traverse(o => {
        if (o.isMesh && (o.name === 'floor' || o.geometry?.type === 'BoxGeometry')) {
          this._camColliders.push(o);
        }
      });
    }
  }

  _solveCollision(delta) {
    const st = this.params;
    const sinY = Math.sin(this.player.cameraYaw);
    const cosY = Math.cos(this.player.cameraYaw);
    const pitch = this.player.cameraPitch;
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);
    const orbitDir = new THREE.Vector3(sinY * cosP, sinP, cosY * cosP);

    this._raycaster.set(this._camLookTarget, orbitDir);
    const hits = this._raycaster.intersectObjects(this._camColliders, false);
    let finalDist = this._currentCamDist;
    if (hits.length > 0 && hits[0].distance < this._currentCamDist) {
      finalDist = Math.max(1.2, hits[0].distance - 0.45);
      this._softCollisionDist = finalDist;
    } else if (this._softCollisionDist !== undefined && this._softCollisionDist < this._currentCamDist) {
      this._softCollisionDist += (this._currentCamDist - this._softCollisionDist) * (1.0 - Math.exp(-8 * delta));
      finalDist = this._softCollisionDist;
    }
    return { orbitDir, finalDist };
  }

  // -----------------------------------------------------------------
  // Procedural Effects – camera shake (exposed via triggerShake)
  // -----------------------------------------------------------------
  triggerShake(intensity, duration) {
    this._shake = { intensity, duration, time: duration };
  }

  // -----------------------------------------------------------------
  // Final Composer – assemble final camera transform
  // -----------------------------------------------------------------
  _compose(finalDist, orbitDir) {
    const st = this.params;
    const target = this._camLookTarget;
    const finalX = target.x + orbitDir.x * finalDist;
    const finalY = Math.max(0.4, target.y + orbitDir.y * finalDist);
    const finalZ = target.z + orbitDir.z * finalDist;
    const cam = this.cam;

    cam.position.set(
      finalX + Math.cos(this.player.cameraYaw) * st.shoulder,
      finalY,
      finalZ - Math.sin(this.player.cameraYaw) * st.shoulder
    );
    cam.lookAt(
      target.x + Math.cos(this.player.cameraYaw) * (st.shoulder * 0.5),
      target.y,
      target.z - Math.sin(this.player.cameraYaw) * (st.shoulder * 0.5)
    );

    // Apply shake if active
    if (this._shake && this._shake.time > 0) {
      const amt = this._shake.intensity * (this._shake.time / this._shake.duration);
      cam.position.x += (Math.random() - 0.5) * amt;
      cam.position.y += (Math.random() - 0.5) * amt;
      cam.position.z += (Math.random() - 0.5) * amt;
      this._shake.time -= 0.016; // approx. one frame, actual delta applied in update
    }
  }

  // -----------------------------------------------------------------
  // Public update – called each frame from Player.update
  // -----------------------------------------------------------------
  update(delta) {
    if (!this.cam) return;
    this._setupColliders();
    this._solveRotation(delta);
    this._applyStateMachine();
    // Apply dynamic FOV based on state
    const targetFov = this.params.fov;
    this.cam.fov += (targetFov - this.cam.fov) * (1.0 - Math.exp(-6 * delta));
    this.cam.updateProjectionMatrix();
    this._solvePosition(delta);
    const { orbitDir, finalDist } = this._solveCollision(delta);
    this._compose(finalDist, orbitDir);
  }
}
