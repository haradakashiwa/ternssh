import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n";
import {
  api,
  ApiResponseError,
  type McpAccessState,
  type McpServerChoice,
  type McpTokenInfo,
} from "@/lib/api";

interface McpAccessWidgetProps {
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
}

const desktopClientGuides = [
  {
    client: "claudeCode",
    docs: "https://code.claude.com/docs/en/desktop#connect-external-tools",
    config: {
      type: "http",
      url: "https://ternssh.example/mcp",
      headers: { Authorization: "Bearer ${TERNSSH_CLAUDE_TOKEN}" },
    },
  },
  {
    client: "antigravityIde",
    docs: "https://antigravity.google/docs/mcp?tab=ide",
    config: {
      serverUrl: "https://ternssh.example/mcp",
      headers: { Authorization: "Bearer <ANTIGRAVITY_PAIRING_TOKEN>" },
    },
  },
];

export function McpAccessWidget({ settingsOpen, onSettingsOpenChange }: McpAccessWidgetProps) {
  const t = useT();
  const [state, setState] = useState<McpAccessState | null>(null);
  const [selection, setSelection] = useState<McpAccessState | null>(null);
  const [issued, setIssued] = useState<(McpTokenInfo & { token: string }) | null>(null);
  const [feedback, setFeedback] = useState("");
  const [readError, setReadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const writing = useRef(false);
  const reading = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    reading.current?.abort();
    const request = new AbortController();
    reading.current = request;
    try {
      const current = await api.getMcpAccess(request.signal);
      if (!request.signal.aborted) {
        setState(current);
        setReadError(false);
        setIssued((value) => {
          if (value && current.tokens.some((token) => token.id === value.id)) return value;
          return null;
        });
      }
    } catch {
      if (!request.signal.aborted) {
        setState(null);
        setReadError(true);
      }
    } finally {
      if (reading.current === request) reading.current = null;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const refreshVisible = () => {
      if (document.visibilityState === "visible" && !writing.current && !reading.current) void refresh();
    };
    const timer = window.setInterval(refreshVisible, 15_000);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      mounted.current = false;
      reading.current?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [refresh]);

  async function change<T>(operation: () => Promise<T>, success: (result: T) => void) {
    if (writing.current) return;
    writing.current = true;
    reading.current?.abort();
    setBusy(true);
    setFeedback("");
    try {
      const result = await operation();
      if (mounted.current) success(result);
    } catch (error) {
      if (mounted.current) {
        setSelection(null);
        setFeedback(error instanceof ApiResponseError && error.status === 409
          ? "mcp.changed"
          : "mcp.updateUnconfirmed");
      }
    } finally {
      if (mounted.current) await refresh();
      writing.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function closeSettings() {
    if (writing.current) return;
    setIssued(null);
    setFeedback("");
    onSettingsOpenChange(false);
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback("mcp.copied");
    } catch {
      setFeedback("mcp.copyFailed");
    }
  }

  const endpoint = new URL("/mcp", window.location.origin).href;
  const authorizedIds = new Set(state?.authorizedServerIds);
  const authorized = state?.availableServers.filter((server) => authorizedIds.has(server.id)) ?? [];
  const message = (
    <div role="status" aria-live="polite" className="space-y-2 text-xs">
      {readError && <div>
        <p>{t("mcp.loadFailed")}</p>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void refresh()}>{t("common.refresh")}</Button>
      </div>}
      {feedback && <p>{t(feedback)}</p>}
    </div>
  );

  return (
    <div className="h-full space-y-3 overflow-auto p-3 text-sm">
      <div>
        <h3 className="font-medium">{t("mcp.authorized")}</h3>
        {state && authorized.length > 0 && (
          <ul className="mt-1 space-y-1">
            {authorized.map((server) => <li className="break-all" key={server.id}>{server.name}</li>)}
          </ul>
        )}
        {state && !authorized.length && (
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{t("mcp.empty")}</p>
        )}
        {!state && !readError && <p className="text-xs">{t("security.loading")}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!state || busy} onClick={() => { setFeedback(""); setSelection(state); }}>
          {t("mcp.select")}
        </Button>
        <Button size="sm" variant="secondary" disabled={!state || busy}
          onClick={() => void change(api.endMcpAuthorization, () => setFeedback("mcp.ended"))}>
          {t("mcp.end")}
        </Button>
      </div>
      {!settingsOpen && !selection && message}
      {!!state?.recentCalls.length && <section>
        <h3 className="text-xs font-medium">{t("mcp.recent")}</h3>
        <ul className="mt-1 space-y-1 text-xs text-[var(--color-muted-foreground)]">
          {state.recentCalls.map((call, index) => <li key={index} className="flex flex-wrap gap-x-2">
            <time dateTime={call.at}>{new Date(call.at).toLocaleString()}</time>
            <span>{call.target ?? t("mcp.authorized")}</span>
            <span>{t(`mcp.${call.result}`)}</span>
          </li>)}
        </ul>
      </section>}
      {selection && <McpAuthorizationDialog snapshot={selection} busy={busy}
        onClose={() => { if (!writing.current) setSelection(null); }}
        onConfirm={(servers) => void change(() => api.replaceMcpAuthorization(selection.revision, servers), () => {
          setSelection(null);
          setFeedback("mcp.saved");
        })} />}
      {settingsOpen && <Modal open onOpenChange={closeSettings}>
        <div role="dialog" aria-modal="true" aria-labelledby="mcp-settings-title" className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 id="mcp-settings-title" className="text-lg font-semibold">{t("mcp.settings")}</h2>
            <Button variant="ghost" onClick={closeSettings} disabled={busy}>{t("common.close")}</Button>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="mcp-address">{t("mcp.address")}</label>
            <Input id="mcp-address" value={endpoint} readOnly />
            <Button size="sm" variant="secondary" onClick={() => void copy(endpoint)}>{t("mcp.copyAddress")}</Button>
          </div>
          <section className="space-y-2">
            <h3 className="text-sm font-medium">{t("mcp.tokens")}</h3>
            {state && !state.tokens.length && <p className="text-xs">{t("mcp.noTokens")}</p>}
            <ul className="space-y-2">
              {state?.tokens.map((token) => <li key={token.id} className="flex items-center justify-between gap-2 text-xs">
                <span title={token.id}>{token.id.slice(0, 8)} · <time dateTime={token.createdAt}>{new Date(token.createdAt).toLocaleString()}</time></span>
                <Button size="sm" variant="secondary" disabled={busy}
                  onClick={() => void change(() => api.revokeMcpToken(token.id), () => {
                    if (issued?.id === token.id) setIssued(null);
                    setFeedback("mcp.revoked");
                  })}>{t("mcp.revoke")}</Button>
              </li>)}
            </ul>
            {issued ? <div className="space-y-2">
              <p className="text-xs">{t("mcp.pairingId")} <code dir="ltr" className="break-all">{issued.id}</code></p>
              <label htmlFor="mcp-new-token" className="block text-xs">{t("mcp.copyOnce")}</label>
              <Input id="mcp-new-token" type="password" readOnly autoComplete="off" value={issued.token} />
              <Button size="sm" onClick={() => void copy(issued.token)}>{t("mcp.copyToken")}</Button>
            </div> : <Button size="sm" disabled={!state || busy}
              onClick={() => void change(api.issueMcpToken, setIssued)}>{t("mcp.issue")}</Button>}
          </section>
          {message}
          <section aria-labelledby="mcp-desktop-guides" className="space-y-2">
            <h3 id="mcp-desktop-guides" className="text-sm font-medium">{t("mcp.desktopGuides")}</h3>
            <p className="text-xs text-[var(--color-muted-foreground)]">{t("mcp.desktopPairing")}</p>
            {desktopClientGuides.map(({ client, config, docs }) => (
              <details key={client} className="rounded border p-2 text-xs">
                <summary className="cursor-pointer font-medium">{t(`mcp.${client}.name`)}</summary>
                <div className="mt-2 space-y-2">
                  <p>{t(`mcp.${client}.setup`)}</p>
                  <pre tabIndex={0} dir="ltr" className="overflow-x-auto rounded bg-[var(--color-muted)] p-2">
                    <code>{JSON.stringify({ mcpServers: { ternssh: config } }, null, 2)}</code>
                  </pre>
                  <p>{t(`mcp.${client}.connect`)}</p>
                  <a href={docs} target="_blank" rel="noreferrer" className="underline">{t("mcp.officialGuide")}</a>
                </div>
              </details>
            ))}
          </section>
        </div>
      </Modal>}
    </div>
  );
}

interface McpAuthorizationDialogProps {
  snapshot: McpAccessState;
  busy: boolean;
  onClose: () => void;
  onConfirm: (servers: Pick<McpServerChoice, "id" | "identityVersion">[]) => void;
}

function McpAuthorizationDialog({ snapshot, busy, onClose, onConfirm }: McpAuthorizationDialogProps) {
  const t = useT();
  const [selected, setSelected] = useState(() => new Set(snapshot.authorizedServerIds));
  const nameCounts = new Map<string, number>();
  for (const { name } of snapshot.availableServers) nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirm() {
    const servers = snapshot.availableServers
      .filter((server) => selected.has(server.id))
      .map(({ id, identityVersion }) => ({ id, identityVersion }));
    onConfirm(servers);
  }

  return (
    <Modal open onOpenChange={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="mcp-selection-title">
        <h2 id="mcp-selection-title" className="text-lg font-semibold">{t("mcp.select")}</h2>
        <p className="my-3 text-xs text-[var(--color-muted-foreground)]">{t("mcp.selectionHint")}</p>
        {!snapshot.availableServers.length && <p className="text-sm">{t("mcp.noServers")}</p>}
        <div className="space-y-1">
          {snapshot.availableServers.map((server) => (
            <label key={server.id} className="flex items-center gap-2 py-1 text-sm">
              <input
                type="checkbox"
                disabled={busy}
                checked={selected.has(server.id)}
                onChange={() => toggle(server.id)}
              />
              <span className="break-all">{server.name}</span>
              {(nameCounts.get(server.name) ?? 0) > 1 && (
                <span className="text-xs text-[var(--color-muted-foreground)]">{server.id}</span>
              )}
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={onClose}>{t("common.cancel")}</Button>
          <Button disabled={busy} onClick={confirm}>{t("mcp.confirm")}</Button>
        </div>
      </div>
    </Modal>
  );
}
