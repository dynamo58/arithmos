import type { LobbyInfo } from "../types";

interface Props {
    lobbies: LobbyInfo[];
    currentLobby: LobbyInfo | null;
    onCreate: (d: { name: string; capacity: number; password: string | null }) => void;
    onJoin: (lobbyId: string) => void;
}

export function LobbySection({ lobbies, onCreate, onJoin }: Props) {
    function create() {
        const nameInput = document.getElementById("lobby-name") as HTMLInputElement;
        const capInput = document.getElementById("lobby-capacity") as HTMLInputElement;

        onCreate({
            name: nameInput.value.trim(),
            capacity: parseInt(capInput.value),
            password: null,
        });
    }

    return (
        <section>
            <div style={{ border: "1px solid #fff", padding: "1em", borderRadius: "1em" }}>
                Name: <input id="lobby-name" />
                <br />
                Capacity: <input id="lobby-capacity" type="number" min="2" max="6" defaultValue="2" />
                <br />
                <button onClick={create}>Create</button>
            </div>

            <div style={{ marginTop: "2em" }}>
                {lobbies.length === 0 && <i>No lobbies available</i>}

                {lobbies.map((l) => (
                    <div key={l.id}>
                        {l.name} ({l.capacity})
                        <button onClick={() => onJoin(l.id)}>Join</button>
                    </div>
                ))}
            </div>
        </section>
    );
}