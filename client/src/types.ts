export type UUID = string;

export type WSMessage =
    | { type: "new-user-response"; data: { id: string; username: string; token: string; error?: string } }
    | { type: "auth-response"; data: { error?: string } }
    | { type: "get-lobbies-response"; data: LobbyFullInfo[] }
    | { type: "create-lobby-response"; data: { id: string; name: string; error?: string } }
    | { type: "join-lobby-response"; data: { lobby: LobbyFullInfo; error?: string } }
    | { type: "game-start"; data: { gameId: string } }
    | { type: "game-turn-start"; data: { playerId: string; dice: number[] } }
    | { type: "number-locked"; data: { playerId: string; chosen: number } }
    | { type: "game-over"; data: { winnerId: string } };

export interface Client {
    username: string;
    id: UUID;
}

export interface LobbyFullInfo {
    id: UUID;
    name: string,
    capacity: number,
    clients: (Client & { isOwner: boolean })[];
}

export interface Player {
    id: UUID,
    username: string,
    board: number[],
}

export interface GameInfo {
    id: UUID,
    players: Player[],
    isOver: boolean,
    roll: [number, number, number],
    turnPlayerId: UUID,
}

export interface LobbySummary {
    id: string;
    name: string;
    capacity: [number, number];
}

export interface MenuSnapshot {
    lobbies: LobbySummary[];
    activeGames: number;
}
