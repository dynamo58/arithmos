import WebSocket, { WebSocketServer } from "ws";
import { v4 as uuidv4 } from 'uuid';

type UUID = string;

interface User {
    username: string;
    id: UUID;
}

interface Client {
    username: string;
    id: UUID;
    ws: WebSocket;
}

interface Lobby {
    id: UUID;
    name: string,
    capacity: number,
    clients: (Client & { isOwner: boolean })[];
}

interface Player {
    id: UUID,
    username: string,
    board: number[],
}

interface GameInfo {
    id: UUID,
    players: Player[],
    isOver: boolean,
    roll: [number, number, number],
    turnPlayerId: UUID,
}

class Game {
    id: UUID;
    clients: Map<UUID, Client>;
    turnOrder: UUID[];
    currentTurn: number;
    playerBoards: Map<UUID, Set<number>>;
    isOver: boolean;
    lastRoll: [number, number, number] | null;
    state: State;

    private turnTimer: NodeJS.Timeout | null = null;

    constructor(state: State, id: UUID, clients: Client[]) {
        this.state = state;
        this.id = id;
        this.clients = new Map(clients.map(c => [c.id, c]));
        this.turnOrder = clients.map(c => c.id);
        this.currentTurn = 0;

        // TESTING:
        this.playerBoards = new Map(
            clients.map(c => [
                c.id,
                new Set([])
            ])
        );

        this.isOver = false;
        this.lastRoll = null;

        console.log(`[GAME] Created game ${this.id} with players: ${this.turnOrder.join(", ")}`);
    }

    private rollDice(): [number, number, number] {
        const dice: [number, number, number] = [
            Math.floor(Math.random() * 6) + 1,
            Math.floor(Math.random() * 6) + 1,
            Math.floor(Math.random() * 6) + 1
        ];
        console.log(`[GAME] Rolled dice: ${dice.join(", ")}`);
        return dice;
    }

    private startTurnTimer() {
        if (this.turnTimer) clearTimeout(this.turnTimer);

        this.turnTimer = setTimeout(() => {
            const playerId = this.turnOrder[this.currentTurn];
            console.log(`[GAME] Turn timed out for player ${playerId}`);
            this.nextTurn();
        }, 15000); // 15 seconds
    }

    startTurn(): void {
        const playerId = this.turnOrder[this.currentTurn];
        console.log(`[GAME] Starting turn for player ${playerId}`);

        const dice = this.rollDice();
        this.lastRoll = dice;

        this.sendUpdates();
        this.startTurnTimer();
    }

    chooseNumber(playerId: UUID, chosen: number): boolean {
        console.log(`[GAME] Player ${playerId} chose number ${chosen}`);

        if (this.turnTimer) {
            clearTimeout(this.turnTimer);
            this.turnTimer = null;
        }

        if (!(Number.isInteger(chosen) && chosen >= 1 && chosen <= 16)) {
            console.log(`[GAME] Invalid number chosen by player ${playerId}: ${chosen}`);
            this.nextTurn();
            return false;
        }

        if (this.isOver) {
            console.log(`[GAME] Game already over, choice ignored for player ${playerId}`);
            return false;
        }

        const [a, b, c] = this.lastRoll ?? [];
        if (!a || !b || !c) {
            console.log(`[GAME] No dice rolled yet, cannot choose number ${chosen}`);
            return false;
        }

        if (!canCompute(a, b, c, chosen)) {
            console.log(`[GAME] Cannot compute number ${chosen} from dice ${a},${b},${c}`);
            this.nextTurn();
            return false;
        }

        const board = this.playerBoards.get(playerId)!;
        if (board.has(chosen)) {
            console.log(`[GAME] Number ${chosen} already on player ${playerId}'s board`);
            this.nextTurn();
            return false;
        }

        board.add(chosen);
        console.log(`[GAME] Number ${chosen} added to player ${playerId}'s board: ${[...board].join(", ")}`);
        this.sendUpdates();

        if (board.size >= 16) {
            this.isOver = true;
            const winner = this.clients.get(playerId)!;
            console.log(`[GAME] Player ${winner.username} (${winner.id}) wins the game!`);

            this.broadcast({
                type: "game-over",
                data: {
                    winner: {
                        id: winner.id,
                        username: winner.username
                    }
                }
            });

            return true;
        }

        this.nextTurn();
        return true;
    }

