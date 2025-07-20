import Phaser from 'phaser';

export class LobbyScene extends Phaser.Scene {
    private socket: any;
    private waitingText?: Phaser.GameObjects.Text;
    
    constructor() {
        super({ key: 'LobbyScene' });
    }
    
    preload() {
        // Preload the game logo if it exists
        this.load.image('game-logo', 'assets/game-logo.png');
    }
    
    create() {
        // Center coordinates
        const centerX = this.cameras.main.width / 2;
        const centerY = this.cameras.main.height / 2;
        
        // Add game logo centered on the canvas
        const logo = this.add.image(centerX, centerY, 'game-logo');
        logo.setScale(0.5); // Scale down if needed
        
        // Add waiting text below the logo
        this.waitingText = this.add.text(centerX, centerY + 150, 'Waiting for another player...', {
            fontSize: '24px',
            color: '#95a5a6',
            fontFamily: 'Arial'
        }).setOrigin(0.5);
        
        // Animate the waiting text with a subtle pulse
        this.tweens.add({
            targets: this.waitingText,
            alpha: 0.5,
            duration: 1000,
            ease: 'Power1',
            yoyo: true,
            repeat: -1
        });
        
        // Get socket connection
        this.socket = (window as any).socket || (window as any).io();
        
        // Get or create socket connection
        if (!this.socket || typeof this.socket !== 'object') {
            const isDevelopment = import.meta.env && import.meta.env.DEV;
            const serverUrl = isDevelopment ? 'http://localhost:3000' : undefined;
            this.socket = (window as any).io(serverUrl);
            (window as any).socket = this.socket; // Store globally for GameScene
            console.log('🔌 Created new socket connection in LobbyScene');
        } else {
            console.log('🔌 Using existing socket connection');
        }
        
        // Listen for game start event
        this.socket.on('gameStart', (initialGameState: any) => {
            console.log('Game starting with state:', initialGameState);
            
            // Stop listening to avoid duplicate handlers
            this.socket.off('gameStart');
            
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