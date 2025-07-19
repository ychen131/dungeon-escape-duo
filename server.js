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

// Constants
const LEVEL_TRANSITION_DELAY_MS = 2000;

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
  // Pressure plate (Level 2 specific)
  28: 0, // Pressure plate renders as floor but has special behavior
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
      if (layer.type === 'tilelayer') {
        // Handle both flat data arrays and chunked data
        if (layer.data) {
          // Flat data array format (level1)
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
        } else if (layer.chunks) {
          // Chunked data format (level2)
          for (const chunk of layer.chunks) {
            const chunkX = chunk.x;
            const chunkY = chunk.y;
            const chunkWidth = chunk.width;

            for (let i = 0; i < chunk.data.length; i++) {
              const tileId = chunk.data[i];
              const localX = i % chunkWidth;
              const localY = Math.floor(i / chunkWidth);
              const x = chunkX + localX;
              const y = chunkY + localY;

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

// Simplified LEVELS structure - One map per level with level-specific configuration
// Tile types in game logic:
// 0 = floor tile (walkable)
// 1 = wall tile (not walkable)
// 2 = fire hazard (requires "Douse Fire" item to pass)
// 3 = chasm (impassable terrain)
// 4 = exit tile (goal for both players)

const LEVELS = {
  level1: {
    mapFile: 'client/public/assets/level1.tmj',
    name: 'Level 1: The Key and the Door',
    // Level 1 specific game objects
    gameObjects: {
      key: {
        x: 1,
        y: 2,
        heldBy: null, // Track which player ID has the key
      },
      fires: [
        { x: 2, y: 2, isDoused: false }, // Fire guarding the key
        { x: 6, y: 5, isDoused: false }, // Fire blocking the central path
      ],
      door: {
        x: 9,
        y: 2,
        isUnlocked: false,
      },
    },
    // Level 1 specific starting positions
    startingPositions: {
      player1: { x: 1, y: 6 }, // Player 1 (Soldier): bottom-left
      player2: { x: 10, y: 2 }, // Player 2 (Orc): top-right
    },
    // Level 1 uses door-based win condition
    winCondition: 'door',
    // Both players get "Douse Fire" items in Level 1
    playerItems: {
      player1: 'Douse Fire',
      player2: 'Douse Fire',
    },
  },
  level2: {
    mapFile: 'client/public/assets/level2.tmj',
    name: 'Level 2: Pressure and Peril',
    // Level 2 specific game objects based on analyzing level2.tmj
    gameObjects: {
      // Key and door for Level 2 - same mechanics as Level 1
      key: {
        x: 20,
        y: 5, // Place key at a strategic location
        heldBy: null, // Track which player ID has the key
      },
      door: {
        x: 7,
        y: 5, // Door at requested position
        isUnlocked: false,
      },
      // Based on analyzing the tmj file, identifying key positions
      fires: [
        { x: 6, y: 6, isDoused: false }, // Fire tile (ID 7) from Layer 3
        { x: 9, y: 5, isDoused: false }, // Another fire tile from Layer 3
      ],
      pressurePlates: [
        {
          x: 13,
          y: 12, // First pressure plate - left of player spawn
          isPressed: false,
        },
        {
          x: 14,
          y: 8, // Second pressure plate - two tiles above trap (trap is at 14, 10)
          isPressed: false,
        },
        {
          x: 6,
          y: 9, // Third pressure plate - controls traps on other side of room
          isPressed: false,
        },
      ],
      trapDoors: [
        {
          x: 14,
          y: 10, // First trap door area from analyzing the layout
          isOpen: false, // Closed by default, opens when any pressure plate is pressed
        },
        {
          x: 17,
          y: 6, // Second trap door - right side of map
          isOpen: false,
        },
        {
          x: 17,
          y: 7, // Third trap door - right side of map
          isOpen: false,
        },
      ],
      slimes: [
        {
          x: 11,
          y: 6, // First slime - left side of map
          isStunned: false,
          stunDuration: 0,
          lastMoveDirection: null, // Track direction for sprite flipping
        },
        {
          x: 18,
          y: 8, // Second slime - right side of map
          isStunned: false,
          stunDuration: 0,
          lastMoveDirection: null, // Track direction for sprite flipping
        },
      ],
      snail: {
        x: 15,
        y: 5, // Snail position - decorative NPC (on visible floor tile)
        direction: -1, // -1 = moving left, 1 = moving right
        moveRange: 4, // Moves within 4 tiles
        startX: 15, // Starting position for calculating range
        lastInteractionTurn: -1, // Track when last interaction happened
      },
    },
    // Level 2 starting positions - placed on visible floor areas
    startingPositions: {
      player1: { x: 14, y: 12 }, // Safe floor area in left platform
      player2: { x: 15, y: 12 }, // Safe floor area in middle platform
    },
    // Level 2 uses door-based win condition (same as Level 1)
    winCondition: 'door',
    // Both players get Douse Fire for cooperative mechanics
    playerItems: {
      player1: 'Douse Fire',
      player2: 'Douse Fire',
    },
  },
};

// Current game settings
let currentLevel = 'level1';

// Grid configuration (will be updated dynamically based on loaded map)
let GRID_WIDTH = 12;
let GRID_HEIGHT = 8;

// Item types that players can receive
const ITEM_TYPES = {
  DOUSE_FIRE: 'Douse Fire',
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
  const levelData = LEVELS[currentLevel];
  if (!levelData || !levelData.mapFile) {
    console.error(`❌ No map file defined for ${currentLevel}`);
    GRID_WIDTH = 12;
    GRID_HEIGHT = 8;
    return createDefaultMap();
  }

  // Load the tilemap file
  const tilemapResult = loadTilemapFromFile(levelData.mapFile);
  if (tilemapResult) {
    // Update grid dimensions
    GRID_WIDTH = tilemapResult.width;
    GRID_HEIGHT = tilemapResult.height;
    return tilemapResult.layout;
  } else {
    console.error(`❌ Failed to load tilemap: ${levelData.mapFile}, falling back to default`);
    // Fallback to default small map
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

// Function to load a new map (for level progression)
function loadNewMap(level = null) {
  // Set level (default to current or level1)
  if (level) {
    currentLevel = level;
  }

  const levelData = LEVELS[currentLevel];
  if (!levelData) {
    console.error(`❌ Level ${currentLevel} not found in LEVELS configuration`);
    return;
  }

  // Load the map (this updates GRID_WIDTH and GRID_HEIGHT)
  const newDungeonLayout = getCurrentMap();

  // Update game state with new map and dimensions
  gameState.dungeonLayout = newDungeonLayout;
  gameState.gridWidth = GRID_WIDTH;
  gameState.gridHeight = GRID_HEIGHT;
  gameState.currentLevel = currentLevel;

  // Initialize level-specific game objects
  if (levelData.gameObjects) {
    // Deep copy game objects to avoid reference issues

    // Level 1 objects
    if (levelData.gameObjects.key) {
      gameState.key = { ...levelData.gameObjects.key };
    }
    if (levelData.gameObjects.fires) {
      gameState.fires = levelData.gameObjects.fires.map(fire => ({ ...fire }));
    }
    if (levelData.gameObjects.door) {
      gameState.door = { ...levelData.gameObjects.door };
    }

    // Level 2 objects
    if (levelData.gameObjects.pressurePlates) {
      gameState.pressurePlates = levelData.gameObjects.pressurePlates.map(plate => ({ ...plate }));
    }
    if (levelData.gameObjects.trapDoors) {
      gameState.trapDoors = levelData.gameObjects.trapDoors.map(trap => ({ ...trap }));
    }
    if (levelData.gameObjects.slimes) {
      gameState.slimes = levelData.gameObjects.slimes.map(slime => ({ ...slime }));
    }
    if (levelData.gameObjects.snail) {
      gameState.snail = { ...levelData.gameObjects.snail };
      console.log('🐌 Snail loaded from level data:', gameState.snail);
    } else {
      console.log('⚠️ No snail found in level data');
    }
  }

  // Update starting positions for the new map
  updateStartingPositionsForMap(newDungeonLayout);

  // Ensure starting positions are safe
  ensureSafeStartingPositions();

  console.log(`🗺️  Loaded map: ${levelData.name} (${GRID_WIDTH}x${GRID_HEIGHT})`);
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
  levelProgression: 1, // Track overall progression: 1 = Level 1, 2 = Level 2, etc.
  // Level-specific objects will be initialized by loadNewMap
  key: null,
  fires: null,
  door: null,
  // Future Level 2 objects
  pressurePlate: null,
  trapDoor: null,
  slimes: null,
};

// Player starting positions (will be updated based on map size)
let startingPositions = {
  player1: { x: 1, y: 8 }, // Player 1 new spawn: bottom-left
  player2: { x: 10, y: 6 },
};

// Function to find safe starting positions in the map
function findSafeStartingPositions(dungeonLayout) {
  const levelData = LEVELS[currentLevel];
  const levelStartingPositions = levelData.startingPositions;

  if (levelStartingPositions) {
    return levelStartingPositions;
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

    // Debug: Check if snail is included
    if (customizedState.snail) {
      console.log(
        '🐌 Snail included in customized state for',
        playerId,
        ':',
        customizedState.snail
      );
    } else {
      console.log('⚠️ No snail in customized state for', playerId);
    }

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
    }, LEVEL_TRANSITION_DELAY_MS);

    // Broadcast victory state
    broadcastCustomizedGameState();
    return true;
  }

  return false;
}

// Helper function to assign random items to players
function assignRandomItems() {
  const levelData = LEVELS[currentLevel];
  const playerItems = levelData.playerItems;

  if (playerItems) {
    gameState.playerItems.player1 = playerItems.player1;
    gameState.playerItems.player2 = playerItems.player2;
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
  // Determine what level we're currently on and what's next
  if (currentLevel === 'level1') {
    // Completing Level 1 → advance to Level 2
    console.log('🚀 ADVANCING FROM LEVEL 1 TO LEVEL 2!');

    // Set transition state for level change
    gameState.levelTransition = {
      isTransitioning: true,
      fromLevel: 'level1',
      toLevel: 'level2',
      transitionStartTime: Date.now(),
      message: 'Level 1 Complete! Advancing to Level 2...',
    };

    // Broadcast transition state first
    broadcastCustomizedGameState();

    // After transition delay, load Level 2
    setTimeout(() => {
      loadNewMap('level2');

      // Reset game state for new level
      gameState.gameWon = false;
      gameState.gameStarted = true; // Both players still connected
      gameState.currentPlayerTurn = 'player1'; // Player 1 starts new level
      gameState.actionsRemaining = 2; // Reset actions for new level
      gameState.levelProgression = 2; // Update progression tracker
      gameState.levelTransition = null; // Clear transition state

      // Reset player positions to Level 2 starting positions
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

      console.log(`✨ Level 2 ready! Players reset to starting positions.`);

      // Broadcast final new level state
      broadcastCustomizedGameState();
    }, 3000); // 3 second transition screen
  } else if (currentLevel === 'level2') {
    // Completing Level 2 → Game Complete!
    console.log('🏆 GAME COMPLETED! Both levels mastered!');

    // Set final victory state
    gameState.gameCompleted = true;
    gameState.finalVictoryTime = new Date().toISOString();
    gameState.levelTransition = {
      isTransitioning: true,
      fromLevel: 'level2',
      toLevel: 'complete',
      transitionStartTime: Date.now(),
      message: 'Congratulations! You have completed Dungeon Escape Duo!',
    };

    // Broadcast final victory state
    broadcastCustomizedGameState();

    // Clear the transition after a longer celebration
    setTimeout(() => {
      gameState.levelTransition = null;
      broadcastCustomizedGameState();
    }, 5000); // 5 second final celebration
  }
}

// Helper function to check if both players are on exit tiles (win condition)
function checkWinCondition() {
  const levelData = LEVELS[currentLevel];
  const winCondition = levelData.winCondition;

  if (winCondition === 'door') {
    // Level 1 uses door-based win condition
    return checkDoorWinCondition();
  } else if (winCondition === 'exit') {
    // Other levels use exit tile win condition
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

    // Start continuous snail movement
    startContinuousSnailMovement();

    console.log("Game started! Player 1's turn.");

    // Broadcast game start to all players (customized for each)
    broadcastCustomizedGameState();
  }
}

// Slime AI Functions
function calculateDistance(pos1, pos2) {
  return Math.max(Math.abs(pos1.x - pos2.x), Math.abs(pos1.y - pos2.y)); // Chebyshev distance (chess king movement)
}

function findNearestPlayer(slime) {
  const players = Object.values(gameState.players);
  if (players.length === 0) {
    return null;
  }

  let nearestPlayer = players[0];
  let minDistance = calculateDistance(slime, nearestPlayer);

  for (let i = 1; i < players.length; i++) {
    const distance = calculateDistance(slime, players[i]);
    if (distance < minDistance) {
      minDistance = distance;
      nearestPlayer = players[i];
    }
  }

  return nearestPlayer;
}

function moveSlimeToward(slime, target) {
  if (!target) {
    return false;
  }

  let newX = slime.x;
  let newY = slime.y;

  // Move one step toward target (simple AI)
  let moveDirection = null;
  if (target.x > slime.x) {
    newX++;
    moveDirection = 'right';
  } else if (target.x < slime.x) {
    newX--;
    moveDirection = 'left';
  } else if (target.y > slime.y) {
    newY++;
    moveDirection = 'down';
  } else if (target.y < slime.y) {
    newY--;
    moveDirection = 'up';
  }

  // Check if the new position is valid (within bounds and not a wall)
  if (newX < 0 || newX >= gameState.gridWidth || newY < 0 || newY >= gameState.gridHeight) {
    return false; // Out of bounds
  }

  const targetTile = gameState.dungeonLayout[newY][newX];
  if (
    targetTile === TILE_TYPES.WALL ||
    targetTile === TILE_TYPES.FIRE_HAZARD ||
    targetTile === TILE_TYPES.CHASM
  ) {
    return false; // Cannot move onto walls or hazards
  }

  // Check if another slime is already at this position
  if (gameState.slimes) {
    const slimeAtTarget = gameState.slimes.find(s => s !== slime && s.x === newX && s.y === newY);
    if (slimeAtTarget) {
      return false; // Another slime is in the way
    }
  }

  // Check if a player is at this position (slimes don't move onto players directly)
  const playerAtTarget = Object.values(gameState.players).find(p => p.x === newX && p.y === newY);
  if (playerAtTarget) {
    return false; // Player is in the way
  }

  // Valid move - update slime position and direction
  slime.x = newX;
  slime.y = newY;
  slime.lastMoveDirection = moveDirection; // Store direction for sprite flipping
  console.log(`🟢 Slime moved to (${newX}, ${newY}) facing ${moveDirection} pursuing player`);
  return true;
}

function updateSlimes() {
  if (!gameState.slimes || gameState.slimes.length === 0) {
    return;
  }

  console.log('🟢 Updating slimes...');

  gameState.slimes.forEach((slime, index) => {
    // Handle stun duration
    if (slime.isStunned && slime.stunDuration > 0) {
      slime.stunDuration--;
      console.log(`🟢 Slime ${index} stunned for ${slime.stunDuration} more turns`);

      if (slime.stunDuration <= 0) {
        slime.isStunned = false;
        console.log(`🟢 Slime ${index} is no longer stunned`);
      }
      return; // Skip movement when stunned
    }

    // Check if any player is within activation range (2 tiles)
    const players = Object.values(gameState.players);
    const playersInRange = players.filter(player => {
      const distance = calculateDistance(slime, player);
      return distance <= 2; // Activate when player is within 2 tiles
    });

    if (playersInRange.length === 0) {
      console.log(`🟢 Slime ${index} dormant (no players within 2 tiles)`);
      return; // Skip movement when no players are close enough
    }

    // Move toward nearest player (only if activated)
    const nearestPlayer = findNearestPlayer(slime);
    if (nearestPlayer) {
      const distance = calculateDistance(slime, nearestPlayer);
      console.log(`🟢 Slime ${index} activated! Nearest player at distance ${distance}`);

      const moved = moveSlimeToward(slime, nearestPlayer);
      if (!moved) {
        console.log(`🟢 Slime ${index} could not move (blocked path)`);
      }
    }
  });
}

// Snail AI Functions
function updateSnail() {
  if (!gameState.snail) {
    return;
  }

  console.log('🐌 Updating snail...');

  // Check for player interactions first
  const players = Object.values(gameState.players);
  const playersNearSnail = players.filter(player => {
    const distance = calculateDistance(gameState.snail, player);
    return distance <= 1; // Player must be adjacent to snail
  });

  // If player is near and we haven't interacted recently, send message
  if (playersNearSnail.length > 0) {
    const currentTurn = gameState.currentPlayerTurn === 'player1' ? 1 : 2;
    if (gameState.snail.lastInteractionTurn !== currentTurn) {
      const messages = ['Good Day, crawler.', 'Where is my key....'];
      const randomMessage = messages[Math.floor(Math.random() * messages.length)];

      console.log(`🐌 Snail says: "${randomMessage}"`);

      // Send message to all clients
      io.emit('snailMessage', {
        message: `🐌 Snail: "${randomMessage}"`,
        snailPos: { x: gameState.snail.x, y: gameState.snail.y },
      });

      gameState.snail.lastInteractionTurn = currentTurn;
    }
  }

  // Move snail horizontally within its range
  const newX = gameState.snail.x + gameState.snail.direction;

  // Check boundaries based on movement range
  const leftBound = gameState.snail.startX - gameState.snail.moveRange;
  const rightBound = gameState.snail.startX + 1; // Allow snail to reach startX position (4 tiles total)

  // Check if we hit a wall or boundary
  if (
    newX <= leftBound ||
    newX >= rightBound ||
    newX < 0 ||
    newX >= gameState.gridWidth ||
    (gameState.dungeonLayout[gameState.snail.y] &&
      gameState.dungeonLayout[gameState.snail.y][newX] === TILE_TYPES.WALL)
  ) {
    // Reverse direction
    gameState.snail.direction *= -1;
    console.log(`🐌 Snail hit boundary/wall, reversing direction`);
  } else {
    // Valid move
    gameState.snail.x = newX;
    console.log(`🐌 Snail moved to (${gameState.snail.x}, ${gameState.snail.y})`);
  }
}

// Helper function to switch turns and reset actions
function switchTurn() {
  gameState.currentPlayerTurn = gameState.currentPlayerTurn === 'player1' ? 'player2' : 'player1';
  gameState.actionsRemaining = 2; // Reset actions to 2 for the new turn
  console.log(
    `Turn switched to: ${gameState.currentPlayerTurn} (${gameState.actionsRemaining} actions remaining)`
  );

  // Update slimes after turn switch
  updateSlimes();

  // Note: Snail now moves continuously via timer, not per turn

  // Broadcast updated game state after entity movement
  broadcastCustomizedGameState();
}

// Initialize with Level 1 tilemap on server startup
console.log('🎮 Initializing server with simplified map system...');
loadNewMap('level2'); // TODO: Change to level1 after level 2 testing

// Console commands for testing
console.log('\n🎮 TESTING COMMANDS:');
console.log('📝 Available levels:');
console.log('   Level 1: The Key and the Door (cooperative puzzle)');
console.log('   Level 2: Pressure and Peril (advanced mechanics) - Coming soon');
console.log('💡 To switch levels during development:');
console.log('   - Use: loadNewMap("level1") or loadNewMap("level2")');
console.log('');

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
            // Check for slimes at this position (slime stunning mechanic)
            if (Array.isArray(gameState.slimes)) {
              const slimeAtPos = gameState.slimes.find(
                s => s.x === pos.x && s.y === pos.y && !s.isStunned
              );
              if (slimeAtPos) {
                slimeAtPos.isStunned = true;
                slimeAtPos.stunDuration = 3; // Stun for 3 turns
                console.log(
                  `${playerId} used ${item} to stun slime at (${pos.x}, ${pos.y}) for 3 turns`
                );

                // Send message to all clients about slime stunning
                io.emit('slimeMessage', {
                  message: `🟢 Slime stunned! Slime is immobilized for 3 turns.`,
                  playerId: playerId,
                });

                itemUsed = true;
              }
            }

            // Check fires array (used by both Level 1 and Level 2)
            if (Array.isArray(gameState.fires)) {
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

        // Check for active trap collision
        if (gameState.trapDoors) {
          const trapAtTarget = gameState.trapDoors.find(
            trap => trap.x === newX && trap.y === newY && !trap.isOpen
          );

          if (trapAtTarget) {
            console.log(
              `Move blocked: ${playerId} tried to move onto active trap at (${newX}, ${newY}). A pressure plate must be activated first!`
            );

            // Send message to player about the trap
            const socket = io.sockets.sockets.get(gameState.players[playerId].socketId);
            if (socket) {
              socket.emit('trapMessage', {
                message: '🔴 Trap blocks your path! Someone must stand on a pressure plate.',
              });
            }

            return; // Cannot move onto active trap
          }
        }

        // Exit tiles are walkable (no blocking needed)

        // Valid move - update player position and direction in game state
        player.x = newX;
        player.y = newY;
        player.lastMoveDirection = direction; // Store direction for sprite flipping

        // === PRESSURE PLATE DETECTION LOGIC ===
        if (gameState.pressurePlates) {
          const plateActivationMessages = [];

          // Check each pressure plate
          gameState.pressurePlates.forEach((plate, index) => {
            const wasPressed = plate.isPressed;

            // Check if any player is currently on this pressure plate
            const playersOnPlate = Object.values(gameState.players).filter(
              p => p.x === plate.x && p.y === plate.y
            );

            plate.isPressed = playersOnPlate.length > 0;

            // If this plate's state changed, log it and prepare messages
            if (wasPressed !== plate.isPressed) {
              if (plate.isPressed) {
                const playerOnPlate = playersOnPlate[0];
                const playerIds = Object.keys(gameState.players);
                const playerName =
                  playerIds.indexOf(
                    playerOnPlate === gameState.players[playerIds[0]] ? playerIds[0] : playerIds[1]
                  ) === 0
                    ? 'Player 1'
                    : 'Player 2';
                console.log(
                  `🔘 PRESSURE PLATE ${index + 1} ACTIVATED by ${playerName} at (${plate.x}, ${plate.y})`
                );

                plateActivationMessages.push({
                  message: `🔘 Pressure plate ${index + 1} activated by ${playerName}!`,
                  isPressed: true,
                });
              } else {
                console.log(
                  `⚪ PRESSURE PLATE ${index + 1} DEACTIVATED at (${plate.x}, ${plate.y})`
                );

                plateActivationMessages.push({
                  message: `⚪ Pressure plate ${index + 1} deactivated`,
                  isPressed: false,
                });
              }
            }
          });

          // === TRAP STATE CHANGES ===
          // Update trap state based on SPECIFIC pressure plate activation
          if (gameState.trapDoors && gameState.pressurePlates) {
            let anyTrapStateChanged = false;

            gameState.trapDoors.forEach((trap, index) => {
              const wasTrapOpen = trap.isOpen;
              let shouldBeOpen = false;

              // Specific trap control logic:
              if (index === 0) {
                // Trap 1 (14, 10) - controlled by middle pressure plates (indices 0 and 1)
                shouldBeOpen =
                  gameState.pressurePlates[0].isPressed || gameState.pressurePlates[1].isPressed;
              } else if (index === 1 || index === 2) {
                // Trap 2 (17, 6) and Trap 3 (17, 7) - controlled by left pressure plate (index 2)
                shouldBeOpen = gameState.pressurePlates[2].isPressed;
              }

              trap.isOpen = shouldBeOpen;

              // Log trap state changes
              if (wasTrapOpen !== trap.isOpen) {
                anyTrapStateChanged = true;
                if (trap.isOpen) {
                  console.log(
                    `🟢 TRAP ${index + 1} DISABLED (safe to pass) at (${trap.x}, ${trap.y}) - specific pressure plate active`
                  );
                } else {
                  console.log(
                    `🔴 TRAP ${index + 1} ACTIVATED (blocks movement) at (${trap.x}, ${trap.y}) - controlling pressure plate inactive`
                  );
                }
              }
            });

            // Send specific messages if any trap state changed
            if (anyTrapStateChanged) {
              const middleTrapsOpen = gameState.trapDoors[0].isOpen;
              const rightTrapsOpen = gameState.trapDoors[1].isOpen && gameState.trapDoors[2].isOpen;

              if (middleTrapsOpen && rightTrapsOpen) {
                io.emit('trapStateMessage', {
                  message: '🟢 All paths unlocked! Both chambers accessible.',
                  isOpen: true,
                });
              } else if (middleTrapsOpen) {
                io.emit('trapStateMessage', {
                  message: '🟢 Middle path unlocked! Right chamber still blocked.',
                  isOpen: true,
                });
              } else if (rightTrapsOpen) {
                io.emit('trapStateMessage', {
                  message: '🟢 Right chamber unlocked! Middle path still blocked.',
                  isOpen: true,
                });
              } else {
                io.emit('trapStateMessage', {
                  message: '🔴 All paths blocked! Find the pressure plates.',
                  isOpen: false,
                });
              }
            }
          }

          // Send pressure plate activation messages
          plateActivationMessages.forEach(msg => {
            io.emit('pressurePlateMessage', msg);
          });
        }

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
        const levelData = LEVELS[currentLevel];
        if (levelData && levelData.winCondition === 'door') {
          // Levels using door-based win condition
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

    // Temporary command to reset player positions (for testing)
    socket.on('resetPositions', () => {
      try {
        console.log('🔄 Reset positions triggered by', playerId);

        // Update starting positions for current level
        updateStartingPositionsForMap(gameState.dungeonLayout);

        // Reset all connected players to starting positions
        if (gameState.players.player1) {
          gameState.players.player1.x = startingPositions.player1.x;
          gameState.players.player1.y = startingPositions.player1.y;
          console.log(
            `Reset player1 to (${startingPositions.player1.x}, ${startingPositions.player1.y})`
          );
        }
        if (gameState.players.player2) {
          gameState.players.player2.x = startingPositions.player2.x;
          gameState.players.player2.y = startingPositions.player2.y;
          console.log(
            `Reset player2 to (${startingPositions.player2.x}, ${startingPositions.player2.y})`
          );
        }

        // Ensure positions are safe
        ensureSafeStartingPositions();

        // Broadcast updated positions
        broadcastCustomizedGameState();

        console.log('✅ Player positions reset successfully');
      } catch (error) {
        console.error(`❌ Error resetting positions:`, error);
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
        
        // Stop continuous snail movement
        stopContinuousSnailMovement();

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

// Initialize continuous snail movement system
let snailMovementInterval = null;

function startContinuousSnailMovement() {
  // Clear any existing interval
  if (snailMovementInterval) {
    clearInterval(snailMovementInterval);
  }
  
  // Start continuous movement every 2 seconds
  snailMovementInterval = setInterval(() => {
    if (gameState.gameStarted && gameState.snail) {
      updateSnail();
      // Broadcast state after snail movement
      broadcastCustomizedGameState();
    }
  }, 2000); // Move every 2 seconds
  
  console.log('🐌 Started continuous snail movement (every 2 seconds)');
}

function stopContinuousSnailMovement() {
  if (snailMovementInterval) {
    clearInterval(snailMovementInterval);
    snailMovementInterval = null;
    console.log('🐌 Stopped continuous snail movement');
  }
}
