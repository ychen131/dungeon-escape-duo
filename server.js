const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Map Pool System - Multiple layouts organized by difficulty
// Tile types:
// 0 = floor tile (walkable)
// 1 = wall tile (not walkable)
// 2 = fire hazard (requires "Douse Fire" item to pass)
// 3 = chasm (requires "Build Bridge" item to pass)
// 4 = exit tile (goal for both players)

const MAP_POOL = {
    level1: [
        // Level 1 Layout A - Simple layout with basic hazards
        [
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            [1, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 1],
            [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1],
            [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 3, 1],
            [1, 0, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
            [1, 0, 3, 0, 0, 0, 4, 0, 0, 2, 0, 1],
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
        ],
        // Level 1 Layout B - COMPLETELY DIFFERENT - Wide open with corner hazards
        [
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
        ],
        // Level 1 Layout C - Bridge pattern with center hazards (FIXED - now reachable!)
        [
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1],
            [1, 0, 0, 0, 3, 0, 4, 0, 2, 0, 0, 1],
            [1, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
        ]
    ],
    level2: [
        // Level 2 Layout A - More complex with multiple hazards
        [
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            [1, 0, 2, 0, 1, 3, 0, 2, 0, 1, 0, 1],
            [1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1],
            [1, 0, 1, 0, 0, 0, 0, 3, 0, 0, 0, 1],
            [1, 0, 1, 1, 1, 1, 0, 1, 0, 2, 0, 1],
            [1, 0, 3, 0, 2, 0, 0, 1, 0, 1, 0, 1],
            [1, 0, 1, 0, 1, 0, 4, 0, 0, 3, 0, 1],
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
        ],
        // Level 2 Layout B - Gauntlet pattern with sequential challenges
        [
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            [1, 0, 0, 2, 3, 0, 0, 2, 3, 0, 0, 1],
            [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1],
            [1, 0, 0, 3, 2, 0, 0, 3, 2, 0, 0, 1],
            [1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1],
            [1, 0, 0, 2, 3, 0, 4, 3, 2, 0, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
        ]
    ]
};

// Current game settings
let currentLevel = 'level1';
let currentMapIndex = 0;

// Grid configuration
const GRID_WIDTH = 12;
const GRID_HEIGHT = 8;

// Item types that players can receive
const ITEM_TYPES = {
    DOUSE_FIRE: 'Douse Fire',
    BUILD_BRIDGE: 'Build Bridge'
};

// Tile types for rendering and logic
const TILE_TYPES = {
    FLOOR: 0,
    WALL: 1,
    FIRE_HAZARD: 2,
    CHASM: 3,
    EXIT: 4
};

// Helper function to get current map layout
function getCurrentMap() {
    const levelMaps = MAP_POOL[currentLevel];
    return levelMaps[currentMapIndex % levelMaps.length];
}

// Helper function to select a random map from current level
function selectRandomMapForLevel() {
    const levelMaps = MAP_POOL[currentLevel];
    currentMapIndex = Math.floor(Math.random() * levelMaps.length);
    console.log(`Selected random map: Level ${currentLevel}, Map ${currentMapIndex + 1}/${levelMaps.length}`);
    return getCurrentMap();
}

// Game state object - server is the source of truth
const gameState = {
    players: {},
    dungeonLayout: getCurrentMap(), // Start with current map
    gridWidth: GRID_WIDTH,
    gridHeight: GRID_HEIGHT,
    currentPlayerTurn: null, // Tracks whose turn it is: 'player1' or 'player2'
    gameStarted: false, // Tracks if both players are connected and game has begun
    playerItems: {}, // Tracks current items for each player: { player1: 'Douse Fire', player2: 'Build Bridge' }
    gameWon: false, // Tracks if the game has been won (both players reached exit)
    currentLevel: currentLevel, // Current difficulty level
    mapIndex: currentMapIndex, // Current map within the level
    levelProgression: 1 // Track overall progression: 1 = Level 1, 2 = Level 2, etc.
};

// Player starting positions (design intent)
const startingPositions = {
    player1: { x: 1, y: 1 },
    player2: { x: 10, y: 6 } // Back to original intended positions
};

// Function to load a new map (for testing and level progression)
function loadNewMap(level = null, mapIndex = null) {
    // Set level (default to current or level1)
    if (level) {
        currentLevel = level;
    }
    
    // Set map index (default to random)
    if (mapIndex !== null) {
        currentMapIndex = mapIndex;
    } else {
        // Select random map from the level
        const levelMaps = MAP_POOL[currentLevel];
        currentMapIndex = Math.floor(Math.random() * levelMaps.length);
    }
    
    // Update game state with new map
    gameState.dungeonLayout = getCurrentMap();
    gameState.currentLevel = currentLevel;
    gameState.mapIndex = currentMapIndex;
    
    // Ensure starting positions are safe
    ensureSafeStartingPositions();
    
    console.log(`🗺️  Loaded new map: ${currentLevel} - Layout ${currentMapIndex + 1}/${MAP_POOL[currentLevel].length}`);
}

// Function to ensure starting positions are safe (no hazards)
function ensureSafeStartingPositions() {
    console.log('Validating starting positions...');
    
    for (const [playerId, pos] of Object.entries(startingPositions)) {
        const currentTile = gameState.dungeonLayout[pos.y][pos.x];
        
        if (currentTile !== TILE_TYPES.FLOOR) {
            const tileTypeName = Object.keys(TILE_TYPES).find(key => TILE_TYPES[key] === currentTile);
            console.log(`WARNING: ${playerId} starting position (${pos.x}, ${pos.y}) has ${tileTypeName}, converting to FLOOR`);
            
            // Convert hazard/wall to safe floor tile
            gameState.dungeonLayout[pos.y][pos.x] = TILE_TYPES.FLOOR;
            console.log(`✅ ${playerId} starting position is now safe`);
        } else {
            console.log(`✅ ${playerId} starting position (${pos.x}, ${pos.y}) is already safe`);
        }
    }
    
    console.log('Starting position validation complete');
}

// Initialize with random Level 1 map on server startup
loadNewMap('level1');

// Console commands for testing different maps
console.log('\n🎮 TESTING COMMANDS:');
console.log('📝 Available maps:');
console.log('   Level 1: 3 layouts (easier puzzles)'); 
console.log('   Level 2: 2 layouts (harder puzzles)');
console.log('💡 To test different maps during development:');
console.log('   - Modify loadNewMap() call above to change initial map');
console.log('   - Examples: loadNewMap("level1", 0), loadNewMap("level1", 1), loadNewMap("level1", 2), loadNewMap("level2", 0), loadNewMap("level2", 1)');
console.log('   - Use loadNewMap("level1") for random Level 1 map, loadNewMap("level2") for random Level 2 map');
console.log('');

// Helper function to find an available player slot
function findAvailablePlayerSlot() {
    if (!gameState.players.player1) {
        return 'player1';
    } else if (!gameState.players.player2) {
        return 'player2';
    }
    return null; // No slots available
}

// Helper function to get connected player count
function getConnectedPlayerCount() {
    return Object.keys(gameState.players).length;
}

// Helper function to create customized game state for a specific player
function createCustomizedGameState(playerId) {
    try {
        if (!playerId) {
            console.error('❌ Error: createCustomizedGameState called with null/undefined playerId');
            return gameState;
        }
        
        const customizedState = {
            ...gameState,
            yourPlayerId: playerId,
            yourItem: gameState.playerItems[playerId] || null
        };
        
        // Remove sensitive data (other player's items)
        delete customizedState.playerItems;
        return customizedState;
        
    } catch (error) {
        console.error('❌ Error in createCustomizedGameState:', error);
        return gameState; // Fallback to basic game state
    }
}

// Helper function to broadcast customized game state to all connected players
function broadcastCustomizedGameState() {
    try {
        if (!gameState.players || typeof gameState.players !== 'object') {
            console.error('❌ Error: Invalid gameState.players in broadcastCustomizedGameState');
            return;
        }
        
        let successfulBroadcasts = 0;
        let failedBroadcasts = 0;
        
        for (const [playerId, player] of Object.entries(gameState.players)) {
            try {
                if (!player || !player.socketId) {
                    console.warn(`⚠️  Warning: Invalid player data for ${playerId}`);
                    failedBroadcasts++;
                    continue;
                }
                
                const socket = io.sockets.sockets.get(player.socketId);
                if (socket && socket.connected) {
                    socket.emit('gameState', createCustomizedGameState(playerId));
                    successfulBroadcasts++;
                } else {
                    console.warn(`⚠️  Warning: Socket not found or disconnected for ${playerId}`);
                    failedBroadcasts++;
                }
            } catch (playerError) {
                console.error(`❌ Error broadcasting to ${playerId}:`, playerError);
                failedBroadcasts++;
            }
        }
        
        if (failedBroadcasts > 0) {
            console.log(`📡 Broadcast complete: ${successfulBroadcasts} successful, ${failedBroadcasts} failed`);
        }
        
    } catch (error) {
        console.error('❌ Critical error in broadcastCustomizedGameState:', error);
    }
}

// Helper function to assign random items to players
function assignRandomItems() {
    const itemTypes = Object.values(ITEM_TYPES);
    
    // Assign random items to each player
    gameState.playerItems.player1 = itemTypes[Math.floor(Math.random() * itemTypes.length)];
    gameState.playerItems.player2 = itemTypes[Math.floor(Math.random() * itemTypes.length)];
    
    console.log(`Items assigned - Player1: ${gameState.playerItems.player1}, Player2: ${gameState.playerItems.player2}`);
}

// Helper function to advance to next level after victory
function advanceToNextLevel() {
    // Increment level progression
    gameState.levelProgression++;
    
    // Determine next level string based on progression
    let nextLevel;
    if (gameState.levelProgression <= 1) {
        nextLevel = 'level1';
    } else if (gameState.levelProgression === 2) {
        nextLevel = 'level2';
    } else {
        // Max level reached - could extend with more levels in future
        nextLevel = 'level2';
        console.log('🏆 MAX LEVEL REACHED! Playing hardest available level.');
    }
    
    console.log(`🚀 ADVANCING TO LEVEL ${gameState.levelProgression}!`);
    
    // Set transition state for level change
    gameState.levelTransition = {
        isTransitioning: true,
        fromLevel: gameState.levelProgression - 1,
        toLevel: gameState.levelProgression,
        transitionStartTime: Date.now()
    };
    
    // Broadcast transition state first
    broadcastCustomizedGameState();
    
    // After transition delay, load the new level
    setTimeout(() => {
        // Load random map from next level
        loadNewMap(nextLevel);
        
        // Reset game state for new level
        gameState.gameWon = false;
        gameState.gameStarted = true; // Both players still connected
        gameState.currentPlayerTurn = 'player1'; // Player 1 starts new level
        gameState.levelTransition = null; // Clear transition state
        
        // Reset player positions to starting positions
        if (gameState.players.player1) {
            gameState.players.player1.x = startingPositions.player1.x;
            gameState.players.player1.y = startingPositions.player1.y;
        }
        if (gameState.players.player2) {
            gameState.players.player2.x = startingPositions.player2.x;
            gameState.players.player2.y = startingPositions.player2.y;
        }
        
        // Assign new items for the new level
        assignRandomItems();
        
        console.log(`✨ New level ready! Players reset to starting positions.`);
        
        // Broadcast final new level state
        broadcastCustomizedGameState();
    }, 3000); // 3 second transition screen
}

// Helper function to check if both players are on exit tiles (win condition)
function checkWinCondition() {
    if (gameState.gameWon || !gameState.gameStarted) {
        return false; // Already won or game not started
    }
    
    const player1 = gameState.players.player1;
    const player2 = gameState.players.player2;
    
    if (!player1 || !player2) {
        return false; // Both players must be connected
    }
    
    // Check if both players are on exit tiles
    const player1OnExit = gameState.dungeonLayout[player1.y][player1.x] === TILE_TYPES.EXIT;
    const player2OnExit = gameState.dungeonLayout[player2.y][player2.x] === TILE_TYPES.EXIT;
    
    if (player1OnExit && player2OnExit) {
        gameState.gameWon = true;
        gameState.victoryTime = new Date().toISOString();
        console.log('🎉 VICTORY! Both players reached the exit!');
        
        // Trigger level progression after a longer celebration period
        setTimeout(() => {
            advanceToNextLevel();
            // Broadcast new level to all clients
            broadcastCustomizedGameState();
        }, 5000); // 5 second victory celebration before advancing
        
        return true;
    }
    
    return false;
}

// Helper function to start the game when both players are connected
function startGame() {
    if (getConnectedPlayerCount() === 2 && !gameState.gameStarted) {
        gameState.gameStarted = true;
        gameState.currentPlayerTurn = 'player1'; // Player 1 starts first
        
        // Assign random items to players
        assignRandomItems();
        
        console.log('Game started! Player 1\'s turn.');
        
        // Broadcast game start to all players (customized for each)
        broadcastCustomizedGameState();
    }
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    
    // Find an available player slot
    const playerId = findAvailablePlayerSlot();
    
    if (playerId) {
        // Check if this is a reconnection
        const isReconnection = gameState.disconnectedPlayer && gameState.disconnectedPlayer.playerId === playerId;
        
        // Initialize player in game state
        gameState.players[playerId] = {
            id: playerId,
            socketId: socket.id,
            x: startingPositions[playerId].x,
            y: startingPositions[playerId].y
        };
        
        if (isReconnection) {
            console.log(`🔄 ${playerId} reconnected! Resuming game...`);
            gameState.disconnectedPlayer = null; // Clear disconnect info
            
            // If it was an active game, restore it
            if (gameState.disconnectedPlayer && gameState.disconnectedPlayer.wasInGame) {
                // Could restore game state here if needed
            }
        } else {
            console.log(`✨ ${playerId} joined fresh`);
        }
        
        console.log(`Assigned ${playerId} to socket ${socket.id}`);
        
        // Send initial game state to the connecting player with customized view
        const customizedState = {
            ...gameState,
            yourPlayerId: playerId,
            yourItem: gameState.playerItems[playerId] || null // Only send this player's item
        };
        // Remove sensitive data (other player's items)
        delete customizedState.playerItems;
        
        socket.emit('gameState', customizedState);
        
        // Notify all other players of the updated game state (customized for each player)
        broadcastCustomizedGameState();
        
        // Check if we can start the game (both players connected)
        startGame();
        
        // Handle use item requests from this client
        socket.on('useItemRequest', (data) => {
            try {
                // Validate input data
                if (!data || typeof data !== 'object') {
                    console.warn(`⚠️  Invalid useItemRequest data from ${playerId}:`, data);
                    return;
                }
                
                const { item } = data;
                const player = gameState.players[playerId];
                
                if (!player) {
                    console.warn(`⚠️  useItemRequest from non-existent player: ${playerId}`);
                    return;
                }
                
                if (!item || typeof item !== 'string') {
                    console.warn(`⚠️  Invalid item from ${playerId}:`, item);
                    return;
                }
                
                // Validate item is one of the allowed types
                const validItems = Object.values(ITEM_TYPES);
                if (!validItems.includes(item)) {
                    console.warn(`⚠️  Unknown item type '${item}' from ${playerId}`);
                    return;
                }
            
            // Check if game has started and it's this player's turn
            if (!gameState.gameStarted) {
                console.log(`Use item rejected: Game not started`);
                return;
            }
            
            if (gameState.currentPlayerTurn !== playerId) {
                console.log(`Use item rejected: Not ${playerId}'s turn`);
                return;
            }
            
            // Check if player has the item they're trying to use
            if (gameState.playerItems[playerId] !== item) {
                console.log(`Use item rejected: ${playerId} doesn't have ${item}`);
                return;
            }
            
            // Find adjacent hazard tiles that this item can affect
            const playerX = player.x;
            const playerY = player.y;
            const adjacentPositions = [
                { x: playerX, y: playerY - 1 }, // Up
                { x: playerX, y: playerY + 1 }, // Down
                { x: playerX - 1, y: playerY }, // Left
                { x: playerX + 1, y: playerY }  // Right
            ];
            
            let itemUsed = false;
            
            for (const pos of adjacentPositions) {
                // Check bounds
                if (pos.x < 0 || pos.x >= GRID_WIDTH || pos.y < 0 || pos.y >= GRID_HEIGHT) {
                    continue;
                }
                
                const tileType = gameState.dungeonLayout[pos.y][pos.x];
                
                // Check if item can be used on this tile
                if (item === ITEM_TYPES.DOUSE_FIRE && tileType === TILE_TYPES.FIRE_HAZARD) {
                    // Remove fire hazard
                    gameState.dungeonLayout[pos.y][pos.x] = TILE_TYPES.FLOOR;
                    console.log(`${playerId} used ${item} to douse fire at (${pos.x}, ${pos.y})`);
                    itemUsed = true;
                } else if (item === ITEM_TYPES.BUILD_BRIDGE && tileType === TILE_TYPES.CHASM) {
                    // Fill chasm with bridge
                    gameState.dungeonLayout[pos.y][pos.x] = TILE_TYPES.FLOOR;
                    console.log(`${playerId} used ${item} to build bridge over chasm at (${pos.x}, ${pos.y})`);
                    itemUsed = true;
                }
            }
            
            if (itemUsed) {
                // Switch turns after successful item use
                gameState.currentPlayerTurn = gameState.currentPlayerTurn === 'player1' ? 'player2' : 'player1';
                console.log(`Turn switched to: ${gameState.currentPlayerTurn} after item use`);
                
                // Reassign new random items for next turn
                assignRandomItems();
                
                // Broadcast updated game state to all clients
                broadcastCustomizedGameState();
            } else {
                console.log(`${playerId} tried to use ${item} but no valid targets found`);
                console.log(`Player at (${playerX}, ${playerY}), adjacent tiles checked:`);
                for (const pos of adjacentPositions) {
                    if (pos.x >= 0 && pos.x < GRID_WIDTH && pos.y >= 0 && pos.y < GRID_HEIGHT) {
                        console.log(`  (${pos.x}, ${pos.y}): tile type ${gameState.dungeonLayout[pos.y][pos.x]}`);
                    }
                }
            }
            
            } catch (itemError) {
                console.error(`❌ Error processing item use for ${playerId}:`, itemError);
                // Send error state to player
                socket.emit('gameError', { 
                    message: 'Item use processing failed', 
                    error: itemError.message 
                });
            }
        });
        
        // Handle move requests from this client
        socket.on('moveRequest', (data) => {
            try {
                // Validate input data
                if (!data || typeof data !== 'object') {
                    console.warn(`⚠️  Invalid moveRequest data from ${playerId}:`, data);
                    return;
                }
                
                const { direction } = data;
                const player = gameState.players[playerId];
                
                if (!player) {
                    console.warn(`⚠️  moveRequest from non-existent player: ${playerId}`);
                    return;
                }
                
                if (!direction || typeof direction !== 'string') {
                    console.warn(`⚠️  Invalid direction from ${playerId}:`, direction);
                    return;
                }
                
                // Validate direction is one of the allowed values
                const validDirections = ['up', 'down', 'left', 'right'];
                if (!validDirections.includes(direction)) {
                    console.warn(`⚠️  Invalid direction '${direction}' from ${playerId}`);
                    return;
                }
            
            // Check if game has started and it's this player's turn
            if (!gameState.gameStarted) {
                console.log(`Move rejected: Game not started (waiting for both players)`);
                return;
            }
            
            if (gameState.currentPlayerTurn !== playerId) {
                console.log(`Move rejected: Not ${playerId}'s turn (current: ${gameState.currentPlayerTurn})`);
                return;
            }
            
            // Calculate new position based on direction
            let deltaX = 0, deltaY = 0;
            switch (direction) {
                case 'up': deltaY = -1; break;
                case 'down': deltaY = 1; break;
                case 'left': deltaX = -1; break;
                case 'right': deltaX = 1; break;
                default: return; // Invalid direction
            }
            
            const newX = player.x + deltaX;
            const newY = player.y + deltaY;
            
            // Validate move (bounds check and collision detection)
            if (newX < 0 || newX >= GRID_WIDTH || newY < 0 || newY >= GRID_HEIGHT) {
                return; // Out of bounds
            }
            
            const targetTile = gameState.dungeonLayout[newY][newX];
            
            // Check for walls
            if (targetTile === TILE_TYPES.WALL) {
                return; // Hit a wall
            }
            
            // Check for hazards - players cannot move onto hazards without using items
            if (targetTile === TILE_TYPES.FIRE_HAZARD || targetTile === TILE_TYPES.CHASM) {
                console.log(`Move blocked: ${playerId} tried to move onto hazard at (${newX}, ${newY})`);
                return; // Cannot move onto hazards directly
            }
            
            // Exit tiles are walkable (no blocking needed)
            
                // Valid move - update player position in game state
                player.x = newX;
                player.y = newY;
                
                console.log(`${playerId} moved to (${newX}, ${newY})`);
                
                // Check for win condition after the move
                const gameWon = checkWinCondition();
                
                if (!gameWon) {
                    // Only switch turns if game hasn't been won
                    gameState.currentPlayerTurn = gameState.currentPlayerTurn === 'player1' ? 'player2' : 'player1';
                    console.log(`Turn switched to: ${gameState.currentPlayerTurn}`);
                }
                
                // Broadcast updated game state to all clients (customized for each)
                broadcastCustomizedGameState();
                
            } catch (moveError) {
                console.error(`❌ Error processing move for ${playerId}:`, moveError);
                // Send error state to player
                socket.emit('gameError', { 
                    message: 'Move processing failed', 
                    error: moveError.message 
                });
            }
        });
        
    } else {
        // No available slots - reject connection
        console.log(`Connection rejected for ${socket.id}: Game is full`);
        
        // Send rejection message with a small delay to ensure it's received
        socket.emit('connectionRejected', { reason: 'Game is full' });
        
        // Disconnect after a brief delay to allow the message to be processed
        setTimeout(() => {
            socket.disconnect();
        }, 100);
        return;
    }
    
        socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Remove this specific player from game state
        if (gameState.players[playerId] && gameState.players[playerId].socketId === socket.id) {
            console.log(`${playerId} disconnected from game`);
            
            // Store disconnect info for graceful handling
            const disconnectedPlayer = {
                playerId: playerId,
                disconnectTime: Date.now(),
                wasInGame: gameState.gameStarted
            };
            
            delete gameState.players[playerId];
            
            // Handle game state when a player disconnects
            if (gameState.gameStarted) {
                gameState.gameStarted = false;
                gameState.currentPlayerTurn = null;
                gameState.playerItems = {}; // Clear items when game stops
                gameState.gameWon = false; // Reset win state
                gameState.levelTransition = null; // Clear any transitions
                
                // Add disconnect info to game state
                gameState.disconnectedPlayer = disconnectedPlayer;
                
                console.log(`⚠️  Game paused: ${playerId} disconnected during active game`);
                console.log(`🔄 Waiting for ${playerId} to reconnect or new player to join...`);
            } else {
                console.log(`👋 ${playerId} left while waiting - no active game disrupted`);
            }
            
            // Notify remaining players with graceful disconnect message
            broadcastCustomizedGameState();
            
            // Auto-cleanup after 30 seconds if no reconnection
            setTimeout(() => {
                if (gameState.disconnectedPlayer && gameState.disconnectedPlayer.playerId === playerId) {
                    console.log(`🧹 Auto-cleanup: ${playerId} didn't reconnect within 30 seconds`);
                    gameState.disconnectedPlayer = null;
                    // Reset to fresh game state for new players
                    gameState.levelProgression = 1;
                    loadNewMap('level1', 0);
                    broadcastCustomizedGameState();
                }
            }, 30000); // 30 second cleanup timeout
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 