import React, { useEffect, useState } from "react";

interface Props {
    message: string;
    onClose: () => void;
    timeoutMS: number;
}

export const Toast: React.FC<Props> = ({ message, timeoutMS, onClose }) => {
    const [visible, setVisible] = useState<boolean>(true);

    useEffect(() => {
        const fadeoutCountdown = setTimeout(() => setVisible(false), timeoutMS - 500);
        const timeout = setTimeout(onClose, timeoutMS);
        return () => {
            clearTimeout(fadeoutCountdown);
            clearTimeout(timeout);
        }
    }, [onClose]);

    return (
        <div className={`card toast ${!visible && "fade-out"}`}
        >
            {message}
        </div>
    );
};