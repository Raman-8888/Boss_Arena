class GameLoop {
  constructor(io, roomManager) {
    this.io = io;
    this.roomManager = roomManager;
    this.activeGames = new Map(); // roomCode -> game state
  }

  startGame(roomCode) {
    const room = this.roomManager.rooms.get(roomCode);
    if (!room) return;

    const gameState = {
      roomCode,
      players: room.players.map(p => ({ ...p, hp: 100, stamina: 100 })),
      boss: { hp: 100, phase: 1, postureBar: 0, position: { x: 0, y: 0, z: 0 }, state: 'IDLE' },
      startTime: Date.now(),
      timerRunning: true
    };

    this.activeGames.set(roomCode, gameState);

    // Start game loop
    this.gameLoop(roomCode);
  }

  gameLoop(roomCode) {
    const gameState = this.activeGames.get(roomCode);
    if (!gameState || !gameState.timerRunning) return;

    // Update boss AI
    this.updateBoss(gameState);

    // Send updates to clients
    this.io.to(roomCode).emit('BOSS_UPDATE', {
      position: gameState.boss.position,
      hp: gameState.boss.hp,
      phase: gameState.boss.phase,
      postureBar: gameState.boss.postureBar,
      currentState: gameState.boss.state
    });

    gameState.players.forEach(player => {
      this.io.to(roomCode).emit('PLAYER_UPDATE', {
        id: player.id,
        position: player.position,
        hp: player.hp,
        stamina: player.stamina
      });
    });

    // Check win condition
    if (gameState.boss.hp <= 0) {
      gameState.timerRunning = false;
      const killTimeMs = Date.now() - gameState.startTime;
      this.io.to(roomCode).emit('GAME_OVER', { killTimeMs, cleared: true });
      this.activeGames.delete(roomCode);
      return;
    }

    // Continue loop
    setTimeout(() => this.gameLoop(roomCode), 1000 / 60); // 60 FPS
  }

  updateBoss(gameState) {
    // Simple boss AI logic
    const boss = gameState.boss;

    // Phase transitions
    if (boss.hp <= 60 && boss.phase === 1) boss.phase = 2;
    if (boss.hp <= 30 && boss.phase === 2) boss.phase = 3;

    // Basic state machine
    switch (boss.state) {
      case 'IDLE':
        // Transition to AGGRO
        boss.state = 'AGGRO';
        break;
      case 'AGGRO':
        // Move towards players
        // For simplicity, just telegraph an attack
        boss.state = 'TELEGRAPH';
        setTimeout(() => {
          if (this.activeGames.has(gameState.roomCode)) {
            boss.state = 'ATTACK';
            this.performBossAttack(gameState);
          }
        }, 1200);
        break;
      case 'ATTACK':
        boss.state = 'RECOVER';
        setTimeout(() => {
          if (this.activeGames.has(gameState.roomCode)) {
            boss.state = 'AGGRO';
          }
        }, 500);
        break;
    }
  }

  performBossAttack(gameState) {
    // Simple attack: deal damage to all players
    const damage = 20;
    gameState.players.forEach(player => {
      player.hp -= damage;
      if (player.hp <= 0) {
        this.io.to(gameState.roomCode).emit('PLAYER_DOWN', { id: player.id });
      }
    });

    this.io.to(gameState.roomCode).emit('BOSS_ATTACK', {
      type: 'sweep',
      hitbox: { x: 0, y: 0, z: 0, radius: 5 },
      telegraphMs: 800
    });
  }
}

module.exports = GameLoop;