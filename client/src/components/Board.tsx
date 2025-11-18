export function Board() {
    return (
        <div className="player-board">
            {Array.from({ length: 16 }).map((_, i) => (
                <div key={i} className="num">
                    {i + 1}
                </div>
            ))}
        </div>
    );
}