### **Project: Dungeon Escape Duo \- MVP Implementation Plan**

**Objective:** Deliver a playable, 2-player cooperative puzzle game for the web in a 5-day sprint. The MVP will demonstrate the core gameplay loop, including turn-based movement, co-op puzzle mechanics, and a clear win condition.  
Lead Engineer: Gemini  
Timeline: Monday \- Friday

### **Phase 0: Foundation & Setup (Monday EOD)**

**Goal:** Establish a clean, working development environment for both client and server.  
**Tasks:**

1. **Repository & Project Structure:**  
   * Initialize a Git repository.  
   * Create a simple project structure:  
     /dungeon-escape-duo  
     |-- /public  
     |   |-- index.html  // The main game client  
     |   |-- /assets     // For future images/sounds  
     |-- server.js       // Our Node.js server  
     |-- package.json

2. **Server Setup:**  
   * Initialize a Node.js project (npm init \-y).  
   * Install required libraries: npm install express socket.io.  
   * Create a basic Express server in server.js to serve the /public directory.  
   * Set up a basic Socket.io listener to confirm connections.  
3. **Client Setup:**  
   * Create index.html.  
   * Include the Phaser 3 library via CDN.  
   * Include the Socket.io client library.  
   * Write a minimal Phaser 3 script to create a blank canvas.  
4. **"Hello World" Test:**  
   * **Success Metric:** When the client loads, it connects to the server. The server logs "A user connected," and the client's browser console logs "Connected to server." This confirms the entire stack is working.

### **Phase 1: The Visual Client (Tuesday EOD)**

**Goal:** Create a visual, single-player prototype. No multiplayer logic yet. The focus is on rendering and input.  
**Tasks:**

1. **Grid Rendering:**  
   * In the client's Phaser code, create a hardcoded 2D array representing a simple dungeon level.  
   * Write a function to render this grid onto the screen using simple colored squares (e.g., grey for floor, dark grey for walls).  
2. **Player Sprite & Movement:**  
   * Add a placeholder sprite (a blue square) to the grid, representing the player.  
   * Implement keyboard controls (up, down, left, right).  
   * Implement basic collision detection based on the hardcoded grid data (i.e., you cannot move into a "wall" tile).  
3. **Success Metric:** A single player can launch the game and move a blue square around a static dungeon layout, with movement correctly blocked by walls.

### **Phase 2: Server Authority & Multiplayer (Wednesday EOD)**

**Goal:** Transition from a client-side prototype to a true client-server architecture where two players can see each other move.  
**Tasks:**

1. **Server State:**  
   * Move the 2D grid layout and player positions from the client to the server.js file. This is now the "source of truth."  
2. **Connection Logic:**  
   * When a user connects, the server assigns them a player ID (player1 or player2) and adds them to the game state.  
   * The server sends the initial game state to the new player.  
3. **Networked Movement:**  
   * Modify the client: when a movement key is pressed, it no longer moves the sprite directly. Instead, it emits a moveRequest event to the server (e.g., { direction: 'up' }).  
   * The server listens for moveRequest, validates the move against its game state, updates the player's position, and then broadcasts the *entire updated game state* to **all** connected clients.  
   * The clients receive the new game state and re-render the scene.  
4. **Success Metric:** Two people can open the game in separate browser tabs. They each see two player sprites. When one person moves, the sprite moves on both screens simultaneously.

### **Phase 3: The Core Puzzle Loop (Thursday EOD)**

**Goal:** Implement the turn-based puzzle mechanics and the hidden information system.  
**Tasks:**

1. **Turn Management (Server-side):**  
   * Implement a turn manager on the server (currentPlayerTurn).  
   * Only process moveRequest or useItemRequest events from the player whose turn it is.  
2. **Item System (Server-side):**  
   * At the start of a player's turn, randomly assign them an item ("Douse Fire" or "Build Bridge").  
   * When broadcasting the game state, send a customized version to each player that hides their partner's item.  
3. **Item Usage (Client & Server):**  
   * Add UI elements on the client to display whose turn it is and what item the player is holding.  
   * Implement an "Use Item" keybind. When pressed, the client sends a useItemRequest to the server.  
   * The server validates the request (correct item for the hazard), updates the grid, and ends the current player's turn.  
4. **Success Metric:** Player 1 can use a "Douse Fire" item to remove a fire tile, which updates on both screens. The turn then correctly passes to Player 2\.

### **Phase 4: Polish & "Shipping" (Friday EOD)**

**Goal:** Add the finishing touches to make it a complete, winnable experience.  
**Tasks:**

1. **Levels & Win Condition:**  
   * Add an "Exit" tile type.  
   * Implement a win condition: when both players are on exit tiles, the game is won.  
   * Create 2-3 hardcoded level layouts. Add logic to load the next level after a win.  
2. **UI/UX Polish:**  
   * Add simple on-screen text for game states: "Waiting for partner...", "Player 1's Turn", "You Win\!", "Level 2".  
   * Ensure the game gracefully handles a player disconnecting.  
3. **Stretch Goal: Art Swap:**  
   * If time permits, find simple, free-to-use pixel art sprites online.  
   * Replace the placeholder squares with actual character and tile sprites.  
4. **Final Success Metric:** Two players can successfully play through all levels, solve the puzzles by communicating, and reach the "You Win\!" screen. The game feels like a complete, albeit short, experience.