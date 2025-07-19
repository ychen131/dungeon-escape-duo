import Phaser from 'phaser';

interface Player {
    x: number;
    y: number;
    lastMoveDirection?: string;
}

interface GameState {
    players: { [key: string]: Player };
    yourPlayerId?: string;
    gameStarted?: boolean;
    gameWon?: boolean;
    gameCompleted?: boolean;
    currentPlayerTurn?: string;
    actionsRemaining?: number;
    yourItem?: string;
    levelProgression?: number;
    currentLevel?: string;
    mapIndex?: number;
    levelTransition?: {
        isTransitioning: boolean;
        fromLevel: string;
        toLevel: string;
        transitionStartTime: number;
        message?: string;
    };
    disconnectedPlayer?: {
        playerId: string;
    };
    // Level 1 cooperative puzzle objects
    key?: {
        x: number;
        y: number;
        heldBy: string | null;
    };
    fires?: Array<{
        x: number;
        y: number;
        isDoused: boolean;
    }>;
    door?: {
        x: number;
        y: number;
        isUnlocked: boolean;
    };
    // Level 2 cooperative puzzle objects
    pressurePlates?: Array<{
        x: number;
        y: number;
        isPressed: boolean;
    }>;
    trapDoors?: Array<{
        x: number;
        y: number;
        isOpen: boolean;
    }>;
    slimes?: Array<{
        x: number;
        y: number;
        isStunned: boolean;
        stunDuration: number;
    }>;
    snail?: {
        x: number;
        y: number;
        direction: number;
        moveRange: number;
        startX: number;
        lastInteractionTurn: number;
    };
}

export class GameScene extends Phaser.Scene {
    private playerSprites: { [key: string]: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text | Phaser.GameObjects.Arc } = {};
    private myPlayerId: string | null = null;
    private socket: any;
    private serverGameState: GameState | null = null;
    private connectionRejected: boolean = false;
    private statusElement: HTMLElement | null = null;
    private itemDisplayElement: HTMLElement | null = null;
    private endTurnButton: HTMLElement | null = null;
    private tilemapLayers: Phaser.Tilemaps.TilemapLayer[] = []; // Track active tilemap layers
    
    // Game object sprites
    private pressurePlateSprites: { [key: string]: Phaser.GameObjects.Sprite } = {};
    
    // Dynamic map sizing - will be set when tilemap is rendered
    private currentTileSize: number = 50; // Default tile size
    private currentMapOffsetX: number = 0; // Current map offset X
    private currentMapOffsetY: number = 0; // Current map offset Y

    constructor() {
        super({ key: 'GameScene' });
    }

    preload() {
        console.log('🎮 Loading game assets...');
        
        // Load tileset and tilemaps
        this.load.image('tiles', 'Full.png');
        this.load.tilemapTiledJSON('level1', 'level1.tmj');
        this.load.tilemapTiledJSON('level2', 'level2.tmj');
        
        // Load player character sprite sheets
        console.log('🏃 Loading character sprite sheets...');
        this.load.spritesheet('soldier', 'soldier.png', { 
            frameWidth: 100, 
            frameHeight: 100 
        });
        this.load.spritesheet('orc', 'orc.png', { 
            frameWidth: 100, 
            frameHeight: 100 
        });
        
        // Load cooperative puzzle spritesheets
        console.log('🗝️ Loading puzzle item spritesheets...');
        this.load.spritesheet('key', 'key.png', {
            frameWidth: 16, // 128px ÷ 8 frames = 16px per frame
            frameHeight: 16, // Height is 16px
        });
        this.load.spritesheet('fire', 'fire.png', {
            frameWidth: 32, // 448px ÷ 14 frames = 32px per frame
            frameHeight: 48, // Height is 48px
        });
        // Load pressure plate spritesheet
        this.load.spritesheet('pressurePlate', 'presure-plate.png', {
            frameWidth: 16, // 16px per frame
            frameHeight: 32, // 32px height
        });

        // Load snail spritesheet - 144x192 pixels, 4 rows x 3 columns
        console.log('🐌 Attempting to load snail spritesheet from snail.png');
        this.load.spritesheet('snail', 'snail.png', {
            frameWidth: 48, // 144px ÷ 3 columns = 48px per frame
            frameHeight: 48, // 192px ÷ 4 rows = 48px per frame
        });

        // Load spike trap spritesheet - each frame is 32x32 pixels
        console.log('🪤 Attempting to load spike trap spritesheet from Spike_Trap.png');
        this.load.spritesheet('spikeTrap', 'Spike_Trap.png', {
            frameWidth: 32, // Each frame is 32x32 pixels
            frameHeight: 32
        });

        
        // Add success logging for pressure plate loading
        this.load.on('filecomplete-spritesheet-pressurePlate', () => {
            console.log('✅ Pressure plate spritesheet loaded successfully');
        });

        // Add success logging for snail loading
        this.load.on('filecomplete-spritesheet-snail', () => {
            console.log('✅ Snail spritesheet loaded successfully');
        });

        // Add success logging for spike trap loading
        this.load.on('filecomplete-spritesheet-spikeTrap', () => {
            console.log('✅ Spike trap spritesheet loaded successfully');
        });

        // Add error logging for sprite loading
        this.load.on('loaderror', (file: any) => {
            if (file.key === 'snail') {
                console.error(`❌ Failed to load snail sprite: ${file.key} from ${file.url}`);
                console.error('Snail load error details:', file);
            }
            if (file.key === 'spikeTrap') {
                console.error(`❌ Failed to load spike trap sprite: ${file.key} from ${file.url}`);
                console.error('Spike trap load error details:', file);
            }
        });
        
        // Keep loading individual tiles as backup for fallback mode
        this.load.image('floor', 'tiles/floor.png');
        this.load.image('wall', 'tiles/wall.png');
        this.load.image('fire', 'tiles/fire.png');
        this.load.image('water', 'tiles/water.png');
        this.load.image('exit', 'tiles/exit.png');
        
        // Add error handling for failed loads
        this.load.on('loaderror', (file: any) => {
            console.error(`❌ Failed to load: ${file.key} from ${file.url}`);
        });
        
        this.load.on('complete', () => {
            console.log('✅ All assets loaded successfully');
        });
    }

