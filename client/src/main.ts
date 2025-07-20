import Phaser from 'phaser';
import { LobbyScene } from './scenes/LobbyScene';
import { GameScene } from './scenes/GameScene';
import { EasterEggScene } from './scenes/EasterEggScene';

// Phaser 3 Game Configuration
const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'game', // This div will be created in index.html
    backgroundColor: '#000000', // Black background outside map
    scene: [
        LobbyScene, // Start with lobby scene
        GameScene, // Our main game scene
        EasterEggScene // Easter egg scene for game completion
    ],
    render: {
        pixelArt: true, // Prevent blurring on pixel art
        antialias: false
    }
};

// Initialize the game
export default new Phaser.Game(config);

// Set up modal controls after DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    const rulesBtn = document.getElementById('rulesBtn') as HTMLButtonElement;
    const modal = document.getElementById('rulesModal') as HTMLDivElement;
    const closeBtn = document.querySelector('.close-button') as HTMLElement;

    if (rulesBtn && modal && closeBtn) {
        rulesBtn.onclick = () => {
            modal.style.display = 'block';
        };
        closeBtn.onclick = () => {
            modal.style.display = 'none';
        };
        window.onclick = (event) => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        };
    }
});
