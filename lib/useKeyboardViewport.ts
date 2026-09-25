"use client";

import { useEffect, useState } from "react";

export interface ViewportBox {
  top: number;
  height: number;
}

// On mobile (iOS Safari, Android Chrome) the on-screen keyboard shrinks only the
// *visual* viewport; `fixed inset-0` stays sized to the layout viewport, so the
// browser pans the whole page to reveal the focused input and the sheet slides
// up off-screen. Track the visual viewport while the keyboard is open so the
// sheet can sit exactly in the visible area above the keyboard.
export function useKeyboardViewport(active: boolean): ViewportBox | null {
  const [box, setBox] = useState<ViewportBox | null>(null);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!active || !vv) return;

    const update = () => {
      const layoutHeight = document.documentElement.clientHeight;
      const keyboardOpen = layoutHeight - vv.height > 80;
      setBox(keyboardOpen ? { top: vv.offsetTop, height: vv.height } : null);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setBox(null);
    };
  }, [active]);

  return box;
}
