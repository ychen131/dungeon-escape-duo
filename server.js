const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configure CORS for development
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:3000'], // Allow Vite dev server and production
  methods: ['GET', 'POST'],
  credentials: true,
};

app.use(cors(corsOptions));

// Configure Socket.io with CORS
const io = socketIo(server, {
  cors: corsOptions,
});

// Serve static files from the client build directory
app.use(express.static(path.join(__dirname, 'client/dist')));

// Tilemap tile ID to game logic mapping (matches client-side mapping)
// Based on careful analysis of the Cardinal Zebra tileset and layer data
const TILEMAP_TO_LOGIC = {
  // Walls (gray brick tiles from the tileset)
  1: 1,
  5: 1,
  6: 1,
  8: 1,
  9: 1,
  10: 1,
  12: 1,
  13: 1,
  15: 1,
  29: 1,
  30: 1,
  34: 1,
  // Floors (purple cracked floor tiles)
  16: 0,
  17: 0,
  18: 0,
  19: 0,
  23: 0,
  25: 0,
  26: 0,
  // Fire hazards (torch tiles) - from Layer 2
  7: 2, // Torch tiles
  2: 2, // Alternative torch tile
  // Chasms/water (barrel/pot tiles) - from Layer 2
  41: 3,
  42: 3, // Barrel/pot tiles that represent chasms
  // Floor tiles that were mistakenly identified as chasms
  43: 0,
  44: 0, // These are actually floor tiles, not chasms
  // Exit (chest/door tile) - from Layer 2
  49: 4,
  // Empty tiles (voids) become walls - impassable black space
  0: 1,
};

// Tilemap parsing functions
function loadTilemapFromFile(tilemapPath) {
  try {
    const tilemapData = JSON.parse(fs.readFileSync(tilemapPath, 'utf8'));
    return parseTilemapToGameLogic(tilemapData);
  } catch (error) {
    console.error(`❌ Failed to load tilemap from ${tilemapPath}:`, error);
    return null;
  }
}

function parseTilemapToGameLogic(tilemapData) {
  try {
    if (!tilemapData || !tilemapData.layers || !tilemapData.width || !tilemapData.height) {
      console.error('❌ Invalid tilemap data structure');
      return null;
    }

    const mapWidth = tilemapData.width;
    const mapHeight = tilemapData.height;
    const fullLayout = [];

    // Initialize empty layout
    for (let y = 0; y < mapHeight; y++) {
      fullLayout.push(new Array(mapWidth).fill(0));
    }

    // Process each layer (later layers override earlier ones, but only if they have content)
    for (const layer of tilemapData.layers) {
      if (layer.type === 'tilelayer' && layer.data) {
        for (let i = 0; i < layer.data.length; i++) {
          const tileId = layer.data[i];
          const x = i % mapWidth;
          const y = Math.floor(i / mapWidth);

          if (y < mapHeight && x < mapWidth) {
            if (tileId > 0) {
              // Non-empty tile - use it (override any previous layer)
              const logicType = TILEMAP_TO_LOGIC[tileId] || 0;
              fullLayout[y][x] = logicType;
            }
            // If tileId is 0 (empty), leave whatever was on lower layers
          }
        }
      }
    }

    // Skip content bounds detection - use full tilemap size
    console.log(`✅ Parsed tilemap: ${mapWidth}x${mapHeight} (using full size)`);

    // Debug: Print the parsed layout
    console.log('🔍 Parsed layout preview:');
    for (let y = 0; y < Math.min(mapHeight, 10); y++) {
      let row = '';
      for (let x = 0; x < Math.min(mapWidth, 30); x++) {
        const tile = fullLayout[y][x];
        row +=
          tile === 0
            ? '.'
            : tile === 1
              ? '#'
              : tile === 2
                ? 'F'
                : tile === 3
                  ? 'W'
                  : tile === 4
                    ? 'E'
                    : '?';
      }
      console.log(`Row ${y}: ${row}`);
    }

    return {
      layout: fullLayout,
      width: mapWidth,
      height: mapHeight,
    };
  } catch (error) {
    console.error('❌ Error parsing tilemap to game logic:', error);
    return null;
  }
}

