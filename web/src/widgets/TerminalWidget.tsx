import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { TerminalGhostSuggestion } from "@/components/TerminalGhostSuggestion";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { usePersonalization } from "@/theme";
import {
  buildXtermTheme,
  resolveTerminalAppearance,
  type XtermTerminalTheme,
} from "@/theme/terminal-theme";
import {
  MAX_SESSION_RECONNECT_ATTEMPTS,
  type ServerSession,
} from "@/lib/sessions";
import {
  dispatchSessionStatusMessage,
  registerSessionStatusTransport,
} from "@/lib/session-status-bridge";
import { registerTerminalRunner } from "@/lib/terminal-bridge";
import {
  applyInputToDraft,
  buildCompletionPayload,
  findTerminalSuggestions,
  pushTerminalHistory,
  resolveInputPartial,
  shouldSyncDraftFromEcho,
  syncDraftFromTerminal,
} from "@/lib/terminal-suggestions";
import { cn } from "@/lib/utils";
import type { SessionCloseReason, TerminalWidgetProps } from "./types";
import "@xterm/xterm/css/xterm.css";

function decodeWsPayload(data: string | Blob | ArrayBuffer): string | Promise<string> {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }
  if (data instanceof Blob) {
    return data.text();
  }
  return String(data);
}

function resolveSessionError(
  code: string | undefined,
  message: string | undefined,
  t: (key: string) => string,
): string {
  switch (code) {
    case "ssh_password_rejected":
      return t("session.passwordIncorrect");
    case "ssh_publickey_rejected":
      return t("session.publicKeyAuthFailed");
    case "ssh_auth_failed":
      return t("session.authFailed");
    default:
      return message ?? t("session.connectFailed");
  }
}

function isAuthFailureCode(code: string | undefined): boolean {
  return (
    code === "ssh_password_rejected" ||
    code === "ssh_publickey_rejected" ||
    code === "ssh_auth_failed"
  );
}

function parseControlMessage(
  data: string,
  t: (key: string) => string,
): {
  kind: "ignore" | "error" | "ready";
  message?: string;
  authFailed?: boolean;
} | null {
  if (!data.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(data) as {
      type?: string;
      code?: string;
      message?: string;
    };
    if (parsed.type === "error") {
      return {
        kind: "error",
        message: resolveSessionError(parsed.code, parsed.message, t),
        authFailed: isAuthFailureCode(parsed.code),
      };
    }
    if (
      parsed.type === "status" &&
      (parsed.message?.includes("Shell 已就绪") ||
        parsed.message?.includes("Shell ready") ||
        parsed.message?.includes("认证成功") ||
        parsed.message?.includes("authenticated"))
    ) {
      return { kind: "ready" };
    }
    return { kind: "ignore" };
  } catch {
    return null;
  }
}

interface SessionPaneProps {
  session: ServerSession;
  active: boolean;
  onStatusChange: (status: ServerSession["status"]) => void;
  onClosed: (reason?: SessionCloseReason) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  xtermTheme: XtermTerminalTheme;
}

