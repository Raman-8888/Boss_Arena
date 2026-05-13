const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const RoomManager = require('./RoomManager');
const GameLoop = require('./GameLoop');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const roomManager = new RoomManager();
const gameLoop = new GameLoop(io, roomManager);

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('CREATE_ROOM', (data) => {
    const { playerName } = data;
    const roomCode = roomManager.createRoom(socket, playerName);
    socket.emit('ROOM_JOINED', { roomCode, players: roomManager.getRoomPlayers(roomCode) });
  });

  socket.on('JOIN_ROOM', (data) => {
    const { roomCode, playerName } = data;
    if (roomManager.joinRoom(socket, roomCode, playerName)) {
      io.to(roomCode).emit('ROOM_JOINED', { roomCode, players: roomManager.getRoomPlayers(roomCode) });
    } else {
      socket.emit('ROOM_JOIN_FAILED', { message: 'Room not found or full' });
    }
  });

  socket.on('ROOM_READY', (data) => {
    const { roomCode } = data;
    if (roomManager.setRoomReady(roomCode)) {
      io.to(roomCode).emit('GAME_START', { serverTimestamp: Date.now() });
      gameLoop.startGame(roomCode);
    }
  });

  socket.on('PLAYER_MOVE', (data) => {
    // Handle player movement
    roomManager.updatePlayerPosition(socket.id, data);
    socket.to(socket.roomCode).emit('PLAYER_UPDATE', { id: socket.id, ...data });
  });

  socket.on('PLAYER_ATTACK', (data) => {
    // Handle player attack
    // Implement attack logic
  });

  socket.on('PLAYER_DODGE', (data) => {
    // Handle player dodge
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    roomManager.removePlayer(socket.id);
  });
});

server.listen(3001, () => {
  console.log('Game server listening on port 3001');
});