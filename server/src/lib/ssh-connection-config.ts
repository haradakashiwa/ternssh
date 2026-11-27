import { getCredentialValue } from "../db/servers";
import { parseServiceToken } from "./cloudflare-tunnel";
import { parsePrivateKeyCredential } from "../lib/private-key-credential";
import type { ServerRecord } from "../types";
import type { SSHConnectionConfig } from "../ssh/types";

export function buildSSHConnectionConfig(
  serverRecord: ServerRecord,
  credential: string,
  tunnelCredential: string | null = null,
): SSHConnectionConfig {
  const tunnel = serverRecord.connection_type === "cloudflare_tunnel"
    ? { accessToken: parseServiceToken(tunnelCredential) }
    : undefined;

  if (serverRecord.auth_type === "password") {
    return {
      host: serverRecord.host,
      port: serverRecord.port,
      username: serverRecord.username,
      password: credential,
      authMethod: "password",
      cols: 120,
      rows: 40,
      tunnel,
    };
  }

  const parsed = parsePrivateKeyCredential(credential);
  return {
    host: serverRecord.host,
    port: serverRecord.port,
    username: serverRecord.username,
    password: "",
    authMethod: "publickey",
    privateKey: parsed.privateKey,
    privateKeyPassphrase: parsed.passphrase,
    cols: 120,
    rows: 40,
    tunnel,
  };
}

/** Loads a server's SSH credential (and tunnel token, if any); null when the credential is missing. */
export async function loadSSHConnectionConfig(
  db: D1Database,
  userId: string,
  serverRecord: ServerRecord,
): Promise<SSHConnectionConfig | null> {
  const credential = await getCredentialValue(db, userId, serverRecord.credential_ref);
  if (!credential) return null;
  const tunnelCredential =
    serverRecord.connection_type === "cloudflare_tunnel" && serverRecord.tunnel_credential_ref
      ? await getCredentialValue(db, userId, serverRecord.tunnel_credential_ref)
      : null;
  return buildSSHConnectionConfig(serverRecord, credential, tunnelCredential);
}