function SessionPane({
  session,
  active,
  onStatusChange,
  onClosed,
  t,
  xtermTheme,
}: SessionPaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const [terminalInstance, setTerminalInstance] = useState<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const runCommandRef = useRef<(command: string) => boolean>(() => false);
  const onStatusChangeRef = useRef(onStatusChange);
  const onClosedRef = useRef(onClosed);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [partial, setPartial] = useState("");
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const suggestionsRef = useRef<string[]>([]);
  const activeSuggestionIndexRef = useRef(0);
  const draftRef = useRef("");
  suggestionsRef.current = suggestions;
  activeSuggestionIndexRef.current = activeSuggestionIndex;
  onStatusChangeRef.current = onStatusChange;
  onClosedRef.current = onClosed;

  const updateSuggestions = (nextPartial: string) => {
    const nextSuggestions = findTerminalSuggestions(
      session.serverId,
      nextPartial,
    );
    setPartial(nextPartial);
    setSuggestions(nextSuggestions);
    setActiveSuggestionIndex(0);
  };

  const readInputState = () => {
    const terminal = terminalRef.current;
    const draft = draftRef.current;
    if (!terminal) {
      return draft;
    }
    return resolveInputPartial(terminal, draft);
  };

  const applySuggestion = (suggestion: string) => {
    const terminal = terminalRef.current;
    const ws = wsRef.current;
    if (!terminal || !ws || ws.readyState !== WebSocket.OPEN) return;
    const partial = readInputState();
    const completion = buildCompletionPayload(partial, suggestion);
    if (!completion) return;
    ws.send(completion.payload);
    draftRef.current = completion.nextDraft;
    updateSuggestions(draftRef.current);
  };

  useEffect(() => {
    return registerTerminalRunner(session.sessionId, (command) =>
      runCommandRef.current(command),
    );
  }, [session.sessionId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const terminal = new Terminal({
      allowTransparency: true,
      cursorBlink: true,
      convertEol: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      // Lift truecolor / low-contrast paste echo on transparent backgrounds.
      minimumContrastRatio: 4.5,
      theme: xtermTheme,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    setTerminalInstance(terminal);

    return () => {
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      setTerminalInstance(null);
    };
  }, [session.sessionId]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.theme = xtermTheme;
  }, [xtermTheme]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}${session.wsUrl}`);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;
    onStatusChangeRef.current("connecting");
    terminal.reset();
    draftRef.current = "";
    const reconnectAttempt = session.reconnectAttempt;
    if (reconnectAttempt && reconnectAttempt > 0) {
      terminal.writeln(
        t("session.reconnecting", {
          current: reconnectAttempt,
          max: MAX_SESSION_RECONNECT_ATTEMPTS,
        }),
      );
    } else {
      terminal.writeln(t("session.connectingSsh"));
    }

    let disposed = false;
    let closeReason: SessionCloseReason | undefined;

    const sendResize = () => {
      const fitAddon = fitAddonRef.current;
      const term = terminalRef.current;
      if (!fitAddon || !term || ws.readyState !== WebSocket.OPEN) return;
      fitAddon.fit();
      ws.send(
        JSON.stringify({
          type: "resize",
          cols: term.cols,
          rows: term.rows,
        }),
      );
    };

    runCommandRef.current = (command: string) => {
      const term = terminalRef.current;
      const currentWs = wsRef.current;
      if (!term || !currentWs || currentWs.readyState !== WebSocket.OPEN) {
        return false;
      }
      const normalized = command.replace(/\r\n/g, "\n");
      term.write(`\x1b[0m${normalized.replace(/\n/g, "\r\n")}\r\n`);
      currentWs.send(`${normalized}\n`);
      return true;
    };

    ws.onopen = () => {
      sendResize();
    };

    const unregisterStatusTransport = registerSessionStatusTransport(
      session.sessionId,
      (payload) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        }
      },
      () => ws.readyState === WebSocket.OPEN,
    );

    ws.onclose = () => {
      if (disposed) return;
      if (closeReason !== "auth_failed") {
        terminal.writeln(`\r\n${t("session.disconnected")}`);
      }
      onStatusChangeRef.current(closeReason === "auth_failed" ? "error" : "closed");
      onClosedRef.current(closeReason);
    };

    ws.onerror = () => {
      if (disposed || closeReason === "auth_failed") return;
      onStatusChangeRef.current("error");
      terminal.writeln(`\r\n${t("session.wsFailed")}`);
    };

    let ready = false;
    ws.onmessage = (event) => {
      void (async () => {
        const data = await decodeWsPayload(event.data);
        if (data.startsWith("{")) {
          if (dispatchSessionStatusMessage(session.sessionId, data)) {
            return;
          }
        }
        const control = parseControlMessage(data, t);
        if (control) {
          if (control.kind === "error") {
            onStatusChangeRef.current("error");
            terminal.writeln(`\r\n${control.message ?? t("session.connectFailed")}`);
            if (control.authFailed) {
              closeReason = "auth_failed";
            }
            return;
          }
          if (control.kind === "ready" && !ready) {
            ready = true;
            onStatusChangeRef.current("open");
            terminal.reset();
            draftRef.current = "";
            sendResize();
            return;
          }
          return;
        }
        terminal.write(data);
        if (shouldSyncDraftFromEcho(data)) {
          const prev = draftRef.current;
          draftRef.current = syncDraftFromTerminal(terminal, draftRef.current);
          if (draftRef.current !== prev) {
            updateSuggestions(draftRef.current);
          }
        }
      })();
    };

    const onData = terminal.onData((input) => {
      if (input.includes("\r") || input === "\n") {
        const command = draftRef.current.trim();
        if (command) {
          pushTerminalHistory(session.serverId, command);
        }
        draftRef.current = "";
        setSuggestions([]);
        setPartial("");
        setActiveSuggestionIndex(0);
      } else {
        draftRef.current = applyInputToDraft(draftRef.current, input);
        updateSuggestions(draftRef.current);
      }

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(input);
      }
    });

    terminal.attachCustomKeyEventHandler((event) => {
      const wsCurrent = wsRef.current;
      const term = terminalRef.current;
      if (!term || !wsCurrent || wsCurrent.readyState !== WebSocket.OPEN) {
        return true;
      }

      const currentSuggestions = suggestionsRef.current;
      const suggestionIndex = activeSuggestionIndexRef.current;

      if (
        currentSuggestions.length > 0 &&
        event.key === "ArrowUp" &&
        suggestionIndex > 0
      ) {
        event.preventDefault();
        setActiveSuggestionIndex((index) => Math.max(index - 1, 0));
        return false;
      }

      if (
        currentSuggestions.length > 0 &&
        event.key === "ArrowDown" &&
        suggestionIndex > 0 &&
        suggestionIndex < currentSuggestions.length - 1
      ) {
        event.preventDefault();
        setActiveSuggestionIndex((index) =>
          Math.min(index + 1, currentSuggestions.length - 1),
        );
        return false;
      }

      if (
        event.key === "Tab" &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey
      ) {
        const current = readInputState();
        draftRef.current = current;
        const matches = findTerminalSuggestions(session.serverId, current);
        if (matches.length === 0) return true;

        event.preventDefault();
        const pick =
          matches[activeSuggestionIndexRef.current] ?? matches[0] ?? "";
        if (pick) applySuggestion(pick);
        return false;
      }

      return true;
    });

    return () => {
      disposed = true;
      onData.dispose();
      terminal.attachCustomKeyEventHandler(() => true);
      unregisterStatusTransport();
      ws.close();
      wsRef.current = null;
      runCommandRef.current = () => false;
    };
  }, [session.serverId, session.sessionId, session.wsUrl, t]);

  useEffect(() => {
    if (!active) return;
    const fitAddon = fitAddonRef.current;
    const ws = wsRef.current;
    const terminal = terminalRef.current;
    if (!fitAddon || !terminal) return;

    fitAddon.fit();
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "resize",
          cols: terminal.cols,
          rows: terminal.rows,
        }),
      );
    }
  }, [active]);

  return (
    <div
      ref={hostRef}
      className={cn(
        "terminal-widget-host absolute inset-0 overflow-hidden p-1",
        !active && "invisible pointer-events-none",
      )}
    >
      <div ref={containerRef} className="h-full w-full" />
      {active && partial.length > 0 && suggestions.length > 0 && (
        <TerminalGhostSuggestion
          activeIndex={activeSuggestionIndex}
          hostRef={hostRef}
          partial={partial}
          suggestions={suggestions}
          terminal={terminalInstance}
        />
      )}
    </div>
  );
}

function sessionTabStatusClass(status: ServerSession["status"]): string {
  if (status === "open") return "bg-[var(--color-primary)]";
  if (status === "connecting") return "bg-[var(--color-muted-foreground)] animate-pulse";
  if (status === "error") return "bg-[var(--color-destructive)]";
  return "bg-[var(--color-muted-foreground)]/40";
}

export function TerminalWidget({
  serverSessions,
  allSessions,
  activeServerId,
  activeSessionId,
  onSelectSession,
  onAddTerminal,
  onCloseTerminal,
  onSessionStatusChange,
  onSessionClosed,
  onStatusChange,
}: TerminalWidgetProps) {
  const { t } = useI18n();
  const { resolvedTerminalColors, resolvedTheme, terminalTheme } =
    usePersonalization();
  const xtermTheme = useMemo(
    () =>
      buildXtermTheme(
        resolvedTerminalColors,
        resolveTerminalAppearance(
          terminalTheme,
          resolvedTheme,
          resolvedTerminalColors,
        ),
      ),
    [resolvedTerminalColors, resolvedTheme, terminalTheme],
  );
  const activeSession = serverSessions.find(
    (session) => session.sessionId === activeSessionId,
  );

  useEffect(() => {
    onStatusChange?.(activeSession?.status ?? "idle");
  }, [activeSession?.status, onStatusChange]);

  return (
    <div className="relative flex h-full min-h-0 flex-col p-3">
      {!activeServerId && (
        <p className="mb-2 text-sm text-[var(--color-muted-foreground)]">
          {t("terminal.emptyHint")}
        </p>
      )}

      {activeServerId && (
        <div className="mb-2 flex min-h-8 items-center gap-1 overflow-x-auto">
          {serverSessions.map((session, index) => {
            const isActive = session.sessionId === activeSessionId;
            return (
              <div
                key={session.sessionId}
                className={cn(
                  "flex h-7 shrink-0 items-center gap-1 rounded border px-2 text-xs",
                  isActive
                    ? "border-[var(--color-primary)] bg-[color-mix(in_oklch,var(--color-primary)_12%,transparent)]"
                    : "border-[var(--color-border)] bg-[var(--color-secondary)]",
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-1.5"
                  onClick={() => onSelectSession(session.sessionId)}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      sessionTabStatusClass(session.status),
                    )}
                  />
                  <span className="truncate">
                    {t("terminal.tab", { index: index + 1 })}
                  </span>
                </button>
                <button
                  type="button"
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                  title={t("terminal.closeTab")}
                  onClick={() => onCloseTerminal(session.sessionId)}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
          <Button
            className="h-7 shrink-0 px-2"
            size="sm"
            title={t("terminal.newTab")}
            variant="secondary"
            onClick={onAddTerminal}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {activeServerId && serverSessions.length > 0 && (
        <p className="mb-2 text-[11px] text-[var(--color-muted-foreground)]">
          {t("terminal.suggestHint")}
        </p>
      )}

      {activeServerId && serverSessions.length === 0 && (
        <p className="mb-2 text-sm text-[var(--color-muted-foreground)]">
          {t("terminal.noTabsHint")}
        </p>
      )}

      <div className="relative min-h-0 flex-1">
        {allSessions.map((session) => (
          <SessionPane
            key={session.sessionId}
            active={
              session.serverId === activeServerId &&
              session.sessionId === activeSessionId
            }
            xtermTheme={xtermTheme}
            session={session}
            t={t}
            onClosed={(reason) => onSessionClosed(session.sessionId, reason)}
            onStatusChange={(status) =>
              onSessionStatusChange(session.sessionId, status)
            }
          />
        ))}
      </div>
    </div>
  );
}
