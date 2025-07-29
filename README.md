# Dungeon Escape Duo

A 2-player cooperative puzzle game where players must work together to escape a series of treacherous dungeons. This project was built in 5 days as an MVP.

## Core Gameplay

- **2-Player Coop:** The game is designed for two players to play simultaneously, requiring communication and coordination.
- **Turn-Based:** Players take turns to move and perform actions.
- **Puzzles & Traps:** Navigate levels filled with puzzles, traps, and enemies.
- **Server-Authoritative:** The game state is managed by the server to ensure consistency between players.

## Tech Stack

- **Backend:** Node.js, Express, Socket.IO
- **Frontend:** Phaser 3, TypeScript, Vite
- **Testing:** Jest

## Setup and Installation

1.  **Install root dependencies:**
    ```bash
    npm install
    ```

2.  **Install client dependencies:**
    ```bash
    cd client
    npm install
    ```

## Running the Game Locally

1.  **Start the server:**
    In the root directory, run:
    ```bash
    npm start
    ```
    The server will start on port 3000.

2.  **Start the client:**
    In a separate terminal, from the `client` directory, run:
    ```bash
    npm run dev
    ```
    The client development server will start, typically on `http://localhost:5173`.

3.  **Play:**
    Open two browser tabs/windows to `http://localhost:5173` to start playing. The game will automatically pair two connected clients into a game room.

## Project Structure

-   `server.js`: The main game server file.
-   `client/`: Contains all the frontend Phaser 3 game code.
-   `client/src/scenes/`: Phaser scenes for different parts of the game (Lobby, Game, etc.).
-   `client/public/assets/`: All game assets like sprites and tilemaps. 