# BossRush — Multiplayer 3D Boss Fight Game
> Full project specification & context document. Paste this at the start of every session.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Three.js + Vite |
| Multiplayer | Node.js + Socket.IO (game server) |
| Backend API | Spring Boot + Maven (Java) — leaderboard |
| Database | PostgreSQL |
| DevOps | Docker + Docker Compose, Jenkins, GitHub Actions, AWS EC2, Nginx |
| Registry | DockerHub |

---

## Assets — Characters

- **Source:** Quaternius RPG Characters (Nov 2020) — CC0 license
- **Format:** GLTF files
- **Location:** `/public/assets/characters/`
- **Textures:** `/public/assets/characters/Textures/`

> ⚠️ GLTF files (not GLB) — they reference external texture files. Keep textures in same folder.

| File | Role | Notes |
|---|---|---|
| `Warrior.gltf` | **BOSS enemy** | scale 2.5x, red tint |
| `Cleric.gltf` | **Player 1** | — |
| `Rogue.gltf` | **Player 2** | — |
| `Monk.gltf` | Unused (fallback) | — |
| `Ranger.gltf` | Unused (fallback) | — |
| `Wizard.gltf` | Unused (fallback) | — |

---

## Assets — Animations

- **Source:** Quaternius Universal Animation Library 1 [Standard]
- **File:** `UAL1_Standard.glb` (single GLB, all clips inside)
- **Location:** `/public/assets/animations/UAL1_Standard.glb`
- **Rig:** Quaternius Universal Humanoid Rig
- **Compatibility:** 100% compatible with Quaternius RPG Characters (same bone names)

### Animation Clips Needed

**Player animations:**
- `Idle` — standing still
- `Walk_Fwd` — moving
- `Run` — sprinting
- `Sword_Regular_A` / `Sword_Regular_B` — light attack
- `Sword_Regular_Combo` — heavy attack / combo
- `Roll` — dodge with iframes
- `Death` — player dies
- `Hit_React` (or similar) — getting hit

**Boss animations (same file, applied to Warrior.gltf):**
- `Idle` / `Breathing_Idle` — boss idle
- `Walk_Fwd` — boss moving toward players
- `Sword_Regular_Combo` — boss sweep attack
- `Slam` (or similar) — boss AOE attack
- `Death` — boss dies → trigger game over

### How to Load Animations in Three.js

```js
// Step 1: Load animation library once
const animLib = await loadGLB('/assets/animations/UAL1_Standard.glb')
const allClips = animLib.animations // array of AnimationClips

// Step 2: Load character
const characterGLTF = await loadGLTF('/assets/characters/Cleric.gltf')
const character = characterGLTF.scene

// Step 3: Create mixer on character
const mixer = new THREE.AnimationMixer(character)

// Step 4: Find clip by name and play
const idleClip = THREE.AnimationClip.findByName(allClips, 'Idle')
const idleAction = mixer.clipAction(idleClip)
idleAction.play()

// Step 5: Update mixer in game loop
mixer.update(deltaTime)

// Step 6: Transition between animations
function playAnimation(name, crossfadeDuration = 0.2) {
  const clip = THREE.AnimationClip.findByName(allClips, name)
  const newAction = mixer.clipAction(clip)
  currentAction.crossFadeTo(newAction, crossfadeDuration, true)
  newAction.play()
  currentAction = newAction
}
```

---

## Gameplay Design

- 1–2 players join a room via **room code**
- Timer starts when both players click **Ready** (or solo player clicks Ready)
- Fight a **3-phase boss** (Warrior.gltf scaled 2.5x)
- Timer stops when boss HP = 0
- Kill time posted to Spring Boot leaderboard API
- Global leaderboard ranked by fastest kill time
- **Duo exclusive:** both players attack within 500ms → **Sync Attack** → 1.5x damage

---

## Boss AI State Machine

```
IDLE → AGGRO → TELEGRAPH → ATTACK → RECOVER → AGGRO
Special: STAGGER (posture maxed), ENRAGE (below 30% HP)
```

| Phase | HP Range | Speed | Aggression | Notes |
|---|---|---|---|---|
| Phase 1 | 100–60% | 1.0 | Low | Telegraphs 1200ms+ |
| Phase 2 | 60–30% | 1.4 | Medium | New charge attack |
| Phase 3 | 30–0% | 1.8 | High | AOE spam, visual FX change |

### Attack Pool (Weighted Random)

| Attack | Weight | Damage | Telegraph |
|---|---|---|---|
| Sweep attack | 40% | 20 dmg | 800ms |
| Charge attack | 30% | 35 dmg | 1200ms |
| AOE ground slam | 20% | 50 dmg | 1500ms |
| Combo string | 10% | 15 dmg x3 | 400ms |

**Posture system:** 0–100 bar, fills on parries/blocks. If maxed → STAGGER → 2 sec free crit window.

---

## Player System