    nextTurn(): void {
        if (this.turnTimer) {
            clearTimeout(this.turnTimer);
            this.turnTimer = null;
        }

        this.currentTurn = (this.currentTurn + 1) % this.turnOrder.length;
        console.log(`[GAME] Next turn: player ${this.turnOrder[this.currentTurn]}`);

        this.startTurn();
    }

    broadcast(msg: WebSocketMessage): void {
        console.log(`[GAME] Broadcasting message: ${msg.type}`);
        for (const [, client] of this.clients) {
            client.ws.send(JSON.stringify(msg));
        }
    }

    gatherInfo() {
        const players = [...this.clients.values()].map(c => {
            return {
                id: c.id,
                username: c.username,
                board: [...this.playerBoards.get(c.id)!.values()]
            };
        });

        const info: GameInfo = {
            id: this.id,
            players,
            isOver: this.isOver,
            roll: this.lastRoll!,
            turnPlayerId: this.turnOrder[this.currentTurn]
        };

        return info;
    }

    sendUpdates() {
        console.log(`[GAME] Sending game updates`);
        this.broadcast({
            type: "game-info",
            data: this.gatherInfo()
        });
    }
}


class State {
    clients: Map<UUID, Client>;
    lobbies: Map<UUID, Lobby>;
    ongoingGames: Map<UUID, Game>;
    peopleInMenu: WebSocket[];

    constructor() {
        this.clients = new Map();
        this.lobbies = new Map();
        this.ongoingGames = new Map();
        this.peopleInMenu = [];
    }

    getLobbies() {
        return [...this.lobbies.values()].map(l => {
            return {
                name: l.name,
                id: l.id,
                capacity: [l.clients.length, l.capacity],
            }
        })
    }

    getLobbyClients(lobbyId: UUID) {
        let lobby = this.lobbies.get(lobbyId);

        if (!lobby) return null;

        return [...lobby.clients.values()].map(c => {
            return {
                username: c.username,
                isOwner: c.isOwner,
                id: c.id
            }
        })
    }

    getLobby(lobbyId: UUID) {
        let lobby = this.lobbies.get(lobbyId);

        if (!lobby) return null;

        return {
            ...lobby,
            clients: this.getLobbyClients(lobby.id)
        }
    }

    refreshMenu() {
        const msg = JSON.stringify({ type: "get-lobbies-response", data: this.getLobbies() });

        this.peopleInMenu.forEach(ws => {
            ws.send(msg);
        })
    }

    handleLobbyUpdate(lobbyId: UUID) {
        let lobby = this.lobbies.get(lobbyId)!;
        let update = JSON.stringify({ type: "lobby-update", data: { lobby: this.getLobby(lobby.id) } });

        lobby.clients.forEach(c => {
            c.ws.send(update);
        });
    }

    cleanup() {
        for (let [uid, game] of this.ongoingGames.entries()) {
            if (game.isOver) this.ongoingGames.delete(uid);
        }
    }
}

const state = new State();

const PORT = 3000;

interface Payload { }

interface NewUserPayload extends Payload {
    username: string
}

interface NewUserResponsePayload extends Payload {
    error: string | null,
    id: UUID,
    username: string,
}

interface LobbyCreationPayload extends Payload {
    name: string,
    capacity: number,
}

interface LobbyCreationResponsePayload extends Payload {
    error: string | null,
    id: UUID,
    name: string,
    capacity: number,
}

interface LobbyJoinPayload extends Payload {
    lobbyId: UUID,
}

interface LobbyJoinResponsePayload extends Payload {
    error: string | null,
    lobbyInfo: Lobby | null,
}

interface LobbyLeavePayload extends Payload { }

interface LobbyLeaveResponsePayload extends Payload {
    error: string | null,
}

interface StartGamePayload extends Payload { }

interface StartGameResponsePayload extends Payload {
    error: string | null,
}


interface WebSocketMessage {
    type: string,
    data: Payload,
}


