package com.bossrush.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.bossrush.model.RunEntry;

/**
 * Spring Data JPA repository for {@link RunEntry}.
 */
@Repository
public interface RunRepository
        extends JpaRepository<RunEntry, Long> {

    /**
     * Returns all run entries ordered by kill time ascending.
     *
     * @return list of run entries sorted by kill time
     */
    @Query("SELECT r FROM RunEntry r "
            + "ORDER BY r.killTimeMs ASC")
    List<RunEntry> findTopRuns();

    /**
     * Returns all run entries for a given room.
     *
     * @param roomId the room identifier
     * @return list of run entries for the room
     */
    List<RunEntry> findByRoomId(String roomId);
}