// Function to detect the actual content bounds in a tilemap
function detectContentBounds(layout) {
  let minX = layout[0].length;
  let maxX = -1;
  let minY = layout.length;
  let maxY = -1;

  // Find bounds of non-floor content (walls, hazards, exits)
  for (let y = 0; y < layout.length; y++) {
    for (let x = 0; x < layout[y].length; x++) {
      const tile = layout[y][x];
      // Consider any non-floor tile as content (walls, hazards, exits)
      if (tile !== 0) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  // Add 1-tile padding around content if possible
  minX = Math.max(0, minX - 1);
  maxX = Math.min(layout[0].length - 1, maxX + 1);
  minY = Math.max(0, minY - 1);
  maxY = Math.min(layout.length - 1, maxY + 1);

  // Return null if no content found
  if (maxX < minX || maxY < minY) {
    return null;
  }

  return { minX, maxX, minY, maxY };
}

// Map Pool System - Tilemap files organized by difficulty
// Tile types in game logic:
// 0 = floor tile (walkable)
// 1 = wall tile (not walkable)
// 2 = fire hazard (requires "Douse Fire" item to pass)
// 3 = chasm (requires "Build Bridge" item to pass)
// 4 = exit tile (goal for both players)

const MAP_POOL = {
  level1: [
    // Level 1 - Use the tilemap file from the source directory (for server parsing)
    'client/public/assets/level1.tmj', // Server reads from source for parsing
    // Future tilemaps can be added here:
    // 'client/public/assets/level1_alt1.tmj',
    // 'client/public/assets/level1_alt2.tmj'
  ],
  level2: [
    // Level 2 - We'll add the tilemap file here when created
    // 'client/public/assets/level2.tmj' // Will be added when we create Level 2 assets
    // Fallback to hardcoded arrays for level 2 for now
    [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 2, 0, 1, 3, 0, 2, 0, 1, 0, 1],
      [1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1],
      [1, 0, 1, 0, 0, 0, 0, 3, 0, 0, 0, 1],
      [1, 0, 1, 1, 1, 1, 0, 1, 0, 2, 0, 1],
      [1, 0, 3, 0, 2, 0, 0, 1, 0, 1, 0, 1],
      [1, 0, 1, 0, 1, 0, 4, 0, 0, 3, 0, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],
  ],
};

// Current game settings
let currentLevel = 'level1';
let currentMapIndex = 0;

// Grid configuration (will be updated dynamically based on loaded map)
let GRID_WIDTH = 12;
let GRID_HEIGHT = 8;

// Item types that players can receive
const ITEM_TYPES = {
  DOUSE_FIRE: 'Douse Fire',
  BUILD_BRIDGE: 'Build Bridge',
};

// Tile types for rendering and logic
const TILE_TYPES = {
  FLOOR: 0,
  WALL: 1,
  FIRE_HAZARD: 2,
  CHASM: 3,
  EXIT: 4,
};

// Helper function to get current map layout
function getCurrentMap() {
  const levelMaps = MAP_POOL[currentLevel];
  const mapData = levelMaps[currentMapIndex % levelMaps.length];

  // Check if it's a tilemap file path or hardcoded array
  if (typeof mapData === 'string') {
    // It's a tilemap file path
    const tilemapResult = loadTilemapFromFile(mapData);
    if (tilemapResult) {
      // Update grid dimensions
      GRID_WIDTH = tilemapResult.width;
      GRID_HEIGHT = tilemapResult.height;
      return tilemapResult.layout;
    } else {
      console.error(`❌ Failed to load tilemap: ${mapData}, falling back to default`);
      // Fallback to default small map
      GRID_WIDTH = 12;
      GRID_HEIGHT = 8;
      return createDefaultMap();
    }
  } else if (Array.isArray(mapData)) {
    // It's a hardcoded array
    GRID_WIDTH = mapData[0].length;
    GRID_HEIGHT = mapData.length;
    return mapData;
  } else {
    console.error(`❌ Invalid map data type: ${typeof mapData}`);
    GRID_WIDTH = 12;
    GRID_HEIGHT = 8;
    return createDefaultMap();
  }
}

// Helper function to create a default map in case of errors
function createDefaultMap() {
  return [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ];
}

// Helper function to select a random map from current level
function selectRandomMapForLevel() {
  const levelMaps = MAP_POOL[currentLevel];
  currentMapIndex = Math.floor(Math.random() * levelMaps.length);
  console.log(
    `Selected random map: Level ${currentLevel}, Map ${currentMapIndex + 1}/${levelMaps.length}`
  );
  return getCurrentMap();
}

// Initialize game state (will be properly set by loadNewMap)
const gameState = {
  players: {},
  dungeonLayout: [], // Will be set by loadNewMap
  gridWidth: 12, // Will be updated by loadNewMap
  gridHeight: 8, // Will be updated by loadNewMap
  currentPlayerTurn: null, // Tracks whose turn it is: 'player1' or 'player2'
  actionsRemaining: 2, // Track remaining actions for current player
  gameStarted: false, // Tracks if both players are connected and game has begun
  playerItems: {}, // Tracks current items for each player: { player1: 'Douse Fire', player2: 'Build Bridge' }
  gameWon: false, // Tracks if the game has been won (both players reached exit)
  currentLevel: currentLevel, // Current difficulty level
  mapIndex: currentMapIndex, // Current map within the level
  levelProgression: 1, // Track overall progression: 1 = Level 1, 2 = Level 2, etc.
  // Level 1 cooperative puzzle objects
  key: {
    x: 1,
    y: 2, // Moved down one tile to floor
    heldBy: null, // Track which player ID has the key
  },
  fires: [
    { x: 2, y: 2, isDoused: false }, // Fire guarding the key (moved to floor)
    { x: 6, y: 5, isDoused: false }, // Fire blocking the central path
  ],
  door: {
    x: 9,
    y: 2,
    isUnlocked: false,
  },
};

// Player starting positions (will be updated based on map size)
let startingPositions = {
  player1: { x: 1, y: 8 }, // Player 1 new spawn: bottom-left
  player2: { x: 10, y: 6 },
};

// Function to find safe starting positions in the map
function findSafeStartingPositions(dungeonLayout) {
  // For Level 1 cooperative puzzle, use specific spawn positions
  if (currentLevel === 'level1') {
    return {
      player1: { x: 1, y: 6 }, // Player 1 (Soldier): bottom-left (valid floor tile)
      player2: { x: 10, y: 2 }, // Player 2 (Orc): top-right
    };
  }

  const safePositions = [];

  // Find all floor tiles
  for (let y = 0; y < dungeonLayout.length; y++) {
    for (let x = 0; x < dungeonLayout[y].length; x++) {
      if (dungeonLayout[y][x] === 0) {
        // Floor tile
        safePositions.push({ x, y });
      }
    }
  }

  if (safePositions.length >= 2) {
    // Use first and last safe positions for maximum separation
    const pos1 = safePositions[0];
    const pos2 = safePositions[safePositions.length - 1];

    return {
      player1: pos1,
      player2: pos2,
    };
  } else {
    // Fallback to corners if no safe positions found
    const width = dungeonLayout[0].length;
    const height = dungeonLayout.length;
    return {
      player1: { x: 1, y: 1 },
      player2: { x: width - 2, y: height - 2 },
    };
  }
}

// Function to update starting positions based on current map
function updateStartingPositionsForMap(dungeonLayout) {
  const newPositions = findSafeStartingPositions(dungeonLayout);
  startingPositions = newPositions;

  console.log(
    `🎯 Updated starting positions: Player1(${newPositions.player1.x},${newPositions.player1.y}), Player2(${newPositions.player2.x},${newPositions.player2.y})`
  );
}

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

  // Load the map (this updates GRID_WIDTH and GRID_HEIGHT)
  const newDungeonLayout = getCurrentMap();

  // Update game state with new map and dimensions
  gameState.dungeonLayout = newDungeonLayout;
  gameState.gridWidth = GRID_WIDTH;
  gameState.gridHeight = GRID_HEIGHT;
  gameState.currentLevel = currentLevel;
  gameState.mapIndex = currentMapIndex;

  // Update starting positions for the new map size
  updateStartingPositionsForMap(newDungeonLayout);

  // Ensure starting positions are safe (this may override the automatic detection if needed)
  ensureSafeStartingPositions();

  console.log(
    `🗺️  Loaded new map: ${currentLevel} - Layout ${currentMapIndex + 1}/${MAP_POOL[currentLevel].length} (${GRID_WIDTH}x${GRID_HEIGHT})`
  );
}

// Function to ensure starting positions are safe (no hazards)
function ensureSafeStartingPositions() {
  console.log('Validating starting positions...');

  for (const [playerId, pos] of Object.entries(startingPositions)) {
    const currentTile = gameState.dungeonLayout[pos.y][pos.x];

    if (currentTile !== TILE_TYPES.FLOOR) {
      const tileTypeName = Object.keys(TILE_TYPES).find(key => TILE_TYPES[key] === currentTile);
      console.log(
        `WARNING: ${playerId} starting position (${pos.x}, ${pos.y}) has ${tileTypeName}, converting to FLOOR`
      );

      // Convert hazard/wall to safe floor tile
      gameState.dungeonLayout[pos.y][pos.x] = TILE_TYPES.FLOOR;
      console.log(`✅ ${playerId} starting position is now safe`);
    } else {
      console.log(`✅ ${playerId} starting position (${pos.x}, ${pos.y}) is already safe`);
    }
  }

  console.log('Starting position validation complete');
}

// Initialize with Level 1 tilemap on server startup
console.log('🎮 Initializing server with tilemap system...');
loadNewMap('level1', 0); // Load first map from level1 (the tilemap)

// Console commands for testing different maps
console.log('\n🎮 TESTING COMMANDS:');
console.log('📝 Available maps:');
console.log('   Level 1: 3 layouts (easier puzzles)');
console.log('   Level 2: 2 layouts (harder puzzles)');
console.log('💡 To test different maps during development:');
console.log('   - Modify loadNewMap() call above to change initial map');
console.log(
  '   - Examples: loadNewMap("level1", 0), loadNewMap("level1", 1), loadNewMap("level1", 2), loadNewMap("level2", 0), loadNewMap("level2", 1)'
);
console.log(
  '   - Use loadNewMap("level1") for random Level 1 map, loadNewMap("level2") for random Level 2 map'
);
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
      yourItem: gameState.playerItems[playerId] || null,
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
      console.log(
        `📡 Broadcast complete: ${successfulBroadcasts} successful, ${failedBroadcasts} failed`
      );
    }
  } catch (error) {
    console.error('❌ Critical error in broadcastCustomizedGameState:', error);
  }
}

