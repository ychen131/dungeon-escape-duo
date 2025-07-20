import Phaser from 'phaser';

export class LobbyScene extends Phaser.Scene {
    private socket: any;
    private backgroundMusic: Phaser.Sound.BaseSound | null = null;
    
    constructor() {
        super({ key: 'LobbyScene' });
    }
    
    preload() {
        // Preload the game logo if it exists
        this.load.image('game-logo', 'assets/game-logo.png');
        
        // Load lobby background music
        this.load.audio('lobby_music', ['assets/audio/beneath.mp3', 'assets/audio/beneath.ogg']);
    }
    
    create() {
        // Center coordinates
        const centerX = this.cameras.main.width / 2;
        const centerY = this.cameras.main.height / 2;
        
        // Add game logo centered on the canvas
        const logo = this.add.image(centerX, centerY, 'game-logo');
        logo.setScale(0.5); // Scale down if needed
        
        // Add click instruction text
        const clickText = this.add.text(centerX, centerY + 150, 'Click anywhere to enable sound', {
            fontSize: '18px',
            color: '#ffffff',
            fontFamily: 'Arial',
            stroke: '#000000',
            strokeThickness: 2
        }).setOrigin(0.5);
        
        // Variable to track if music has started
        let musicStarted = false;
        
        // Handle click/tap to start music (browser autoplay policy)
        const startMusic = () => {
            // Resume audio context if it's suspended (for WebAudio)
            if (!musicStarted && 'context' in this.sound && (this.sound as any).context.state === 'suspended') {
                (this.sound as any).context.resume();
            }
            
            if (!musicStarted) {
                // Play lobby background music
                this.backgroundMusic = this.sound.add('lobby_music', {
                    loop: true,
                    volume: 0.3
                });
                this.backgroundMusic.play();
                musicStarted = true;
                clickText.destroy(); // Remove the instruction text
                console.log('🎵 Lobby music started');
            }
        };
        
        // Add click listener to the entire game
        this.input.on('pointerdown', startMusic);
        
        // Also try to play automatically in case autoplay is allowed
        this.time.delayedCall(100, () => {
            if (!musicStarted) {
                startMusic();
            }
        });
        
        // Update the HTML status to show we're waiting for another player
        const statusElement = document.getElementById('status');
        if (statusElement) {
            statusElement.textContent = 'Waiting for another player to join...';
            statusElement.style.color = '#ecf0f1';
        }
        
        const itemDisplayElement = document.getElementById('item-display');
        if (itemDisplayElement) {
            itemDisplayElement.textContent = 'The game will start automatically when both players are connected';
            itemDisplayElement.style.color = '#95a5a6';
        }
        
        // Get or create socket connection
        if (!this.socket || typeof this.socket !== 'object') {
            const isDevelopment = import.meta.env && import.meta.env.DEV;
            const serverUrl = isDevelopment ? 'http://localhost:3000' : 'https://dungeon-escape-duo.onrender.com';
            this.socket = (window as any).io(serverUrl);
            (window as any).socket = this.socket; // Store globally for GameScene
            console.log('🔌 Created new socket connection in LobbyScene to:', serverUrl);
        } else {
            console.log('🔌 Using existing socket connection');
        }
        
        // Listen for game start event
        this.socket.on('gameStart', (initialGameState: any) => {
            console.log('Game starting with state:', initialGameState);
            
            // Stop listening to avoid duplicate handlers
            this.socket.off('gameStart');
            
            // Stop lobby music when transitioning to game
            if (this.backgroundMusic) {
                this.backgroundMusic.stop();
            }
            
            // Transition to game scene with the initial state
            this.scene.start('GameScene', { initialState: initialGameState });
        });
        
        // Listen for existing gameState if rejoining
        this.socket.on('gameState', (gameState: any) => {
            // If game already started, go directly to game scene
            if (gameState.gameStarted) {
                console.log('Game already in progress, joining...');
                this.socket.off('gameState');
                this.scene.start('GameScene', { initialState: gameState });
            }
        });
    }
    
    shutdown() {
        // Clean up socket listeners when scene shuts down
        if (this.socket) {
            this.socket.off('gameStart');
            this.socket.off('gameState');
        }
    }
} 