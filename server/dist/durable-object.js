"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameRoomDO = void 0;
// Durable Object
class GameRoomDO {
    constructor(ctx, env) {
        this.ctx = ctx;
    }
    async fetch(request) {
        const url = new URL(request.url);
        // Explicit endpoint to create a game
        if (request.method === "POST" && url.pathname === "/init") {
            try {
                return new Response(JSON.stringify({ success: true }), {
                    headers: { "Content-Type": "application/json" },
                });
            }
            catch (error) {
                return new Response(JSON.stringify({ error: error.message }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
            }
        }
        // Check if the request is for a WebSocket upgrade.
        const upgradeHeader = request.headers.get("Upgrade");
        if (upgradeHeader === "websocket") {
            // The Hibernation API is the best practice for WebSockets.
            // It allows the DO to sleep when no clients are connected.
            const webSocketPair = new WebSocketPair();
            const client = webSocketPair[0];
            const server = webSocketPair[1];
            // This is the key step for the Hibernation API.
            // We pass the server-side socket to the runtime, which will
            // then manage its lifecycle.
            this.ctx.acceptWebSocket(server);
            // We return the client-side socket to the user, completing the handshake.
            return new Response(null, {
                status: 101, // Switching Protocols
                webSocket: client,
            });
        }
        // If the path does not match any known routes, return 404.
        return new Response(`Durable Object path not found: ${url.pathname}`, {
            status: 404,
        });
    }
    // --- WebSocket Hibernation API Handlers ---
    webSocketMessage(ws, message) {
    }
    webSocketClose(ws, code, reason, wasClean) {
        console.log(`WebSocket closed: code=${code}, reason=${reason}, wasClean=${wasClean}`);
    }
    webSocketError(ws, error) {
        console.log("WebSocket error:", error);
    }
    // --- Helper Methods ---
    /**
     * Broadcasts a message to all connected WebSocket clients.
     * @param message The message to send.
     */
    broadcast(message) {
    }
}
exports.GameRoomDO = GameRoomDO;
