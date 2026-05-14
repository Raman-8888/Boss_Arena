package com.bossrush.controller;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.bossrush.model.RunEntry;
import com.bossrush.service.LeaderboardService;

/**
 * REST controller for leaderboard operations.
 */
@RestController
@RequestMapping("/api/leaderboard")
@CrossOrigin(origins = "*")
public class LeaderboardController {

    /** Service for leaderboard business logic. */
    @Autowired
    private LeaderboardService leaderboardService;

    /**
     * Submits a new run to the leaderboard.
     *
     * @param payload the run submission payload
     * @return the created run entry
     */
    @PostMapping("/submit")
    public ResponseEntity<RunEntry> submitRun(
            @RequestBody final Map<String, Object> payload) {
        final String playerName =
                (String) payload.get("playerName");
        final Integer teamSize =
                (Integer) payload.get("teamSize");
        final Long killTimeMs =
                Long.valueOf(
                        payload.get("killTimeMs").toString());
        final String roomId =
                (String) payload.get("roomId");

        final RunEntry runEntry = leaderboardService
                .submitRun(playerName, teamSize,
                        killTimeMs, roomId);
        return ResponseEntity.ok(runEntry);
    }

    /**
     * Returns the top runs on the leaderboard.
     *
     * @param limit maximum number of runs to return
     * @return list of top run entries
     */
    @GetMapping("/top")
    public ResponseEntity<List<RunEntry>> getTopRuns(
            @RequestParam(defaultValue = "10")
            final int limit) {
        final List<RunEntry> topRuns =
                leaderboardService.getTopRuns(limit);
        return ResponseEntity.ok(topRuns);
    }

    /**
     * Returns all runs associated with a room.
     *
     * @param roomId the room identifier
     * @return list of run entries for the room
     */
    @GetMapping("/run/{roomId}")
    public ResponseEntity<List<RunEntry>> getRunByRoomId(
            @PathVariable final String roomId) {
        final List<RunEntry> runs =
                leaderboardService.getRunByRoomId(roomId);
        return ResponseEntity.ok(runs);
    }
}