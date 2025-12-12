import { useEffect, useRef, useState } from "react";
import type { LobbyFullInfo, Client, GameInfo, LobbySummary } from "./types";
import Home from "./pages/Home";
import Lobby from "./pages/Lobby";

import "./styles.css";
import Game from "./pages/Game";
import Login from "./pages/Login";
import { Toast } from "./components/Toast";

const WS_URL: string = import.meta.env.MODE === "development"
    ? "ws://127.0.0.1:3000"
    : "wss://arithmos-server.smolik.xyz"

export default function App() {
    const diceAudio = useRef<HTMLAudioElement | null>(null);
    const tadaAudio = useRef<HTMLAudioElement | null>(null);
    const introAudio = useRef<HTMLAudioElement | null>(null);

    const wsRef = useRef<WebSocket | null>(null);

    const [user, setUser] = useState<Client | null>(null);
    const [lobbies, setLobbies] = useState<LobbySummary[]>([]);
    const [activeGames, setActiveGames] = useState<number>(0);
    const [lobby, setLobby] = useState<LobbyFullInfo | null>(null);
    const [game, setGame] = useState<GameInfo | null>(null);

    const [toastMessage, setToastMessage] = useState<string | null>(null);

    useEffect(() => {
        if (diceAudio.current) diceAudio.current.volume = 0.4;

        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            let id = localStorage.getItem("last_id");
            if (id) {
                send("recover-user", { id });
            }
        };
        ws.onmessage = (ev) => handleMessage(JSON.parse(ev.data));
        ws.onerror = (err) => console.error(err);

        return () => ws.close();
    }, []);

    function send(type: string, data: any) {
        wsRef.current?.send(JSON.stringify({ type, data }));
    }

    function resetConnection() {
        localStorage.removeItem("last_id");
        localStorage.removeItem("last_username");
        window.location.reload();
    }

    function handleMessage(msg: any) {
        switch (msg.type) {
            case "new-user-response":
                if (!msg.data.error) {
                    console.log(`Connected as ${msg.data.username}.`);
                    setUser(msg.data);
                    localStorage.setItem("last_username", msg.data.username)
                    localStorage.setItem("last_id", msg.data.id)
                    console.log(`Subbing to menu updates.`);

                    send("subscribe-to-menu-updates", {});
                }
                break;
            case "recover-user-response":
                if (msg.data.error) {
                    console.log(`Connection recovery failed: ${msg.data.error}`)
                }
                break;
            case "get-lobbies-response":
                setLobbies(msg.data.lobbies ?? msg.data);
                setActiveGames(msg.data.activeGames ?? 0);
                break;

            case "create-lobby-response":
            case "join-lobby-response":
                if (!msg.data.error) setLobby(msg.data.lobby);
                else console.log(msg.data.error)
                break;

            case "start-game-response":
                if (msg.data.error) setToastMessage(msg.data.error);
                break;

            case "lobby-update":
                setLobby(msg.data.lobby);
                break;
            case "leave-lobby-response":
                if (!msg.data.error) {
                    setLobby(null);
                } else {
                    console.log(msg.data.error);
                }
                break;

            case "game-over":
                tadaAudio.current?.play().catch(() => { });
                setToastMessage(`${msg.data.winner.username} won!`);
                setGame(null);
                break;

            case "game-info":
                setGame(msg.data);
                setLobby(null);
                (diceAudio.current || introAudio.current)?.play().catch(() => { });
                break;

            case "leave-game-response":
                setGame(null);
                setLobby(null);
                break;

            case "choose-number-response":
                if (msg.data.error) setToastMessage(msg.data.error);
                break;
        }
    }

    return (
        <div id="app">
            <audio ref={diceAudio} src="/dice.mp3" />
            <audio ref={tadaAudio} src="/tada.mp3" />
            <audio ref={introAudio} src="/intro.mp3" />

            {toastMessage && (
                <Toast
                    timeoutMS={2_000}
                    message={toastMessage}
                    onClose={() => setToastMessage(null)}
                />
            )}

            {user && lobby && (<Lobby send={send} uid={user.id} lobby={lobby!} />)}
            {user && game && (<Game send={send} uid={user.id} game={game} />)}
            {(!lobby && !game && user) && (<Home resetConnection={resetConnection} send={send} username={user.username} lobbies={lobbies} activeGames={activeGames} />)}
            {(!game && !lobby && !user) && (<Login send={send} notify={setToastMessage} />)}

        </div>
    );
}
