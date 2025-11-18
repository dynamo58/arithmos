import { useEffect, useRef, useState } from "react";
import type { Lobby, Client, GameInfo, LobbyInfo } from "./types";
import "./styles.css";

const getUsername = () => {
    let name;
    while (!name) name = window.prompt("Choose a username:");
    return name;
};

export default function App() {
    const diceAudio = useRef<HTMLAudioElement | null>(null);
    const tadaAudio = useRef<HTMLAudioElement | null>(null);
    const introAudio = useRef<HTMLAudioElement | null>(null);

    const wsRef = useRef<WebSocket | null>(null);

    const [user, setUser] = useState<Client | null>(null);

    const [lobbies, setLobbies] = useState<LobbyInfo[]>([]);
    const [lobbyName, setLobbyName] = useState("");
    const [lobbyCapacity, setLobbyCapacity] = useState(2);

    const [currentLobby, setCurrentLobby] = useState<Lobby | null>(null);

    const [game, setGame] = useState<GameInfo | null>(null);

    const [timer, setTimer] = useState(15);
    const timerRef = useRef<number | null>(null);

    const [showHelp, setShowHelp] = useState(false);

    useEffect(() => {
        if (diceAudio.current) diceAudio.current.volume = 0.4;

        const ws = new WebSocket("ws://localhost:3000");
        wsRef.current = ws;

        ws.onopen = () => {
            send("subscribe-to-menu-updates", {});
            const username = getUsername();
            send("new-user", { username });
        };

        ws.onmessage = (ev) => handleMessage(JSON.parse(ev.data));
        ws.onerror = (err) => console.error(err);

        return () => ws.close();
    }, []);

    function send(type: string, data: any) {
        wsRef.current?.send(JSON.stringify({ type, data }));
    }

    function handleMessage(msg: any) {
        switch (msg.type) {
            case "new-user-response":
                if (!msg.data.error) setUser(msg.data);
                break;

            case "get-lobbies-response":
                setLobbies(msg.data);
                break;

            case "create-lobby-response":
            case "join-lobby-response":
                if (!msg.data.error) setCurrentLobby(msg.data.lobby);
                break;

            case "lobby-update":
                setCurrentLobby(msg.data.lobby);
                break;

            case "game-over":
                tadaAudio.current?.play().catch(() => { });
                alert(`${msg.data.winner.username} won!`);
                setGame(null);
                break;

            case "game-info":
                setGame(msg.data);
                resetTimer();
                setCurrentLobby(null);
                (diceAudio.current || introAudio.current)?.play().catch(() => { });
                break;

            case "choose-number-response":
                if (msg.data.error) alert(msg.data.error);
                break;
        }
    }

    function resetTimer() {
        if (timerRef.current) clearInterval(timerRef.current);
        setTimer(15);
        timerRef.current = window.setInterval(() => {
            setTimer((t) => {
                if (t <= 1) {
                    clearInterval(timerRef.current!);
                    return 0;
                }
                return t - 1;
            });
        }, 1000);
    }

    if (!user)
        return <div></div>;

    // ------------------ GAME UI ------------------
    if (game) {
        const turnPlayer = game.players.find((p) => p.id === game.turnPlayerId)!;
        const myTurn = user.id === turnPlayer.id;

        return (
            <div id="app">
                <audio ref={diceAudio} src="/dice.mp3" />
                <audio ref={tadaAudio} src="/tada.mp3" />
                <audio ref={introAudio} src="/intro.mp3" />

                <h3>{myTurn ? "Your turn" : `${turnPlayer.username}'s turn`}</h3>

                <p className="dice">
                    Dice: {game.roll[0]} {game.roll[1]} {game.roll[2]}
                </p>

                <p>Time left: {timer}s</p>

                {myTurn && (
                    <div>
                        <input
                            type="number"
                            placeholder="Choose 1–16"
                            min={1}
                            max={16}
                            id="chosenNumber"
                            style={{ width: "8em" }}
                        />
                        <button
                            onClick={() => {
                                const chosen = parseInt(
                                    (document.getElementById("chosenNumber") as HTMLInputElement)
                                        .value
                                );
                                if (!chosen) return;
                                send("choose-number", { gameId: game.id, chosen });
                            }}
                        >
                            Lock Number
                        </button>
                    </div>
                )}

                {[...game.players]
                    .sort((a, b) => (a.id === user.id ? -1 : b.id === user.id ? 1 : 0))
                    .map((p) => (
                        <div key={p.id} className="card">
                            <h3>{p.id === user.id ? "Your Board" : `${p.username}'s Board`}</h3>

                            <div className="board-grid">
                                {Array.from({ length: 16 }, (_, i) => i + 1).map((n) => (
                                    <div
                                        key={n}
                                        className={
                                            "num-tile " + (p.board.includes(n) ? "locked" : "")
                                        }
                                    >
                                        {n}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
            </div>
        );
    }

    // ------------------ LOBBY UI ------------------
    if (currentLobby) {
        const isHost = currentLobby.clients.find((c) => c.isOwner)!.id === user.id;

        return (
            <div id="app">
                <audio ref={diceAudio} src="/dice.mp3" />
                <audio ref={tadaAudio} src="/tada.mp3" />
                <audio ref={introAudio} src="/intro.mp3" />

                <h2>Lobby: {currentLobby.name}</h2>

                <div className="card">
                    <h3>Players</h3>
                    <ul>
                        {currentLobby.clients.map((c) => (
                            <li key={c.id}>
                                {c.username} {c.isOwner && "(owner)"}
                            </li>
                        ))}
                    </ul>
                </div>

                {isHost && (
                    <button onClick={() => send("start-game", {})}>Start Game</button>
                )}
            </div>
        );
    }

    // ------------------ MENU UI ------------------
    return (
        <div id="app">
            <h2>Welcome, {user.username}.</h2>

            <button
                className="button-aqua"
                onClick={() => setShowHelp((prev) => !prev)}
                style={{ marginBottom: 10 }}
            >
                {showHelp ? "Hide Help" : "How to Play"}
            </button>

            {showHelp && (
                <div className="info-box">
                    <h3>How to Play</h3>
                    <ul>
                        <li>Join a lobby or create your own.</li>
                        <li>Wait for the game to start.</li>
                        <li>Players roll 3 dice.</li>
                        <li>If it is your turn, create a number (1–16) like so:
                            <ul>
                                <li>Put the numbers in any order.</li>
                                <li>Put parenthesis around them as you wish.</li>
                                <li>Apply +, -, × between the numbers.</li>
                            </ul>
                        </li>
                        <li>First to lock in all numbers 1–16 wins.</li>
                    </ul>
                </div>
            )}

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
                    min={2}
                    max={6}
                />
                <button onClick={() => send("create-lobby", { name: lobbyName, capacity: lobbyCapacity })}>
                    Create
                </button>
            </div>

            <div className="card">
                <h3>Available Lobbies</h3>
                {lobbies.length === 0 && <i>No lobbies yet</i>}

                {lobbies.map((lobby) => (
                    <div key={lobby.id} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                        <span>
                            {lobby.name} ({lobby.capacity[0]}/{lobby.capacity[1]})
                        </span>
                        <button
                            className="button-secondary"
                            onClick={() => send("join-lobby", { lobbyId: lobby.id })}
                        >
                            Join
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
