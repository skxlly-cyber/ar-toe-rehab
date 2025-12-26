// AR Toe Grip Rehabilitation Game
// Web-based version using AR.js

// Game State
const GameState = {
    WAITING: 'waiting',
    CALIBRATION: 'calibration',
    PLAYING: 'playing',
    GAMEOVER: 'gameover'
};

class ToeGripGame {
    constructor() {
        // State
        this.currentState = GameState.WAITING;
        this.isMarkerVisible = false;

        // Calibration
        this.neutralPosition = null;
        this.neutralRotation = null;
        this.calibrationProgress = 0;
        this.calibrationDuration = 3000; // 3 seconds
        this.calibrationStartTime = 0;

        // Motion tracking
        this.currentCurlMagnitude = 0;
        this.currentCurlAngle = 0;
        this.exerciseState = 'neutral'; // neutral, curling, curled, releasing
        this.curlThreshold = 15; // degrees

        // Exercise metrics
        this.totalReps = 0;
        this.currentHoldTime = 0;
        this.maxHoldTime = 0;
        this.holdStartTime = 0;

        // Game
        this.score = 0;
        this.combo = 1;
        this.consecutiveCatches = 0;
        this.gameTime = 180; // 3 minutes
        this.gameStartTime = 0;
        this.fruits = [];
        this.spawnInterval = 2000; // ms
        this.lastSpawnTime = 0;

        // DOM elements
        this.initDOMElements();

        // AR elements
        this.marker = null;
        this.basket = null;
        this.gameAnchor = null;

        // Initialize
        this.init();
    }

    initDOMElements() {
        // Panels
        this.waitingPanel = document.getElementById('waiting-panel');
        this.calibrationPanel = document.getElementById('calibration-panel');
        this.gameHUD = document.getElementById('game-hud');
        this.gameoverPanel = document.getElementById('gameover-panel');

        // HUD elements
        this.scoreEl = document.getElementById('score');
        this.timeEl = document.getElementById('time');
        this.comboEl = document.getElementById('combo-text');
        this.curlFillEl = document.getElementById('curl-fill');
        this.curlPercentEl = document.getElementById('curl-percent');
        this.repsEl = document.getElementById('reps');
        this.holdTimeEl = document.getElementById('hold-time');

        // Calibration
        this.calibrationProgressEl = document.getElementById('calibration-progress');
        this.calibrationTextEl = document.getElementById('calibration-text');

        // Game over
        this.finalScoreEl = document.getElementById('final-score');
        this.finalRepsEl = document.getElementById('final-reps');
        this.finalHoldEl = document.getElementById('final-hold');
        this.restartBtn = document.getElementById('restart-btn');

        // Achievement
        this.achievementEl = document.getElementById('achievement');
        this.achievementTextEl = document.getElementById('achievement-text');

        // Event listeners
        this.restartBtn.addEventListener('click', () => this.restartGame());
    }

    init() {
        // Wait for A-Frame to load
        const scene = document.querySelector('a-scene');

        if (scene.hasLoaded) {
            this.setupAR();
        } else {
            scene.addEventListener('loaded', () => this.setupAR());
        }
    }

    setupAR() {
        this.marker = document.getElementById('marker');
        this.basket = document.getElementById('basket');
        this.gameAnchor = document.getElementById('game-anchor');

        // Marker events
        this.marker.addEventListener('markerFound', () => {
            this.onMarkerFound();
        });

        this.marker.addEventListener('markerLost', () => {
            this.onMarkerLost();
        });

        // Start update loop
        this.lastUpdateTime = Date.now();
        this.update();
    }

    onMarkerFound() {
        console.log('Marker found!');
        this.isMarkerVisible = true;

        if (this.currentState === GameState.WAITING) {
            this.startCalibration();
        }
    }

    onMarkerLost() {
        console.log('Marker lost!');
        this.isMarkerVisible = false;
    }

    startCalibration() {
        this.setState(GameState.CALIBRATION);
        this.calibrationStartTime = Date.now();
        this.calibrationProgress = 0;
    }

    updateCalibration() {
        if (!this.isMarkerVisible) {
            // Lost tracking during calibration
            this.setState(GameState.WAITING);
            return;
        }

        const elapsed = Date.now() - this.calibrationStartTime;
        this.calibrationProgress = Math.min(100, (elapsed / this.calibrationDuration) * 100);

        // Update UI
        this.calibrationProgressEl.style.width = this.calibrationProgress + '%';
        this.calibrationTextEl.textContent = Math.round(this.calibrationProgress) + '%';

        if (this.calibrationProgress >= 100) {
            // Calibration complete - record neutral position
            const markerObject = this.marker.object3D;
            this.neutralPosition = markerObject.position.clone();
            this.neutralRotation = markerObject.rotation.clone();

            console.log('Calibration complete!', this.neutralPosition, this.neutralRotation);
            this.showAchievement('Calibration Complete!');

            setTimeout(() => {
                this.startGame();
            }, 1000);
        }
    }

