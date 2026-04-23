import { useRef, useState, useEffect } from "react";

export default function AnimatedCollapse({ open, children }) {
    const ref = useRef(null);
    const [height, setHeight] = useState(open ? "auto" : "0px");

    useEffect(() => {
        if (!ref.current) return;
        if (open) {
            setHeight(ref.current.scrollHeight + "px");
            const t = setTimeout(() => setHeight("auto"), 200);
            return () => clearTimeout(t);
        } else {
            setHeight(ref.current.scrollHeight + "px");
            requestAnimationFrame(() => setHeight("0px"));
        }
    }, [open]);

    return (
        <div
            ref={ref}
            style={{ height, overflow: "hidden", transition: "height 200ms ease" }}
        >
            {children}
        </div>
    );
}
