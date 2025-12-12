import { type UUID, type Client, type Lobby, type WebSocketMessage } from "./types";
import Game from "./game";
import WebSocket from "ws";

import { v4 as uuidv4 } from 'uuid';

const CLEANUP_DELAY_MS = 5 * 60 * 1000; // ~5 minutes
const ACTIVE_GAME_CUTOFF = (game: Game) => !game.isOver && !game.isEmpty();

type LobbySnapshot = {
    id: UUID;
    name: string;
    capacity: number;
    clients: { id: UUID; username: string; isOwner: boolean }[];
};

export function safeSend(ws: WebSocket, obj: any) {
    try { ws.send(JSON.stringify(obj)); } catch (e) { /* ignore broken sockets */ }
}

export default class State {
    private clients = new Map<UUID, Client>();
    private lobbies = new Map<UUID, Lobby>();
    private games = new Map<UUID, Game>();
    private menuSubscribers = new Set<WebSocket>();
    private lobbyCleanupTimers = new Map<UUID, NodeJS.Timeout>();
    private gameCleanupTimers = new Map<UUID, NodeJS.Timeout>();
    private clientCleanupTimers = new Map<UUID, NodeJS.Timeout>();
    private gameLobbySnapshots = new Map<UUID, LobbySnapshot>();

    /* -------- USERS -------- */
    public createUser(id: UUID, username: string, ws: WebSocket): Client {
        const client: Client = { id, username, ws };
        this.clients.set(id, client);
        this.cancelClientCleanup(id);
        return client;
    }

    public getClient(id: UUID): Client | undefined { return this.clients.get(id); }

    public updateClientSocket(id: UUID, ws: WebSocket) {
        const c = this.clients.get(id);
        if (c) {
            c.ws = ws;
            this.cancelClientCleanup(id);
        }
    }

    /* -------- MENU SUBSCRIPTION -------- */
    public subscribeToMenu(ws: WebSocket) {
        this.menuSubscribers.add(ws);
        safeSend(ws, { type: 'get-lobbies-response', data: this.getLobbiesSummary() });
    }

    private broadcastMenu() {
        const msg = { type: 'get-lobbies-response', data: this.getLobbiesSummary() };
        for (const ws of this.menuSubscribers) safeSend(ws, msg);
    }

    private scheduleLobbyCleanup(lobbyId: UUID) {
        if (this.lobbyCleanupTimers.has(lobbyId)) return;
        const timer = setTimeout(() => {
            this.lobbies.delete(lobbyId);
            this.lobbyCleanupTimers.delete(lobbyId);
            this.broadcastMenu();
        }, CLEANUP_DELAY_MS);
        this.lobbyCleanupTimers.set(lobbyId, timer);
    }

    private cancelLobbyCleanup(lobbyId: UUID) {
        const t = this.lobbyCleanupTimers.get(lobbyId);
        if (t) clearTimeout(t);
        this.lobbyCleanupTimers.delete(lobbyId);
    }

    private scheduleGameCleanup(gameId: UUID) {
        if (this.gameCleanupTimers.has(gameId)) return;
        const timer = setTimeout(() => {
            this.games.delete(gameId);
            this.gameCleanupTimers.delete(gameId);
            this.gameLobbySnapshots.delete(gameId);
        }, CLEANUP_DELAY_MS);
        this.gameCleanupTimers.set(gameId, timer);
    }

    private cancelGameCleanup(gameId: UUID) {
        const t = this.gameCleanupTimers.get(gameId);
        if (t) clearTimeout(t);
        this.gameCleanupTimers.delete(gameId);
    }

    private scheduleClientCleanup(clientId: UUID) {
        if (this.clientCleanupTimers.has(clientId)) return;
        const timer = setTimeout(() => {
            this.clients.delete(clientId);
            this.clientCleanupTimers.delete(clientId);
        }, CLEANUP_DELAY_MS);
        this.clientCleanupTimers.set(clientId, timer);
    }

    private cancelClientCleanup(clientId: UUID) {
        const t = this.clientCleanupTimers.get(clientId);
        if (t) clearTimeout(t);
        this.clientCleanupTimers.delete(clientId);
    }

    private removeFromAllLobbies(userId: UUID) {
        for (const lobby of [...this.lobbies.values()]) {
            const contains = lobby.clients.some(c => c.id === userId);
            if (contains) {
                this.leaveLobby(lobby.id, userId);
            }
        }
    }