| Stat | Value |
|---|---|
| HP | 100 |
| Stamina | 100 (regen 15/sec) |
| Light attack | 25 dmg, 15 stamina, fast |
| Heavy attack | 50 dmg, 35 stamina, slow wind-up |
| Dodge | 20 stamina, 300ms iframes |
| Parry | Timing-based → staggers boss, fills posture bar |
| Solo respawn | 0 (one life) |
| Duo respawn | Partner can revive once, 5 sec channel |

---

## Socket.IO Events

### Client → Server

| Event | Payload |
|---|---|
| `CREATE_ROOM` | `{ playerName }` |
| `JOIN_ROOM` | `{ roomCode, playerName }` |
| `ROOM_READY` | `{ roomCode }` |
| `PLAYER_MOVE` | `{ x, y, z, rotation }` |
| `PLAYER_ATTACK` | `{ type, timestamp }` — type: `light \| heavy \| parry` |
| `PLAYER_DODGE` | `{ direction }` |

### Server → Client

| Event | Payload |
|---|---|
| `ROOM_JOINED` | `{ roomCode, players[] }` |
| `GAME_START` | `{ serverTimestamp }` |
| `PLAYER_UPDATE` | `{ id, position, hp, stamina }` |
| `BOSS_UPDATE` | `{ position, hp, phase, postureBar, currentState }` |
| `BOSS_ATTACK` | `{ type, hitbox, telegraphMs }` |
| `SYNC_ATTACK` | `{ damage }` |
| `PLAYER_DOWN` | `{ id }` |
| `GAME_OVER` | `{ killTimeMs, cleared }` |

---

## Spring Boot Leaderboard API

```
POST /api/leaderboard/submit
  Body: { playerName, teamSize, killTimeMs, roomId }
  → saves to PostgreSQL

GET /api/leaderboard/top?limit=10
  → returns top 10 sorted by killTimeMs ASC

GET /api/leaderboard/run/{roomId}
  → returns specific room result
```

**RunEntry model fields:** `id, playerName, teamSize (1|2), killTimeMs, roomId, createdAt`

---

## DevOps Pipeline

```
git push main
  → GitHub Actions: ESLint + Java Checkstyle → fires Jenkins webhook
  → Jenkins:
      stage 1: Maven clean install (Spring Boot)
      stage 2: Vite build (frontend)
      stage 3: Docker build x3 images
      stage 4: Push to DockerHub
      stage 5: SSH into AWS EC2
      stage 6: docker-compose pull && up -d
      stage 7: health check
```

---

## Project Folder Structure

```
bossrush/
├── frontend/
│   ├── public/
│   │   └── assets/
│   │       ├── characters/
│   │       │   ├── Warrior.gltf
│   │       │   ├── Cleric.gltf
│   │       │   ├── Rogue.gltf
│   │       │   └── Textures/
│   │       └── animations/
│   │           └── UAL1_Standard.glb
│   ├── src/
│   │   ├── game/
│   │   │   ├── arena.js
│   │   │   ├── player.js
│   │   │   ├── boss/
│   │   │   │   ├── BossAI.js
│   │   │   │   ├── BossPhase.js
│   │   │   │   └── AttackPool.js
│   │   │   ├── AnimationManager.js
│   │   │   └── hitDetection.js
│   │   ├── network/
│   │   │   └── SocketManager.js
│   │   └── ui/
│   │       ├── HUD.js
│   │       └── RoomLobby.js
│   ├── Dockerfile
│   └── vite.config.js
├── game-server/
│   ├── src/
│   │   ├── RoomManager.js
│   │   ├── GameLoop.js
│   │   └── BossSync.js
│   └── Dockerfile
├── leaderboard-api/
│   ├── src/main/java/com/bossrush/
│   │   ├── controller/LeaderboardController.java
│   │   ├── service/LeaderboardService.java
│   │   ├── repository/RunRepository.java
│   │   └── model/RunEntry.java
│   ├── pom.xml
│   └── Dockerfile
├── docker-compose.yml
├── Jenkinsfile
└── .github/workflows/ci.yml
```

---

## AWS Architecture

```
EC2 Instance (t2.medium):
  Jenkins on :8080
  Nginx on :80/:443
    /         → frontend container    :3000
    /api      → leaderboard-api       :8081
    /socket   → game-server           :3001
  PostgreSQL container               :5432

DockerHub images:
  bossrush/frontend:latest
  bossrush/game-server:latest
  bossrush/leaderboard-api:latest
```

---

## Current Task

> **Fill this in before sending each session:**
>
> `[DESCRIBE EXACTLY WHAT YOU NEED HERE]`
>
> **Examples:**
> - "Generate the complete AnimationManager.js file"
> - "Generate the Vite project setup and arena.js"
> - "Generate BossAI.js state machine"
> - "Generate the Jenkinsfile"
> - "Generate docker-compose.yml"
> - "Debug this error: [paste error]"