// Helper function to check adjacency between two positions
function isAdjacent(pos1, pos2) {
  const dx = Math.abs(pos1.x - pos2.x);
  const dy = Math.abs(pos1.y - pos2.y);
  return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
}

// Helper function to check door win condition (both players at unlocked door)
function checkDoorWinCondition() {
  if (!gameState.door || !gameState.door.isUnlocked) {
    return false;
  }

  const players = Object.values(gameState.players);
  if (players.length < 2) {
    return false;
  }

  // Check if both players are at the door tile
  const bothAtDoor = players.every(
    player => player.x === gameState.door.x && player.y === gameState.door.y
  );

  if (bothAtDoor) {
    console.log('🎉 Both players reached the door! Level completed!');
    gameState.gameWon = true;
    gameState.victoryTime = new Date().toISOString();

    // Advance to next level after a brief delay
    setTimeout(() => {
      advanceToNextLevel();
    }, 2000);

    // Broadcast victory state
    broadcastCustomizedGameState();
    return true;
  }

  return false;
}

// Helper function to assign random items to players
function assignRandomItems() {
  // For Level 1 cooperative puzzle, both players get "Douse Fire" items
  if (currentLevel === 'level1') {
    gameState.playerItems.player1 = ITEM_TYPES.DOUSE_FIRE;
    gameState.playerItems.player2 = ITEM_TYPES.DOUSE_FIRE;
  } else {
    // For other levels, assign random items
    const itemTypes = Object.values(ITEM_TYPES);
    gameState.playerItems.player1 = itemTypes[Math.floor(Math.random() * itemTypes.length)];
    gameState.playerItems.player2 = itemTypes[Math.floor(Math.random() * itemTypes.length)];
  }

  console.log(
    `Items assigned - Player1: ${gameState.playerItems.player1}, Player2: ${gameState.playerItems.player2}`
  );
}

