import WebSocket from "ws";


export type UUID = string;

export interface User { username: string; id: UUID }

export interface Client {
    username: string; id: UUID; ws: WebSocket
}

export interface LobbyClient extends Client { isOwner: boolean }

export interface Lobby { id: UUID; name: string; capacity: number; clients: LobbyClient[] }

export interface Player { id: UUID; username: string; board: number[] }

export interface GameInfo { id: UUID; players: Player[]; isOver: boolean; roll: [number, number, number] | null; turnPlayerId: UUID }

export interface Payload { }
export interface NewUserPayload extends Payload { username: string }
export interface LobbyCreationPayload extends Payload { name: string; capacity: number }
export interface LobbyJoinPayload extends Payload { lobbyId: UUID }
export interface LobbyLeavePayload extends Payload { }
export interface StartGamePayload extends Payload { }

export interface WebSocketMessage { type: string; data: any }