import type { Terminal } from "@xterm/xterm";

const STORAGE_KEY = "ternssh-terminal-history";
const MAX_HISTORY = 200;
const MAX_SUGGESTIONS = 8;

const COMMON_COMMANDS = [
  "ls",
  "cd",
  "pwd",
  "cat",
  "grep",
  "tail",
  "head",
  "chmod",
  "chown",
  "mkdir",
  "rm",
  "mv",
  "cp",
  "ps",
  "top",
  "htop",
  "df",
  "du",
  "free",
  "systemctl",
  "journalctl",
  "docker",
  "docker ps",
  "docker compose ps",
  "kubectl",
  "git status",
  "git pull",
  "npm install",
  "curl",
  "wget",
  "ssh",
  "scp",
  "tar",
  "zip",
  "unzip",
  "nano",
  "vim",
  "sudo",
  "su",
  "exit",
  "clear",
  "history",
];

type HistoryStore = Record<string, string[]>;

function readStore(): HistoryStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as HistoryStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: HistoryStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getTerminalHistory(serverId: string): string[] {
  return readStore()[serverId] ?? [];
}

export function pushTerminalHistory(serverId: string, command: string): void {
  const trimmed = command.trim();
  if (!trimmed || trimmed.startsWith(" ") || /[$#>❯➜λ]\s*$/.test(trimmed)) return;

  const store = readStore();
  const existing = store[serverId] ?? [];
  const next = [trimmed, ...existing.filter((item) => item !== trimmed)].slice(
    0,
    MAX_HISTORY,
  );
  store[serverId] = next;
  writeStore(store);
}

function readLineText(terminal: Terminal): string {
  const buffer = terminal.buffer.active;
  const row = buffer.getLine(buffer.baseY + buffer.cursorY);
  if (!row) return "";

  let text = "";
  for (let x = 0; x < row.length; x++) {
    text += row.getCell(x)?.getChars() ?? "";
  }
  return text.replace(/\s+$/g, "");
}

function extractCommandTail(line: string): string {
  const markers = ["$ ", "# ", "> ", "❯ ", "➜ ", "λ "];
  let start = 0;
  for (const marker of markers) {
    const index = line.lastIndexOf(marker);
    if (index >= start) {
      start = index + marker.length;
    }
  }

  // Prompts like root@host:~# often omit the trailing space after $ or #.
  const endPrompt = line.match(/[$#](?:\s*)?$/);
  if (endPrompt?.index !== undefined) {
    const cut = endPrompt.index + endPrompt[0].length;
    if (cut > start) {
      start = cut;
    }
  }

  return line.slice(start);
}

export function readTerminalPartialCommand(terminal: Terminal): string {
  return extractCommandTail(readLineText(terminal));
}

/** Apply a single onData payload to the local input draft (echo may arrive later). */
export function applyInputToDraft(draft: string, input: string): string {
  if (input.includes("\r") || input === "\n") return "";
  if (input === "\x7f" || input === "\x08") return draft.slice(0, -1);
  if (input === "\x15" || input === "\x03") return "";
  if (input.startsWith("\x1b") || input === "\t") return draft;
  if (/[\x00-\x1f\x7f]/.test(input)) return draft;
  return draft + input;
}

/** Prefer local draft when ahead of echo; never regress to a shorter buffer. */
export function resolveInputPartial(
  terminal: Terminal | null,
  draft: string,
): string {
  if (!terminal) return draft;
  const fromBuffer = readTerminalPartialCommand(terminal);
  if (!fromBuffer) return draft;
  if (!draft) return fromBuffer;
  if (draft === fromBuffer) return draft;
  if (draft.startsWith(fromBuffer)) return draft;
  if (fromBuffer.startsWith(draft)) return fromBuffer;
  return draft;
}

/** Reconcile local draft with the terminal buffer after server echo. */
export function syncDraftFromTerminal(
  terminal: Terminal,
  draft: string,
): string {
  return resolveInputPartial(terminal, draft);
}

/** True when WebSocket output is likely prompt/input echo, not bulk command output. */
export function shouldSyncDraftFromEcho(data: string): boolean {
  if (data.startsWith("\x1b")) return true;
  return !data.includes("\n") && !data.includes("\r");
}

function splitPartial(partial: string): { head: string; token: string } {
  const trimmed = partial.trimEnd();
  const lastSpace = trimmed.lastIndexOf(" ");
  if (lastSpace < 0) {
    return { head: "", token: trimmed };
  }
  return {
    head: trimmed.slice(0, lastSpace + 1),
    token: trimmed.slice(lastSpace + 1),
  };
}

function getLastToken(partial: string): string {
  return splitPartial(partial).token;
}

function suggestionScore(partial: string, suggestion: string): number {
  const partialLower = partial.toLowerCase();
  const suggestionLower = suggestion.toLowerCase();
  if (suggestionLower.startsWith(partialLower)) {
    return 3;
  }

  const token = getLastToken(partial);
  if (!token) {
    return suggestionLower.includes(partialLower) ? 1 : 0;
  }

  const tokenLower = token.toLowerCase();
  const { head } = splitPartial(partial);
  const headLower = head.toLowerCase();

  if (head && suggestionLower.startsWith(headLower)) {
    const tail = suggestionLower.slice(headLower.length);
    if (tail.startsWith(tokenLower)) {
      return 2;
    }
  }

  if (suggestionLower.startsWith(tokenLower)) {
    return 2;
  }

  return suggestionLower.includes(tokenLower) ? 1 : 0;
}

export function findTerminalSuggestions(
  serverId: string,
  partial: string,
  extraCommands: string[] = [],
): string[] {
  const normalized = partial.trimStart();
  const pool = [
    ...new Set([
      ...getTerminalHistory(serverId),
      ...extraCommands,
      ...COMMON_COMMANDS,
    ]),
  ];

  if (!normalized) {
    return [];
  }

  return pool
    .map((item) => ({ item, score: suggestionScore(normalized, item) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.item.localeCompare(right.item))
    .slice(0, MAX_SUGGESTIONS)
    .map(({ item }) => item);
}

export function completionSuffix(partial: string, suggestion: string): string {
  if (!suggestion) return "";

  if (suggestion.startsWith(partial)) {
    return suggestion.slice(partial.length);
  }

  const { head, token } = splitPartial(partial);
  if (!token) return "";

  if (head && suggestion.startsWith(head)) {
    const tail = suggestion.slice(head.length);
    if (tail.startsWith(token)) {
      return tail.slice(token.length);
    }
  }

  if (suggestion.startsWith(token)) {
    return suggestion.slice(token.length);
  }

  return "";
}

function completedTail(partial: string, suggestion: string): string {
  const { head, token } = splitPartial(partial);
  if (!token) return suggestion;

  if (head && suggestion.startsWith(head)) {
    return suggestion.slice(head.length);
  }

  if (suggestion.startsWith(token)) {
    return suggestion;
  }

  return suggestion;
}

/**
 * Build bytes to send for Tab completion. Replaces the last token on the server
 * so lagging echo (network) cannot stack suffixes onto a stale PTY cursor.
 */
export function buildCompletionPayload(
  partial: string,
  suggestion: string,
): { payload: string; nextDraft: string } | null {
  if (!suggestion) return null;

  const partialTrimmed = partial.trimStart();

  if (suggestion.startsWith(partialTrimmed)) {
    const suffix = suggestion.slice(partialTrimmed.length);
    if (!suffix) return null;
    return {
      payload: suffix,
      nextDraft: partialTrimmed + suffix,
    };
  }

  const suffix = completionSuffix(partialTrimmed, suggestion);
  if (!suffix) return null;

  const { head, token } = splitPartial(partialTrimmed);
  const tail = completedTail(partialTrimmed, suggestion);

  return {
    payload: "\x7f".repeat(token.length) + tail,
    nextDraft: head + tail,
  };
}
