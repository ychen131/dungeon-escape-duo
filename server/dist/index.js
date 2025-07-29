"use strict";
/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameRoomDO = void 0;
var durable_object_1 = require("./durable-object");
Object.defineProperty(exports, "GameRoomDO", { enumerable: true, get: function () { return durable_object_1.GameRoomDO; } });
// Define allowed origins for CORS
const corsOrigins = [
    "http://localhost:5173", // Local development
    "http://localhost:4173", // Vite preview mode
    "https://dungeon-escape-duo.chuanchuanc.workers.dev", // Production client (Cloudflare Pages)
];
// CORS handler function
function getCorsHeaders(request) {
    const origin = request.headers.get("Origin");
    const headers = new Headers();
    if (origin && corsOrigins.includes(origin)) {
        headers.set("Access-Control-Allow-Origin", origin);
        headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization"); // Add any other headers your client might send
    }
    return headers;
}
exports.default = {
    /**
     * This is the standard fetch handler for a Cloudflare Worker
     *
     * @param request - The request submitted to the Worker from the client
     * @param env - The interface to reference bindings declared in wrangler.jsonc
     * @param ctx - The execution context of the Worker
     * @returns The response to be sent back to the client
     */
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const corsHeaders = getCorsHeaders(request);
        // Handle OPTIONS preflight requests
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: corsHeaders,
            });
        }
        // Handle POST /api/games/create
        if (request.method === "POST" && url.pathname === "/api/games/create") {
            try {
                // Parse the request body to get player count
                const body = (await request.json());
                const playerCount = body.playerCount || 1;
                const id = env.GAME_ROOM_DO.newUniqueId();
                const stub = env.GAME_ROOM_DO.get(id);
                // Initialize the game with the specified player count
                await stub.fetch(new Request(`http://localhost/init`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ playerCount }),
                }));
                const responseHeaders = new Headers({
                    "Content-Type": "application/json",
                });
                // Append CORS headers
                corsHeaders.forEach((value, key) => {
                    responseHeaders.set(key, value);
                });
                return new Response(JSON.stringify({ id: id.toString() }), {
                    headers: responseHeaders,
                });
            }
            catch (error) {
                const responseHeaders = new Headers({
                    "Content-Type": "application/json",
                });
                corsHeaders.forEach((value, key) => responseHeaders.set(key, value));
                return new Response(JSON.stringify({ error: "Invalid request body" }), {
                    status: 400,
                    headers: responseHeaders,
                });
            }
        }
        // Handle /api/games/:id/* routes
        const gameRouteMatch = url.pathname.match(/^\/api\/games\/([a-f0-9]+)(.*)$/);
        if (gameRouteMatch) {
            const gameId = gameRouteMatch[1];
            const subPath = gameRouteMatch[2] || "/";
            // Validate the ID format (64 hex characters for a standard unique ID)
            if (gameId.length !== 64) {
                const responseHeaders = new Headers({
                    "Content-Type": "application/json",
                });
                corsHeaders.forEach((value, key) => responseHeaders.set(key, value));
                return new Response(JSON.stringify({ error: "Invalid game ID format" }), {
                    status: 400,
                    headers: responseHeaders,
                });
            }
            try {
                const id = env.GAME_ROOM_DO.idFromString(gameId);
                const stub = env.GAME_ROOM_DO.get(id);
                // Create a new request with the stripped path
                const newUrl = new URL(request.url);
                newUrl.pathname = subPath;
                const newRequest = new Request(newUrl.toString(), request);
                // Forward the modified request to the DO
                const response = await stub.fetch(newRequest);
                // The DO will handle its own CORS headers for WebSocket responses.
                // For regular HTTP responses from the DO, we can add our worker's CORS headers.
                const isWebSocketUpgrade = response.status === 101;
                if (isWebSocketUpgrade) {
                    return response; // Return the response directly for WebSockets
                }
                // For regular HTTP, clone and add CORS headers
                const newResponse = new Response(response.body, response);
                corsHeaders.forEach((value, key) => {
                    newResponse.headers.set(key, value);
                });
                return newResponse;
            }
            catch (error) {
                const responseHeaders = new Headers({
                    "Content-Type": "application/json",
                });
                corsHeaders.forEach((value, key) => responseHeaders.set(key, value));
                return new Response(JSON.stringify({ error: "Invalid game ID" }), {
                    status: 400,
                    headers: responseHeaders,
                });
            }
        }
        const responseHeaders = new Headers();
        corsHeaders.forEach((value, key) => responseHeaders.set(key, value));
        return new Response("Not found", {
            status: 404,
            headers: responseHeaders,
        });
    },
};
