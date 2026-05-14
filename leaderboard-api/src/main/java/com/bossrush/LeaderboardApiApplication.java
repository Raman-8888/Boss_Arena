package com.bossrush;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Entry point for the BossRush Leaderboard API application.
 */
@SpringBootApplication
public class LeaderboardApiApplication {

    /** Utility class — do not instantiate. */
    private LeaderboardApiApplication() {
    }

    /**
     * Starts the Spring Boot application.
     *
     * @param args command-line arguments
     */
    public static void main(final String[] args) {
        SpringApplication.run(
                LeaderboardApiApplication.class, args);
    }
}