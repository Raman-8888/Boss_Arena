package com.bossrush.repository;

import com.bossrush.model.RunEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface RunRepository extends JpaRepository<RunEntry, Long> {

    @Query("SELECT r FROM RunEntry r ORDER BY r.killTimeMs ASC")
    List<RunEntry> findTopRuns();

    List<RunEntry> findByRoomId(String roomId);
}