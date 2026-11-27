import { DurableObject } from "cloudflare:workers";
import { getServer } from "../db/servers";
import { loadSSHConnectionConfig } from "../lib/ssh-connection-config";
import {
  buildLightStatusCommand,
  buildProcessMetricsCommand,
  clampStatusPollIntervalMs,
  computeContainerNetRates,
  computeCpuUsage,
  computeInterfaceNetRates,
  computeNetRates,
  DEFAULT_PROCESS_LIMIT,
  DEFAULT_STATUS_POLL_INTERVAL_MS,
  MAX_STATUS_POLL_INTERVAL_MS,
  parseProcessLimitParam,
  parseStatusOutput,
} from "../lib/server-status";
import { connectToServer } from "../lib/resolve-host";
import { SSHSession } from "../ssh/session";
import type { SSHConnectionConfig } from "../ssh/types";

interface SessionRow {
  id: string;
  user_id: string;
  server_id: string;
  status: string;
}

interface StatusSubscription {
  pollIntervalMs: number;
  processLimit: number;
}

interface StatusPushPayload {
  serverId: string;
  collectedAt: string;
  metrics: ReturnType<typeof parseStatusOutput>["metrics"];
}

export class SshSession extends DurableObject<Env> {
  private sshSession: SSHSession | null = null;
  private statusSession: SSHSession | null = null;
  private terminalWs: WebSocket | null = null;
  private sftpSockets = new Set<WebSocket>();
  private bootstrapping: Promise<void> | null = null;
  private statusBootstrapping: Promise<void> | null = null;
  private connectionConfig: SSHConnectionConfig | null = null;
  private activeSession: SessionRow | null = null;
  private statusSubscriptions = new Map<string, StatusSubscription>();
  private lastNetSample: { rxBytes: number; txBytes: number; at: number } | null =
    null;
  private lastCpuSample: { total: number; idle: number; at: number } | null =
    null;
  private lastNetInterfaceSamples: Record<
    string,
    { rxBytes: number; txBytes: number; at: number }
  > | null = null;
  private lastContainerNetSamples: Record<
    string,
    { rxBytes: number; txBytes: number; at: number }
  > | null = null;
  private statusCollectChain: Promise<void> = Promise.resolve();
  private statusPushInFlight: Promise<void> | null = null;

  async fetch(request: Request): Promise<Response> {
    const parsed = parseRequestUrl(request.url);
    if (!parsed) {
      return new Response("Invalid session URL", { status: 400 });
    }

    const session = await this.env.DB.prepare(
      "SELECT id, user_id, server_id, status FROM sessions WHERE id = ?",
    )
      .bind(parsed.sessionId)
      .first<SessionRow>();

    if (!session) {
      return new Response("Session not found", { status: 404 });
    }

    if (parsed.channel === "status") {
      return this.handleStatus(session, request);
    }

    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, serverWs] = Object.values(pair);
    this.ctx.acceptWebSocket(serverWs);

    if (parsed.channel === "sftp") {
      queueMicrotask(() => {
        void this.attachSftp(serverWs);
      });
      return new Response(null, { status: 101, webSocket: client });
    }

    const serverRecord = await getServer(
      this.env.DB,
      session.user_id,
      session.server_id,
    );
    if (!serverRecord) {
      return new Response("Server not found", { status: 404 });
    }

    const config = await loadSSHConnectionConfig(
      this.env.DB,
      session.user_id,
      serverRecord,
    );
    if (!config) {
      return new Response("Credential not found", { status: 404 });
    }

