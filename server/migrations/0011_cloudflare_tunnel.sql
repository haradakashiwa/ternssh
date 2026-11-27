-- Servers reachable only through a Cloudflare Tunnel (`cloudflared access ssh`).
ALTER TABLE servers ADD COLUMN connection_type TEXT NOT NULL DEFAULT 'direct'
  CHECK (connection_type IN ('direct', 'cloudflare_tunnel'));

-- Optional Cloudflare Access service token, stored as JSON {"client_id","client_secret"}.
ALTER TABLE servers ADD COLUMN tunnel_credential_ref TEXT REFERENCES credentials(id);

-- Switching how a server is reached changes the target, so MCP grants for it lapse.
CREATE TRIGGER mcp_changed_connection AFTER UPDATE OF connection_type ON servers
WHEN OLD.connection_type IS NOT NEW.connection_type
BEGIN
  UPDATE mcp_target_identities SET version = lower(hex(randomblob(16))) WHERE server_id = NEW.id;
END;
