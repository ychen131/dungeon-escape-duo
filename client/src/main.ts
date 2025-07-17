import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';

// Phaser 3 Game Configuration
const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'game', // This div will be created in index.html
    backgroundColor: '#000000', // Black background outside map
    scene: [
        GameScene // Our main game scene
    ],
    render: {
        pixelArt: true, // Prevent blurring on pixel art
        antialias: false
    }
};

// Initialize the game
export default new Phaser.Game(config);
