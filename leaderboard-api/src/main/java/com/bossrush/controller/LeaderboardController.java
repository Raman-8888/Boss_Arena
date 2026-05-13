package com.bossrush.controller;

import com.bossrush.model.RunEntry;
import com.bossrush.service.LeaderboardService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/leaderboard")
@CrossOrigin(origins = "*")
public class LeaderboardController {

    @Autowired
    private LeaderboardService leaderboardService;

    @PostMapping("/submit")
    public ResponseEntity<RunEntry> submitRun(@RequestBody Map<String, Object> payload) {
        String playerName = (String) payload.get("playerName");
        Integer teamSize = (Integer) payload.get("teamSize");
        Long killTimeMs = Long.valueOf(payload.get("killTimeMs").toString());
        String roomId = (String) payload.get("roomId");

        RunEntry runEntry = leaderboardService.submitRun(playerName, teamSize, killTimeMs, roomId);
        return ResponseEntity.ok(runEntry);
    }

    @GetMapping("/top")
    public ResponseEntity<List<RunEntry>> getTopRuns(@RequestParam(defaultValue = "10") int limit) {
        List<RunEntry> topRuns = leaderboardService.getTopRuns(limit);
        return ResponseEntity.ok(topRuns);
    }

    @GetMapping("/run/{roomId}")
    public ResponseEntity<List<RunEntry>> getRunByRoomId(@PathVariable String roomId) {
        List<RunEntry> runs = leaderboardService.getRunByRoomId(roomId);
        return ResponseEntity.ok(runs);
    }
}