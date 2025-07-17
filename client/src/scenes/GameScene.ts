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
    yourItem?: string;
    levelProgression?: number;
    currentLevel?: string;
    mapIndex?: number;
    levelTransition?: {
        isTransitioning: boolean;
        toLevel: number;
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
}

export class GameScene extends Phaser.Scene {
    private playerSprites: { [key: string]: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text } = {};
    private myPlayerId: string | null = null;
    private socket: any;
    private serverGameState: GameState | null = null;
    private connectionRejected: boolean = false;
    private statusElement: HTMLElement | null = null;
    private itemDisplayElement: HTMLElement | null = null;

    constructor() {
        super({ key: 'GameScene' });
    }

    preload() {
        console.log('🎮 Loading game assets...');
        
        // Load tileset and tilemap
        this.load.image('tiles', 'Full.png');
        this.load.tilemapTiledJSON('level1', 'level1.tmj');
        
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
        
        // Set up socket event listeners
        this.setupSocketListeners();
    }

    private renderTilemap() {
        try {
            // Check if tileset image loaded
            if (!this.textures.exists('tiles')) {
                console.warn('⚠️  Tileset image "tiles" not loaded, using fallback mode');
                return false;
            }
            
            // Try to create tilemap from loaded data
            const map = this.make.tilemap({ key: 'level1' });
            if (!map) {
                console.warn('⚠️  Failed to create tilemap');
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
            
            // Calculate centering offset for the tilemap
            const tileSize = 50; // Our desired tile size after scaling
            const mapWidthPixels = map.width * tileSize;  // 12 * 50 = 600
            const mapHeightPixels = map.height * tileSize; // 9 * 50 = 450
            const canvasWidth = 800;
            const canvasHeight = 600;
            
            const offsetX = (canvasWidth - mapWidthPixels) / 2;   // (800 - 600) / 2 = 100
            const offsetY = (canvasHeight - mapHeightPixels) / 2; // (600 - 450) / 2 = 75
            
            console.log(`🎯 Centering tilemap: offset (${offsetX}, ${offsetY}), map size ${mapWidthPixels}x${mapHeightPixels}`);

            // Create tile layers (render all layers from the tilemap)
            map.layers.forEach((layerData, index) => {
                console.log(`🎨 Creating layer ${index}: ${layerData.name}`);
                const layer = map.createLayer(layerData.name, tileset, offsetX, offsetY);
                if (layer) {
                    // Scale the layer to make tiles bigger (32x32 -> 50x50)
                    const scale = tileSize / 32; // Scale factor from tileset to desired tile size
                    layer.setScale(scale);
                    console.log(`✅ Layer '${layerData.name}' created successfully at offset (${offsetX}, ${offsetY})`);
                } else {
                    console.warn(`⚠️  Failed to create layer: ${layerData.name}`);
                }
            });
            
            console.log('✅ Tilemap rendering complete');
            return true;
            
        } catch (error) {
            console.error('❌ Error rendering tilemap:', error);
            return false;
        }
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
    }

    private handleGameState(newGameState: GameState) {
        try {
            console.log('📡 Received game state from server:', newGameState);
            
            if (!newGameState || typeof newGameState !== 'object') {
                console.error('❌ Invalid game state received:', newGameState);
                this.updateStatus('❌ Connection error - invalid game state', '#e74c3c');
                return;
            }
            
            this.serverGameState = newGameState;
        
            if (newGameState.yourPlayerId) {
                this.myPlayerId = newGameState.yourPlayerId;
                console.log('Assigned as:', this.myPlayerId);
            }
            
            this.updateGameStatus();
            this.updatePlayerSprites();
            
        } catch (error) {
            console.error('❌ Error handling game state:', error);
        }
    }

    private updateGameStatus() {
        if (!this.serverGameState) return;

        const playerCount = Object.keys(this.serverGameState.players).length;
        
        // Check for level transition first
        if (this.serverGameState.levelTransition?.isTransitioning) {
            const toLevel = this.serverGameState.levelTransition.toLevel;
            this.updateStatus(`🚀 ENTERING LEVEL ${toLevel} 🚀`, '#3498db', '24px', 'bold');
            this.updateItemDisplay(`🎯 Prepare for greater challenges! New puzzles await... 🎯`, '#9b59b6');
            this.setVictoryBackground('linear-gradient(45deg, #3498db, #9b59b6, #3498db)');
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
                    this.updateStatus(`🟢 YOUR TURN | You are ${this.myPlayerId} | Arrow keys: move, SPACE: use item`, '#2ecc71', '18px', 'bold');
                } else {
                    const otherPlayer = this.serverGameState.currentPlayerTurn?.toUpperCase();
                    this.updateStatus(`⏳ ${otherPlayer}'S TURN | You are ${this.myPlayerId} | Wait for your partner...`, '#f39c12');
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

        // Get tile size and calculate positions (matching centered tilemap offset)
        const getTilePixelPosition = (tileX: number, tileY: number) => {
            const tileSize = 50;
            const canvasWidth = 800;
            const canvasHeight = 600;
            const mapWidthPixels = 12 * tileSize;  // 12 tiles wide
            const mapHeightPixels = 9 * tileSize;  // 9 tiles tall
            
            const offsetX = (canvasWidth - mapWidthPixels) / 2;   // Same as tilemap offset
            const offsetY = (canvasHeight - mapHeightPixels) / 2; // Same as tilemap offset
            
            return {
                x: offsetX + (tileX * tileSize) + (tileSize / 2),
                y: offsetY + (tileY * tileSize) + (tileSize / 2),
                tileSize
            };
        };

        // Create or update player sprites
        for (const [playerId, player] of Object.entries(this.serverGameState.players)) {
            if (!this.playerSprites[playerId]) {
                // Create new player sprite
                const coords = getTilePixelPosition(player.x, player.y);
                
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
                    
                    const scale = (coords.tileSize * 4.0) / 100;
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
                    // Fallback to colored rectangle
                    console.warn(`⚠️ Sprite '${spriteKey}' not available, using rectangle fallback for ${playerId}`);
                    const color = playerId === 'player1' ? 0x3498db : 0xe74c3c;
                    sprite = this.add.rectangle(coords.x, coords.y, coords.tileSize - 10, coords.tileSize - 10, color);
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
                const coords = getTilePixelPosition(player.x, player.y);
                
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
                
                // Highlight current player's turn
                if (this.serverGameState.gameStarted && this.serverGameState.currentPlayerTurn === playerId) {
                    label.setStyle({ fontSize: '16px', color: '#ffff00', fontWeight: 'bold', stroke: '#000000', strokeThickness: 3 });
                } else {
                    label.setStyle({ fontSize: '12px', color: '#ffffff', fontWeight: 'normal', stroke: '#000000', strokeThickness: 2 });
                }
                
                // Victory effects
                if (this.serverGameState.gameCompleted) {
                    if (sprite.setStrokeStyle) {
                        sprite.setScale(1.3);
                        sprite.setStrokeStyle(5, 0xff6b35);
                    } else if (sprite.setTint) {
                        sprite.setScale(4 * 1.3);
                        sprite.setTint(0xff6b35);
                    }
                    label.setStyle({ fontSize: '18px', color: '#ff6b35', fontWeight: 'bold' });
                } else if (this.serverGameState.gameWon) {
                    if (sprite.setStrokeStyle) {
                        sprite.setScale(1.2);
                        sprite.setStrokeStyle(4, 0xffd700);
                    } else if (sprite.setTint) {
                        sprite.setScale(4 * 1.2);
                        sprite.setTint(0xffd700);
                    }
                    label.setStyle({ fontSize: '16px', color: '#ffd700', fontWeight: 'bold' });
                }
            }
        }

        // Render cooperative puzzle objects
        this.renderPuzzleObjects();
    }

    private renderPuzzleObjects() {
        if (!this.serverGameState) return;

        // Get tile size and calculate positions (same helper as player sprites)
        const getTilePixelPosition = (tileX: number, tileY: number) => {
            const tileSize = 50;
            const canvasWidth = 800;
            const canvasHeight = 600;
            const mapWidthPixels = 12 * tileSize;  // 12 tiles wide
            const mapHeightPixels = 9 * tileSize;  // 9 tiles tall
            
            const offsetX = (canvasWidth - mapWidthPixels) / 2;   // Same as tilemap offset
            const offsetY = (canvasHeight - mapHeightPixels) / 2; // Same as tilemap offset
            
            return {
                x: offsetX + (tileX * tileSize) + (tileSize / 2),
                y: offsetY + (tileY * tileSize) + (tileSize / 2),
                tileSize
            };
        };

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
            const coords = getTilePixelPosition(this.serverGameState.key.x, this.serverGameState.key.y);
            
            if (this.textures.exists('key')) {
                const keySprite = this.add.sprite(coords.x, coords.y, 'key');
                keySprite.setOrigin(0.5, 0.5);
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
                    const coords = getTilePixelPosition(fireState.x, fireState.y);
                    
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
            const coords = getTilePixelPosition(this.serverGameState.door.x, this.serverGameState.door.y);
            
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