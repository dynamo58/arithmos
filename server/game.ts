import WebSocket from "ws";
import { type UUID, type User, type Client, type LobbyClient, type Lobby, type Player, type GameInfo, type Payload, type LobbyLeavePayload, type NewUserPayload, type LobbyCreationPayload, type LobbyJoinPayload, type StartGamePayload, type WebSocketMessage } from "./types";


function canCompute(a: number, b: number, c: number, x: number): boolean {
    const ops = [
        (x: number, y: number) => x + y,
        (x: number, y: number) => x - y,
        (x: number, y: number) => x * y,
    ];

    function permute<T>(arr: T[]): T[][] {
        if (arr.length <= 1) return [arr];
        const result: T[][] = [];
        for (let i = 0; i < arr.length; i++) {
            const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
            for (const p of permute(rest)) result.push([arr[i], ...p]);
        }
        return result;
    }

    const permutations = permute([a, b, c]);

    for (const [x1, x2, x3] of permutations) {
        for (const op1 of ops) {
            for (const op2 of ops) {
                const r1 = op2(op1(x1, x2), x3);
                if (r1 === x) return true;

                const r2 = op1(x1, op2(x2, x3));
                if (r2 === x) return true;
            }
        }
    }

    return false;
}

// -------------------------------
// Game (encapsulated)
// -------------------------------

export default class Game {
    public readonly id: UUID;
    private clients: Map<UUID, Client>;
    private turnOrder: UUID[];
    private currentTurn: number;
    private playerBoards: Map<UUID, Set<number>>;
    public isOver: boolean = false;
    private lastRoll: [number, number, number] | null = null;
    private turnTimer: NodeJS.Timeout | null = null;
    private endedCallback: (winnerId: UUID | null) => void;

    // abstraction for broadcasting — provided by State when creating the game
    private broadcastToAll: (msg: WebSocketMessage) => void;
    private broadcastToClient: (id: UUID, msg: WebSocketMessage) => void;

    constructor(
        id: UUID,
        clients: LobbyClient[],
        broadcastToAll: (msg: WebSocketMessage) => void,
        broadcastToClient: (id: UUID, msg: WebSocketMessage) => void,
        onGameEnded: (winnerId: UUID | null) => void
    ) {
        this.id = id;
        this.clients = new Map(clients.map(c => [c.id, { id: c.id, username: c.username, ws: c.ws }]));
        this.turnOrder = clients.map(c => c.id);
        this.currentTurn = this.turnOrder.length > 0
            ? Math.floor(Math.random() * this.turnOrder.length)
            : 0;
        this.playerBoards = new Map(clients.map(c => [c.id, new Set<number>()]));

        this.broadcastToAll = broadcastToAll;
        this.broadcastToClient = broadcastToClient;
        this.endedCallback = onGameEnded;

        console.log(`[GAME] Created game ${this.id} players=${this.turnOrder.join(',')}`);
    }

    private rollDice(): [number, number, number] {
        const dice: [number, number, number] = [
            Math.floor(Math.random() * 6) + 1,
            Math.floor(Math.random() * 6) + 1,
            Math.floor(Math.random() * 6) + 1,
        ];
        console.log(`[GAME] ${this.id} rolled ${dice.join(',')}`);
        return dice;
    }

    private startTurnTimer() {
        if (this.turnTimer) clearTimeout(this.turnTimer);
        this.turnTimer = setTimeout(() => {
            const playerId = this.turnOrder[this.currentTurn];
            console.log(`[GAME] ${this.id} turn timed out for ${playerId}`);
            this.nextTurn();
        }, 15_000);
    }

    public startTurn(): void {
        if (this.isOver) return;
        const playerId = this.turnOrder[this.currentTurn];
        console.log(`[GAME] ${this.id} starting turn for ${playerId}`);
        this.lastRoll = this.rollDice();
        this.sendUpdates();
        this.startTurnTimer();
    }

