import React, { useEffect, useRef, useState } from "react";
import type { UUID, GameInfo } from "../types";

type Props = {
    game: GameInfo;
    send: (type: string, data: any) => void;
    uid: UUID;
};

export const Game: React.FC<Props> = ({ game, uid, send }) => {
    const [timer, setTimer] = useState(15);
    const timerRef = useRef<number | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

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

    function submitNumber() {
        const chosen = parseInt(inputRef.current?.value || "");
        if (!chosen) return;

        send("choose-number",
            { gameId: game.id, chosen },
        );
    }

    useEffect(() => {
        resetTimer();
        inputRef.current?.focus();
    }, [game]);

    const turnPlayer = game.players.find((p) => p.id === game.turnPlayerId)!;
    const myTurn = uid === turnPlayer.id;


    return (<>
        <button className="button-aqua" onClick={() => {
            send("leave-game", {});
        }}>Return to menu</button>

        <hr style={{ border: "1px dashed #ebdbb2" }} />

        <h3>{myTurn ? "Your turn" : `${turnPlayer.username}'s turn`}</h3>

        {game.roll && (
            <p className="dice">
                Dice: {game.roll[0]} {game.roll[1]} {game.roll[2]}
            </p>
        )}

        <p>Time left: {timer}s</p>

        <div style={{ visibility: myTurn ? "visible" : "hidden" }}>
            <input
                type="number"
                placeholder="Choose 1–16"
                min={1}
                max={16}
                id="chosenNumber"
                style={{ width: "8em" }}
                ref={inputRef}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        submitNumber();
                    }
                }}
            />
            <button onClick={submitNumber}>
                Lock Number
            </button>
        </div>


        <br />


        {[...game.players]
            .sort((a, b) => (a.id === uid ? -1 : b.id === uid ? 1 : 0))
            .map((p) => (
                <div key={p.id} className="card">
                    <h3>{p.id === uid ? "Your Board" : `${p.username}'s Board`}</h3>

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
            ))
        }
    </>)
};

export default Game;