    startGame() {
        this.setState(GameState.PLAYING);
        this.gameStartTime = Date.now();
        this.score = 0;
        this.combo = 1;
        this.totalReps = 0;
        this.currentHoldTime = 0;
        this.maxHoldTime = 0;
        this.consecutiveCatches = 0;
        this.fruits = [];
        this.lastSpawnTime = Date.now();

        this.updateHUD();
    }

    updateGame(deltaTime) {
        if (!this.isMarkerVisible) return;

        // Update game timer
        const elapsed = (Date.now() - this.gameStartTime) / 1000;
        const remaining = Math.max(0, this.gameTime - elapsed);

        const minutes = Math.floor(remaining / 60);
        const seconds = Math.floor(remaining % 60);
        this.timeEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        if (remaining <= 0) {
            this.endGame();
            return;
        }

        // Track motion
        this.trackMotion();

        // Spawn fruits
        if (Date.now() - this.lastSpawnTime > this.spawnInterval) {
            this.spawnFruit();
            this.lastSpawnTime = Date.now();

            // Increase difficulty
            this.spawnInterval = Math.max(800, this.spawnInterval * 0.98);
        }

        // Update fruits
        this.updateFruits(deltaTime);

        // Update basket position based on curl
        this.updateBasketPosition();

        // Update HUD
        this.updateHUD();
    }

    trackMotion() {
        if (!this.neutralPosition || !this.neutralRotation) return;

        const markerObject = this.marker.object3D;
        const currentPos = markerObject.position;
        const currentRot = markerObject.rotation;

        // Calculate curl angle (simplified - using Y rotation difference)
        const rotDiff = Math.abs(currentRot.x - this.neutralRotation.x) * (180 / Math.PI);
        this.currentCurlAngle = rotDiff;

        // Normalize to 0-1
        this.currentCurlMagnitude = Math.min(1, rotDiff / 45); // 45 degrees = max curl

        // State machine for exercise tracking
        this.updateExerciseState();
    }

    updateExerciseState() {
        const prevState = this.exerciseState;

        switch (this.exerciseState) {
            case 'neutral':
                if (this.currentCurlAngle > this.curlThreshold) {
                    this.exerciseState = 'curling';
                }
                break;

            case 'curling':
                if (this.currentCurlAngle > this.curlThreshold * 1.5) {
                    this.exerciseState = 'curled';
                    this.holdStartTime = Date.now();
                } else if (this.currentCurlAngle < this.curlThreshold * 0.5) {
                    this.exerciseState = 'neutral';
                }
                break;

            case 'curled':
                // Update hold time
                this.currentHoldTime = (Date.now() - this.holdStartTime) / 1000;
                if (this.currentHoldTime > this.maxHoldTime) {
                    this.maxHoldTime = this.currentHoldTime;
                }

                if (this.currentCurlAngle < this.curlThreshold * 0.7) {
                    this.exerciseState = 'releasing';
                }
                break;

            case 'releasing':
                if (this.currentCurlAngle < this.curlThreshold * 0.5) {
                    this.exerciseState = 'neutral';

                    // Rep completed!
                    this.totalReps++;
                    this.showAchievement(`Rep #${this.totalReps}!`);

                    // Check for rep milestones
                    if (this.totalReps % 10 === 0) {
                        this.showAchievement(`🎉 ${this.totalReps} Reps!`);
                    }

                    this.currentHoldTime = 0;
                } else if (this.currentCurlAngle > this.curlThreshold) {
                    this.exerciseState = 'curled';
                }
                break;
        }
    }

    updateBasketPosition() {
        if (!this.basket) return;

        // Move basket vertically based on curl magnitude
        const minY = -0.15;
        const maxY = 0.15;
        const targetY = minY + (this.currentCurlMagnitude * (maxY - minY));

        const currentPos = this.basket.getAttribute('position');
        currentPos.y = targetY;
        this.basket.setAttribute('position', currentPos);
    }

    spawnFruit() {
        const scene = document.querySelector('a-scene');

        // Random fruit type
        const fruitTypes = [
            { color: '#FF0000', points: 10 }, // Apple
            { color: '#FFA500', points: 15 }, // Orange
            { color: '#FFFF00', points: 20 }  // Banana
        ];
        const fruitType = fruitTypes[Math.floor(Math.random() * fruitTypes.length)];

        // Create fruit entity
        const fruit = document.createElement('a-sphere');
        fruit.setAttribute('radius', '0.04');
        fruit.setAttribute('color', fruitType.color);
        fruit.setAttribute('position', {
            x: (Math.random() - 0.5) * 0.2,
            y: 0.3,
            z: 0
        });

        // Add to game anchor (so it moves with marker)
        this.gameAnchor.appendChild(fruit);

        // Store fruit data
        this.fruits.push({
            element: fruit,
            points: fruitType.points,
            fallSpeed: 0.15 + (Math.random() * 0.1),
            spawnTime: Date.now()
        });
    }