// Helper function to advance to next level after victory
function advanceToNextLevel() {
  // Check if we've completed Level 2 - if so, end the game entirely
  if (gameState.levelProgression === 2) {
    console.log('🏆 GAME COMPLETED! Both levels mastered!');

    // Set final victory state
    gameState.gameCompleted = true;
    gameState.finalVictoryTime = new Date().toISOString();

    // Broadcast final victory state
    broadcastCustomizedGameState();

    return; // End the game here - no more levels
  }

  // Increment level progression (only from 1 to 2)
  gameState.levelProgression++;

  // Determine next level string based on progression
  let nextLevel;
  if (gameState.levelProgression <= 1) {
    nextLevel = 'level1';
  } else if (gameState.levelProgression === 2) {
    nextLevel = 'level2';
  }

  console.log(`🚀 ADVANCING TO LEVEL ${gameState.levelProgression}!`);

  // Set transition state for level change
  gameState.levelTransition = {
    isTransitioning: true,
    fromLevel: gameState.levelProgression - 1,
    toLevel: gameState.levelProgression,
    transitionStartTime: Date.now(),
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
    gameState.actionsRemaining = 2; // Reset actions for new level
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
    gameState.actionsRemaining = 2; // Initialize actions remaining

    // Assign random items to players
    assignRandomItems();

    console.log("Game started! Player 1's turn.");

    // Broadcast game start to all players (customized for each)
    broadcastCustomizedGameState();
  }
}

