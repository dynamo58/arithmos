import WebSocket, { WebSocketServer } from "ws";
import { v4 as uuidv4 } from 'uuid';
import { type UUID, type NewUserPayload, type LobbyCreationPayload, type LobbyJoinPayload, type WebSocketMessage } from "./types";
import State, { safeSend } from "./state";

const state = new State();
const PORT = Number.parseInt(process.env['PORT'] ?? '3000');
const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws: WebSocket) => {
    console.log('[WS] New connection');
    let localId = uuidv4();

    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw.toString()) as WebSocketMessage;

            switch (msg.type) {
                case 'subscribe-to-menu-updates': {
                    state.subscribeToMenu(ws);
                    break;
                }

                case 'new-user': {
                    const pl = msg.data as NewUserPayload;
                    state.createUser(localId, pl.username, ws);
                    safeSend(ws, { type: 'new-user-response', data: { error: null, id: localId, username: pl.username } });
                    break;
                }

                case 'create-lobby': {
                    const pl = msg.data as LobbyCreationPayload;
                    const client = state.getClient(localId);
                    if (!client) { safeSend(ws, { type: 'create-lobby-response', data: { error: 'Unknown user' } }); break; }
                    const result = state.createLobby(localId, pl.name, pl.capacity);
                    if (!result.ok) safeSend(ws, { type: 'create-lobby-response', data: { error: result.error } });
                    else safeSend(ws, { type: 'create-lobby-response', data: { error: null, lobby: (result.lobby ? state.getLobbyBare(result.lobby.id) : null) } });
                    break;
                }

                case 'join-lobby': {
                    const pl = msg.data as LobbyJoinPayload;
                    const res = state.joinLobby(pl.lobbyId, localId);
                    safeSend(ws, { type: 'join-lobby-response', data: { error: res.ok ? null : res.error, lobby: res.lobby } });
                    break;
                }

                case 'leave-lobby': {
                    // we don't need payload here; find and remove from any lobby they are in
                    for (const l of state.getLobbiesSummary().lobbies) {
                        // summary doesn't include clients so we can't use it — instead iterate state internals via helper
                        const lobbyBare = state.getLobbyBare(l.id);
                        if (lobbyBare && lobbyBare.clients.find((c: any) => c.id === localId)) {
                            state.leaveLobby(l.id, localId);
                            safeSend(ws, { type: 'leave-lobby-response', data: { error: null } });
                            break;
                        }
                    }
                    break;
                }

                case 'start-game': {
                    // find lobby that the user owns
                    // simplified approach: iterate known lobbies and check for ownership
                    let ownedLobbyId: UUID | null = null;
                    for (const s of state.getLobbiesSummary().lobbies) {
                        const l = state.getLobbyBare(s.id);
                        if (!l) continue;
                        const owner = l.clients.find((c: any) => c.id === localId && c.isOwner);
                        if (owner) { ownedLobbyId = s.id; break; }
                    }

                    if (!ownedLobbyId) { safeSend(ws, { type: 'start-game-response', data: { error: 'You are not owner of any lobby' } }); break; }

                    const res = state.startGameFromLobby(ownedLobbyId);
                    if (!res.ok) safeSend(ws, { type: 'start-game-response', data: { error: res.error } });
                    else safeSend(ws, { type: 'start-game-response', data: { error: null, gameId: res.gameId } });
                    break;
                }

                case 'leave-game':
                    const { gameId } = msg.data as { gameId: UUID };

                    state.handleGameLeave(localId, gameId);
                    break;

                case 'choose-number': {
                    const { gameId, chosen } = msg.data as { gameId: UUID; chosen: number };
                    const game = state.getGame(gameId);
                    if (!game) { safeSend(ws, { type: 'choose-number-response', data: { error: 'Game not found' } }); break; }
                    const ok = game.chooseNumber(localId, chosen);
                    safeSend(ws, { type: 'choose-number-response', data: { error: ok ? null : 'Invalid choice' } });
                state.cleanupGames();
                state.evaluateGameCleanup(gameId);
                    break;
                }

                case 'get-lobbies': {
                    safeSend(ws, { type: 'get-lobbies-response', data: state.getLobbiesSummary() });
                    break;
                }

                case 'recover-user': {
                    const { id } = msg.data as { id: UUID };
                    const result = state.recoverConnection(id, ws);
                    if (!result.ok) { safeSend(ws, { type: 'recover-user-response', data: { error: 'Unknown user' } }); break; }

                    localId = id;

                    if (result.inLobby) safeSend(ws, { type: 'lobby-update', data: { lobby: state.getLobbyBare(result.inLobby.id) } });
                    if (result.inGame) safeSend(ws, { type: 'game-info', data: result.inGame.gatherInfo() });

                    safeSend(ws, { type: 'recover-user-response', data: { error: null } });
                    break;
                }

                default:
                    safeSend(ws, { type: 'error', message: 'Unknown message type' });
            }

            state.cleanupGames();
        } catch (err) {
            console.error(err);
            safeSend(ws, { type: 'error', message: 'server error' });
        }
    });

    ws.on('close', () => {
        console.log('[WS] connection closed');
        state.handleSocketClosure(localId, ws);
    });
});

console.log(`WebSocket server running on ws://localhost:${PORT}`);