    /* -------- LOBBIES -------- */
    public createLobby(ownerId: UUID, name: string, capacity: number): { ok: boolean; lobby?: Lobby; error?: string } {
        const owner = this.clients.get(ownerId);
        if (!owner) return { ok: false, error: 'Unknown owner' };

        const trimmedName = name.trim();
        if (trimmedName.length === 0 || trimmedName.length > 32) return { ok: false, error: 'Lobby name must be 1-32 characters' };
        if (!Number.isInteger(capacity) || capacity < 1 || capacity > 16) return { ok: false, error: 'Lobby capacity must be between 1 and 16' };

        const id = uuidv4();
        const lobby: Lobby = { id, name: trimmedName, capacity, clients: [{ ...owner, isOwner: true }] };
        this.lobbies.set(id, lobby);
        this.cancelLobbyCleanup(id);
        this.broadcastMenu();
        return { ok: true, lobby };
    }

    public joinLobby(lobbyId: UUID, userId: UUID): { ok: boolean; error?: string; lobby?: Lobby } {
        const lobby = this.lobbies.get(lobbyId);
        const user = this.clients.get(userId);
        if (!lobby) return { ok: false, error: 'Lobby not found' };
        if (!user) return { ok: false, error: 'Unknown user' };
        if (lobby.clients.length >= lobby.capacity) return { ok: false, error: 'Lobby full' };

        lobby.clients.push({ ...user, isOwner: false });
        this.cancelLobbyCleanup(lobbyId);
        this.updateLobby(lobbyId);
        this.broadcastMenu();
        return { ok: true, lobby };
    }

    public leaveLobby(lobbyId: UUID, userId: UUID) {
        const lobby = this.lobbies.get(lobbyId);
        if (!lobby) return;

        const isOwner = lobby.clients.find(c => c.isOwner)!.id === userId;
        lobby.clients = lobby.clients.filter(c => c.id !== userId);
        if (lobby.clients.length === 0) {
            this.scheduleLobbyCleanup(lobbyId);
        } else {
            this.cancelLobbyCleanup(lobbyId);
            // there is still someone in the lobby

            if (isOwner) {
                // pass on ownership
                lobby.clients[0].isOwner = true;
            }
            this.updateLobby(lobbyId);
        }
        this.broadcastMenu();
    }

    private updateLobby(lobbyId: UUID) {
        const lobby = this.lobbies.get(lobbyId);
        if (!lobby) return;
        const payload = { type: 'lobby-update', data: { lobby: this.stripLobby(lobby) } };
        for (const c of lobby.clients) safeSend(c.ws, payload);
    }

    private stripLobby(lobby: Lobby) {
        return { ...lobby, clients: lobby.clients.map(c => ({ id: c.id, username: c.username, isOwner: c.isOwner })) };
    }

    public getLobbyBare(lobbyId: UUID): ReturnType<State['stripLobby']> | null {
        const l = this.lobbies.get(lobbyId);
        if (!l) return null;
        return this.stripLobby(l);
    }

    private activeGamesCount(): number {
        let count = 0;
        for (const g of this.games.values()) {
            if (ACTIVE_GAME_CUTOFF(g)) count++;
        }
        return count;
    }

    public getLobbiesSummary() {
        return {
            lobbies: [...this.lobbies.values()].map(l => ({ id: l.id, name: l.name, capacity: [l.clients.length, l.capacity] })),
            activeGames: this.activeGamesCount()
        };
    }

    /* -------- GAMES -------- */
    public evaluateGameCleanup(gameId: UUID) {
        const game = this.games.get(gameId);
        if (!game) return;

        if (game.isEmpty() || game.isOver) {
            this.scheduleGameCleanup(gameId);
        } else {
            this.cancelGameCleanup(gameId);
        }
    }

    public startGameFromLobby(lobbyId: UUID): { ok: boolean; gameId?: UUID; error?: string } {
        const lobby = this.lobbies.get(lobbyId);
        if (!lobby) return { ok: false, error: 'Lobby not found' };

        // Remember original lobby to restore after game ends
        const snapshot: LobbySnapshot = {
            id: lobby.id,
            name: lobby.name,
            capacity: lobby.capacity,
            clients: lobby.clients.map(c => ({ id: c.id, username: c.username, isOwner: c.isOwner }))
        };

        const gameId = uuidv4();

        // helper functions that Game will use for communication
        const broadcastToAll = (msg: WebSocketMessage) => {
            for (const c of lobby.clients) safeSend(c.ws, msg);
        };

        const broadcastToClient = (id: UUID, msg: WebSocketMessage) => {
            const client = lobby.clients.find(c => c.id === id);
            if (client) safeSend(client.ws, msg);
        };

        const game = new Game(gameId, lobby.clients, broadcastToAll, broadcastToClient, (winnerId) => this.handleGameEnded(gameId, winnerId));
        this.games.set(gameId, game);
        this.cancelGameCleanup(gameId);
        this.gameLobbySnapshots.set(gameId, snapshot);

        // remove lobby from lobby list since the game started
        this.lobbies.delete(lobbyId);
        this.broadcastMenu();

        // immediately notify clients and start first turn
        game.sendUpdates();
        game.startTurn();

        return { ok: true, gameId };
    }

