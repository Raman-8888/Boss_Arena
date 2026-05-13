class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomCode -> { players: [], ready: false, gameStarted: false }
  }

  generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  createRoom(socket, playerName) {
    let roomCode;
    do {
      roomCode = this.generateRoomCode();
    } while (this.rooms.has(roomCode));

    this.rooms.set(roomCode, {
      players: [{ id: socket.id, name: playerName, ready: false }],
      ready: false,
      gameStarted: false
    });

    socket.join(roomCode);
    socket.roomCode = roomCode;
    return roomCode;
  }

  joinRoom(socket, roomCode, playerName) {
    const room = this.rooms.get(roomCode);
    if (!room || room.players.length >= 2 || room.gameStarted) {
      return false;
    }

    room.players.push({ id: socket.id, name: playerName, ready: false });
    socket.join(roomCode);
    socket.roomCode = roomCode;
    return true;
  }

  setRoomReady(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return false;

    room.players.forEach(player => player.ready = true);
    room.ready = true;
    return true;
  }

  getRoomPlayers(roomCode) {
    const room = this.rooms.get(roomCode);
    return room ? room.players : [];
  }

  updatePlayerPosition(playerId, position) {
    // Find room and update player position
    for (const [roomCode, room] of this.rooms) {
      const player = room.players.find(p => p.id === playerId);
      if (player) {
        player.position = position;
        break;
      }
    }
  }

  removePlayer(playerId) {
    for (const [roomCode, room] of this.rooms) {
      const index = room.players.findIndex(p => p.id === playerId);
      if (index !== -1) {
        room.players.splice(index, 1);
        if (room.players.length === 0) {
          this.rooms.delete(roomCode);
        }
        break;
      }
    }
  }

  getRoomByPlayerId(playerId) {
    for (const [roomCode, room] of this.rooms) {
      if (room.players.some(p => p.id === playerId)) {
        return roomCode;
      }
    }
    return null;
  }
}

module.exports = RoomManager;