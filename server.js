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
const dungeonLayout = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1],
    [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
];

// Grid configuration
const GRID_WIDTH = 12;
const GRID_HEIGHT = 8;

// Game state object - server is the source of truth
const gameState = {
    players: {},
    dungeonLayout: dungeonLayout,
    gridWidth: GRID_WIDTH,
    gridHeight: GRID_HEIGHT
};

// Player starting positions
const startingPositions = {
    player1: { x: 1, y: 1 },
    player2: { x: 10, y: 6 }
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
        
        // Send initial game state to the connecting player
        socket.emit('gameState', {
            ...gameState,
            yourPlayerId: playerId
        });
        
        // Notify all other players of the updated game state
        socket.broadcast.emit('gameState', gameState);
        
        // Handle move requests from this client
        socket.on('moveRequest', (data) => {
            const { direction } = data;
            const player = gameState.players[playerId];
            
            if (!player) return;
            
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
            
            if (dungeonLayout[newY][newX] === 1) {
                return; // Hit a wall
            }
            
            // Valid move - update player position in game state
            player.x = newX;
            player.y = newY;
            
            console.log(`${playerId} moved to (${newX}, ${newY})`);
            
            // Broadcast updated game state to all clients
            io.emit('gameState', gameState);
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
            
            // Notify remaining players of the updated game state
            socket.broadcast.emit('gameState', gameState);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 