package com.bossrush.service;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.bossrush.model.RunEntry;
import com.bossrush.repository.RunRepository;

/**
 * Service layer for leaderboard business logic.
 */
@Service
public class LeaderboardService {

    /** Repository for run entry persistence. */
    @Autowired
    private RunRepository runRepository;

    /**
     * Creates and persists a new run entry.
     *
     * @param playerName name of the player
     * @param teamSize   size of the team (1 or 2)
     * @param killTimeMs time taken to kill the boss in ms
     * @param roomId     unique identifier for the room
     * @return the saved run entry
     */
    public RunEntry submitRun(
            final String playerName,
            final Integer teamSize,
            final Long killTimeMs,
            final String roomId) {
        final RunEntry runEntry =
                new RunEntry(playerName, teamSize,
                        killTimeMs, roomId);
        return runRepository.save(runEntry);
    }

    /**
     * Returns the top-ranked run entries.
     *
     * @param limit maximum number of results
     * @return list of top run entries
     */
    public List<RunEntry> getTopRuns(final int limit) {
        final List<RunEntry> allRuns =
                runRepository.findTopRuns();
        return allRuns.subList(
                0, Math.min(limit, allRuns.size()));
    }

    /**
     * Returns all runs for a specific room.
     *
     * @param roomId the room identifier
     * @return list of run entries for the given room
     */
    public List<RunEntry> getRunByRoomId(
            final String roomId) {
        return runRepository.findByRoomId(roomId);
    }
}