    this.activeSession = session;
    queueMicrotask(() => {
      void this.startTerminal(serverWs, config);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm(): Promise<void> {
    if (this.statusSubscriptions.size === 0) {
      await this.ctx.storage.deleteAlarm();
      return;
    }

    // Schedule the next tick from alarm start, not after collection finishes.
    // Otherwise slow SSH/docker stats drift the effective interval (e.g. 5s → ~8.5s).
    await this.ctx.storage.setAlarm(
      Date.now() + this.getEffectivePollIntervalMs(),
    );
    await this.collectAndPushStatus();
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (this.sftpSockets.has(ws)) {
      await this.sshSession?.handleSFTPWebSocketMessage(ws, message);
      return;
    }

    if (ws === this.terminalWs) {
      if (typeof message === "string" && this.handleTerminalStatusControl(message)) {
        return;
      }
      await this.sshSession?.handleWebSocketMessage(message);
    }
  }

  async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ) {
    if (this.sftpSockets.has(ws)) {
      this.sftpSockets.delete(ws);
      this.sshSession?.detachSFTPWebSocket(ws, true);
      return;
    }

    if (ws === this.terminalWs) {
      this.terminalWs = null;
      this.activeSession = null;
      this.statusSubscriptions.clear();
      void this.ctx.storage.deleteAlarm();
      this.sshSession?.close();
      this.sshSession = null;
      this.bootstrapping = null;
      this.connectionConfig = null;
      this.closeStatusSession(true);
      for (const sftpWs of this.sftpSockets) {
        try {
          sftpWs.close(1000, "Terminal session closed");
        } catch {
          // ignore
        }
      }
      this.sftpSockets.clear();
    }
  }

  private handleTerminalStatusControl(message: string): boolean {
    let parsed: {
      type?: string;
      id?: string;
      pollIntervalMs?: number;
      processLimit?: number;
    };
    try {
      parsed = JSON.parse(message) as {
        type?: string;
        id?: string;
        pollIntervalMs?: number;
        processLimit?: number;
      };
    } catch {
      return false;
    }

    if (!parsed?.type) return false;

    if (parsed.type === "status_subscribe") {
      if (typeof parsed.id !== "string" || !parsed.id) return true;
      const pollIntervalMs =
        typeof parsed.pollIntervalMs === "number"
          ? clampStatusPollIntervalMs(parsed.pollIntervalMs)
          : DEFAULT_STATUS_POLL_INTERVAL_MS;
      const processLimit = parseProcessLimitParam(
        parsed.processLimit === undefined
          ? null
          : String(parsed.processLimit),
      );
      this.statusSubscriptions.set(parsed.id, {
        pollIntervalMs,
        processLimit,
      });
      void this.onStatusSubscriptionsChanged(true);
      return true;
    }

    if (parsed.type === "status_unsubscribe") {
      if (typeof parsed.id === "string" && parsed.id) {
        this.statusSubscriptions.delete(parsed.id);
      }
      void this.onStatusSubscriptionsChanged(false);
      return true;
    }

    if (parsed.type === "status_refresh") {
      void this.collectAndPushStatus();
      return true;
    }

    return false;
  }

  private getEffectivePollIntervalMs(): number {
    if (this.statusSubscriptions.size === 0) {
      return DEFAULT_STATUS_POLL_INTERVAL_MS;
    }

    let minInterval = MAX_STATUS_POLL_INTERVAL_MS;
    for (const subscription of this.statusSubscriptions.values()) {
      minInterval = Math.min(minInterval, subscription.pollIntervalMs);
    }
    return minInterval;
  }

  private getEffectiveProcessLimit(): number {
    let maxLimit = DEFAULT_PROCESS_LIMIT;
    for (const subscription of this.statusSubscriptions.values()) {
      maxLimit = Math.max(maxLimit, subscription.processLimit);
    }
    return maxLimit;
  }

  private scheduleStatusAlarm(): void {
    if (this.statusSubscriptions.size === 0) {
      void this.ctx.storage.deleteAlarm();
      return;
    }

    void this.ctx.storage.setAlarm(
      Date.now() + this.getEffectivePollIntervalMs(),
    );
  }

  private async onStatusSubscriptionsChanged(immediate: boolean): Promise<void> {
    if (this.statusSubscriptions.size === 0) {
      await this.ctx.storage.deleteAlarm();
      return;
    }

    this.scheduleStatusAlarm();
    if (immediate) {
      await this.collectAndPushStatus();
    }
  }

  private pushStatusPayload(payload: StatusPushPayload): void {
    if (!this.terminalWs || this.terminalWs.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      this.terminalWs.send(
        JSON.stringify({
          type: "metrics",
          serverId: payload.serverId,
          collectedAt: payload.collectedAt,
          metrics: payload.metrics,
        }),
      );
    } catch {
      // ignore
    }
  }

  private pushStatusError(message: string): void {
    if (!this.terminalWs || this.terminalWs.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      this.terminalWs.send(
        JSON.stringify({
          type: "metrics_error",
          message,
        }),
      );
    } catch {
      // ignore
    }
  }

  private async collectAndPushStatus(): Promise<void> {
    if (this.statusSubscriptions.size === 0) return;

    const run = async () => {
      const session = this.activeSession;
      if (!session) {
        this.pushStatusError("请先连接终端会话");
        return;
      }

      try {
        const payload = await this.gatherStatusPayload(
          session,
          this.getEffectiveProcessLimit(),
        );
        this.pushStatusPayload(payload);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Status collection failed";
        this.pushStatusError(message);
      }
    };

    const next = (this.statusPushInFlight ?? Promise.resolve()).then(run);
    this.statusPushInFlight = next.then(
      () => {},
      () => {},
    );
    await next;
  }

  private async gatherStatusPayload(
    session: SessionRow,
    processLimit: number,
  ): Promise<StatusPushPayload> {
    const deadline = Date.now() + 30_000;

    while (Date.now() < deadline) {
      if (this.bootstrapping) {
        try {
          await this.bootstrapping;
        } catch {
          break;
        }
      }

      if (this.sshSession?.isSSHReady()) {
        const config = await this.resolveConnectionConfig(session);
        if (!config) {
          throw new Error("服务器配置不存在");
        }

        await this.ensureStatusSession(config);
        if (!this.statusSession?.isSSHReady()) {
          throw new Error("状态采集连接未就绪");
        }

        const result = await this.collectStatusMetrics(config, processLimit);
        const parsed = parseStatusOutput(result.stdout);
        const now = Date.now();
        const { netRxRate, netTxRate, sample } = computeNetRates(
          parsed.netRxBytes,
          parsed.netTxBytes,
          this.lastNetSample,
          now,
        );
        if (sample) {
          this.lastNetSample = sample;
        }
        const { cpuUsedPercent, sample: cpuSample } = computeCpuUsage(
          parsed.cpuTotalJiffies,
          parsed.cpuIdleJiffies,
          this.lastCpuSample,
          now,
        );
        if (cpuSample) {
          this.lastCpuSample = cpuSample;
        }
        const { interfaces: netInterfaces, samples: netInterfaceSamples } =
          computeInterfaceNetRates(
            parsed.netInterfaces,
            this.lastNetInterfaceSamples,
            now,
          );
        this.lastNetInterfaceSamples = netInterfaceSamples;
        const { containers, samples: containerNetSamples } =
          computeContainerNetRates(
            parsed.metrics.containers,
            parsed.containerNetBytes,
            this.lastContainerNetSamples,
            now,
          );
        this.lastContainerNetSamples = containerNetSamples;
        parsed.metrics.netRxRate = netRxRate;
        parsed.metrics.netTxRate = netTxRate;
        parsed.metrics.cpuUsedPercent = cpuUsedPercent;
        parsed.metrics.netInterfaces = netInterfaces;
        parsed.metrics.containers = containers;

        return {
          serverId: session.server_id,
          collectedAt: new Date(now).toISOString(),
          metrics: parsed.metrics,
        };
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    throw new Error(
      this.sshSession ? "SSH 连接未就绪，请稍后重试" : "请先连接终端会话",
    );
  }

  private async handleStatus(
    session: SessionRow,
    request: Request,
  ): Promise<Response> {
    const processLimit = parseProcessLimitParam(
      new URL(request.url).searchParams.get("processLimit"),
    );

    try {
      const payload = await this.gatherStatusPayload(session, processLimit);
      return Response.json(payload);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Status collection failed";
      const status =
        message === "请先连接终端会话" ||
        message === "SSH 连接未就绪，请稍后重试"
          ? 503
          : 500;
      return Response.json({ error: message }, { status });
    }
  }

  private async resolveConnectionConfig(
    session: SessionRow,
  ): Promise<SSHConnectionConfig | null> {
    if (this.connectionConfig) {
      return this.connectionConfig;
    }

    const serverRecord = await getServer(
      this.env.DB,
      session.user_id,
      session.server_id,
    );
    if (!serverRecord) return null;

    this.connectionConfig = await loadSSHConnectionConfig(
      this.env.DB,
      session.user_id,
      serverRecord,
    );
    return this.connectionConfig;
  }

  private closeStatusSession(clearNetSample = false): void {
    this.statusSession?.close();
    this.statusSession = null;
    this.statusBootstrapping = null;
    if (clearNetSample) {
      this.lastNetSample = null;
      this.lastCpuSample = null;
      this.lastNetInterfaceSamples = null;
      this.lastContainerNetSamples = null;
    }
  }

  private async ensureStatusSession(
    config: SSHConnectionConfig,
  ): Promise<void> {
    if (this.statusSession?.isSSHReady()) return;

    if (this.statusBootstrapping) {
      await this.statusBootstrapping;
      await this.waitForStatusReady(30_000);
      return;
    }

    this.closeStatusSession();

    this.statusBootstrapping = (async () => {
      const socket = await connectToServer(config);

      const noopWs = {
        send: () => {},
        close: () => {},
      } as unknown as WebSocket;

      const session = new SSHSession(
        noopWs,
        socket,
        config,
        false,
        false,
        undefined,
        true,
      );
      this.statusSession = session;
      await session.startHandshake();
      await this.waitForStatusReady(30_000);
    })();

    try {
      await this.statusBootstrapping;
    } finally {
      this.statusBootstrapping = null;
    }
  }

  private async waitForStatusReady(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      if (this.statusSession?.isSSHReady()) return;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    throw new Error("状态采集连接未就绪");
  }

  private isRetriableStatusError(message: string): boolean {
    return (
      message.includes("open failed") ||
      message.includes("Exec 通道打开失败") ||
      message.includes("Exec 请求被拒绝") ||
      message.includes("已有命令正在执行") ||
      message.includes("命令执行超时") ||
      message.includes("SSH 连接未就绪")
    );
  }

  private async collectStatusMetrics(
    config: SSHConnectionConfig,
    processLimit: number,
  ) {
    const lightCommand = buildLightStatusCommand();
    const processCommand = buildProcessMetricsCommand(processLimit);
    const run = async () => {
      try {
        const lightResult = await this.statusSession!.execCommand(
          lightCommand,
          8000,
        );
        const processResult = await this.statusSession!.execCommand(
          processCommand,
          8000,
        );
        return {
          stdout: `${lightResult.stdout}\n${processResult.stdout}`,
          stderr: `${lightResult.stderr}${processResult.stderr}`,
          exitCode: lightResult.exitCode || processResult.exitCode,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!this.isRetriableStatusError(message)) {
          throw error;
        }

        this.closeStatusSession();
        await this.ensureStatusSession(config);
        if (!this.statusSession?.isSSHReady()) {
          throw new Error("状态采集连接未就绪");
        }
        const lightResult = await this.statusSession!.execCommand(
          lightCommand,
          8000,
        );
        const processResult = await this.statusSession!.execCommand(
          processCommand,
          8000,
        );
        return {
          stdout: `${lightResult.stdout}\n${processResult.stdout}`,
          stderr: `${lightResult.stderr}${processResult.stderr}`,
          exitCode: lightResult.exitCode || processResult.exitCode,
        };
      }
    };

    const result = this.statusCollectChain.then(run);
    this.statusCollectChain = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  private async startTerminal(
    ws: WebSocket,
    config: SSHConnectionConfig,
  ): Promise<void> {
    this.terminalWs = ws;
    this.lastNetSample = null;

    if (this.sshSession) {
      this.sshSession.close();
      this.sshSession = null;
    }
    this.closeStatusSession(true);

    try {
      await this.ensureSshSession(ws, config);
      await this.bootstrapping;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "SSH connection failed";
      try {
        ws.send(JSON.stringify({ type: "error", message: `连接失败: ${message}` }));
        ws.close(1011, message);
      } catch {
        // ignore
      }
      this.terminalWs = null;
      this.sshSession = null;
      this.bootstrapping = null;
    }
  }

  private async attachSftp(ws: WebSocket): Promise<void> {
    const deadline = Date.now() + 30_000;

    while (Date.now() < deadline) {
      if (this.bootstrapping) {
        try {
          await this.bootstrapping;
        } catch {
          break;
        }
      }

      if (this.sshSession?.isSSHReady()) {
        this.sftpSockets.add(ws);
        this.sshSession.attachSFTPWebSocket(ws);
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    try {
      ws.send(
        JSON.stringify({
          type: "sftp_error",
          operation: "init",
          message: this.sshSession
            ? "SSH 连接未就绪，请稍后重试"
            : "请先连接终端会话",
        }),
      );
      ws.close(1013, "SSH session not ready");
    } catch {
      // ignore
    }
  }

  private async ensureSshSession(
    ws: WebSocket,
    config: SSHConnectionConfig,
  ): Promise<void> {
    if (this.sshSession && this.bootstrapping) {
      await this.bootstrapping;
      return;
    }

    if (this.sshSession) return;

    this.bootstrapping = (async () => {
      const socket = await connectToServer(config);

      this.connectionConfig = config;
      const session = new SSHSession(ws, socket, config, false, false);
      this.sshSession = session;
      await session.startHandshake();
    })();

    await this.bootstrapping;
    this.bootstrapping = null;
  }
}

function parseRequestUrl(
  url: string,
): { sessionId: string; channel: "terminal" | "sftp" | "status" } | null {
  const pathname = new URL(url).pathname;
  const statusMatch = pathname.match(/\/sessions\/([^/]+)\/status$/);
  if (statusMatch?.[1]) {
    return { sessionId: statusMatch[1], channel: "status" };
  }
  const sftpMatch = pathname.match(/\/sessions\/([^/]+)\/sftp\/ws$/);
  if (sftpMatch?.[1]) {
    return { sessionId: sftpMatch[1], channel: "sftp" };
  }
  const terminalMatch = pathname.match(/\/sessions\/([^/]+)\/ws$/);
  if (terminalMatch?.[1]) {
    return { sessionId: terminalMatch[1], channel: "terminal" };
  }
  return null;
}
