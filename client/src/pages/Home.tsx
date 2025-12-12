import React, { useState } from "react";
import type { LobbySummary } from "../types";


type Props = {
    send: (type: string, data: any) => void;
    lobbies: LobbySummary[];
    username: string;
    activeGames: number;
    resetConnection(): void,
};

export const Home: React.FC<Props> = ({ lobbies, username, send, resetConnection, activeGames }) => {
    const [showHelp, setShowHelp] = useState(false);
    const [lobbyName, setLobbyName] = useState("");
    const [lobbyCapacity, setLobbyCapacity] = useState(4);

    return (
        <>
            <h2 style={{ textAlign: "center" }}>Welcome, {username}.</h2>

            <div style={{ marginBottom: "24px" }}>
                <button
                    className="button-aqua"
                    onClick={() => resetConnection()}
                >Change nickname</button>
                <br />
                <button
                    className="button-aqua"
                    onClick={() => setShowHelp((prev) => !prev)}
                    style={{ marginBottom: 10 }}
                >
                    {showHelp ? "Hide Help" : "How to Play"}
                </button>
            </div>


            {
                showHelp && (
                    <div className="info-box">
                        <h3>How to Play</h3>
                        <ul>
                            <li>Join a lobby or create your own.</li>
                            <li>Wait for the game to start.</li>
                            <li>Each turn 3 dice are cast.</li>
                            <li>If it is your turn, create a number (1–16) like so:
                                <ul>
                                    <li>Put the numbers in any order.</li>
                                    <li>Put parenthesis around them as you wish.</li>
                                    <li>Apply +, -, × between the numbers.</li>
                                </ul>
                            </li>
                            <li>For example, if one is given (2,4,6), they may create:
                                <ul>
                                    <li>2+4+6=12,</li>
                                    <li>2-4+6=4,</li>
                                    <li>6+(4*2)=14,</li>
                                    <li>etc.</li>
                                </ul>
                            </li>
                            <li>First to lock in all numbers 1–16 wins.</li>
                        </ul>
                    </div>
                )
            }

            <div className="card">
                <h3>Create Lobby</h3>
                <input
                    value={lobbyName}
                    onChange={(e) => setLobbyName(e.target.value)}
                    placeholder="Lobby name"
                />
                <input
                    type="number"
                    value={lobbyCapacity}
                    onChange={(e) => setLobbyCapacity(parseInt(e.target.value))}
                    min={1}
                    max={16}
                />
                <button onClick={() => send(
                    "create-lobby", {
                    name: lobbyName,
                    capacity: lobbyCapacity
                }
                )}>
                    Create
                </button>
            </div>

            <div className="card">
                <h3>Available Lobbies</h3>
                <p style={{ marginTop: 0, color: "#bdae93" }}>Active games: {activeGames}</p>
                {lobbies.length === 0 && <i>No lobbies yet</i>}

                {lobbies.map((lobby) => (
                    <div key={lobby.id} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                        <span>
                            {lobby.name} ({lobby.capacity[0]}/{lobby.capacity[1]})
                        </span>
                        <button
                            className="button-secondary"
                            onClick={() => send("join-lobby",
                                { lobbyId: lobby.id }
                            )}
                        >
                            Join
                        </button>
                    </div>
                ))}
            </div>
        </>);
};

export default Home;