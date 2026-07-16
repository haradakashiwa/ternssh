import { useEffect, useState } from "react";
import type { Terminal } from "@xterm/xterm";
import {
  getTerminalCursorStyle,
  type TerminalCursorStyle,
} from "@/lib/terminal-cursor-position";
import { completionSuffix } from "@/lib/terminal-suggestions";

interface TerminalGhostSuggestionProps {
  terminal: Terminal | null;
  hostRef: React.RefObject<HTMLElement | null>;
  partial: string;
  suggestions: string[];
  activeIndex: number;
}

export function TerminalGhostSuggestion({
  terminal,
  hostRef,
  partial,
  suggestions,
  activeIndex,
}: TerminalGhostSuggestionProps) {
  const [style, setStyle] = useState<TerminalCursorStyle | null>(null);

  const active = suggestions[activeIndex] ?? suggestions[0] ?? "";
  const suffix =
    active && partial ? completionSuffix(partial, active) : "";

  useEffect(() => {
    if (!terminal || !suffix) {
      setStyle(null);
      return;
    }

    const update = () => {
      setStyle(getTerminalCursorStyle(terminal, hostRef.current));
    };

    const disposables = [
      terminal.onRender(update),
      terminal.onCursorMove(update),
      terminal.onScroll(update),
      terminal.onResize(update),
    ];

    update();
    window.addEventListener("resize", update);

    return () => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
      window.removeEventListener("resize", update);
    };
  }, [terminal, hostRef, suffix, partial, suggestions, activeIndex]);

  if (!suffix || !style) return null;

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute z-10 whitespace-nowrap overflow-hidden text-[var(--color-muted-foreground)] opacity-45"
      style={{
        left: style.left,
        top: style.top,
        maxWidth: style.maxWidth,
        fontSize: style.fontSize,
        lineHeight: `${style.lineHeight}px`,
        fontFamily: style.fontFamily,
      }}
    >
      {suffix}
    </span>
  );
}
