import React, { useEffect, useState } from "react";

export function generateUsername(): string {
    const names = [
        "Euclid",
        "Pythagoras",
        "Archimedes",
        "Eratosthenes",
        "Hypatia",

        "AlKhwarizmi",
        "IbnSina",
        "AlHaytham",
        "IbnQurra",
        "AlBiruni",

        "Fibonacci",
        "Oresme",
        "Cardano",
        "Descartes",
        "Kepler",
    ];

    const name = names[Math.floor(Math.random() * names.length)];
    const number = Math.floor(Math.random() * 900 + 100);
    return `${name}${number}`;
}


type Props = {
    send: (type: string, data: any) => void;
    notify: (msg: string) => void;
};

export const Login: React.FC<Props> = ({ send, notify }) => {
    const [chosen, setChosen] = useState<string>(generateUsername());

    const handleNicknameSubmit = () => {
        if (chosen.length === 0) {
            return;
        }

        if (chosen.length > 16) {
            notify("Nickname too long");
            return;
        }

        send("new-user", { username: chosen });
    };

    useEffect(() => {
        const last = localStorage.getItem("last_username");

        if (last !== null) {
            setChosen(last);
        }
    }, []);

    return (<>
        <div style={{
            width: "100%",
            height: "100%",
            display: "flex",
            justifyContent: "center"
        }}>
            <div>
                <img src="/euclid.png" style={{ display: "block", height: "7em", width: "7em", marginLeft: "auto", marginRight: "auto", borderRadius: "1000em" }} />
                <br />
                <br />
                <input
                    placeholder="Choose a nickname"
                    id="chosenNickname"
                    value={chosen}
                    onChange={(e) => { setChosen(e.target.value) }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            handleNicknameSubmit();
                        }
                    }}
                />
                <button onClick={handleNicknameSubmit}>
                    Choose nickname
                </button>
            </div>
        </div>
    </>)
};

export default Login;