import { useEffect, useCallback } from "react";

export default function Lightbox({ src, alt, onClose }) {
    const handleKey = useCallback(
        (e) => {
            if (e.key === "Escape") onClose();
        },
        [onClose],
    );

    useEffect(() => {
        document.addEventListener("keydown", handleKey);
        history.pushState(null, "", location.href);
        const onPop = () => onClose();
        window.addEventListener("popstate", onPop);
        return () => {
            document.removeEventListener("keydown", handleKey);
            window.removeEventListener("popstate", onPop);
        };
    }, [handleKey, onClose]);

    if (!src) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 cursor-pointer"
            onClick={onClose}
        >
            <img
                src={src}
                alt={alt || ""}
                className="max-w-[90vw] max-h-[90vh] object-contain"
                onClick={(e) => e.stopPropagation()}
            />
        </div>
    );
}
