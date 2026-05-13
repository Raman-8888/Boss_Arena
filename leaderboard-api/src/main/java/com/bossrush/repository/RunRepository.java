package com.bossrush.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.bossrush.model.RunEntry;

@Repository
public interface RunRepository extends JpaRepository<RunEntry, Long> {

    @Query("SELECT r FROM RunEntry r ORDER BY r.killTimeMs ASC")
    List<RunEntry> findTopRuns();

    List<RunEntry> findByRoomId(String roomId);
}