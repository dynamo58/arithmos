import React from "react";
import type { LobbyFullInfo, UUID } from "../types";


type Props = {
    send: (type: string, data: any) => void;
    lobby: LobbyFullInfo;
    uid: UUID;
};

export const Lobby: React.FC<Props> = ({ lobby, uid, send }) => {
    const isHost = lobby.clients.find((c) => c.isOwner)!.id === uid;

    return (<>
        <h2>Lobby: {lobby.name}</h2>

        <div className="card">
            <h3>Players</h3>
            <ul>
                {lobby.clients.map((c) => (
                    <li key={c.id}>
                        {c.username} {c.isOwner && "(owner)"}
                    </li>
                ))}
            </ul>
        </div>

        {isHost && (
            <button onClick={() => send("start-game", {})}>Start Game</button>
        )}
        <button onClick={() => send("leave-lobby", {})}>Leave</button>
    </>)
};

export default Lobby;