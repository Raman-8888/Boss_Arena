<div align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=timeGradient&height=250&section=header&text=BossRush&fontSize=90&animation=fadeIn&fontAlignY=38&desc=Multiplayer%203D%20Boss%20Fight%20Game&descAlignY=51&descAlign=62" />

  **A Multiplayer 3D Boss Fight Game built with Three.js, Node.js, and Spring Boot.**
  
  <p align="center">
    <img src="https://img.shields.io/badge/Three.js-black?style=for-the-badge&logo=three.js&logoColor=white" />
    <img src="https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E" />
    <img src="https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white" />
    <img src="https://img.shields.io/badge/Socket.io-black?style=for-the-badge&logo=socket.io&badgeColor=010101" />
    <img src="https://img.shields.io/badge/Spring_Boot-F2F4F9?style=for-the-badge&logo=spring-boot" />
    <img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" />
    <img src="https://img.shields.io/badge/Docker-2CA5E0?style=for-the-badge&logo=docker&logoColor=white" />
  </p>
</div>

<br />

## ⚔️ Welcome to the Arena
**BossRush** is a fast-paced, highly-responsive 3D action game where players team up (or go solo) to defeat an evolving, 3-phase boss. Jump into a room, gear up your combos, and sync your attacks for maximum damage. 

<div align="center">
  <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Smilies/Crossed%20Swords.png" alt="Crossed Swords" width="80" height="80" />
</div>

## ✨ Features

- **Multiplayer Co-Op:** Real-time sync powered by Socket.IO. Join with a room code.
- **Dynamic 3D Combat:** Built on Three.js & Rapier3D. Includes light/heavy attacks, dodges with i-frames, and parries.
- **Evolving AI Boss:** A state-machine driven boss with 3 distinct phases, posture tracking, and weighted attack pools.
- **Global Leaderboard:** Track your fastest kill times with our Spring Boot + PostgreSQL backend API.

## 🛠️ Tech Stack & Architecture

- **Frontend:** Three.js, Rapier3D, Vite
- **Multiplayer Server:** Node.js, Socket.IO
- **Backend API (Leaderboard):** Java, Spring Boot, Maven
- **Database:** PostgreSQL
- **DevOps:** Docker, docker-compose, Jenkins, AWS EC2, GitHub Actions

## 🎮 How to Play

1. **Host or Join:** Create a room and share the code, or join an existing one.
2. **Ready Up:** Timer starts when all players are ready.
3. **Fight:** 
   - **Light Attack:** Quick, low stamina cost.
   - **Heavy Attack:** Slow wind-up, high damage.
   - **Dodge/Parry:** Time your parries to build the boss's stagger bar!
4. **Sync Attack:** Hit the boss at the exact same time as your partner for **1.5x Damage**!

## 🚀 Getting Started Locally

```bash
# Clone the repository
git clone https://github.com/Raman-8888/Boss_Arena.git
cd Boss_Arena

# Start the full stack with Docker
docker-compose up -d --build
```

*Frontend runs on `:3000`, Game Server on `:3001`, Leaderboard API on `:8081`.*

---
<div align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=timeGradient&height=100&section=footer" />
</div>
