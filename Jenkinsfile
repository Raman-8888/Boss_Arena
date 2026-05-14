pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                git branch: 'master', url: 'https://github.com/Raman-8888/Boss_Arena.git'
            }
        }

        stage('Maven Build') {
            steps {
                dir('leaderboard-api') {
                    bat 'mvn clean install'
                }
            }
        }

        stage('Frontend Build') {
            steps {
                bat 'npm install'
                bat 'npm run build'
            }
        }

        stage('Docker Build') {
            steps {
                bat 'docker build -t bossrush/frontend:latest .'
                bat 'docker build -t bossrush/game-server:latest ./game-server'
                bat 'docker build -t bossrush/leaderboard-api:latest ./leaderboard-api'
            }
        }

        stage('Docker Push') {
            steps {
                bat 'docker push bossrush/frontend:latest'
                bat 'docker push bossrush/game-server:latest'
                bat 'docker push bossrush/leaderboard-api:latest'
            }
        }

        stage('Deploy') {
            steps {
                bat 'docker-compose down'
                bat 'docker-compose pull'
                bat 'docker-compose up -d'
            }
        }
    }

    post {
        always {
            echo 'Pipeline completed'
        }
        failure {
            echo 'Pipeline failed'
        }
    }
}