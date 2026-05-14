FROM maven:3.8-eclipse-temurin-17
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn clean package -DskipTests
EXPOSE 8081
CMD ["java", "-jar", "target/leaderboard-api-0.0.1-SNAPSHOT.jar"]