import { useCallback, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n";
import type { Server, ServerConnectionInput, ServerConnectionType } from "@/lib/api";
import { isIpAddress } from "@/lib/validate-host";

export interface TunnelConnectionState {
  connectionType: ServerConnectionType;
  setConnectionType: (value: ServerConnectionType) => void;
  clientId: string;
  setClientId: (value: string) => void;
  clientSecret: string;
  setClientSecret: (value: string) => void;
  clearToken: boolean;
  setClearToken: (value: boolean) => void;
  /** Resets the fields, from the server being edited or copied when there is one. */
  reset: (server?: Server | null) => void;
  /** An i18n key for the first problem with the fields, or null. */
  validate: (host: string) => string | null;
  /** The connection fields of a create, copy or update request. */
  payload: () => ServerConnectionInput;
}

export function useTunnelConnection(): TunnelConnectionState {
  const [connectionType, setConnectionType] = useState<ServerConnectionType>("direct");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [clearToken, setClearToken] = useState(false);

  const reset = useCallback((server?: Server | null) => {
    setConnectionType(server?.connection_type ?? "direct");
    setClientId("");
    setClientSecret("");
    setClearToken(false);
  }, []);

  const validate = (host: string) => {
    if (connectionType !== "cloudflare_tunnel") return null;
    if (isIpAddress(host)) return "tunnel.hostnameRequired";
    if (!clearToken && !!clientId.trim() !== !!clientSecret.trim()) return "tunnel.tokenIncomplete";
    return null;
  };

  const payload = (): ServerConnectionInput => {
    if (connectionType === "direct") return { connection_type: "direct" };
    if (clearToken) return { connection_type: connectionType, tunnel_token: null };
    if (clientId.trim() && clientSecret.trim()) {
      return {
        connection_type: connectionType,
        tunnel_token: { client_id: clientId.trim(), client_secret: clientSecret.trim() },
      };
    }
    return { connection_type: connectionType };
  };

  return {
    connectionType,
    setConnectionType,
    clientId,
    setClientId,
    clientSecret,
    setClientSecret,
    clearToken,
    setClearToken,
    reset,
    validate,
    payload,
  };
}

interface TunnelConnectionTypeSelectProps {
  idPrefix: string;
  state: TunnelConnectionState;
}

export function TunnelConnectionTypeSelect({ idPrefix, state }: TunnelConnectionTypeSelectProps) {
  const t = useT();
  return (
    <div className="grid gap-2">
      <Label htmlFor={`${idPrefix}-connectionType`}>{t("tunnel.connectionType")}</Label>
      <select
        id={`${idPrefix}-connectionType`}
        className="flex h-9 w-full bg-[var(--color-secondary)] px-3 text-sm"
        value={state.connectionType}
        onChange={(event) => state.setConnectionType(event.target.value as ServerConnectionType)}
      >
        <option value="direct">{t("tunnel.direct")}</option>
        <option value="cloudflare_tunnel">{t("tunnel.cloudflareTunnel")}</option>
      </select>
    </div>
  );
}

interface TunnelTokenFieldsProps {
  idPrefix: string;
  state: TunnelConnectionState;
  /** Whether the server being edited or copied already has a saved token. */
  hasStoredToken?: boolean;
}

export function TunnelTokenFields({ idPrefix, state, hasStoredToken = false }: TunnelTokenFieldsProps) {
  const t = useT();
  if (state.connectionType !== "cloudflare_tunnel") return null;
  const disabled = state.clearToken;
  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-tunnelClientId`}>{t("tunnel.clientId")}</Label>
        <Input
          id={`${idPrefix}-tunnelClientId`}
          value={state.clientId}
          onChange={(event) => state.setClientId(event.target.value)}
          placeholder="xxxxxxxx.access"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-tunnelClientSecret`}>{t("tunnel.clientSecret")}</Label>
        <Input
          id={`${idPrefix}-tunnelClientSecret`}
          type="password"
          value={state.clientSecret}
          onChange={(event) => state.setClientSecret(event.target.value)}
          autoComplete="new-password"
          disabled={disabled}
        />
      </div>
      <p className="text-[11px] text-[var(--color-muted-foreground)]">
        {hasStoredToken ? t("tunnel.tokenStored") : t("tunnel.tokenHint")}
      </p>
      {hasStoredToken && (
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={state.clearToken}
            onChange={(event) => state.setClearToken(event.target.checked)}
          />
          {t("tunnel.clearToken")}
        </label>
      )}
    </div>
  );
}
