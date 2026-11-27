export interface SSHPacket {
  length: number;
  paddingLength: number;
  payload: Uint8Array;
  mac?: Uint8Array;
}

export interface KEXInitMessage {
  kexAlgorithms: string[];
  hostKeyAlgorithms: string[];
  encryptionC2S: string[];
  encryptionS2C: string[];
  macC2S: string[];
  macS2C: string[];
  compressionC2S: string[];
  compressionS2C: string[];
}

export interface SessionKeys {
  ivClientToServer: Uint8Array;
  ivServerToClient: Uint8Array;
  encKeyClientToServer: Uint8Array;
  encKeyServerToClient: Uint8Array;
  integrityKeyC2S: Uint8Array;
  integrityKeyS2C: Uint8Array;
  sessionID: Uint8Array;
}

export interface ECDHResult {
  sharedSecret: Uint8Array;
  exchangeHash: Uint8Array;
  sessionID: Uint8Array;
  hostKey: Uint8Array;
  signature: Uint8Array;
}

export interface AuthResult {
  success: boolean;
  allowedMethods?: string[];
  partialSuccess?: boolean;
}

export interface SSHConnectionConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  authMethod?: 'password' | 'publickey';
  privateKey?: string;
  privateKeyPassphrase?: string;
  cols?: number;
  rows?: number;
  expectedFingerprint?: string;
  /** Reach the server through a Cloudflare Tunnel instead of a direct TCP connection. */
  tunnel?: {
    accessToken: { clientId: string; clientSecret: string } | null;
  };
}

export interface TerminalSize {
  cols: number;
  rows: number;
}

export function normalizeTerminalSize(cols: unknown, rows: unknown): TerminalSize | null {
  if (
    typeof cols !== 'number' ||
    typeof rows !== 'number' ||
    !Number.isFinite(cols) ||
    !Number.isFinite(rows)
  ) {
    return null;
  }

  const size = {
    cols: Math.floor(cols),
    rows: Math.floor(rows),
  };

  if (size.cols < 10 || size.cols > 2000 || size.rows < 5 || size.rows > 2000) {
    return null;
  }

  return size;
}

export interface Env {
  SSH_SESSION: DurableObjectNamespace;
  USER_DB: DurableObjectNamespace;
  MAX_CONNECTIONS?: string;
  IDLE_TIMEOUT?: string;
  TURNSTILE_SECRET?: string;
  TURNSTILE_SITEKEY?: string;
  // GitHub OAuth（可选，未配置则登录功能自动禁用）
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  BASE_URL?: string;
  // 主机密钥验证严格模式（默认 true，设为 false 可跳过签名验证失败）
  STRICT_HOST_KEY_VERIFY?: string;
  // 调试模式（设为 true 启用调试日志输出到前端）
  DEBUG_MODE?: string;
}

export interface UserInfo {
  id: number;
  github_id: number;
  username: string;
  avatar_url: string;
}

export interface ServerConfig {
  id: number;
  user_id: number;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_method: 'password' | 'publickey';
  created_at: string;
  updated_at: string;
}

export const SSH_MSG_DISCONNECT = 1;
export const SSH_MSG_IGNORE = 2;
export const SSH_MSG_UNIMPLEMENTED = 3;
export const SSH_MSG_DEBUG = 4;
export const SSH_MSG_SERVICE_REQUEST = 5;
export const SSH_MSG_SERVICE_ACCEPT = 6;
export const SSH_MSG_KEXINIT = 20;
export const SSH_MSG_NEWKEYS = 21;
export const SSH_MSG_KEX_ECDH_INIT = 30;
export const SSH_MSG_KEX_ECDH_REPLY = 31;
export const SSH_MSG_USERAUTH_REQUEST = 50;
export const SSH_MSG_USERAUTH_FAILURE = 51;
export const SSH_MSG_USERAUTH_SUCCESS = 52;
export const SSH_MSG_GLOBAL_REQUEST = 80;
export const SSH_MSG_REQUEST_SUCCESS = 81;
export const SSH_MSG_REQUEST_FAILURE = 82;
export const SSH_MSG_CHANNEL_OPEN = 90;
export const SSH_MSG_CHANNEL_OPEN_CONFIRMATION = 91;
export const SSH_MSG_CHANNEL_OPEN_FAILURE = 92;
export const SSH_MSG_CHANNEL_WINDOW_ADJUST = 93;
export const SSH_MSG_CHANNEL_DATA = 94;
export const SSH_MSG_CHANNEL_EXTENDED_DATA = 95;
export const SSH_MSG_CHANNEL_EOF = 96;
export const SSH_MSG_CHANNEL_CLOSE = 97;
export const SSH_MSG_CHANNEL_REQUEST = 98;
export const SSH_MSG_CHANNEL_SUCCESS = 99;
export const SSH_MSG_CHANNEL_FAILURE = 100;
