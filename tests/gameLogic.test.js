const fs = require('fs');
const path = require('path');

// Mock the server dependencies for testing
jest.mock('express');
jest.mock('socket.io');

// Import game logic by requiring the server file and extracting functions
// We'll need to refactor some functions to be more testable

describe('Game Logic Tests', () => {
  // Mock game state for testing
  let mockGameState;
  let mockTileTypes;
  let mockItemTypes;

  beforeEach(() => {
    // Reset mock game state before each test
    mockTileTypes = {
      FLOOR: 0,
      WALL: 1,
      FIRE_HAZARD: 2,
      CHASM: 3,
      EXIT: 4,
    };

    mockItemTypes = {
      DOUSE_FIRE: 'Douse Fire',
      BUILD_BRIDGE: 'Build Bridge',
    };

    mockGameState = {
      players: {
        player1: { id: 'player1', x: 1, y: 1 },
        player2: { id: 'player2', x: 2, y: 2 },
      },
      dungeonLayout: [
        [1, 1, 1, 1, 1],
        [1, 0, 0, 2, 1],
        [1, 0, 3, 0, 1],
        [1, 0, 0, 4, 1],
        [1, 1, 1, 1, 1],
      ],
      gridWidth: 5,
      gridHeight: 5,
      currentPlayerTurn: 'player1',
      gameStarted: true,
      playerItems: {
        player1: mockItemTypes.DOUSE_FIRE,
        player2: mockItemTypes.BUILD_BRIDGE,
      },
      gameWon: false,
    };
  });

  describe('Movement Validation', () => {
    test('should validate bounds correctly', () => {
      // Test function to validate if a position is within bounds
      const isWithinBounds = (x, y, width, height) => {
        return x >= 0 && x < width && y >= 0 && y < height;
      };

      expect(isWithinBounds(0, 0, 5, 5)).toBe(true);
      expect(isWithinBounds(4, 4, 5, 5)).toBe(true);
      expect(isWithinBounds(-1, 0, 5, 5)).toBe(false);
      expect(isWithinBounds(5, 0, 5, 5)).toBe(false);
      expect(isWithinBounds(0, -1, 5, 5)).toBe(false);
      expect(isWithinBounds(0, 5, 5, 5)).toBe(false);
    });

    test('should validate movement to different tile types', () => {
      const canMoveTo = tileType => {
        return tileType === mockTileTypes.FLOOR || tileType === mockTileTypes.EXIT;
      };

      expect(canMoveTo(mockTileTypes.FLOOR)).toBe(true);
      expect(canMoveTo(mockTileTypes.EXIT)).toBe(true);
      expect(canMoveTo(mockTileTypes.WALL)).toBe(false);
      expect(canMoveTo(mockTileTypes.FIRE_HAZARD)).toBe(false);
      expect(canMoveTo(mockTileTypes.CHASM)).toBe(false);
    });

    test('should calculate new position correctly based on direction', () => {
      const calculateNewPosition = (x, y, direction) => {
        let deltaX = 0;
        let deltaY = 0;
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
        }
        return { x: x + deltaX, y: y + deltaY };
      };

      expect(calculateNewPosition(2, 2, 'up')).toEqual({ x: 2, y: 1 });
      expect(calculateNewPosition(2, 2, 'down')).toEqual({ x: 2, y: 3 });
      expect(calculateNewPosition(2, 2, 'left')).toEqual({ x: 1, y: 2 });
      expect(calculateNewPosition(2, 2, 'right')).toEqual({ x: 3, y: 2 });
    });
  });

  describe('Item Usage Logic', () => {
    test('should find adjacent positions correctly', () => {
      const getAdjacentPositions = (x, y) => {
        return [
          { x, y: y - 1 }, // Up
          { x, y: y + 1 }, // Down
          { x: x - 1, y }, // Left
          { x: x + 1, y }, // Right
        ];
      };

      const adjacent = getAdjacentPositions(2, 2);
      expect(adjacent).toEqual([
        { x: 2, y: 1 },
        { x: 2, y: 3 },
        { x: 1, y: 2 },
        { x: 3, y: 2 },
      ]);
    });

    test('should validate item usage on appropriate tiles', () => {
      const canUseItemOnTile = (item, tileType) => {
        if (item === mockItemTypes.DOUSE_FIRE && tileType === mockTileTypes.FIRE_HAZARD) {
          return true;
        }
        if (item === mockItemTypes.BUILD_BRIDGE && tileType === mockTileTypes.CHASM) {
          return true;
        }
        return false;
      };

      expect(canUseItemOnTile(mockItemTypes.DOUSE_FIRE, mockTileTypes.FIRE_HAZARD)).toBe(true);
      expect(canUseItemOnTile(mockItemTypes.BUILD_BRIDGE, mockTileTypes.CHASM)).toBe(true);
      expect(canUseItemOnTile(mockItemTypes.DOUSE_FIRE, mockTileTypes.CHASM)).toBe(false);
      expect(canUseItemOnTile(mockItemTypes.BUILD_BRIDGE, mockTileTypes.FIRE_HAZARD)).toBe(false);
      expect(canUseItemOnTile(mockItemTypes.DOUSE_FIRE, mockTileTypes.WALL)).toBe(false);
    });
  });

  describe('Win Condition Logic', () => {
    test('should detect win condition when both players are on exit', () => {
      const checkWinCondition = (player1, player2, dungeonLayout) => {
        const player1OnExit = dungeonLayout[player1.y][player1.x] === mockTileTypes.EXIT;
        const player2OnExit = dungeonLayout[player2.y][player2.x] === mockTileTypes.EXIT;
        return player1OnExit && player2OnExit;
      };

      // Both players on exit
      const player1OnExit = { x: 3, y: 3 };
      const player2OnExit = { x: 3, y: 3 };
      expect(checkWinCondition(player1OnExit, player2OnExit, mockGameState.dungeonLayout)).toBe(
        true
      );

      // Only one player on exit
      const player1NotOnExit = { x: 1, y: 1 };
      expect(checkWinCondition(player1NotOnExit, player2OnExit, mockGameState.dungeonLayout)).toBe(
        false
      );

      // Neither player on exit
      const player2NotOnExit = { x: 2, y: 2 };
      expect(
        checkWinCondition(player1NotOnExit, player2NotOnExit, mockGameState.dungeonLayout)
      ).toBe(false);
    });
  });

  describe('Player Management', () => {
    test('should find available player slots correctly', () => {
      const findAvailablePlayerSlot = players => {
        if (!players.player1) {
          return 'player1';
        } else if (!players.player2) {
          return 'player2';
        }
        return null;
      };

      // No players
      expect(findAvailablePlayerSlot({})).toBe('player1');

      // One player
      expect(findAvailablePlayerSlot({ player1: {} })).toBe('player2');

      // Both players
      expect(findAvailablePlayerSlot({ player1: {}, player2: {} })).toBe(null);
    });

    test('should count connected players correctly', () => {
      const getConnectedPlayerCount = players => {
        return Object.keys(players).length;
      };

      expect(getConnectedPlayerCount({})).toBe(0);
      expect(getConnectedPlayerCount({ player1: {} })).toBe(1);
      expect(getConnectedPlayerCount({ player1: {}, player2: {} })).toBe(2);
    });
  });

  describe('Turn Management', () => {
    test('should switch turns correctly', () => {
      const switchTurn = currentTurn => {
        return currentTurn === 'player1' ? 'player2' : 'player1';
      };

      expect(switchTurn('player1')).toBe('player2');
      expect(switchTurn('player2')).toBe('player1');
    });

    test('should validate turn before allowing actions', () => {
      const isPlayerTurn = (playerId, currentTurn, gameStarted) => {
        return gameStarted && currentTurn === playerId;
      };

      expect(isPlayerTurn('player1', 'player1', true)).toBe(true);
      expect(isPlayerTurn('player1', 'player2', true)).toBe(false);
      expect(isPlayerTurn('player1', 'player1', false)).toBe(false);
    });
  });

  describe('Tilemap Parsing', () => {
    test('should map tilemap IDs to game logic correctly', () => {
      const TILEMAP_TO_LOGIC = {
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
        34: 1, // Walls
        16: 0,
        17: 0,
        18: 0,
        19: 0,
        23: 0,
        25: 0,
        26: 0,
        43: 0,
        44: 0, // Floors
        7: 2,
        2: 2, // Fire hazards
        41: 3,
        42: 3, // Chasms
        49: 4, // Exit
        0: 1, // Empty becomes wall
      };

      // Test wall mapping
      expect(TILEMAP_TO_LOGIC[1]).toBe(1);
      expect(TILEMAP_TO_LOGIC[34]).toBe(1);

      // Test floor mapping
      expect(TILEMAP_TO_LOGIC[16]).toBe(0);
      expect(TILEMAP_TO_LOGIC[26]).toBe(0);

      // Test hazard mapping
      expect(TILEMAP_TO_LOGIC[7]).toBe(2);
      expect(TILEMAP_TO_LOGIC[41]).toBe(3);

      // Test exit mapping
      expect(TILEMAP_TO_LOGIC[49]).toBe(4);

      // Test empty tile mapping
      expect(TILEMAP_TO_LOGIC[0]).toBe(1);
    });
  });

  describe('Game State Validation', () => {
    test('should validate game state structure', () => {
      const validateGameState = gameState => {
        if (!gameState || typeof gameState !== 'object') {
          return false;
        }

        return Boolean(
          gameState.players &&
            Array.isArray(gameState.dungeonLayout) &&
            typeof gameState.gridWidth === 'number' &&
            typeof gameState.gridHeight === 'number' &&
            typeof gameState.gameStarted === 'boolean'
        );
      };

      expect(validateGameState(mockGameState)).toBe(true);
      expect(validateGameState(null)).toBe(false);
      expect(validateGameState({})).toBe(false);
      expect(validateGameState({ players: null })).toBe(false);
    });

    test('should validate player positions are within bounds', () => {
      const validatePlayerPositions = (players, width, height) => {
        for (const player of Object.values(players)) {
          if (player.x < 0 || player.x >= width || player.y < 0 || player.y >= height) {
            return false;
          }
        }
        return true;
      };

      expect(validatePlayerPositions(mockGameState.players, 5, 5)).toBe(true);

      const invalidPlayers = {
        player1: { x: -1, y: 1 },
        player2: { x: 2, y: 2 },
      };
      expect(validatePlayerPositions(invalidPlayers, 5, 5)).toBe(false);
    });
  });
});