    public getGame(gameId: UUID): Game | undefined { return this.games.get(gameId); }

    public cleanupGames() {
        for (const [id] of this.games) this.evaluateGameCleanup(id);
    }

    /* -------- CONNECTION RECOVERY -------- */
    private restoreLobbyFromSnapshot(gameId: UUID) {
        const snap = this.gameLobbySnapshots.get(gameId);
        if (!snap) return;

        // Build lobby members from currently connected clients only
        const clients = snap.clients
            .map(s => {
                const live = this.clients.get(s.id);
                if (!live) return null;
                return { ...live, isOwner: s.isOwner };
            })
            .filter((c): c is Lobby['clients'][number] => Boolean(c));

        if (clients.length === 0) {
            this.gameLobbySnapshots.delete(gameId);
            return;
        }

        // ensure one owner
        let ownerIdx = clients.findIndex(c => c.isOwner);
        if (ownerIdx === -1) ownerIdx = 0;
        const normalizedClients = clients.map((c, idx) => ({ ...c, isOwner: idx === ownerIdx }));

        const lobby: Lobby = {
            id: snap.id,
            name: snap.name,
            capacity: snap.capacity,
            clients: normalizedClients
        };

        this.lobbies.set(lobby.id, lobby);
        this.cancelLobbyCleanup(lobby.id);
        this.broadcastMenu();
        this.updateLobby(lobby.id);
        this.gameLobbySnapshots.delete(gameId);
    }

    private handleGameEnded(gameId: UUID, winnerId: UUID | null) {
        // Remove game and schedule cleanup
        this.games.delete(gameId);
        this.scheduleGameCleanup(gameId);

        // Restore lobby for remaining/connected clients
        this.restoreLobbyFromSnapshot(gameId);
    }

    public recoverConnection(id: UUID, ws: WebSocket): { ok: boolean; inLobby: Lobby | null; inGame: Game | null; username?: string } {
        const client = this.clients.get(id);
        if (!client) return { ok: false, inLobby: null, inGame: null };

        // replace socket at global client
        client.ws = ws;

        // update lobby membership socket if present
        let lobbyFound: Lobby | null = null;
        for (const l of this.lobbies.values()) {
            const idx = l.clients.findIndex(c => c.id === id);
            if (idx !== -1) { l.clients[idx] = { ...l.clients[idx], ws }; lobbyFound = l; break; }
        }

        // update game membership socket if present
        let gameFound: Game | null = null;
        if (!lobbyFound) {
            for (const g of this.games.values()) {
                g.updateSocketForPlayer(id, ws);
                // if the game had that player, updateSocketForPlayer is a no-op otherwise — but we don't have a direct way to check membership here cheaply
                // a quick membership check:
                // (we can't access private Game.clients here; instead we rely on that updateSocketForPlayer only changes when player exists)
                // to keep the API simple, we'll still return the game reference if we can find it by calling getGame and checking gatherInfo
                const info = g.gatherInfo();
                if (info.players.find(p => p.id === id)) { gameFound = g; break; }
            }
        }

        // confirm identification to client
        safeSend(ws, { type: 'new-user-response', data: { error: null, id, username: client.username } });

        if (gameFound) this.cancelGameCleanup(gameFound.id);
        this.cancelClientCleanup(id);
        return { ok: true, inLobby: lobbyFound, inGame: gameFound, username: client.username };
    }

    public handleSocketClosure(id: UUID, ws: WebSocket) {
        this.menuSubscribers.delete(ws);
        this.removeFromAllLobbies(id);

        // If player is part of any games, notify the game so it can progress.
        for (const game of this.games.values()) {
            game.handleDisconnect(id);
            this.evaluateGameCleanup(game.id);
        }

        this.scheduleClientCleanup(id);
    }

    public handleGameLeave(playerId: UUID, gameId: UUID) {
        let client = this.clients.get(playerId);

        if (!client) return;

        let game = this.games.get(gameId);

        if (!game) {
            safeSend(client.ws, { type: "leave-game-response", data: { error: "Game not found." } });
            return;
        }

        game.handleDisconnect(playerId);
        this.evaluateGameCleanup(gameId);
    }
}