const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws: WebSocket, req) => {
    console.log("New connection");
    let uuid = uuidv4();
    let joinedLobbyUUID: UUID | null = null;

    ws.on("message", (message: WebSocket.RawData) => {
        try {
            const msg = JSON.parse(message.toString()) as WebSocketMessage;

            if (msg.type === "subscribe-to-menu-updates") {
                state.peopleInMenu.push(ws);

                ws.send(JSON.stringify({
                    type: "get-lobbies-response", data: state.getLobbies()
                }));
            } else if (msg.type === "new-user") {
                const pl = msg.data as NewUserPayload;
                console.log(`New frog "${pl.username}" appeared.`);

                const user: User = {
                    username: pl.username,
                    id: uuid,
                };

                const client: Client = {
                    username: user.username,
                    id: user.id,
                    ws: ws
                }

                state.clients.set(user.id, client);
                const response: WebSocketMessage = {
                    type: "new-user-response",
                    data: {
                        error: null,
                        id: user.id,
                        username: user.username,
                    } as NewUserResponsePayload
                };
                ws.send(JSON.stringify(response));
            } else if (msg.type === "create-lobby") {
                console.log(`[${uuid}] creating lobby.`);

                const pl = msg.data as LobbyCreationPayload;



                let lobby: Lobby = {
                    id: uuidv4(),
                    name: pl.name,
                    capacity: pl.capacity,
                    clients: [{ ...state.clients.get(uuid)!, isOwner: true }]
                };

                state.lobbies.set(lobby.id, lobby);
                state.refreshMenu();
                joinedLobbyUUID = lobby.id;

                let resPayload: LobbyCreationResponsePayload = {
                    error: null,
                    id: lobby.id,
                    name: lobby.name,
                    capacity: lobby.capacity,
                }

                ws.send(JSON.stringify({
                    type: "create-lobby-response", data: {
                        error: null,
                        lobby: state.getLobby(joinedLobbyUUID)
                    }
                }))
            } else if (msg.type === "join-lobby") {
                console.log(`[${uuid}] joining lobby.`);

                const pl = msg.data as LobbyJoinPayload;

                let lobby = state.lobbies.get(pl.lobbyId);

                if (!lobby) {
                    ws.send(JSON.stringify({ type: "join-lobby-response", data: { error: "Lobby doesn't exist." } }))
                } else if (lobby.capacity <= lobby.clients.length) {
                    ws.send(JSON.stringify({ type: "join-lobby-response", data: { error: "Lobby is already full." } }))
                } else {
                    // TODO: notify the other players
                    lobby.clients.push({ ...state.clients.get(uuid)!, isOwner: false });
                    joinedLobbyUUID = lobby.id;
                    state.handleLobbyUpdate(lobby.id);
                    state.refreshMenu();
                }
            } else if (msg.type === "leave-lobby") {
                console.log(`[${uuid}] leaving lobby.`);
                const pl = msg.data as LobbyLeavePayload;

                // TODO: handle lobby deletion after last player has left
                // TODO: notify other players
                if (joinedLobbyUUID) {
                    let lobby = state.lobbies.get(joinedLobbyUUID!)!;
                    lobby.clients = lobby.clients.filter(c => c.id !== uuid);
                    ws.send(JSON.stringify({ type: "leave-lobby-response", data: { error: null } }));
                }
            } else if (msg.type === "start-game") {
                console.log(`[${uuid}] attempting to start game.`);
                const pl = msg.data as StartGamePayload;

                const lobby = state.lobbies.get(joinedLobbyUUID!);
                if (!lobby) {
                    ws.send(JSON.stringify({ type: "start-game-response", data: { error: "No lobby found." } }));
                    return;
                }

                const owner = lobby.clients.find(c => c.isOwner)!;

                if (owner.id !== uuid) {
                    ws.send(JSON.stringify({ type: "start-game-response", data: { error: "You're not the owner." } }));
                    return;
                }

                const game = new Game(state, uuidv4(), lobby.clients);
                state.ongoingGames.set(game.id, game);
                state.lobbies.delete(lobby.id);
                state.refreshMenu();

                game.sendUpdates();
                game.startTurn();
            } else if (msg.type === "choose-number") {
                console.log(`[${uuid}] chose their number.`);

                const { gameId, chosen } = msg.data as { gameId: UUID, chosen: number };
                const game = state.ongoingGames.get(gameId);
                if (!game) {
                    ws.send(JSON.stringify({ type: "choose-number-response", data: { error: "Game not found" } }));
                    return;
                }

                const success = game.chooseNumber(uuid, chosen);
                ws.send(JSON.stringify({ type: "choose-number-response", data: { error: success ? null : "Invalid choice" } }));
            } else if (msg.type === "get-lobbies") {
                console.log(`[${uuid}] getting lobbies.`);

                ws.send(JSON.stringify({
                    type: "get-lobbies-response", data: state.getLobbies()
                }))
            }
        } catch (err) {
            console.log(err);
            ws.send(JSON.stringify({ type: "error", message: "idk bruh" }));
        }
    });

    ws.on("close", () => {
        console.log(`[${uuid}] Connection closed`);
    });
});

console.log(`WebSocket server running on ws://localhost:${PORT}`);

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