import Phaser from 'phaser';

export class EasterEggScene extends Phaser.Scene {
    private nyanMusic?: Phaser.Sound.BaseSound;
    
    constructor() {
        super({ key: 'EasterEggScene' });
    }
    
    preload() {
        // Load Nyan Cat GIF
        this.load.image('nyan_cat', 'assets/nyan-cat.gif');
        
        // Load Nyan Cat audio
        this.load.audio('nyan_audio', ['assets/audio/nyan.mp3', 'assets/audio/nyan.ogg']);
    }
    
    create() {
        // Update the status bar to show final victory message
        const statusElement = document.getElementById('status');
        if (statusElement) {
            statusElement.textContent = '🎉 VICTORY! ALL LEVELS COMPLETE! 🎉';
            statusElement.style.color = '#ffd700';
            statusElement.style.fontSize = '24px';
            statusElement.style.fontWeight = 'bold';
        }
        
        const itemDisplayElement = document.getElementById('item-display');
        if (itemDisplayElement) {
            itemDisplayElement.textContent = '🏆 You have mastered Dungeon Escape Duo! 🏆';
            itemDisplayElement.style.color = '#ffd700';
        }
        
        // Update left sidebar to show all levels complete
        const levelElement = document.getElementById('current-level');
        if (levelElement) {
            levelElement.textContent = 'All Complete!';
            levelElement.style.color = '#ffd700';
        }
        
        const actionsElement = document.getElementById('actions-left');
        if (actionsElement) {
            actionsElement.textContent = '∞';
            actionsElement.style.color = '#ffd700';
        }
        
        const turnElement = document.getElementById('current-turn');
        if (turnElement) {
            turnElement.textContent = 'Victory!';
            turnElement.style.color = '#ffd700';
            turnElement.style.fontWeight = 'bold';
        }
        
        // Get center coordinates
        const centerX = this.cameras.main.width / 2;
        const centerY = this.cameras.main.height / 2;
        
        // Add rainbow background gradient effect
        const graphics = this.add.graphics();
        const colors = [0xff0000, 0xff7f00, 0xffff00, 0x00ff00, 0x0000ff, 0x4b0082, 0x9400d3];
        const height = this.cameras.main.height / colors.length;
        
        colors.forEach((color, index) => {
            graphics.fillStyle(color, 0.3);
            graphics.fillRect(0, index * height, this.cameras.main.width, height);
        });
        
        // Add congratulations text
        this.add.text(centerX, centerY - 180, '🎉 CONGRATULATIONS! 🎉', {
            fontSize: '28px',
            color: '#ffff00',
            fontFamily: 'Arial',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);
        
        this.add.text(centerX, centerY - 140, 'You escaped together!', {
            fontSize: '20px',
            color: '#ffffff',
            fontFamily: 'Arial',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);
        
        // Add Nyan Cat GIF - make it bigger!
        const nyanCat = this.add.image(centerX, centerY + 50, 'nyan_cat');
        nyanCat.setScale(1.5); // Much bigger!
        
        // Add floating animation to Nyan Cat
        this.tweens.add({
            targets: nyanCat,
            y: centerY + 30,
            duration: 1000,
            ease: 'Sine.inOut',
            yoyo: true,
            repeat: -1
        });
        
        // Play Nyan Cat music on loop
        this.nyanMusic = this.sound.add('nyan_audio', {
            loop: true,
            volume: 0.5
        });
        this.nyanMusic.play();
        
        // Create a simple white circle for sparkle particles
        const sparkGraphics = this.make.graphics({ x: 0, y: 0 }, false);
        sparkGraphics.fillStyle(0xffffff);
        sparkGraphics.fillCircle(4, 4, 4);
        sparkGraphics.generateTexture('spark', 8, 8);
        sparkGraphics.destroy();
        
        // Add sparkle particles with the created texture
        const particles = this.add.particles(0, 0, 'spark', {
            x: { min: 0, max: this.cameras.main.width },
            y: { min: 0, max: this.cameras.main.height },
            scale: { start: 0.5, end: 0 },
            blendMode: 'ADD',
            lifespan: 2000,
            quantity: 2,
            alpha: { start: 1, end: 0 }
        });
        
        // Add return to menu text
        this.add.text(centerX, this.cameras.main.height - 50, 'Press ESC to return to lobby', {
            fontSize: '20px',
            color: '#ffffff',
            fontFamily: 'Arial',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);
        
        // Listen for ESC key to return to lobby
        this.input.keyboard?.on('keydown-ESC', () => {
            this.returnToLobby();
        });
    }
    
    private returnToLobby() {
        // Stop the music
        if (this.nyanMusic) {
            this.nyanMusic.stop();
        }
        
        // Return to lobby scene
        this.scene.start('LobbyScene');
    }
    
    shutdown() {
        // Clean up music when scene shuts down
        if (this.nyanMusic) {
            this.nyanMusic.stop();
            this.nyanMusic = undefined;
        }
    }
} 