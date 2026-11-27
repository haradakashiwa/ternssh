-- A new incarnation is generated even when a server switches back to a prior address.
CREATE TABLE mcp_target_identities (
  server_id TEXT PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
  version TEXT NOT NULL
);

INSERT INTO mcp_target_identities (server_id, version)
SELECT id, lower(hex(randomblob(16))) FROM servers;

CREATE TRIGGER mcp_new_target AFTER INSERT ON servers
BEGIN
  INSERT INTO mcp_target_identities (server_id, version)
    VALUES (NEW.id, lower(hex(randomblob(16))));
END;

CREATE TRIGGER mcp_changed_target AFTER UPDATE OF host, port, username, user_id ON servers
WHEN OLD.host IS NOT NEW.host OR OLD.port IS NOT NEW.port OR
     OLD.username IS NOT NEW.username OR OLD.user_id IS NOT NEW.user_id
BEGIN
  UPDATE mcp_target_identities SET version = lower(hex(randomblob(16))) WHERE server_id = NEW.id;
END;

-- Each row is one complete confirmed set of {id, identityVersion} pairs.
CREATE TABLE mcp_authorizations (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision > 0),
  selection TEXT NOT NULL CHECK (json_valid(selection) AND json_type(selection) = 'array')
);

CREATE TABLE mcp_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  digest TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_mcp_tokens_user ON mcp_tokens(user_id);

CREATE TABLE mcp_recent_calls (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  result TEXT NOT NULL CHECK (result IN ('listed'))
);
CREATE INDEX idx_mcp_recent_calls_user ON mcp_recent_calls(user_id, id DESC);

CREATE TRIGGER mcp_trim_recent_calls AFTER INSERT ON mcp_recent_calls
BEGIN
  DELETE FROM mcp_recent_calls WHERE id IN (
    SELECT id FROM mcp_recent_calls WHERE user_id = NEW.user_id
      ORDER BY id DESC LIMIT -1 OFFSET 20
  );
END;