    updateFruits(deltaTime) {
        const basketPos = this.basket.getAttribute('position');
        const basketSize = 0.15;

        for (let i = this.fruits.length - 1; i >= 0; i--) {
            const fruit = this.fruits[i];
            const pos = fruit.element.getAttribute('position');

            // Fall
            pos.y -= fruit.fallSpeed * (deltaTime / 1000);
            fruit.element.setAttribute('position', pos);

            // Check collision with basket
            const distance = Math.sqrt(
                Math.pow(pos.x - basketPos.x, 2) +
                Math.pow(pos.y - basketPos.y, 2)
            );

            if (distance < basketSize / 2) {
                // Caught!
                this.onFruitCaught(fruit);
                fruit.element.parentNode.removeChild(fruit.element);
                this.fruits.splice(i, 1);
            }
            // Check if missed (fell below)
            else if (pos.y < -0.3) {
                this.onFruitMissed(fruit);
                fruit.element.parentNode.removeChild(fruit.element);
                this.fruits.splice(i, 1);
            }
        }
    }

    onFruitCaught(fruit) {
        // Add score with combo
        const points = fruit.points * this.combo;
        this.score += points;

        // Update combo
        this.consecutiveCatches++;
        if (this.consecutiveCatches >= 3) {
            this.combo = Math.min(5, this.combo + 1);
            this.showAchievement(`Combo x${this.combo}!`);
        }

        console.log(`Caught! +${points} points`);
    }

    onFruitMissed(fruit) {
        // Reset combo
        this.consecutiveCatches = 0;
        this.combo = 1;
        console.log('Missed!');
    }

    updateHUD() {
        this.scoreEl.textContent = this.score;
        this.repsEl.textContent = this.totalReps;
        this.holdTimeEl.textContent = this.currentHoldTime.toFixed(1) + 's';

        // Curl meter
        const curlPercent = Math.round(this.currentCurlMagnitude * 100);
        this.curlFillEl.style.width = curlPercent + '%';
        this.curlPercentEl.textContent = curlPercent + '%';

        // Combo
        if (this.combo > 1) {
            this.comboEl.textContent = `COMBO x${this.combo}!`;
            this.comboEl.style.display = 'block';
        } else {
            this.comboEl.style.display = 'none';
        }
    }

    endGame() {
        this.setState(GameState.GAMEOVER);

        // Clear fruits
        this.fruits.forEach(fruit => {
            fruit.element.parentNode.removeChild(fruit.element);
        });
        this.fruits = [];

        // Show final stats
        this.finalScoreEl.textContent = this.score;
        this.finalRepsEl.textContent = this.totalReps;
        this.finalHoldEl.textContent = this.maxHoldTime.toFixed(1) + 's';

        // Save to localStorage
        this.saveSession();
    }

    restartGame() {
        this.setState(GameState.WAITING);
        this.calibrationProgress = 0;
    }

    saveSession() {
        const session = {
            date: new Date().toISOString(),
            score: this.score,
            reps: this.totalReps,
            maxHold: this.maxHoldTime,
            duration: this.gameTime
        };

        // Get existing sessions
        let sessions = JSON.parse(localStorage.getItem('toegripSessions') || '[]');
        sessions.push(session);

        // Keep last 30 sessions
        if (sessions.length > 30) {
            sessions = sessions.slice(-30);
        }

        localStorage.setItem('toegripSessions', JSON.stringify(sessions));
        console.log('Session saved:', session);
    }

    showAchievement(text) {
        this.achievementTextEl.textContent = text;
        this.achievementEl.classList.add('show');

        setTimeout(() => {
            this.achievementEl.classList.remove('show');
        }, 3000);
    }

    setState(newState) {
        this.currentState = newState;

        // Hide all panels
        this.waitingPanel.classList.remove('active');
        this.calibrationPanel.classList.remove('active');
        this.gameHUD.classList.remove('active');
        this.gameoverPanel.classList.remove('active');

        // Show appropriate panel
        switch (newState) {
            case GameState.WAITING:
                this.waitingPanel.classList.add('active');
                break;
            case GameState.CALIBRATION:
                this.calibrationPanel.classList.add('active');
                break;
            case GameState.PLAYING:
                this.gameHUD.classList.add('active');
                break;
            case GameState.GAMEOVER:
                this.gameoverPanel.classList.add('active');
                break;
        }

        console.log('State changed to:', newState);
    }

    update() {
        const now = Date.now();
        const deltaTime = now - this.lastUpdateTime;
        this.lastUpdateTime = now;

        switch (this.currentState) {
            case GameState.CALIBRATION:
                this.updateCalibration();
                break;
            case GameState.PLAYING:
                this.updateGame(deltaTime);
                break;
        }

        requestAnimationFrame(() => this.update());
    }
}

// Start the game when page loads
window.addEventListener('load', () => {
    const game = new ToeGripGame();
});
