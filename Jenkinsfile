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
                    sh 'mvn clean install'
                }
            }
        }

        stage('Frontend Build') {
            steps {
                sh 'npm install'
                sh 'npm run build'
            }
        }

        stage('Docker Build') {
            steps {
                sh 'docker build -t bossrush/frontend:latest .'
                sh 'docker build -t bossrush/game-server:latest ./game-server'
                sh 'docker build -t bossrush/leaderboard-api:latest ./leaderboard-api'
            }
        }

        stage('Docker Push') {
            steps {
                sh 'docker push bossrush/frontend:latest'
                sh 'docker push bossrush/game-server:latest'
                sh 'docker push bossrush/leaderboard-api:latest'
            }
        }

        stage('Deploy') {
            steps {
                sh 'docker-compose down'
                sh 'docker-compose pull'
                sh 'docker-compose up -d'
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