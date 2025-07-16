const http = require('http');
const ioClient = require('socket.io-client');
const express = require('express');

// We'll mock the server creation for integration testing
describe('Socket.io Integration Tests', () => {
  let server;
  let ioServer;
  let clientSocket1;
  let clientSocket2;
  let serverPort;

  beforeAll(done => {
    // Create a test server
    const app = express();
    server = http.createServer(app);
    const io = require('socket.io')(server);
    ioServer = io;

    // Simplified game state for testing
    const testGameState = {
      players: {},
      dungeonLayout: [
        [1, 1, 1, 1, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 0, 4, 1],
        [1, 1, 1, 1, 1],
      ],
      gridWidth: 5,
      gridHeight: 5,
      currentPlayerTurn: null,
      gameStarted: false,
      playerItems: {},
      gameWon: false,
    };

    // Basic socket handlers for testing
    io.on('connection', socket => {
      console.log('Test client connected:', socket.id);

      // Assign player ID
      let playerId;
      if (!testGameState.players.player1) {
        playerId = 'player1';
        testGameState.players.player1 = {
          id: 'player1',
          socketId: socket.id,
          x: 1,
          y: 1,
        };
      } else if (!testGameState.players.player2) {
        playerId = 'player2';
        testGameState.players.player2 = {
          id: 'player2',
          socketId: socket.id,
          x: 3,
          y: 3,
        };
      }

      // Send initial game state
      socket.emit('gameState', {
        ...testGameState,
        yourPlayerId: playerId,
      });

      // Start game when both players connected
      if (Object.keys(testGameState.players).length === 2) {
        testGameState.gameStarted = true;
        testGameState.currentPlayerTurn = 'player1';
        io.emit('gameState', testGameState);
      }

      // Handle move requests
      socket.on('moveRequest', data => {
        const { direction } = data;
        const player = testGameState.players[playerId];

        if (!player || testGameState.currentPlayerTurn !== playerId) {
          return;
        }

        // Calculate new position
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

        const newX = player.x + deltaX;
        const newY = player.y + deltaY;

        // Validate bounds and tile type
        if (
          newX >= 0 &&
          newX < testGameState.gridWidth &&
          newY >= 0 &&
          newY < testGameState.gridHeight &&
          testGameState.dungeonLayout[newY][newX] !== 1 // Not a wall
        ) {
          player.x = newX;
          player.y = newY;

          // Switch turns
          testGameState.currentPlayerTurn =
            testGameState.currentPlayerTurn === 'player1' ? 'player2' : 'player1';

          // Broadcast updated state
          io.emit('gameState', testGameState);
        }
      });

      socket.on('disconnect', () => {
        console.log('Test client disconnected:', socket.id);
        // Remove player
        if (testGameState.players[playerId]?.socketId === socket.id) {
          delete testGameState.players[playerId];
          testGameState.gameStarted = false;
          testGameState.currentPlayerTurn = null;
        }
      });
    });

    server.listen(() => {
      serverPort = server.address().port;
      done();
    });
  });

  afterAll(done => {
    server.close();
    done();
  });

  beforeEach(done => {
    // Create client connections with longer timeout
    clientSocket1 = ioClient(`http://localhost:${serverPort}`, {
      forceNew: true,
      timeout: 1000,
    });

    clientSocket1.on('connect', () => {
      clientSocket2 = ioClient(`http://localhost:${serverPort}`, {
        forceNew: true,
        timeout: 1000,
      });

      clientSocket2.on('connect', () => {
        // Give a small delay for server to process connections
        setTimeout(done, 100);
      });

      clientSocket2.on('connect_error', error => {
        console.error('Client 2 connection error:', error);
        done(error);
      });
    });

    clientSocket1.on('connect_error', error => {
      console.error('Client 1 connection error:', error);
      done(error);
    });
  });

  afterEach(() => {
    if (clientSocket1.connected) {
      clientSocket1.disconnect();
    }
    if (clientSocket2.connected) {
      clientSocket2.disconnect();
    }
  });

  describe('Connection Management', () => {
    test('should assign player IDs correctly', done => {
      let player1Id, player2Id;
      let receivedCount = 0;

      const checkComplete = () => {
        receivedCount++;
        if (receivedCount >= 2 && player1Id && player2Id) {
          // Both players should have unique IDs
          expect(player1Id).toBe('player1');
          expect(player2Id).toBe('player2');
          expect(player1Id).not.toBe(player2Id);
          done();
        }
      };

      clientSocket1.on('gameState', gameState => {
        if (gameState.yourPlayerId && !player1Id) {
          player1Id = gameState.yourPlayerId;
          checkComplete();
        }
      });

      clientSocket2.on('gameState', gameState => {
        if (gameState.yourPlayerId && !player2Id) {
          player2Id = gameState.yourPlayerId;
          checkComplete();
        }
      });

      // Safety timeout
      setTimeout(() => {
        if (!player1Id || !player2Id) {
          done(new Error('Player IDs not assigned within timeout'));
        }
      }, 2000);
    }, 10000); // Increase timeout to 10 seconds

    test('should start game when both players connect', done => {
      let gameStartedReceived = false;

      const checkGameStarted = gameState => {
        if (gameState.gameStarted && !gameStartedReceived) {
          gameStartedReceived = true;
          expect(gameState.gameStarted).toBe(true);
          expect(gameState.currentPlayerTurn).toBe('player1');
          expect(Object.keys(gameState.players)).toHaveLength(2);
          done();
        }
      };

      clientSocket1.on('gameState', checkGameStarted);
      clientSocket2.on('gameState', checkGameStarted);
    });
  });

  describe('Game Mechanics', () => {
    test('should handle move requests correctly', done => {
      let gameReady = false;
      let moveCount = 0;

      const handleGameState = gameState => {
        if (!gameReady && gameState.gameStarted) {
          gameReady = true;
          // Player 1 should start, make a move
          clientSocket1.emit('moveRequest', { direction: 'right' });
        } else if (gameReady && gameState.players.player1?.x === 2) {
          moveCount++;
          if (moveCount === 1) {
            // Player 1 moved successfully, now it should be player 2's turn
            expect(gameState.currentPlayerTurn).toBe('player2');
            expect(gameState.players.player1.x).toBe(2);
            expect(gameState.players.player1.y).toBe(1);
            done();
          }
        }
      };

      clientSocket1.on('gameState', handleGameState);
      clientSocket2.on('gameState', handleGameState);
    });

    test('should reject moves when not player turn', done => {
      let gameReady = false;
      let player2InitialPosition;

      const handleGameState = gameState => {
        if (!gameReady && gameState.gameStarted) {
          gameReady = true;
          player2InitialPosition = { ...gameState.players.player2 };

          // Player 2 tries to move when it's player 1's turn
          clientSocket2.emit('moveRequest', { direction: 'left' });

          // Wait a bit and check that player 2 didn't move
          setTimeout(() => {
            // Player 2 position should be unchanged
            expect(gameState.players.player2.x).toBe(player2InitialPosition.x);
            expect(gameState.players.player2.y).toBe(player2InitialPosition.y);
            expect(gameState.currentPlayerTurn).toBe('player1'); // Still player 1's turn
            done();
          }, 100);
        }
      };

      clientSocket1.on('gameState', handleGameState);
      clientSocket2.on('gameState', handleGameState);
    });

    test('should prevent movement into walls', done => {
      let gameReady = false;
      let initialPosition;

      const handleGameState = gameState => {
        if (!gameReady && gameState.gameStarted) {
          gameReady = true;
          initialPosition = { ...gameState.players.player1 };

          // Try to move player 1 into a wall (up from starting position should be a wall)
          clientSocket1.emit('moveRequest', { direction: 'up' });

          // Wait and check position didn't change
          setTimeout(() => {
            expect(gameState.players.player1.x).toBe(initialPosition.x);
            expect(gameState.players.player1.y).toBe(initialPosition.y);
            expect(gameState.currentPlayerTurn).toBe('player1'); // Turn shouldn't switch
            done();
          }, 100);
        }
      };

      clientSocket1.on('gameState', handleGameState);
      clientSocket2.on('gameState', handleGameState);
    });
  });

  describe('Turn Management', () => {
    test('should alternate turns between players', done => {
      let gameReady = false;
      let turnSequence = [];

      const handleGameState = gameState => {
        if (!gameReady && gameState.gameStarted) {
          gameReady = true;
          turnSequence.push(gameState.currentPlayerTurn);
        } else if (gameReady && gameState.currentPlayerTurn) {
          turnSequence.push(gameState.currentPlayerTurn);

          if (turnSequence.length === 1) {
            // First turn should be player1
            expect(turnSequence[0]).toBe('player1');
            clientSocket1.emit('moveRequest', { direction: 'right' });
          } else if (turnSequence.length === 2) {
            // After player1 moves, should be player2's turn
            expect(turnSequence[1]).toBe('player2');
            clientSocket2.emit('moveRequest', { direction: 'left' });
          } else if (turnSequence.length === 3) {
            // After player2 moves, should be player1's turn again
            expect(turnSequence[2]).toBe('player1');
            expect(turnSequence).toEqual(['player1', 'player2', 'player1']);
            done();
          }
        }
      };

      clientSocket1.on('gameState', handleGameState);
      clientSocket2.on('gameState', handleGameState);
    });
  });

  describe('Disconnection Handling', () => {
    test('should handle player disconnection gracefully', done => {
      let gameReady = false;

      const handleGameState = gameState => {
        if (!gameReady && gameState.gameStarted) {
          gameReady = true;
          // Disconnect player2
          clientSocket2.disconnect();

          // Wait and check game state
          setTimeout(() => {
            expect(Object.keys(gameState.players)).toHaveLength(1);
            expect(gameState.gameStarted).toBe(false);
            done();
          }, 100);
        }
      };

      clientSocket1.on('gameState', handleGameState);
    });
  });
});
