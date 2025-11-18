import { useState } from "react";
import { Board } from "./Board";

interface Props {
    gameId: string;
    diceInfo: { playerId: string; dice: number[] } | null;
    onChoose: (n: number) => void;
}

export function GameSection({ diceInfo, onChoose }: Props) {
    const [chosen, setChosen] = useState("");

    return (
        <section>
            <h3>Game</h3>

            {diceInfo && (
                <div id="dice-display">
                    Player {diceInfo.playerId} rolled: 🎲 {diceInfo.dice.join("  ")}
                </div>
            )}

            <input
                type="number"
                value={chosen}
                onChange={(e) => setChosen(e.target.value)}
                placeholder="Enter number 1–16"
            />
            <button onClick={() => onChoose(parseInt(chosen))}>Lock</button>

            <h4>Your Board</h4>
            <Board />
        </section>
    );
}