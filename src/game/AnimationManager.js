// ─── AnimationManager v2 ────────────────────────────────────────────────────
// New asset structure: each animation is its OWN .gltf file.
// Every file contains a full skeleton + 1 animation clip.
// We load the character ONCE, then retarget animations from each animation-gltf.
//
// Usage:
//   const animator = new CharacterAnimator(characterGltfScene, animationsMap)
//   animator.play('idle')
//   animator.crossfade('walk')
//   animator.update(delta)
//
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

/**
 * Loads a GLTF and returns gltf object.
 */
export function loadGLTF(path) {
  return new Promise((resolve, reject) => {
    loader.load(path, resolve, undefined, reject);
  });
}

/**
 * Given an animation GLTF (which has its own skeleton) and the target character
 * root, this retargets the clip so it drives the CHARACTER's bones rather than
 * the animation file's bones.
 *
 * The key insight: Mixamo-exported GLTFs have bones named identically across
 * files, so THREE.AnimationClip.findByName + name-reuse works perfectly.
 */
export function retargetAnimationToModel(animGltfScene, animClip, targetRoot) {
  // Build a name→Object3D map for the TARGET skeleton
  const targetBoneMap = {};
  targetRoot.traverse(n => {
    if (n.isBone || n.isObject3D) {
      targetBoneMap[n.name] = n;
    }
  });

  // Clone the clip so we don't mutate the source
  const clonedClip = animClip.clone();

  // Filter tracks — only keep tracks for bones that EXIST in the target skeleton
  clonedClip.tracks = clonedClip.tracks.filter(track => {
    const parts = track.name.split('.');
    const boneName = parts[0];
    const property = parts[1];
    
    const lowerBone = boneName.toLowerCase();
    // Completely remove root motion (position tracks) for root bones to lock the character to its bind-pose origin!
    // This prevents them from sinking into the floor if the animation has a different Y height,
    // and prevents them from walking away from the collision box.
    if ((lowerBone.includes('hips') || lowerBone.includes('pelvis') || lowerBone.includes('root') || lowerBone.includes('armature')) && property === 'position') {
      return false;
    }

    return boneName in targetBoneMap;
  });

  return clonedClip;
}

/**
 * CharacterAnimator — one per character (Player or Boss).
 *
 * @param {THREE.Object3D} rootModel  — the gltf.scene of the CHARACTER
 * @param {Object}         animPaths  — { alias: '/path/to/anim.gltf', ... }
 */
export class CharacterAnimator {
  constructor(rootModel, animPaths) {
    this.rootModel  = rootModel;
    this.animPaths  = animPaths;   // alias → path
    this.mixer      = new THREE.AnimationMixer(rootModel);

    this._clips     = {};   // alias → AnimationClip (loaded + retargeted)
    this._actions   = {};   // alias → AnimationAction
    this._current   = null; // current alias
    this._loading   = {};   // alias → Promise (to avoid double-loads)
    this._onFinish  = {};   // alias → callback

    // Wire 'finished' event
    this.mixer.addEventListener('finished', e => {
      const alias = this._current;
      if (alias && this._onFinish[alias]) {
        const cb = this._onFinish[alias];
        delete this._onFinish[alias];
        cb();
      }
    });
  }

  /** Preload a specific alias (or all aliases if none given) */
  async preload(aliases) {
    const toLoad = aliases ?? Object.keys(this.animPaths);
    await Promise.all(toLoad.map(a => this._ensureLoaded(a)));
  }

  /** Load & retarget a clip if not yet cached */
  async _ensureLoaded(alias) {
    if (this._clips[alias]) return this._clips[alias];
    if (this._loading[alias]) return this._loading[alias];

    const path = this.animPaths[alias];
    if (!path) {
      console.warn(`[Animator] No path for alias "${alias}"`);
      return null;
    }

    this._loading[alias] = loadGLTF(path).then(gltf => {
      const clip = gltf.animations[0];
      if (!clip) {
        console.warn(`[Animator] No animation in "${path}"`);
        return null;
      }
      const retargeted = retargetAnimationToModel(gltf.scene, clip, this.rootModel);
      this._clips[alias] = retargeted;
      delete this._loading[alias];
      return retargeted;
    }).catch(err => {
      console.error(`[Animator] Failed to load "${path}":`, err);
      delete this._loading[alias];
      return null;
    });

    return this._loading[alias];
  }

  _getAction(alias, clip) {
    if (!this._actions[alias]) {
      this._actions[alias] = this.mixer.clipAction(clip);
    }
    return this._actions[alias];
  }

  _isOneShot(alias) {
    const loopBoss = ['bossIdle', 'bossWalk', 'bossRun'];
    if (alias?.startsWith('boss') && !loopBoss.includes(alias)) return true;
    return ['attackLight', 'attackHeavy', 'attackCombo', 'death',
      'hit', 'dodge', 'bossAttack', 'bossSlam', 'bossDeath'].includes(alias);
  }

  /** Duration in seconds for a loaded clip (for hit-frame sync). */
  getClipDuration(alias) {
    const c = this._clips[alias];
    return c && c.duration > 0.01 ? c.duration : null;
  }

  /** Immediately play an alias (hard cut, no fade) */
  async play(alias) {
    if (this._current === alias) return;
    const clip = await this._ensureLoaded(alias);
    if (!clip) return;

    const prevAlias = this._current;
    if (prevAlias && this._actions[prevAlias]) {
      this._actions[prevAlias].fadeOut(0.1);
    }

    const action = this._getAction(alias, clip);
    action.reset();
    action.setLoop(this._isOneShot(alias) ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = this._isOneShot(alias);
    action.fadeIn(0.1);
    action.play();
    this._current = alias;
  }

  /** Smooth crossfade to an alias */
  async crossfade(alias, duration = 0.25) {
    if (this._current === alias) return;
    const clip = await this._ensureLoaded(alias);
    if (!clip) return;

    const prevAlias = this._current;
    const prevAction = prevAlias ? this._actions[prevAlias] : null;

    const action = this._getAction(alias, clip);
    action.reset();
    action.setLoop(this._isOneShot(alias) ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = this._isOneShot(alias);
    action.play();

    if (prevAction) {
      prevAction.crossFadeTo(action, duration, true);
    }

    this._current = alias;
  }

  /** Register a one-time callback when the current one-shot finishes */
  onFinish(alias, cb) {
    this._onFinish[alias] = cb;
  }

  getCurrent() { return this._current; }
  isPlaying(alias) { return this._current === alias; }

  /** Ensure clip is in cache (async). Safe to call before measuring duration. */
  ensureClipLoaded(alias) {
    return this._ensureLoaded(alias);
  }

  update(delta) {
    this.mixer.update(delta);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.rootModel);
  }
}
