// BossSync.js - For synchronizing boss state across clients
class BossSync {
  constructor() {
    this.bossStates = new Map(); // roomCode -> boss state
  }

  updateBossState(roomCode, state) {
    this.bossStates.set(roomCode, state);
  }

  getBossState(roomCode) {
    return this.bossStates.get(roomCode);
  }
}

module.exports = BossSync;