    create() {
        // Get DOM elements
        this.statusElement = document.getElementById('status');
        this.itemDisplayElement = document.getElementById('item-display');
        this.endTurnButton = document.getElementById('end-turn-btn');
        
        // Set up end turn button event listener
        if (this.endTurnButton) {
            this.endTurnButton.addEventListener('click', () => {
                console.log('🔄 End turn button clicked');
                if (this.socket && this.serverGameState?.gameStarted && 
                    this.serverGameState?.currentPlayerTurn === this.myPlayerId) {
                    this.socket.emit('endTurn');
                }
            });
        }
        
        // Debug: List all loaded textures
        console.log('🔍 Loaded textures:', Object.keys(this.textures.list));
        console.log('🐌 Snail texture exists?', this.textures.exists('snail'));
        console.log('🪤 Spike trap texture exists?', this.textures.exists('spikeTrap'));
        
        // Create character animations
        this.createCharacterAnimations();
        
        // Set up keyboard input
        this.setupKeyboardInput();
        
        // Try to render the tilemap
        this.renderTilemap();
        
        // Connect to server via global io function
        // In development, connect to the Express server explicitly
        const isDevelopment = import.meta.env.DEV;
        const serverUrl = isDevelopment ? 'http://localhost:3000' : undefined;
        this.socket = (window as any).io(serverUrl);
        
        // Expose socket globally for testing
                  (window as any).socket = this.socket;
          console.log('🧪 Exposed socket to window for testing');
          console.log('🔄 Use: socket.emit("resetPositions") to reset player positions');
                  
        
        // Set up socket event listeners
        this.setupSocketListeners();
    }

    private destroyCurrentTilemap() {
        // Destroy all existing tilemap layers
        this.tilemapLayers.forEach(layer => {
            if (layer && layer.destroy) {
                layer.destroy();
            }
        });
        this.tilemapLayers = [];
        console.log('🧹 Destroyed existing tilemap layers');
    }

    private renderTilemap(level: string = 'level1') {
        try {
            console.log(`🎯 Rendering tilemap for ${level}`);
            
            // Destroy existing tilemap layers first
            this.destroyCurrentTilemap();
            
            // Check if tileset image loaded
            if (!this.textures.exists('tiles')) {
                console.warn('⚠️  Tileset image "tiles" not loaded, using fallback mode');
                return false;
            }
            
            // Try to create tilemap from loaded data
            const map = this.make.tilemap({ key: level });
            if (!map) {
                console.warn(`⚠️  Failed to create tilemap for ${level}`);
                return false;
            }
            
            console.log(`📋 Tilemap created: ${map.width}x${map.height}, layers: ${map.layers.length}`);
            
            // Add tileset to the map - make sure the name matches the tileset name in the TMJ file
            const tileset = map.addTilesetImage('Full', 'tiles');
            if (!tileset) {
                console.warn('⚠️  Failed to add tileset to map');
                console.log('Available tilesets in map:', map.tilesets.map(ts => ts.name));
                return false;
            }
            
            // Better sizing strategy: Use reasonable tile size for good visibility
            const canvasWidth = 800;
            const canvasHeight = 600;
            
            // Use a much larger base tile size for better visibility
            let tileSize = 50; // Larger base size for better game experience
            
            // Only scale down for extremely large maps (bigger than 40x30)
            if (map.width > 40 || map.height > 30) {
                // For truly massive maps, scale down but keep readable
                const maxTileSizeByWidth = (canvasWidth - 50) / map.width;
                const maxTileSizeByHeight = (canvasHeight - 50) / map.height;
                tileSize = Math.max(35, Math.min(maxTileSizeByWidth, maxTileSizeByHeight)); // Minimum 35px
                console.log(`📏 Extremely large map detected, adjusted tile size to ${tileSize.toFixed(1)}px`);
            } else {
                console.log(`🎯 Using full tile size of ${tileSize}px for good visibility`);
            }
            
            // Store current sizing for player/object positioning
            this.currentTileSize = tileSize;
            
            const finalMapWidthPixels = map.width * tileSize;
            const finalMapHeightPixels = map.height * tileSize;
            
            // Center the map on canvas (large maps will extend beyond canvas - this is good!)
            const offsetX = (canvasWidth - finalMapWidthPixels) / 2;
            const offsetY = (canvasHeight - finalMapHeightPixels) / 2;
            
            // Manual positioning adjustments for Level 2 only
            let finalOffsetX = offsetX;
            let finalOffsetY = offsetY;
            
            if (level === 'level2') {
                // Only Level 2 gets the positioning adjustment
                finalOffsetX = offsetX + 75; // Move right
                finalOffsetY = offsetY + 85; // Move down
            }
            
            // Store current offsets for player/object positioning
            this.currentMapOffsetX = finalOffsetX;
            this.currentMapOffsetY = finalOffsetY;
            
            console.log(`🎯 Map rendering: ${map.width}x${map.height} at ${tileSize.toFixed(1)}px tiles`);
            console.log(`📐 Positioned at offset (${finalOffsetX.toFixed(1)}, ${finalOffsetY.toFixed(1)}), map size ${finalMapWidthPixels.toFixed(1)}x${finalMapHeightPixels.toFixed(1)}`);
            if (finalMapWidthPixels > canvasWidth || finalMapHeightPixels > canvasHeight) {
                console.log(`✅ Map extends beyond canvas - perfect for detailed gameplay!`);
            }

            // Create tile layers (render all layers from the tilemap)
            map.layers.forEach((layerData, index) => {
                console.log(`🎨 Creating layer ${index}: ${layerData.name}`);
                const layer = map.createLayer(layerData.name, tileset, finalOffsetX, finalOffsetY);
                if (layer) {
                    // Scale the layer to the calculated tile size
                    const scale = tileSize / 32; // Scale factor from tileset (32px) to desired tile size
                    layer.setScale(scale);
                    layer.setDepth(0); // Set depth to ensure proper layering
                    this.tilemapLayers.push(layer); // Track this layer for cleanup
                    console.log(`✅ Layer '${layerData.name}' created at scale ${scale.toFixed(2)}`);
                } else {
                    console.warn(`⚠️  Failed to create layer: ${layerData.name}`);
                }
            });
            
            console.log(`✅ Tilemap rendering complete for ${level}: ${this.tilemapLayers.length} layers created`);
            return true;
            
        } catch (error) {
            console.error('❌ Error rendering tilemap:', error);
            return false;
        }
    }

    // Centralized method to get pixel position of a tile using current dynamic sizing
    private getTilePixelPosition(tileX: number, tileY: number) {
        return {
            x: this.currentMapOffsetX + (tileX * this.currentTileSize) + (this.currentTileSize / 2),
            y: this.currentMapOffsetY + (tileY * this.currentTileSize) + (this.currentTileSize / 2),
            tileSize: this.currentTileSize
        };
    }

