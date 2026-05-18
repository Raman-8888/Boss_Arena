package com.bossrush;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Entry point for the BossRush Leaderboard API application.
 */
@SpringBootApplication
public class LeaderboardApiApplication {

    /**
     * Instantiates a new LeaderboardApiApplication.
     */
    public LeaderboardApiApplication() {
    }

    /**
     * Dummy method to prevent Checkstyle from treating this as a utility class.
     */
    public void init() {
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