    public chooseNumber(playerId: UUID, chosen: number): boolean {
        console.log(`[GAME] ${this.id} player ${playerId} chooses ${chosen}`);
        if (this.isOver) return false;

        const activePlayer = this.turnOrder[this.currentTurn];
        if (playerId !== activePlayer) {
            // Ignore out-of-turn inputs
            return false;
        }

        if (!this.lastRoll) return false;
        if (!Number.isInteger(chosen) || chosen < 1 || chosen > 16) {
            this.invalidateActiveTurn();
            return false;
        }

        const [a, b, c] = this.lastRoll;
        if (!canCompute(a, b, c, chosen)) {
            this.invalidateActiveTurn();
            return false;
        }

        const board = this.playerBoards.get(playerId);
        if (!board) return false; // not part of game

        if (board.has(chosen)) {
            this.invalidateActiveTurn();
            return false;
        }

        if (this.turnTimer) { clearTimeout(this.turnTimer); this.turnTimer = null; }
        board.add(chosen);
        this.sendUpdates();

        if ((board.size) >= 16) {
            this.isOver = true;
            const winner = this.clients.get(playerId)!;
            this.broadcastToAll({ type: 'game-over', data: { winner: { id: winner.id, username: winner.username } } });
            console.log(`[GAME] ${this.id} winner ${winner.username}`);
            this.endedCallback(playerId);
            return true;
        }

        this.nextTurn();
        return true;
    }

    private invalidateActiveTurn() {
        if (this.turnTimer) { clearTimeout(this.turnTimer); this.turnTimer = null; }
        this.nextTurn();
    }

    private nextTurn(): void {
        if (this.turnTimer) { clearTimeout(this.turnTimer); this.turnTimer = null; }
        if (this.turnOrder.length === 0) return;
        this.currentTurn = (this.currentTurn + 1) % this.turnOrder.length;
        console.log(`[GAME] ${this.id} next turn: ${this.turnOrder[this.currentTurn]}`);
        this.startTurn();
    }

    private broadcast(msg: WebSocketMessage) {
        this.broadcastToAll(msg);
    }

    public isEmpty(): boolean {
        return this.turnOrder.length === 0;
    }

    public gatherInfo(): GameInfo {
        const players = [...this.clients.values()].map(c => ({ id: c.id, username: c.username, board: [...this.playerBoards.get(c.id)!.values()] }));
        return { id: this.id, players, isOver: this.isOver, roll: this.lastRoll, turnPlayerId: this.turnOrder[this.currentTurn] };
    }

    public sendUpdates() {
        this.broadcast({ type: 'game-info', data: this.gatherInfo() });
    }

    // when a player's socket changes (recover), update it inside the game's local map
    public updateSocketForPlayer(playerId: UUID, ws: WebSocket) {
        const existing = this.clients.get(playerId);
        if (existing) existing.ws = ws;
    }

    public handleDisconnect(playerId: UUID): void {
        console.log(`[GAME] ${this.id} player disconnected: ${playerId}`);

        // If player not in game → nothing to do
        if (!this.clients.has(playerId)) return;

        // Remove player entirely
        this.clients.delete(playerId);
        this.playerBoards.delete(playerId);

        // Remove from turn order
        const idx = this.turnOrder.indexOf(playerId);
        if (idx !== -1) {
            this.turnOrder.splice(idx, 1);

            // Adjust currentTurn so it still points to the correct next player
            if (idx < this.currentTurn) {
                this.currentTurn--;
            }

            // Clamp if needed
            if (this.currentTurn >= this.turnOrder.length) {
                this.currentTurn = 0;
            }
        }

        // If a turn timer existed for the disconnected player, clear it.
        if (this.turnTimer) {
            clearTimeout(this.turnTimer);
            this.turnTimer = null;
        }

        // If only one player remains → they win automatically
        if (this.turnOrder.length === 1 && !this.isOver) {
            this.isOver = true;
            const winnerId = this.turnOrder[0];
            const winner = this.clients.get(winnerId)!;

            console.log(`[GAME] ${this.id} only one player left — winner is ${winner.username}`);

            this.broadcastToAll({
                type: "game-over",
                data: { winner: { id: winner.id, username: winner.username } }
            });
            this.endedCallback(winnerId);
            return;
        }

        // If zero players remain → mark game dead
        if (this.turnOrder.length === 0) {
            console.log(`[GAME] ${this.id} ended — no players remain`);
            this.isOver = true;
            this.endedCallback(null);
            return;
        }

        // Otherwise continue the game — start next turn
        console.log(`[GAME] ${this.id} continuing after disconnect; next turn = ${this.turnOrder[this.currentTurn]}`);
        this.sendUpdates();
        this.startTurn();
    }
}