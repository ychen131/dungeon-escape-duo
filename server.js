const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Dungeon Level Layout (moved from client)
// 0 = floor tile (walkable)
// 1 = wall tile (not walkable)
// 2 = fire hazard (requires "Douse Fire" item to pass)
// 3 = chasm (requires "Build Bridge" item to pass)
const dungeonLayout = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 1],
    [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1],
    [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 3, 1],
    [1, 0, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
    [1, 0, 3, 0, 0, 0, 0, 0, 0, 2, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
];

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
    CHASM: 3
};

// Game state object - server is the source of truth
const gameState = {
    players: {},
    dungeonLayout: dungeonLayout,
    gridWidth: GRID_WIDTH,
    gridHeight: GRID_HEIGHT,
    currentPlayerTurn: null, // Tracks whose turn it is: 'player1' or 'player2'
    gameStarted: false, // Tracks if both players are connected and game has begun
    playerItems: {} // Tracks current items for each player: { player1: 'Douse Fire', player2: 'Build Bridge' }
};

// Player starting positions
const startingPositions = {
    player1: { x: 1, y: 1 },
    player2: { x: 9, y: 6 } // Changed from (10,6) to (9,6) to avoid fire hazard
};

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
            
            const targetTile = dungeonLayout[newY][newX];
            
            // Check for walls
            if (targetTile === TILE_TYPES.WALL) {
                return; // Hit a wall
            }
            
            // Check for hazards - players cannot move onto hazards without using items
            if (targetTile === TILE_TYPES.FIRE_HAZARD || targetTile === TILE_TYPES.CHASM) {
                console.log(`Move blocked: ${playerId} tried to move onto hazard at (${newX}, ${newY})`);
                return; // Cannot move onto hazards directly
            }
            
            // Valid move - update player position in game state
            player.x = newX;
            player.y = newY;
            
            console.log(`${playerId} moved to (${newX}, ${newY})`);
            
            // Switch turns after successful move
            gameState.currentPlayerTurn = gameState.currentPlayerTurn === 'player1' ? 'player2' : 'player1';
            console.log(`Turn switched to: ${gameState.currentPlayerTurn}`);
            
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
            
            // Stop the game if a player disconnects
            if (gameState.gameStarted) {
                gameState.gameStarted = false;
                gameState.currentPlayerTurn = null;
                gameState.playerItems = {}; // Clear items when game stops
                console.log('Game stopped due to player disconnect');
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