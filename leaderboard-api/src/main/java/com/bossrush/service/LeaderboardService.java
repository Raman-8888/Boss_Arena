package com.bossrush.service;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.bossrush.model.RunEntry;
import com.bossrush.repository.RunRepository;

@Service
public class LeaderboardService {

    @Autowired
    private RunRepository runRepository;

    public RunEntry submitRun(String playerName, Integer teamSize, Long killTimeMs, String roomId) {
        RunEntry runEntry = new RunEntry(playerName, teamSize, killTimeMs, roomId);
        return runRepository.save(runEntry);
    }

    public List<RunEntry> getTopRuns(int limit) {
        List<RunEntry> allRuns = runRepository.findTopRuns();
        return allRuns.subList(0, Math.min(limit, allRuns.size()));
    }

    public List<RunEntry> getRunByRoomId(String roomId) {
        return runRepository.findByRoomId(roomId);
    }
}