package com.bossrush.model;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Entity representing a single boss-kill run entry.
 */
@Entity
@Table(name = "run_entries")
public class RunEntry {

    /** Auto-generated primary key. */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Name of the player who made the run. */
    @Column(nullable = false)
    private String playerName;

    /** Team size for the run (1 or 2). */
    @Column(nullable = false)
    private Integer teamSize;

    /** Time in milliseconds taken to kill the boss. */
    @Column(nullable = false)
    private Long killTimeMs;

    /** Unique identifier of the room. */
    @Column(nullable = false)
    private String roomId;

    /** Timestamp when the run was submitted. */
    @Column(nullable = false)
    private LocalDateTime createdAt;

    /** Default no-arg constructor required by JPA. */
    public RunEntry() {
    }

    /**
     * Constructs a new run entry with the given details.
     *
     * @param playerName name of the player
     * @param teamSize   number of players in the team
     * @param killTimeMs time to kill the boss in ms
     * @param roomId     unique room identifier
     */
    public RunEntry(
            final String playerName,
            final Integer teamSize,
            final Long killTimeMs,
            final String roomId) {
        this.playerName = playerName;
        this.teamSize = teamSize;
        this.killTimeMs = killTimeMs;
        this.roomId = roomId;
        this.createdAt = LocalDateTime.now();
    }

    /**
     * Returns the run ID.
     *
     * @return the ID
     */
    public Long getId() {
        return id;
    }

    /**
     * Sets the run ID.
     *
     * @param id the ID to set
     */
    public void setId(final Long id) {
        this.id = id;
    }

    /**
     * Returns the player name.
     *
     * @return the player name
     */
    public String getPlayerName() {
        return playerName;
    }

    /**
     * Sets the player name.
     *
     * @param playerName the player name to set
     */
    public void setPlayerName(final String playerName) {
        this.playerName = playerName;
    }

    /**
     * Returns the team size.
     *
     * @return the team size
     */
    public Integer getTeamSize() {
        return teamSize;
    }

    /**
     * Sets the team size.
     *
     * @param teamSize the team size to set
     */
    public void setTeamSize(final Integer teamSize) {
        this.teamSize = teamSize;
    }

    /**
     * Returns the kill time in milliseconds.
     *
     * @return the kill time in ms
     */
    public Long getKillTimeMs() {
        return killTimeMs;
    }

    /**
     * Sets the kill time in milliseconds.
     *
     * @param killTimeMs the kill time to set
     */
    public void setKillTimeMs(final Long killTimeMs) {
        this.killTimeMs = killTimeMs;
    }

    /**
     * Returns the room ID.
     *
     * @return the room ID
     */
    public String getRoomId() {
        return roomId;
    }

    /**
     * Sets the room ID.
     *
     * @param roomId the room ID to set
     */
    public void setRoomId(final String roomId) {
        this.roomId = roomId;
    }

    /**
     * Returns the creation timestamp.
     *
     * @return the creation timestamp
     */
    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    /**
     * Sets the creation timestamp.
     *
     * @param createdAt the timestamp to set
     */
    public void setCreatedAt(
            final LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}