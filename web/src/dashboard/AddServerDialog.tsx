import { useState } from "react";
import { Modal } from "@/components/Modal";
import { PrivateKeyField } from "@/components/PrivateKeyField";
import { PasswordField } from "@/components/PasswordField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n";
import { api } from "@/lib/api";
import { maybeSavePrivateKey } from "@/lib/saved-private-keys";
import { maybeSavePassword } from "@/lib/saved-passwords";
import {
  privateKeyRequiresPassphrase,
  serializePrivateKeyCredential,
} from "@/lib/private-key-credential";
import { isValidServerHost } from "@/lib/validate-host";
import {
  TunnelConnectionTypeSelect,
  TunnelTokenFields,
  useTunnelConnection,
} from "@/components/TunnelConnectionFields";

interface AddServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId?: string | null;
  onCreated: () => Promise<void>;
}

export function AddServerDialog({
  open,
  onOpenChange,
  groupId = null,
  onCreated,
}: AddServerDialogProps) {
  const t = useT();
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [authType, setAuthType] = useState<"password" | "private_key">(
    "password",
  );
  const [credential, setCredential] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [saveKey, setSaveKey] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [savePassword, setSavePassword] = useState(false);
  const [passwordName, setPasswordName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tunnel = useTunnelConnection();

  if (!open) return null;

  const reset = () => {
    setName("");
    setHost("");
    setPort("22");
    setUsername("");
    setAuthType("password");
    setCredential("");
    setPassphrase("");
    setSaveKey(false);
    setKeyName("");
    setSavePassword(false);
    setPasswordName("");
    tunnel.reset();
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValidServerHost(host)) {
      setError(t("addServer.invalidHost"));
      return;
    }
    const tunnelError = tunnel.validate(host);
    if (tunnelError) {
      setError(t(tunnelError));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const trimmedCredential = credential.trim();
      const trimmedPassphrase = passphrase.trim();
      if (
        authType === "private_key" &&
        privateKeyRequiresPassphrase(trimmedCredential, trimmedPassphrase)
      ) {
        setError(t("privateKey.passphraseRequired"));
        return;
      }
      const storedCredential =
        authType === "private_key"
          ? serializePrivateKeyCredential(trimmedCredential, trimmedPassphrase)
          : trimmedCredential;
      await api.createServer({
        name,
        host,
        port: Number(port),
        username,
        auth_type: authType,
        ...tunnel.payload(),
        credential: storedCredential,
        group_id: groupId,
      });
      if (authType === "private_key") {
        await maybeSavePrivateKey(keyName, storedCredential, saveKey);
      } else {
        await maybeSavePassword(passwordName, trimmedCredential, savePassword);
      }
      reset();
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("addServer.createFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      className="flex max-w-lg flex-col overflow-hidden p-0"
      open={open}
      onOpenChange={onOpenChange}
    >
        <form
          className="flex min-h-0 flex-auto flex-col overflow-hidden"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <div className="flex shrink-0 items-center justify-between px-6 pt-6 pb-4">
            <h2 className="text-lg font-semibold">{t("addServer.title")}</h2>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("common.close")}
            </Button>
          </div>

          <div className="min-h-0 flex-auto space-y-4 overflow-y-auto overscroll-contain px-6 pb-4">
          <div className="grid gap-2">
            <Label htmlFor="name">{t("common.name")}</Label>
            <Input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
          <TunnelConnectionTypeSelect idPrefix="add" state={tunnel} />
          <div className="grid grid-cols-3 gap-3">
            <div className={tunnel.connectionType === "direct" ? "col-span-2 grid gap-2" : "col-span-3 grid gap-2"}>
              <Label htmlFor="host">{t("addServer.host")}</Label>
              <Input
                id="host"
                value={host}
                onChange={(event) => setHost(event.target.value)}
                required
              />
            </div>
            {tunnel.connectionType === "direct" && (
            <div className="grid gap-2">
              <Label htmlFor="port">{t("addServer.port")}</Label>
              <Input
                id="port"
                value={port}
                onChange={(event) => setPort(event.target.value)}
                required
              />
            </div>
            )}
          </div>
          {tunnel.connectionType === "cloudflare_tunnel" && (
            <p className="-mt-2 text-[11px] text-[var(--color-muted-foreground)]">{t("tunnel.hostHint")}</p>
          )}
          <TunnelTokenFields idPrefix="add" state={tunnel} hasStoredToken={false} />
          <div className="grid gap-2">
            <Label htmlFor="username">{t("addServer.username")}</Label>
            <Input
              id="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="authType">{t("addServer.authType")}</Label>
            <select
              id="authType"
              className="flex h-9 w-full bg-[var(--color-secondary)] px-3 text-sm"
              value={authType}
              onChange={(event) =>
                setAuthType(event.target.value as "password" | "private_key")
              }
            >
              <option value="password">{t("addServer.password")}</option>
              <option value="private_key">{t("addServer.privateKey")}</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="credential">
              {authType === "password"
                ? t("addServer.password")
                : t("addServer.privateKeyContent")}
            </Label>
            {authType === "password" ? (
              <PasswordField
                id="credential"
                value={credential}
                onChange={setCredential}
                savePassword={savePassword}
                onSavePasswordChange={setSavePassword}
                passwordName={passwordName}
                onPasswordNameChange={setPasswordName}
                required
              />
            ) : (
              <PrivateKeyField
                id="credential"
                value={credential}
                onChange={setCredential}
                passphrase={passphrase}
                onPassphraseChange={setPassphrase}
                saveKey={saveKey}
                onSaveKeyChange={setSaveKey}
                keyName={keyName}
                onKeyNameChange={setKeyName}
                required
              />
            )}
          </div>

          {error && <p className="text-sm text-[var(--color-destructive)]">{error}</p>}
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--color-border)] px-6 py-4">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </form>
    </Modal>
  );
}