    private createCharacterAnimations() {
        console.log('🎭 Creating character animations...');
        
        // Soldier (Player 1) animations
        if (this.textures.exists('soldier')) {
            this.anims.create({
                key: 'soldier-idle',
                frames: this.anims.generateFrameNumbers('soldier', { start: 0, end: 5 }),
                frameRate: 6,
                repeat: -1
            });
            
            this.anims.create({
                key: 'soldier-walk',
                frames: this.anims.generateFrameNumbers('soldier', { start: 9, end: 18 }),
                frameRate: 8,
                repeat: -1
            });
            
            console.log('✅ Soldier animations created');
        } else {
            console.warn('⚠️ Soldier sprite sheet not loaded, skipping animations');
        }
        
        // Orc (Player 2) animations  
        if (this.textures.exists('orc')) {
            this.anims.create({
                key: 'orc-idle',
                frames: this.anims.generateFrameNumbers('orc', { start: 0, end: 5 }),
                frameRate: 6,
                repeat: -1
            });
            
            this.anims.create({
                key: 'orc-walk',
                frames: this.anims.generateFrameNumbers('orc', { start: 9, end: 10 }),
                frameRate: 8,
                repeat: -1
            });
            
            console.log('✅ Orc animations created');
        } else {
            console.warn('⚠️ Orc sprite sheet not loaded, skipping animations');
        }
        
        // Key animations
        if (this.textures.exists('key')) {
            this.anims.create({
                key: 'key_shine',
                frames: this.anims.generateFrameNumbers('key', { start: 0, end: 7 }), // Assuming 8 frames
                frameRate: 10,
                repeat: -1, // Loop forever
            });
            
            console.log('✅ Key animations created');
        } else {
            console.warn('⚠️ Key sprite sheet not loaded, skipping animations');
        }
        
        // Fire animations
        if (this.textures.exists('fire')) {
            this.anims.create({
                key: 'fire_burn',
                frames: this.anims.generateFrameNumbers('fire', { start: 0, end: 13 }), // 14 frames (448÷32=14)
                frameRate: 12,
                repeat: -1, // Loop forever
            });
            
            console.log('✅ Fire animations created');
        } else {
            console.warn('⚠️ Fire sprite sheet not loaded, skipping animations');
        }
        
        // Pressure Plate animations
        if (this.textures.exists('pressurePlate')) {
            // Calculate frame indices (192px wide ÷ 16px = 12 frames per row)
            // Row 5 (1-indexed) = Row 4 (0-indexed), Frame 7 (1-indexed) = Frame 6 (0-indexed)
            const frameRow = 4; // Row 5 (1-indexed) = Row 4 (0-indexed)
            const framesPerRow = 12; // 192px ÷ 16px = 12 frames per row
            const idleFrame = frameRow * framesPerRow + 6; // Frame 7 (1-indexed) = Frame 6 (0-indexed)
            const activatedFrame1 = frameRow * framesPerRow + 7; // Frame 8 (1-indexed) = Frame 7 (0-indexed)
            const activatedFrame2 = frameRow * framesPerRow + 8; // Frame 9 (1-indexed) = Frame 8 (0-indexed)
            
            // Idle state
            this.anims.create({
                key: 'pressure_plate_idle',
                frames: [{ key: 'pressurePlate', frame: idleFrame }],
                frameRate: 1,
                repeat: 0
            });
            
            // Activated state
            this.anims.create({
                key: 'pressure_plate_activated',
                frames: this.anims.generateFrameNumbers('pressurePlate', { start: activatedFrame1, end: activatedFrame2 }),
                frameRate: 4,
                repeat: 0 // Play animation once, don't loop
            });
            
            console.log('✅ Pressure plate animations created');
        } else {
            console.warn('⚠️ Pressure plate sprite sheet not loaded, skipping animations');
        }

        // Snail animations
        console.log('🐌 Checking snail texture for animations. Exists?', this.textures.exists('snail'));
        if (this.textures.exists('snail')) {
            console.log('🎭 Creating snail animations...');
            
            // Calculate frame indices (3 columns per row)
            // Row 2 (index 1) for left movement: frames 3, 4, 5
            // Row 3 (index 2) for right movement: frames 6, 7, 8
            
            try {
                this.anims.create({
                    key: 'snail_move_left',
                    frames: this.anims.generateFrameNumbers('snail', { start: 3, end: 5 }), // Row 2 frames
                    frameRate: 4,
                    repeat: -1 // Loop forever
                });
                
                this.anims.create({
                    key: 'snail_move_right',
                    frames: this.anims.generateFrameNumbers('snail', { start: 6, end: 8 }), // Row 3 frames
                    frameRate: 4,
                    repeat: -1 // Loop forever
                });
                
                console.log('✅ Snail animations created successfully');
            } catch (error) {
                console.error('❌ Error creating snail animations:', error);
            }
        } else {
            console.warn('⚠️ Snail sprite sheet not loaded, skipping animations');
        }

        // Spike Trap animations
        console.log('🪤 Checking spike trap texture for animations. Exists?', this.textures.exists('spikeTrap'));
        if (this.textures.exists('spikeTrap')) {
            console.log('🎭 Creating spike trap animations...');
            
            try {
                // Closed/safe state (trap is not dangerous)
                this.anims.create({
                    key: 'trap_closed',
                    frames: [{ key: 'spikeTrap', frame: 0 }], // First frame - closed
                    frameRate: 1,
                    repeat: 0
                });
                
                // Open/dangerous state (spikes are up)
                this.anims.create({
                    key: 'trap_open',
                    frames: [{ key: 'spikeTrap', frame: 1 }], // Second frame - open/dangerous
                    frameRate: 1,
                    repeat: 0
                });
                
                console.log('✅ Spike trap animations created successfully');
            } catch (error) {
                console.error('❌ Error creating spike trap animations:', error);
            }
        } else {
            console.warn('⚠️ Spike trap sprite sheet not loaded, skipping animations');
        }
    }

    private setupKeyboardInput() {
        // Set up individual key listeners for immediate response
        this.input.keyboard?.on('keydown-UP', () => this.sendMoveRequest('up'));
        this.input.keyboard?.on('keydown-DOWN', () => this.sendMoveRequest('down'));
        this.input.keyboard?.on('keydown-LEFT', () => this.sendMoveRequest('left'));
        this.input.keyboard?.on('keydown-RIGHT', () => this.sendMoveRequest('right'));
        this.input.keyboard?.on('keydown-SPACE', () => this.sendUseItemRequest());
    }

