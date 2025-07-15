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
    const customizedState = {
        ...gameState,
        yourPlayerId: playerId,
        yourItem: gameState.playerItems[playerId] || null
    };
    // Remove sensitive data (other player's items)
    delete customizedState.playerItems;
    return customizedState;
}

// Helper function to broadcast customized game state to all connected players
function broadcastCustomizedGameState() {
    for (const [playerId, player] of Object.entries(gameState.players)) {
        const socket = io.sockets.sockets.get(player.socketId);
        if (socket) {
            socket.emit('gameState', createCustomizedGameState(playerId));
        }
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
    
    // Load random map from next level
    loadNewMap(nextLevel);
    
    // Reset game state for new level
    gameState.gameWon = false;
    gameState.gameStarted = true; // Both players still connected
    gameState.currentPlayerTurn = 'player1'; // Player 1 starts new level
    
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
        console.log('🎉 VICTORY! Both players reached the exit!');
        
        // Trigger level progression after a brief delay
        setTimeout(() => {
            advanceToNextLevel();
            // Broadcast new level to all clients
            broadcastCustomizedGameState();
        }, 2000); // 2 second victory celebration before advancing
        
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
        // Initialize player in game state
        gameState.players[playerId] = {
            id: playerId,
            socketId: socket.id,
            x: startingPositions[playerId].x,
            y: startingPositions[playerId].y
        };
        
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
            const { item } = data;
            const player = gameState.players[playerId];
            
            if (!player) return;
            
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
        });
        
        // Handle move requests from this client
        socket.on('moveRequest', (data) => {
            const { direction } = data;
            const player = gameState.players[playerId];
            
            if (!player) return;
            
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
            delete gameState.players[playerId];
            console.log(`Removed ${playerId} from game`);
            
                    // Handle game state when a player disconnects
        if (gameState.gameStarted) {
            gameState.gameStarted = false;
            gameState.currentPlayerTurn = null;
            gameState.playerItems = {}; // Clear items when game stops
            gameState.gameWon = false; // Reset win state
            console.log('Game paused due to player disconnect - waiting for reconnection...');
        }
            
            // Notify remaining players of the updated game state
            broadcastCustomizedGameState();
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 