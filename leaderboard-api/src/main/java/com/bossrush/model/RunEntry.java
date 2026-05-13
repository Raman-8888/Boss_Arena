package com.bossrush.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "run_entries")
public class RunEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String playerName;

    @Column(nullable = false)
    private Integer teamSize; // 1 or 2

    @Column(nullable = false)
    private Long killTimeMs;

    @Column(nullable = false)
    private String roomId;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    // Constructors
    public RunEntry() {}

    public RunEntry(String playerName, Integer teamSize, Long killTimeMs, String roomId) {
        this.playerName = playerName;
        this.teamSize = teamSize;
        this.killTimeMs = killTimeMs;
        this.roomId = roomId;
        this.createdAt = LocalDateTime.now();
    }

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getPlayerName() { return playerName; }
    public void setPlayerName(String playerName) { this.playerName = playerName; }

    public Integer getTeamSize() { return teamSize; }
    public void setTeamSize(Integer teamSize) { this.teamSize = teamSize; }

    public Long getKillTimeMs() { return killTimeMs; }
    public void setKillTimeMs(Long killTimeMs) { this.killTimeMs = killTimeMs; }

    public String getRoomId() { return roomId; }
    public void setRoomId(String roomId) { this.roomId = roomId; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}