    private setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.updateStatus('Connected! Waiting for game state...');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            if (!this.connectionRejected) {
                this.updateStatus('Disconnected from server');
            }
        });

        this.socket.on('connectionRejected', (data: any) => {
            console.log('Connection rejected:', data.reason);
            this.connectionRejected = true;
            this.updateStatus(`Connection rejected: ${data.reason}`, '#e74c3c');
        });

        this.socket.on('gameState', (newGameState: GameState) => {
            this.handleGameState(newGameState);
        });

        this.socket.on('doorMessage', (data: { message: string }) => {
            console.log('Door message:', data.message);
            this.updateStatus(data.message, '#f39c12', '16px', 'normal');
            
            // Clear the message after 3 seconds
            setTimeout(() => {
                this.updateGameStatus(); // Restore normal status
            }, 3000);
        });

        this.socket.on('pressurePlateMessage', (data: { message: string; isPressed: boolean }) => {
            console.log('Pressure plate message:', data.message);
            const color = data.isPressed ? '#2ecc71' : '#95a5a6'; // Green for activated, gray for deactivated
            this.updateStatus(data.message, color, '16px', 'bold');
            
            // Clear the message after 3 seconds
            setTimeout(() => {
                this.updateGameStatus(); // Restore normal status
            }, 3000);
        });

        this.socket.on('trapMessage', (data: { message: string }) => {
            console.log('Trap message:', data.message);
            this.updateStatus(data.message, '#e74c3c', '16px', 'bold'); // Red for trap warnings
            
            // Clear the message after 3 seconds
            setTimeout(() => {
                this.updateGameStatus(); // Restore normal status
            }, 3000);
        });

        this.socket.on('trapStateMessage', (data: { message: string; isOpen: boolean }) => {
            console.log('Trap state message:', data.message);
            const color = data.isOpen ? '#2ecc71' : '#e74c3c'; // Green for safe, red for dangerous
            this.updateStatus(data.message, color, '16px', 'bold');
            
            // Clear the message after 4 seconds (slightly longer for state changes)
            setTimeout(() => {
                this.updateGameStatus(); // Restore normal status
            }, 4000);
        });

        this.socket.on('slimeMessage', (data: { message: string; playerId: string }) => {
            console.log('Slime message:', data.message);
            this.updateStatus(data.message, '#2ecc71', '16px', 'bold'); // Green for successful slime actions
            
            // Clear the message after 3 seconds
            setTimeout(() => {
                this.updateGameStatus(); // Restore normal status
            }, 3000);
        });

        this.socket.on('snailMessage', (data: { message: string; snailPos: { x: number; y: number } }) => {
            console.log('Snail message:', data.message);
            this.updateStatus(data.message, '#f39c12', '16px', 'normal'); // Orange for snail interactions
            
            // Clear the message after 4 seconds (slightly longer for NPC dialogue)
            setTimeout(() => {
                this.updateGameStatus(); // Restore normal status
            }, 4000);
        });
    }

    private handleGameState(newGameState: GameState) {
        try {
            console.log('📡 Received game state from server:', newGameState);
            console.log('🐌 Client: Snail data in received gameState:', newGameState.snail);
            
            if (!newGameState || typeof newGameState !== 'object') {
                console.error('❌ Invalid game state received:', newGameState);
                this.updateStatus('❌ Connection error - invalid game state', '#e74c3c');
                return;
            }
            
            // Check if level changed - re-render tilemap if needed
            const levelChanged = this.serverGameState?.currentLevel !== newGameState.currentLevel;
            
            this.serverGameState = newGameState;
        
            if (newGameState.yourPlayerId) {
                this.myPlayerId = newGameState.yourPlayerId;
                console.log('Assigned as:', this.myPlayerId);
            }
            
            // Re-render tilemap if level changed
            if (levelChanged && newGameState.currentLevel) {
                console.log(`🔄 Level changed to ${newGameState.currentLevel}, re-rendering tilemap`);
                this.renderTilemap(newGameState.currentLevel);
            }
            
            this.updateGameStatus();
            this.updatePlayerSprites();
            this.updateEndTurnButton();
            
        } catch (error) {
            console.error('❌ Error handling game state:', error);
        }
    }

    private updateGameStatus() {
        if (!this.serverGameState) return;

        const playerCount = Object.keys(this.serverGameState.players).length;
        
        // Check for level transition first
        if (this.serverGameState.levelTransition?.isTransitioning) {
            const transition = this.serverGameState.levelTransition;
            const message = transition.message || `🚀 ENTERING LEVEL ${transition.toLevel} 🚀`;
            
            if (transition.toLevel === 'complete') {
                // Final game completion transition
                this.updateStatus('🏆 GAME COMPLETE! 🏆', '#ff6b35', '28px', 'bold');
                this.updateItemDisplay(message, '#d35400');
                this.setVictoryBackground('linear-gradient(45deg, #e74c3c, #f39c12, #e67e22, #e74c3c)');
            } else {
                // Level progression transition
                this.updateStatus(message, '#3498db', '24px', 'bold');
                this.updateItemDisplay(`🎯 Loading new level... Get ready for new challenges! 🎯`, '#9b59b6');
                this.setVictoryBackground('linear-gradient(45deg, #3498db, #9b59b6, #3498db)');
            }
        }
        // Check for final game completion
        else if (this.serverGameState.gameCompleted) {
            this.updateStatus(`🏆 DUNGEON ESCAPE DUO MASTERED! 🏆`, '#ff6b35', '24px', 'bold');
            this.updateItemDisplay(`🎉 PERFECT TEAMWORK! You conquered all levels together! 🎉 | Refresh to play again`, '#d35400');
            this.setVictoryBackground('linear-gradient(45deg, #e74c3c, #f39c12, #e67e22, #e74c3c)');
        }
        // Check for level completion
        else if (this.serverGameState.gameWon) {
            const levelName = this.serverGameState.levelProgression === 1 ? "Level 1" : "Level 2";
            this.updateStatus(`🎉 VICTORY! ${levelName.toUpperCase()} COMPLETE! 🎉`, '#f1c40f', '22px', 'bold');
            this.updateItemDisplay(`🌟 Excellent teamwork! Advancing to Level 2 in 5 seconds... 🌟`, '#27ae60');
            this.setVictoryBackground('linear-gradient(45deg, #2c3e50, #34495e, #2c3e50)');
        }
        else if (playerCount === 1) {
            if (this.serverGameState.disconnectedPlayer) {
                const disconnectedPlayerId = this.serverGameState.disconnectedPlayer.playerId.toUpperCase();
                this.updateStatus(`⚠️ ${disconnectedPlayerId} disconnected! Waiting for reconnection... You are ${this.myPlayerId}`, '#e74c3c');
                this.updateItemDisplay(`Game paused at Level ${this.serverGameState.levelProgression} | ${disconnectedPlayerId} has 30 seconds to reconnect`);
            } else {
                this.updateStatus(`⏳ Waiting for partner to join... You are ${this.myPlayerId}`, '#f39c12');
                this.updateItemDisplay(`Level ${this.serverGameState.levelProgression} - ${this.serverGameState.currentLevel?.toUpperCase()} Layout ${(this.serverGameState.mapIndex || 0) + 1} | Partner needed to continue`);
            }
            this.resetBackground();
        }
        else if (playerCount === 2) {
            if (this.serverGameState.gameStarted) {
                const isMyTurn = this.serverGameState.currentPlayerTurn === this.myPlayerId;
                
                if (isMyTurn) {
                    const actionsText = this.serverGameState.actionsRemaining !== undefined ? 
                        ` | ${this.serverGameState.actionsRemaining} actions left` : '';
                    this.updateStatus(`🟢 YOUR TURN | You are ${this.myPlayerId}${actionsText} | Arrow keys: move, SPACE: use item`, '#2ecc71', '18px', 'bold');
                } else {
                    const otherPlayer = this.serverGameState.currentPlayerTurn?.toUpperCase();
                    const actionsText = this.serverGameState.actionsRemaining !== undefined ? 
                        ` | ${this.serverGameState.actionsRemaining} actions left` : '';
                    this.updateStatus(`⏳ ${otherPlayer}'S TURN${actionsText} | You are ${this.myPlayerId} | Wait for your partner...`, '#f39c12');
                }
                
                if (this.serverGameState.yourItem) {
                    this.updateItemDisplay(`Your Item: ${this.serverGameState.yourItem} | Level ${this.serverGameState.levelProgression} - ${this.serverGameState.currentLevel?.toUpperCase()} Layout ${(this.serverGameState.mapIndex || 0) + 1}`, '#3498db');
                } else {
                    this.updateItemDisplay(`Level ${this.serverGameState.levelProgression} - ${this.serverGameState.currentLevel?.toUpperCase()} Layout ${(this.serverGameState.mapIndex || 0) + 1}`, '#95a5a6');
                }
            } else {
                this.updateStatus(`🚀 Both players ready! You are ${this.myPlayerId}. Game starting...`, '#2ecc71');
                this.updateItemDisplay(`Level ${this.serverGameState.levelProgression} - ${this.serverGameState.currentLevel?.toUpperCase()} Layout ${(this.serverGameState.mapIndex || 0) + 1} | Get ready to cooperate!`, '#2ecc71');
            }
            this.resetBackground();
        }
    }

    private updateStatus(text: string, color: string = '#ecf0f1', fontSize: string = '16px', fontWeight: string = 'normal') {
        if (this.statusElement) {
            this.statusElement.textContent = text;
            this.statusElement.style.color = color;
            this.statusElement.style.fontSize = fontSize;
            this.statusElement.style.fontWeight = fontWeight;
        }
    }

    private updateItemDisplay(text: string, color: string = '#95a5a6') {
        if (this.itemDisplayElement) {
            this.itemDisplayElement.textContent = text;
            this.itemDisplayElement.style.color = color;
        }
    }

    private updateEndTurnButton() {
        if (this.endTurnButton) {
            const gameState = this.serverGameState;
            
            // Show button only when game is started and not won
            if (gameState?.gameStarted && !gameState?.gameWon && !gameState?.gameCompleted) {
                this.endTurnButton.style.display = 'block';
                
                // Enable button only when it's the current player's turn
                if (gameState.currentPlayerTurn === this.myPlayerId) {
                    (this.endTurnButton as HTMLButtonElement).disabled = false;
                    this.endTurnButton.style.opacity = '1';
                } else {
                    (this.endTurnButton as HTMLButtonElement).disabled = true;
                    this.endTurnButton.style.opacity = '0.5';
                }
            } else {
                // Hide button when game is not active
                this.endTurnButton.style.display = 'none';
            }
        }
    }

    private setVictoryBackground(gradient: string) {
        const container = document.getElementById('game-container');
        if (container) {
            container.style.background = gradient;
            container.style.backgroundSize = '300% 300%';
            container.style.animation = 'gradient-shift 2s ease infinite';
        }
    }

    private resetBackground() {
        const container = document.getElementById('game-container');
        if (container) {
            container.style.background = 'none';
            container.style.animation = 'none';
        }
    }

    private updatePlayerSprites() {
        if (!this.serverGameState) return;

        // Create or update player sprites
        for (const [playerId, player] of Object.entries(this.serverGameState.players)) {
            if (!this.playerSprites[playerId]) {
                // Create new player sprite
                const coords = this.getTilePixelPosition(player.x, player.y);
                
                let spriteKey: string;
                let walkAnim: string;
                let idleAnim: string;
                
                // Player 1 is always soldier, Player 2 is always orc (regardless of which client is viewing)
                if (playerId === 'player1') {
                    spriteKey = 'soldier';
                    walkAnim = 'soldier-walk';
                    idleAnim = 'soldier-idle';
                } else {
                    spriteKey = 'orc';
                    walkAnim = 'orc-walk';
                    idleAnim = 'orc-idle';
                }
                
                // Try to create animated sprite, fallback to rectangle if sprite not available
                let sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
                if (this.textures.exists(spriteKey)) {
                    sprite = this.add.sprite(coords.x, coords.y, spriteKey) as Phaser.GameObjects.Sprite;
                    sprite.setOrigin(0.5, 0.5);
                    
                    // Use consistent character scale regardless of map tile size
                    const scale = 2.0; // Fixed scale for consistent character size
                    sprite.setScale(scale);
                    sprite.setDepth(100);
                    
                    // Store animation references
                    (sprite as any).walkAnim = walkAnim;
                    (sprite as any).idleAnim = idleAnim;
                    (sprite as any).isWalking = false;
                    (sprite as any).lastTileX = player.x;
                    (sprite as any).lastTileY = player.y;
                    
                    sprite.play(idleAnim);
                    sprite.clearTint();
                    
                    if (player.lastMoveDirection === 'left') {
                        sprite.setFlipX(true);
                    } else {
                        sprite.setFlipX(false);
                    }
                    
                    console.log(`✅ Created animated sprite for ${playerId} using ${spriteKey}`);
                } else {
                    // Fallback to colored rectangle with consistent size
                    console.warn(`⚠️ Sprite '${spriteKey}' not available, using rectangle fallback for ${playerId}`);
                    const color = playerId === 'player1' ? 0x3498db : 0xe74c3c;
                    const rectSize = 40; // Fixed size regardless of tile size
                    sprite = this.add.rectangle(coords.x, coords.y, rectSize, rectSize, color);
                    sprite.setStrokeStyle(2, 0xffffff);
                    sprite.setDepth(100);
                }
                
                this.playerSprites[playerId] = sprite;
                
                // Add label
                const label = this.add.text(coords.x, coords.y - 40, playerId.toUpperCase(), {
                    fontSize: '12px',
                    color: '#ffffff',
                    stroke: '#000000',
                    strokeThickness: 2
                }).setOrigin(0.5);
                label.setDepth(101);
                
                this.playerSprites[playerId + '_label'] = label;
                console.log(`Created sprite for new player: ${playerId}`);
            }
        }

        // Remove sprites for disconnected players
        for (const spriteKey of Object.keys(this.playerSprites)) {
            if (spriteKey.endsWith('_label')) continue;
            
            // Skip non-player entities (snail, slimes, traps, etc.)
            if (spriteKey === 'snail' || spriteKey === 'snail_label' || 
                spriteKey.startsWith('slime_') || spriteKey.startsWith('trap_')) continue;
            
            const playerId = spriteKey;
            if (!this.serverGameState.players[playerId]) {
                if (this.playerSprites[playerId]) {
                    (this.playerSprites[playerId] as any).destroy();
                    delete this.playerSprites[playerId];
                }
                if (this.playerSprites[playerId + '_label']) {
                    (this.playerSprites[playerId + '_label'] as any).destroy();
                    delete this.playerSprites[playerId + '_label'];
                }
                console.log(`Removed sprite for disconnected player: ${playerId}`);
            }
        }

        // Update positions for all existing players
        for (const [playerId, player] of Object.entries(this.serverGameState.players)) {
            const sprite = this.playerSprites[playerId] as any;
            const label = this.playerSprites[playerId + '_label'] as any;
            
            if (sprite && label) {
                const coords = this.getTilePixelPosition(player.x, player.y);
                
                // Handle animations for sprite-based players
                if (sprite.walkAnim) {
                    const oldTileX = sprite.lastTileX !== undefined ? sprite.lastTileX : player.x;
                    const oldTileY = sprite.lastTileY !== undefined ? sprite.lastTileY : player.y;
                    const positionChanged = (oldTileX !== player.x || oldTileY !== player.y);
                    
                    sprite.lastTileX = player.x;
                    sprite.lastTileY = player.y;
                    
                    if (positionChanged && !sprite.isWalking) {
                        sprite.play(sprite.walkAnim);
                        sprite.isWalking = true;
                        
                        if (sprite.animationTimeout) {
                            clearTimeout(sprite.animationTimeout);
                        }
                        
                        sprite.animationTimeout = setTimeout(() => {
                            if (sprite && sprite.active) {
                                sprite.play(sprite.idleAnim);
                                sprite.isWalking = false;
                                sprite.animationTimeout = null;
                            }
                        }, 500);
                    }
                    
                    // Handle sprite flipping
                    if (player.lastMoveDirection) {
                        switch (player.lastMoveDirection) {
                            case 'left':
                                sprite.setFlipX(true);
                                break;
                            case 'right':
                                sprite.setFlipX(false);
                                break;
                        }
                    }
                }
               
                sprite.setPosition(coords.x, coords.y);
                label.setPosition(coords.x, coords.y - 40);
                
                // Keep character sprites clean and consistent - no tints or scaling
                if (sprite.clearTint) {
                    sprite.clearTint(); // Always clear any tints from previous states
                }
                sprite.setScale(2.0); // Always maintain consistent scale
                
                // Highlight current player's turn (only affects labels)
                if (this.serverGameState.gameStarted && this.serverGameState.currentPlayerTurn === playerId) {
                    label.setStyle({ fontSize: '16px', color: '#ffff00', fontWeight: 'bold', stroke: '#000000', strokeThickness: 3 });
                } else {
                    label.setStyle({ fontSize: '12px', color: '#ffffff', fontWeight: 'normal', stroke: '#000000', strokeThickness: 2 });
                }
                
                // Victory effects only for labels (characters stay clean)
                if (this.serverGameState.gameCompleted) {
                    label.setStyle({ fontSize: '18px', color: '#ff6b35', fontWeight: 'bold' });
                } else if (this.serverGameState.gameWon) {
                    label.setStyle({ fontSize: '16px', color: '#ffd700', fontWeight: 'bold' });
                }
            }
        }

        // Render cooperative puzzle objects
        this.renderPuzzleObjects();
    }

    private renderPuzzleObjects() {
        if (!this.serverGameState) return;

        // Clear old puzzle object sprites
        const puzzleObjectKeys = ['key', 'fire_0', 'fire_1', 'door', 'door_label'];
        puzzleObjectKeys.forEach(key => {
            if (this.playerSprites[key]) {
                (this.playerSprites[key] as any).destroy();
                delete this.playerSprites[key];
            }
        });

        // Draw the key if it's not held by a player
        if (this.serverGameState.key && !this.serverGameState.key.heldBy) {
            const coords = this.getTilePixelPosition(this.serverGameState.key.x, this.serverGameState.key.y);
            
            if (this.textures.exists('key')) {
                const keySprite = this.add.sprite(coords.x, coords.y, 'key');
                keySprite.setOrigin(0.5, 0.5);
                keySprite.setScale(2.0); // Make key bigger and more visible
                keySprite.setDepth(90); // Below players but above tiles
                keySprite.play('key_shine');
                this.playerSprites['key'] = keySprite;
                console.log('✨ Rendered animated key');
            } else {
                console.warn('⚠️ Key sprite not available, skipping key rendering');
            }
        }

        // Draw the fires if they are not doused
        if (this.serverGameState.fires) {
            this.serverGameState.fires.forEach((fireState, index) => {
                if (!fireState.isDoused) {
                    const coords = this.getTilePixelPosition(fireState.x, fireState.y);
                    
                    if (this.textures.exists('fire')) {
                        const fireSprite = this.add.sprite(coords.x, coords.y, 'fire');
                        fireSprite.setOrigin(0.5, 0.5);
                        fireSprite.setDepth(90); // Below players but above tiles
                        fireSprite.play('fire_burn');
                        this.playerSprites[`fire_${index}`] = fireSprite;
                        console.log(`🔥 Rendered animated fire ${index}`);
                    } else {
                        console.warn('⚠️ Fire sprite not available, skipping fire rendering');
                    }
                }
            });
        }

        // Draw the door
        if (this.serverGameState.door) {
            const coords = this.getTilePixelPosition(this.serverGameState.door.x, this.serverGameState.door.y);
            
            // Determine door appearance based on state
            let doorColor = 0x8b4513; // Default brown (locked)
            let doorIcon = '🔒';
            let strokeColor = 0x000000; // Default black stroke
            
            if (this.serverGameState.door.isUnlocked) {
                doorColor = 0x2ecc71; // Green (unlocked)
                doorIcon = '🚪';
            } else if (this.serverGameState.key && this.serverGameState.key.heldBy) {
                doorColor = 0xf39c12; // Orange (highlighted - someone has key)
                doorIcon = '🔑';
                strokeColor = 0xffd700; // Golden stroke for highlight
            }
            
            const doorRect = this.add.rectangle(coords.x, coords.y, 40, 40, doorColor);
            doorRect.setStrokeStyle(4, strokeColor);
            doorRect.setDepth(90); // Below players but above tiles
            this.playerSprites['door'] = doorRect;
            
            // Add door label
            const doorLabel = this.add.text(coords.x, coords.y, doorIcon, {
                fontSize: '20px',
                color: '#ffffff'
            }).setOrigin(0.5);
            doorLabel.setDepth(91);
            this.playerSprites['door_label'] = doorLabel;
            
            const doorState = this.serverGameState.door.isUnlocked ? 'unlocked' : 
                             (this.serverGameState.key?.heldBy ? 'highlighted' : 'locked');
            console.log(`🚪 Rendered door (${doorState})`);
        }

        // Draw the pressure plates
        if (this.serverGameState.pressurePlates) {
            this.serverGameState.pressurePlates.forEach((plate, index) => {
                const coords = this.getTilePixelPosition(plate.x, plate.y);
                
                // Destroy old pressure plate sprite if it exists for this index
                if (this.pressurePlateSprites[`plate_${index}`]) {
                    this.pressurePlateSprites[`plate_${index}`].destroy();
                    delete this.pressurePlateSprites[`plate_${index}`];
                }
                
                if (this.textures.exists('pressurePlate')) {
                    const plateSprite = this.add.sprite(coords.x, coords.y, 'pressurePlate');
                    plateSprite.setDepth(85); // Below fires and players but above tiles
                    
                    // Make the pressure plate bigger and ensure it fills most of the tile
                    // 80% of tile size, the sprite is only 16px of the actual tile
                    // in the bottom half. so we need to adust the origin too
                    plateSprite.setOrigin(0.5, 0.7); 
                    const scale = (this.currentTileSize * 0.75) / 16;
                    plateSprite.setScale(scale);
                    
                    // Play appropriate animation based on state
                    if (plate.isPressed) {
                        plateSprite.play('pressure_plate_activated');
                        console.log(`🔘 Rendered activated pressure plate ${index + 1} at (${plate.x}, ${plate.y})`);
                    } else {
                        plateSprite.play('pressure_plate_idle');
                        console.log(`⚪ Rendered idle pressure plate ${index + 1} at (${plate.x}, ${plate.y})`);
                    }
                    
                    // Store with unique key for each plate
                    this.pressurePlateSprites[`plate_${index}`] = plateSprite;
                    this.playerSprites[`pressure_plate_${index}`] = plateSprite;
                } else {
                    console.warn('⚠️ Pressure plate sprite not available, using fallback rendering');
                    
                    // Fallback: render a simple colored rectangle
                    const fallbackColor = plate.isPressed ? 0x2ecc71 : 0x95a5a6;
                    const fallbackRect = this.add.rectangle(coords.x, coords.y, 30, 30, fallbackColor);
                    fallbackRect.setStrokeStyle(2, 0x000000);
                    fallbackRect.setDepth(85);
                    this.playerSprites[`pressure_plate_fallback_${index}`] = fallbackRect;
                    
                    const fallbackIcon = this.add.text(coords.x, coords.y, '⚪', {
                        fontSize: '20px',
                        color: '#000000'
                    }).setOrigin(0.5);
                    fallbackIcon.setDepth(86);
                    this.playerSprites[`pressure_plate_fallback_icon_${index}`] = fallbackIcon;
                    
                    console.log(`🔄 Rendered fallback pressure plate ${index + 1} at (${plate.x}, ${plate.y})`);
                }
            });
        } else {
            console.warn('⚠️ No pressure plates found in game state');
        }

        // Draw the trap doors
        if (this.serverGameState.trapDoors) {
            this.serverGameState.trapDoors.forEach((trap, index) => {
                const coords = this.getTilePixelPosition(trap.x, trap.y);
                
                // Create or update animated spike trap sprite
                if (this.textures.exists('spikeTrap')) {
                    console.log('✅ Spike trap texture exists, creating sprite for trap', index + 1);
                    
                    let trapSprite = this.playerSprites[`trap_${index}`] as Phaser.GameObjects.Sprite;
                    
                    // If trap sprite doesn't exist or is wrong type, create it
                    if (!trapSprite || !(trapSprite instanceof Phaser.GameObjects.Sprite) || trapSprite.texture.key !== 'spikeTrap') {
                        trapSprite = this.add.sprite(coords.x, coords.y, 'spikeTrap');
                        trapSprite.setOrigin(0.5);
                        trapSprite.setScale(1.5); // Scale up slightly for better visibility
                        trapSprite.setDepth(85); // Same depth as pressure plate
                        this.playerSprites[`trap_${index}`] = trapSprite;
                    } else {
                        // Update existing sprite position
                        trapSprite.setPosition(coords.x, coords.y);
                    }
                    
                    // Play appropriate animation based on trap state
                    // trap.isOpen = true (safe) → spikes down → 'trap_closed'
                    // trap.isOpen = false (dangerous) → spikes up → 'trap_open'
                    const targetAnimation = trap.isOpen ? 'trap_closed' : 'trap_open';
                    if (!trapSprite.anims.currentAnim || trapSprite.anims.currentAnim.key !== targetAnimation) {
                        trapSprite.play(targetAnimation);
                    }
                    
                    const trapState = trap.isOpen ? 'open (safe)' : 'closed (dangerous)';
                    console.log(`🪤 Rendered animated spike trap ${index + 1} (${trapState}) at (${trap.x}, ${trap.y})`);
                } else {
                    // Fallback to rectangle if spike trap sprite not available
                    console.log('⚠️ Spike trap texture not found, using fallback for trap', index + 1);
                    
                    // Determine trap appearance based on state
                    let trapColor = trap.isOpen ? 0x2ecc71 : 0xe74c3c; // Green if open (safe), red if closed (dangerous)
                    let trapIcon = trap.isOpen ? '✅' : '❌';
                    let strokeColor = trap.isOpen ? 0x27ae60 : 0xc0392b;
                    
                    const trapRect = this.add.rectangle(coords.x, coords.y, 40, 40, trapColor);
                    trapRect.setStrokeStyle(4, strokeColor);
                    trapRect.setDepth(85);
                    this.playerSprites[`trap_${index}`] = trapRect;
                    
                    // Add trap label
                    const trapLabel = this.add.text(coords.x, coords.y, trapIcon, {
                        fontSize: '20px',
                        color: '#ffffff'
                    }).setOrigin(0.5);
                    trapLabel.setDepth(86);
                    this.playerSprites[`trap_label_${index}`] = trapLabel;
                    
                    const trapState = trap.isOpen ? 'open (safe)' : 'closed (dangerous)';
                    console.log(`🚪 Rendered fallback trap door ${index + 1} (${trapState}) at (${trap.x}, ${trap.y})`);
                }
            });
        }

        // Draw the slimes
        if (this.serverGameState.slimes) {
            this.serverGameState.slimes.forEach((slime, index) => {
                const coords = this.getTilePixelPosition(slime.x, slime.y);
                
                // Determine slime appearance based on state
                let slimeColor = slime.isStunned ? 0x95a5a6 : 0x2ecc71; // Gray if stunned, green if active
                let slimeIcon = slime.isStunned ? '😵' : '🟢';
                let strokeColor = slime.isStunned ? 0x7f8c8d : 0x27ae60;
                
                const slimeCircle = this.add.circle(coords.x, coords.y, 20, slimeColor);
                slimeCircle.setStrokeStyle(3, strokeColor);
                slimeCircle.setDepth(90); // Above tiles but below players
                this.playerSprites[`slime_${index}`] = slimeCircle;
                
                // Add slime label
                const slimeLabel = this.add.text(coords.x, coords.y, slimeIcon, {
                    fontSize: '18px',
                    color: '#ffffff'
                }).setOrigin(0.5);
                slimeLabel.setDepth(91);
                this.playerSprites[`slime_${index}_label`] = slimeLabel;
                
                const slimeState = slime.isStunned ? `stunned (${slime.stunDuration} turns)` : 'active';
                console.log(`🟢 Rendered slime ${index} (${slimeState}) at (${slime.x}, ${slime.y})`);
            });
        }

        // Draw the snail (decorative NPC)
        if (this.serverGameState.snail) {
            console.log('🐌 Client: Rendering snail at', this.serverGameState.snail);
            const coords = this.getTilePixelPosition(this.serverGameState.snail.x, this.serverGameState.snail.y);
            
            // Create or update animated snail sprite
            if (this.textures.exists('snail')) {
                console.log('✅ Snail texture exists, creating sprite');
                
                let snailSprite = this.playerSprites['snail'] as Phaser.GameObjects.Sprite;
                
                // If snail sprite doesn't exist or is wrong type, create it
                if (!snailSprite || !(snailSprite instanceof Phaser.GameObjects.Sprite) || snailSprite.texture.key !== 'snail') {
                    snailSprite = this.add.sprite(coords.x, coords.y, 'snail');
                    snailSprite.setOrigin(0.5);
                    snailSprite.setScale(1.0); // Adjust scale as needed
                    snailSprite.setDepth(89); // Above tiles, below players and other entities
                    this.playerSprites['snail'] = snailSprite;
                } else {
                    // Update existing sprite position
                    snailSprite.setPosition(coords.x, coords.y);
                }
                
                // Play appropriate animation based on direction
                const targetAnimation = this.serverGameState.snail.direction === -1 ? 'snail_move_left' : 'snail_move_right';
                if (!snailSprite.anims.currentAnim || snailSprite.anims.currentAnim.key !== targetAnimation) {
                    snailSprite.play(targetAnimation);
                }
                
                console.log(`🐌 Rendered animated snail NPC at (${this.serverGameState.snail.x}, ${this.serverGameState.snail.y}) moving ${this.serverGameState.snail.direction === -1 ? 'left' : 'right'}`);
            } else {
                // Fallback to orange circle if sprite not available
                console.log('⚠️ Snail texture not found, using fallback orange circle');
                const snailColor = 0xf39c12; // Orange
                const snailIcon = '🐌';
                const strokeColor = 0xe67e22;
                
                const snailCircle = this.add.circle(coords.x, coords.y, 18, snailColor);
                snailCircle.setStrokeStyle(2, strokeColor);
                snailCircle.setDepth(89);
                this.playerSprites['snail'] = snailCircle;
                
                const snailLabel = this.add.text(coords.x, coords.y, snailIcon, {
                    fontSize: '16px',
                    color: '#ffffff'
                }).setOrigin(0.5);
                snailLabel.setDepth(90);
                this.playerSprites['snail_label'] = snailLabel;
                
                console.log(`🐌 Rendered fallback snail NPC at (${this.serverGameState.snail.x}, ${this.serverGameState.snail.y})`);
            }
        }
    }

    private sendMoveRequest(direction: string) {
        try {
            if (!this.myPlayerId || !this.serverGameState) {
                console.log('Cannot move: not connected or no player ID');
                return;
            }
            
            if (this.serverGameState.gameWon || this.serverGameState.gameCompleted) {
                console.log('Cannot move: game completed!');
                return;
            }
            
            if (!direction || typeof direction !== 'string') {
                console.error('❌ Invalid direction for move request:', direction);
                return;
            }
            
            console.log('Sending move request:', direction);
            this.socket.emit('moveRequest', { direction: direction });
            
        } catch (error) {
            console.error('❌ Error sending move request:', error);
        }
    }

    private sendUseItemRequest() {
        try {
            if (!this.myPlayerId || !this.serverGameState) {
                console.log('Cannot use item: not connected or no player ID');
                return;
            }
            
            if (this.serverGameState.gameWon || this.serverGameState.gameCompleted) {
                console.log('Cannot use item: game completed!');
                return;
            }
            
            if (!this.serverGameState.gameStarted) {
                console.log('Cannot use item: game not started');
                return;
            }
            
            if (this.serverGameState.currentPlayerTurn !== this.myPlayerId) {
                console.log('Cannot use item: not your turn');
                return;
            }
            
            if (!this.serverGameState.yourItem) {
                console.log('Cannot use item: no item assigned');
                return;
            }
            
            console.log('Sending use item request:', this.serverGameState.yourItem);
            this.socket.emit('useItemRequest', { item: this.serverGameState.yourItem });
            
        } catch (error) {
            console.error('❌ Error sending use item request:', error);
        }
    }

    update() {
        // Game loop (empty for now)
    }
} 