// Helper function to switch turns and reset actions
function switchTurn() {
  gameState.currentPlayerTurn = gameState.currentPlayerTurn === 'player1' ? 'player2' : 'player1';
  gameState.actionsRemaining = 2; // Reset actions to 2 for the new turn
  console.log(
    `Turn switched to: ${gameState.currentPlayerTurn} (${gameState.actionsRemaining} actions remaining)`
  );
}

// Socket.io connection handling
io.on('connection', socket => {
  console.log('A user connected:', socket.id);

  // Find an available player slot
  const playerId = findAvailablePlayerSlot();

  if (playerId) {
    // Check if this is a reconnection
    const isReconnection =
      gameState.disconnectedPlayer && gameState.disconnectedPlayer.playerId === playerId;

    // Initialize player in game state
    gameState.players[playerId] = {
      id: playerId,
      socketId: socket.id,
      x: startingPositions[playerId].x,
      y: startingPositions[playerId].y,
      lastMoveDirection: null, // Track direction for sprite flipping
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
      yourItem: gameState.playerItems[playerId] || null, // Only send this player's item
    };
    // Remove sensitive data (other player's items)
    delete customizedState.playerItems;

    socket.emit('gameState', customizedState);

    // Notify all other players of the updated game state (customized for each player)
    broadcastCustomizedGameState();

    // Check if we can start the game (both players connected)
    startGame();

    // Handle use item requests from this client
    socket.on('useItemRequest', data => {
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

        // === SPECIAL CASE: DOOR ESCAPE ===
        // Check if player is trying to escape through the door
        if (
          gameState.door &&
          gameState.key &&
          gameState.key.heldBy === playerId &&
          gameState.door.isUnlocked &&
          isAdjacent(player, gameState.door)
        ) {
          console.log(`Player ${playerId} is escaping through the door!`);

          // Send escape message to player
          const socket = io.sockets.sockets.get(gameState.players[playerId].socketId);
          if (socket) {
            socket.emit('doorMessage', {
              message: '🎉 You escaped! Checking if your partner is ready...',
            });
          }

          // Check if both players are at the door for level completion
          checkDoorWinCondition();
          return; // Don't process as regular item use
        }

        // Find adjacent hazard tiles that this item can affect
        const playerX = player.x;
        const playerY = player.y;
        const adjacentPositions = [
          { x: playerX, y: playerY - 1 }, // Up
          { x: playerX, y: playerY + 1 }, // Down
          { x: playerX - 1, y: playerY }, // Left
          { x: playerX + 1, y: playerY }, // Right
        ];

        let itemUsed = false;

        for (const pos of adjacentPositions) {
          // Check bounds
          if (
            pos.x < 0 ||
            pos.x >= gameState.gridWidth ||
            pos.y < 0 ||
            pos.y >= gameState.gridHeight
          ) {
            continue;
          }

          const tileType = gameState.dungeonLayout[pos.y][pos.x];

          // Check if item can be used on this tile
          if (item === ITEM_TYPES.DOUSE_FIRE) {
            // For Level 1 cooperative puzzle, check fires array
            if (currentLevel === 'level1' && Array.isArray(gameState.fires)) {
              const fireAtPos = gameState.fires.find(
                f => f.x === pos.x && f.y === pos.y && !f.isDoused
              );
              if (fireAtPos) {
                fireAtPos.isDoused = true;
                console.log(`${playerId} used ${item} to douse fire at (${pos.x}, ${pos.y})`);
                itemUsed = true;
              }
            } else if (tileType === TILE_TYPES.FIRE_HAZARD) {
              // Fallback for other levels - use dungeon layout
              gameState.dungeonLayout[pos.y][pos.x] = TILE_TYPES.FLOOR;
              console.log(`${playerId} used ${item} to douse fire at (${pos.x}, ${pos.y})`);
              itemUsed = true;
            }
          } else if (item === ITEM_TYPES.BUILD_BRIDGE && tileType === TILE_TYPES.CHASM) {
            // Fill chasm with bridge
            gameState.dungeonLayout[pos.y][pos.x] = TILE_TYPES.FLOOR;
            console.log(
              `${playerId} used ${item} to build bridge over chasm at (${pos.x}, ${pos.y})`
            );
            itemUsed = true;
          }
        }

        if (itemUsed) {
          // Decrement actions remaining after successful item use
          gameState.actionsRemaining--;
          console.log(
            `${playerId} used 1 action (item), ${gameState.actionsRemaining} actions remaining`
          );

          // Auto-switch turns if no actions remaining
          if (gameState.actionsRemaining <= 0) {
            switchTurn();
            // Reassign new random items for next turn
            assignRandomItems();
          }

          // Broadcast updated game state to all clients
          broadcastCustomizedGameState();
        } else {
          console.log(`${playerId} tried to use ${item} but no valid targets found`);
          console.log(`Player at (${playerX}, ${playerY}), adjacent tiles checked:`);
          for (const pos of adjacentPositions) {
            if (
              pos.x >= 0 &&
              pos.x < gameState.gridWidth &&
              pos.y >= 0 &&
              pos.y < gameState.gridHeight
            ) {
              console.log(
                `  (${pos.x}, ${pos.y}): tile type ${gameState.dungeonLayout[pos.y][pos.x]}`
              );
            }
          }
        }
      } catch (itemError) {
        console.error(`❌ Error processing item use for ${playerId}:`, itemError);
        // Send error state to player
        socket.emit('gameError', {
          message: 'Item use processing failed',
          error: itemError.message,
        });
      }
    });

    // Handle move requests from this client
    socket.on('moveRequest', data => {
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
          console.log(
            `Move rejected: Not ${playerId}'s turn (current: ${gameState.currentPlayerTurn})`
          );
          return;
        }

        // Calculate new position based on direction
        let deltaX = 0,
          deltaY = 0;
        switch (direction) {
          case 'up':
            deltaY = -1;
            break;
          case 'down':
            deltaY = 1;
            break;
          case 'left':
            deltaX = -1;
            break;
          case 'right':
            deltaX = 1;
            break;
          default:
            return; // Invalid direction
        }

        const newX = player.x + deltaX;
        const newY = player.y + deltaY;

        // Validate move (bounds check and collision detection)
        if (newX < 0 || newX >= gameState.gridWidth || newY < 0 || newY >= gameState.gridHeight) {
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

        // Prevent movement onto undoused fire tiles (from fires array)
        if (Array.isArray(gameState.fires)) {
          const fireAtTarget = gameState.fires.find(
            f => f.x === newX && f.y === newY && !f.isDoused
          );
          if (fireAtTarget) {
            console.log(
              `Move blocked: ${playerId} tried to move onto undoused fire at (${newX}, ${newY})`
            );
            return; // Cannot move onto undoused fire
          }
        }

        // Exit tiles are walkable (no blocking needed)

        // Valid move - update player position and direction in game state
        player.x = newX;
        player.y = newY;
        player.lastMoveDirection = direction; // Store direction for sprite flipping

        // === KEY PICKUP LOGIC ===
        if (
          gameState.key &&
          !gameState.key.heldBy &&
          player.x === gameState.key.x &&
          player.y === gameState.key.y
        ) {
          gameState.key.heldBy = playerId;
          console.log(`Player ${playerId} picked up the key!`);
        }

        // === DOOR INTERACTION LOGIC ===
        if (gameState.door) {
          const isAdjacentToDoor = isAdjacent(player, gameState.door);

          if (isAdjacentToDoor && gameState.key) {
            if (gameState.key.heldBy === playerId && !gameState.door.isUnlocked) {
              // Player has key and is adjacent to door - auto-unlock
              gameState.door.isUnlocked = true;
              console.log(`Player ${playerId} unlocked the door!`);
            } else if (!gameState.key.heldBy && !gameState.door.isUnlocked) {
              // Player is near door but no one has the key yet
              console.log(`Player ${playerId} approached the door but needs the key first`);
              // Send reminder message to this specific player
              const socket = io.sockets.sockets.get(gameState.players[playerId].socketId);
              if (socket) {
                socket.emit('doorMessage', {
                  message: '🔒 You need the key to unlock this door! Find it first.',
                });
              }
            }
          }
        }

        console.log(`${playerId} moved to (${newX}, ${newY}) facing ${direction}`);

        // Check for win condition after the move - use appropriate win condition for level
        let gameWon = false;
        if (currentLevel === 'level1') {
          // Level 1 uses door-based win condition
          gameWon = checkDoorWinCondition();
        } else {
          // Other levels use exit tile win condition
          gameWon = checkWinCondition();
        }

        if (!gameWon) {
          // Decrement actions remaining after valid move
          gameState.actionsRemaining--;
          console.log(`${playerId} used 1 action, ${gameState.actionsRemaining} actions remaining`);

          // Auto-switch turns if no actions remaining
          if (gameState.actionsRemaining <= 0) {
            switchTurn();
          }
        }

        // Broadcast updated game state to all clients (customized for each)
        broadcastCustomizedGameState();
      } catch (moveError) {
        console.error(`❌ Error processing move for ${playerId}:`, moveError);
        // Send error state to player
        socket.emit('gameError', {
          message: 'Move processing failed',
          error: moveError.message,
        });
      }
    });

    // Handle end turn requests from this client
    socket.on('endTurn', () => {
      try {
        const player = gameState.players[playerId];

        if (!player) {
          console.warn(`⚠️  endTurn from non-existent player: ${playerId}`);
          return;
        }

        // Check if game has started and it's this player's turn
        if (!gameState.gameStarted) {
          console.log(`End turn rejected: Game not started`);
          return;
        }

        if (gameState.currentPlayerTurn !== playerId) {
          console.log(
            `End turn rejected: Not ${playerId}'s turn (current: ${gameState.currentPlayerTurn})`
          );
          return;
        }

        // Player is ending their turn early
        console.log(
          `${playerId} ended their turn early (had ${gameState.actionsRemaining} actions remaining)`
        );

        // Switch turns immediately
        switchTurn();

        // Broadcast updated game state to all clients
        broadcastCustomizedGameState();
      } catch (endTurnError) {
        console.error(`❌ Error processing end turn for ${playerId}:`, endTurnError);
        // Send error state to player
        socket.emit('gameError', {
          message: 'End turn processing failed',
          error: endTurnError.message,
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
        wasInGame: gameState.gameStarted,
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
