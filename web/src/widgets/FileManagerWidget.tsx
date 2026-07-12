import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type MouseEvent } from "react";
import {
  ArrowUp,
  Download,
  File,
  Folder,
  FolderPlus,
  FolderUp,
  Home,
  Link2,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { ContextMenu, type ContextMenuItem } from "@/components/ContextMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n";
import {
  getSftpSessionForServer,
  isSessionAlive,
  type ServerSession,
} from "@/lib/sessions";
import {
  collectDroppedFiles,
  collectFileInputItems,
  joinRemotePath,
  isRemoteRoot,
  MAX_SFTP_TEXT_EDIT_SIZE,
  parentRemotePath,
  SftpClient,
  sortSftpEntries,
  type SftpEntry,
} from "@/lib/sftp-client";
import {
  acquireSftpClient,
  releaseSftpClient,
} from "@/lib/sftp-session-pool";
import { cn } from "@/lib/utils";

const FileEditorDialog = lazy(() =>
  import("@/widgets/FileEditorDialog").then((module) => ({
    default: module.FileEditorDialog,
  })),
);

export interface FileManagerWidgetProps {
  activeServerId: string | null;
  sessions: Record<string, ServerSession>;
}

interface MenuState {
  x: number;
  y: number;
  target: { kind: "blank" } | { kind: "entry"; entry: SftpEntry };
}

interface UploadState {
  name: string;
  loaded: number;
  total: number;
}

interface TransferState {
  name: string;
  loaded: number;
  total: number;
}

interface EditorTarget {
  entry: SftpEntry;
  remotePath: string;
}

const TEXT_EDIT_SIZE_LABEL = "2 MB";

function formatUploadProgress(loaded: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.min(100, Math.round((loaded / total) * 100))}%`;
}

async function ensureRemoteDirectories(
  client: SftpClient,
  basePath: string,
  relativePath: string,
  created: Set<string>,
): Promise<void> {
  const parts = relativePath.split("/").filter(Boolean);
  parts.pop();
  if (parts.length === 0) return;

  let current = basePath;
  for (const part of parts) {
    current = joinRemotePath(current, part);
    if (created.has(current)) continue;
    try {
      await client.mkdir(current);
    } catch {
      // directory may already exist
    }
    created.add(current);
  }
}

function formatModifiedTime(timestamp: number): string {
  if (!timestamp) return "-";
  return new Date(timestamp * 1000).toLocaleString();
}

export function FileManagerWidget({
  activeServerId,
  sessions,
}: FileManagerWidgetProps) {
  const t = useT();
  const session = activeServerId
    ? getSftpSessionForServer(sessions, activeServerId)
    : null;
  const clientRef = useRef<SftpClient | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const mountedRef = useRef(true);
  const createdDirsRef = useRef<Set<string>>(new Set());
  const [remotePath, setRemotePath] = useState(".");
  const [pathInput, setPathInput] = useState(".");
  const [entries, setEntries] = useState<SftpEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadState, setDownloadState] = useState<TransferState | null>(null);
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);
  const dragDepthRef = useRef(0);
  const uploadClientRef = useRef<SftpClient | null>(null);
  const uploadCancelledRef = useRef(false);

  const sortedEntries = useMemo(() => sortSftpEntries(entries), [entries]);
  const selectedEntry = useMemo(
    () => entries.find((item) => item.name === selectedName) ?? null,
    [entries, selectedName],
  );
  const canDownloadSelected =
    selectedEntry !== null && !selectedEntry.isDir && !downloading && !uploading;

  const clearClientRef = useCallback(() => {
    clientRef.current = null;
  }, []);

  const isActive = useCallback(() => mountedRef.current, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearClientRef();
    };
  }, [clearClientRef]);

  const loadDirectory = useCallback(async (path: string) => {
    if (!isActive()) return;

    const client = clientRef.current;
    if (!client) return;

    setLoading(true);
    setError(null);
    try {
      const result = await client.list(path);
      if (!isActive()) return;
      setRemotePath(result.path);
      setPathInput(result.path);
      setEntries(result.entries);
      setSelectedName(null);
    } catch (err) {
      if (!isActive()) return;
      setError(err instanceof Error ? err.message : t("fileManager.readDirFailed"));
    } finally {
      if (isActive()) setLoading(false);
    }
  }, [isActive, t]);

  useEffect(() => {
    if (!session || session.status !== "open") {
      if (session?.status === "closed" || session?.status === "error") {
        releaseSftpClient(session.sessionId);
      }
      clearClientRef();
      if (!isActive()) return;
      setReady(false);
      setRemotePath(".");
      setPathInput(".");
      setEntries([]);
      setSelectedName(null);
      setError(null);
      setMenu(null);
      return;
    }

    const { sessionId, sftpWsUrl } = session;
    let cancelled = false;

    void (async () => {
      if (!isActive()) return;
      setLoading(true);
      setError(null);
      setReady(false);

      const maxAttempts = 3;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (cancelled || !isActive()) return;

        try {
          const client = await acquireSftpClient(sessionId, sftpWsUrl);
          if (cancelled || !isActive()) return;
          clientRef.current = client;
          setReady(true);
          const result = await client.list(".");
          if (cancelled || !isActive()) return;
          setRemotePath(result.path);
          setPathInput(result.path);
          setEntries(result.entries);
          setSelectedName(null);
          setLoading(false);
          return;
        } catch (err) {
          if (cancelled || !isActive()) return;
          const message = err instanceof Error ? err.message : t("fileManager.sftpConnectFailed");
          const retryable =
            message.includes("未就绪") ||
            message.includes("请先连接") ||
            message.includes("连接已关闭") ||
            message.includes("超时");

          if (retryable && attempt < maxAttempts - 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 800));
            continue;
          }

          releaseSftpClient(sessionId);
          clearClientRef();
          setError(message);
          setReady(false);
          setLoading(false);
          return;
        }
      }
    })();

    return () => {
      cancelled = true;
      clearClientRef();
    };
  }, [
    session?.sessionId,
    session?.status,
    session?.sftpWsUrl,
    clearClientRef,
    isActive,
    t,
  ]);

  const navigateTo = (nextPath: string) => {
    if (!isActive() || !ready) return;
    void loadDirectory(nextPath);
  };

  const handleEntryOpen = (entry: SftpEntry) => {
    if (!isActive() || !ready) return;
    if (entry.isDir) {
      navigateTo(joinRemotePath(remotePath, entry.name));
      return;
    }
    if (!entry.isLink) {
      handleEditEntry(entry);
    }
  };

  const handleEditEntry = (entry: SftpEntry) => {
    if (!isActive() || !ready || entry.isDir || entry.isLink) return;
    if (uploading || downloading || loading) return;

    if (entry.size > MAX_SFTP_TEXT_EDIT_SIZE) {
      setError(
        t("fileManager.editTooLarge", { size: TEXT_EDIT_SIZE_LABEL }),
      );
      return;
    }

    setMenu(null);
    setEditorTarget({
      entry,
      remotePath: joinRemotePath(remotePath, entry.name),
    });
  };

  const handleMkdir = async () => {
    if (!isActive() || !ready || !clientRef.current) return;

    const name = window.prompt(t("fileManager.newFolderPrompt"));
    if (!name?.trim()) return;

    setLoading(true);
    setError(null);
    try {
      await clientRef.current.mkdir(joinRemotePath(remotePath, name.trim()));
      if (!isActive()) return;
      await loadDirectory(remotePath);
    } catch (err) {
      if (!isActive()) return;
      setError(err instanceof Error ? err.message : t("fileManager.mkdirFailed"));
      setLoading(false);
    }
  };

  const handleDeleteEntry = async (entry: SftpEntry) => {
    if (!isActive() || !ready || !clientRef.current) return;

    const target = joinRemotePath(remotePath, entry.name);
    const kind = entry.isDir
      ? t("fileManager.deleteFolder")
      : t("fileManager.deleteFile");
    if (
      !window.confirm(t("fileManager.deleteConfirm", { kind, name: entry.name }))
    ) {
      return;
    }

    setLoading(true);
    setError(null);
    setMenu(null);
    try {
      await clientRef.current.deletePath(target);
      if (!isActive()) return;
      await loadDirectory(remotePath);
    } catch (err) {
      if (!isActive()) return;
      setError(err instanceof Error ? err.message : t("fileManager.deleteFailed"));
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedName) return;
    const entry = entries.find((item) => item.name === selectedName);
    if (!entry) return;
    await handleDeleteEntry(entry);
  };

  const handleDownloadEntry = async (entry: SftpEntry) => {
    if (!isActive() || !ready || !clientRef.current || entry.isDir) return;

    const target = joinRemotePath(remotePath, entry.name);
    const client = clientRef.current;
    setDownloading(true);
    setError(null);
    setMenu(null);
    setDownloadState({ name: entry.name, loaded: 0, total: entry.size });

    try {
      await client.download(target, (progress) => {
        if (!isActive()) return;
        setDownloadState({
          name: entry.name,
          loaded: progress.loaded,
          total: progress.total,
        });
      });
    } catch (err) {
      if (!isActive()) return;
      setError(err instanceof Error ? err.message : t("fileManager.downloadFailed"));
    } finally {
      if (isActive()) {
        setDownloading(false);
        setDownloadState(null);
      }
    }
  };

  const handleDownload = async () => {
    if (!selectedEntry || selectedEntry.isDir) return;
    await handleDownloadEntry(selectedEntry);
  };

  const handleCancelUpload = useCallback(() => {
    uploadCancelledRef.current = true;
    uploadClientRef.current?.cancelUpload();
  }, []);

  const uploadLocalItems = useCallback(
    async (items: { file: File; relativePath: string }[]) => {
      if (!isActive() || !ready || !clientRef.current || items.length === 0) {
        return;
      }

      const client = clientRef.current;
      uploadCancelledRef.current = false;
      uploadClientRef.current = client;
      setUploading(true);
      setError(null);
      createdDirsRef.current = new Set();

      try {
        for (const item of items) {
          if (!isActive() || uploadCancelledRef.current) return;

          const targetPath = joinRemotePath(remotePath, item.relativePath);
          await ensureRemoteDirectories(
            client,
            remotePath,
            item.relativePath,
            createdDirsRef.current,
          );

          setUploadState({
            name: item.relativePath,
            loaded: 0,
            total: item.file.size,
          });

          await client.upload(targetPath, item.file, (progress) => {
            if (!isActive() || uploadCancelledRef.current) return;
            setUploadState({
              name: item.relativePath,
              loaded: progress.loaded,
              total: progress.total,
            });
          });

          if (uploadCancelledRef.current) return;
        }

        if (!isActive() || uploadCancelledRef.current) return;
        await loadDirectory(remotePath);
      } catch (err) {
        if (!isActive() || uploadCancelledRef.current) return;
        setError(err instanceof Error ? err.message : t("fileManager.uploadFailed"));
      } finally {
        uploadClientRef.current = null;
        if (isActive()) {
          setUploading(false);
          setUploadState(null);
        }
      }
    },
    [isActive, ready, remotePath, loadDirectory, t],
  );

  const handleDrop = useCallback(
    async (event: DragEvent) => {
      event.preventDefault();
      dragDepthRef.current = 0;
      setDragActive(false);
      if (!ready || uploading || downloading || loading) return;

      const items = await collectDroppedFiles(event.dataTransfer);
      if (items.length === 0) return;
      await uploadLocalItems(items);
    },
    [ready, uploading, loading, uploadLocalItems],
  );

  const handleFileInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const fileList = event.target.files;
      if (!fileList || fileList.length === 0) return;

      const items = collectFileInputItems(fileList);
      event.target.value = "";
      await uploadLocalItems(items);
    },
    [uploadLocalItems],
  );

  const handleFolderInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const fileList = event.target.files;
      if (!fileList || fileList.length === 0) return;

      const items = collectFileInputItems(fileList);
      event.target.value = "";
      await uploadLocalItems(items);
    },
    [uploadLocalItems],
  );

  const openContextMenu = (
    event: MouseEvent,
    target: MenuState["target"],
  ) => {
    if (!ready || loading) return;
    event.preventDefault();
    event.stopPropagation();
    if (target.kind === "entry") {
      setSelectedName(target.entry.name);
    }
    setMenu({ x: event.clientX, y: event.clientY, target });
  };

  const menuItems = useMemo((): ContextMenuItem[] => {
    if (!menu || loading || !ready) return [];

    if (menu.target.kind === "blank") {
      return [
        {
          id: "upload",
          label: t("fileManager.upload"),
          onSelect: () => fileInputRef.current?.click(),
        },
        {
          id: "uploadFolder",
          label: t("fileManager.uploadFolder"),
          onSelect: () => folderInputRef.current?.click(),
        },
        {
          id: "mkdir",
          label: t("fileManager.newFolder"),
          onSelect: () => void handleMkdir(),
        },
        {
          id: "refresh",
          label: t("common.refresh"),
          onSelect: () => void loadDirectory(remotePath),
        },
        {
          id: "up",
          label: t("fileManager.parent"),
          disabled: isRemoteRoot(remotePath),
          onSelect: () => navigateTo(parentRemotePath(remotePath)),
        },
        {
          id: "home",
          label: t("fileManager.home"),
          onSelect: () => navigateTo("."),
        },
      ];
    }

    const { entry } = menu.target;
    const items: ContextMenuItem[] = [];

    if (entry.isDir) {
      items.push({
        id: "open",
        label: t("common.open"),
        onSelect: () => navigateTo(joinRemotePath(remotePath, entry.name)),
      });
    } else {
      items.push({
        id: "edit",
        label: t("fileManager.edit"),
        onSelect: () => handleEditEntry(entry),
      });
      items.push({
        id: "download",
        label: t("fileManager.download"),
        onSelect: () => void handleDownloadEntry(entry),
      });
    }

    items.push({
      id: "delete",
      label: t("common.delete"),
      danger: true,
      onSelect: () => void handleDeleteEntry(entry),
    });

    return items;
  }, [menu, loading, ready, remotePath, loadDirectory, t]);

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-[var(--color-muted-foreground)]">
        {t("fileManager.selectServer")}
      </div>
    );
  }

  if (!isSessionAlive(session.status)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-sm text-[var(--color-muted-foreground)]">
        <span>{t(`session.${session.status}`)}</span>
        <span>{t("fileManager.connectFirst")}</span>
      </div>
    );
  }

  return (
    <div
      className="file-manager-widget relative flex h-full min-h-0 flex-col"
      onDragEnter={(event) => {
        event.preventDefault();
        if (!ready || uploading || downloading || loading) return;
        dragDepthRef.current += 1;
        setDragActive(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!ready || uploading || downloading || loading) return;
        event.dataTransfer.dropEffect = "copy";
        setDragActive(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) {
          setDragActive(false);
        }
      }}
      onDrop={(event) => void handleDrop(event)}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => void handleFileInputChange(event)}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        {...({ webkitdirectory: "", directory: "" } as object)}
        onChange={(event) => void handleFolderInputChange(event)}
      />
      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--color-border)] p-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={loading || !ready}
          onClick={() => navigateTo(".")}
          title={t("fileManager.home")}
        >
          <Home className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={loading || !ready || isRemoteRoot(remotePath)}
          onClick={() => navigateTo(parentRemotePath(remotePath))}
          title={t("fileManager.parent")}
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={loading || !ready}
          onClick={() => void loadDirectory(remotePath)}
          title={t("common.refresh")}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={loading || !ready || uploading}
          onClick={() => fileInputRef.current?.click()}
          title={t("fileManager.upload")}
        >
          <Upload className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={loading || !ready || uploading}
          onClick={() => folderInputRef.current?.click()}
          title={t("fileManager.uploadFolder")}
        >
          <FolderUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={loading || !ready || !canDownloadSelected}
          onClick={() => void handleDownload()}
          title={t("fileManager.download")}
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={loading || !ready}
          onClick={() => void handleMkdir()}
          title={t("fileManager.newFolder")}
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={loading || !ready || !selectedName}
          onClick={() => void handleDelete()}
          title={t("common.delete")}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <form
          className="flex min-w-0 flex-1 items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            navigateTo(pathInput.trim() || ".");
          }}
        >
          <Input
            className="h-8 min-w-0 flex-1 font-mono text-xs"
            value={pathInput}
            disabled={loading || !ready}
            onChange={(event) => setPathInput(event.target.value)}
          />
        </form>
      </div>

      {error && (
        <div className="alert-destructive px-3 py-2 text-xs">
          {error}
        </div>
      )}

      {uploadState && (
        <div className="border-b border-[var(--color-border)] px-3 py-2">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="truncate">
              {t("fileManager.uploading", { name: uploadState.name })}
            </span>
            <span className="shrink-0 text-[var(--color-muted-foreground)]">
              {formatUploadProgress(uploadState.loaded, uploadState.total)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 min-w-0 flex-1 bg-[var(--color-secondary)]">
              <div
                className="h-full bg-[var(--color-primary)] transition-all"
                style={{
                  width: `${uploadState.total > 0 ? Math.min(100, (uploadState.loaded / uploadState.total) * 100) : 0}%`,
                }}
              />
            </div>
            <button
              type="button"
              className="shrink-0 text-[11px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              onClick={handleCancelUpload}
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      {downloadState && (
        <div className="border-b border-[var(--color-border)] px-3 py-2">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="truncate">
              {t("fileManager.downloading", { name: downloadState.name })}
            </span>
            <span className="shrink-0 text-[var(--color-muted-foreground)]">
              {formatUploadProgress(downloadState.loaded, downloadState.total)}
            </span>
          </div>
          <div className="mt-1 h-1.5 bg-[var(--color-secondary)]">
            <div
              className="h-full bg-sky-400 transition-all"
              style={{
                width: `${downloadState.total > 0 ? Math.min(100, (downloadState.loaded / downloadState.total) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      <div
        className="min-h-0 flex-1 overflow-auto"
        onContextMenu={(event) => openContextMenu(event, { kind: "blank" })}
      >
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-[var(--color-card)] text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-3 py-2 font-medium">{t("fileManager.colName")}</th>
              <th className="hidden px-3 py-2 font-medium sm:table-cell">
                {t("fileManager.colSize")}
              </th>
              <th className="hidden px-3 py-2 font-medium md:table-cell">
                {t("fileManager.colPerm")}
              </th>
              <th className="hidden px-3 py-2 font-medium lg:table-cell">
                {t("fileManager.colModified")}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedEntries.map((entry) => {
              const Icon = entry.isDir ? Folder : entry.isLink ? Link2 : File;
              const selected = selectedName === entry.name;
              return (
                <tr
                  key={entry.name}
                  className={cn(
                    "cursor-pointer border-b border-[var(--color-border)]/40 hover:bg-[var(--color-secondary)]/60",
                    selected && "bg-[var(--color-secondary)]",
                  )}
                  onClick={() => setSelectedName(entry.name)}
                  onDoubleClick={() => handleEntryOpen(entry)}
                  onContextMenu={(event) =>
                    openContextMenu(event, { kind: "entry", entry })
                  }
                >
                  <td className="px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Icon
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          entry.isDir
                            ? "text-[var(--color-folder)]"
                            : "text-[var(--color-muted-foreground)]",
                        )}
                      />
                      <span className="truncate">{entry.name}</span>
                    </div>
                  </td>
                  <td className="hidden px-3 py-2 text-[var(--color-muted-foreground)] sm:table-cell">
                    {entry.isDir ? "-" : entry.sizeFormatted}
                  </td>
                  <td className="hidden px-3 py-2 font-mono text-[var(--color-muted-foreground)] md:table-cell">
                    {entry.permissions}
                  </td>
                  <td className="hidden px-3 py-2 text-[var(--color-muted-foreground)] lg:table-cell">
                    {formatModifiedTime(entry.modifiedTime)}
                  </td>
                </tr>
              );
            })}
            {!loading && ready && sortedEntries.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-8 text-center text-[var(--color-muted-foreground)]"
                >
                  {t("fileManager.emptyDir")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t border-[var(--color-border)] px-3 py-1.5 text-[11px] text-[var(--color-muted-foreground)]">
        {ready
          ? uploading
            ? t("fileManager.uploadingStatus", { path: remotePath })
            : downloading
              ? t("fileManager.downloadingStatus", { path: remotePath })
              : t("fileManager.status", {
                  path: remotePath,
                  count: sortedEntries.length,
                })
          : t("fileManager.connecting")}
      </div>

      {dragActive && ready && !uploading && !downloading && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-[var(--color-primary)] bg-[var(--color-background)]/80">
          <div className="rounded-sm bg-[var(--color-card)] px-4 py-3 text-sm shadow-lg">
            {t("fileManager.dropToUpload", { path: remotePath })}
          </div>
        </div>
      )}

      <ContextMenu
        open={menu !== null}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        items={menuItems}
        onClose={() => setMenu(null)}
      />

      {editorTarget && (
        <Suspense fallback={null}>
          <FileEditorDialog
            open={editorTarget !== null}
            onOpenChange={(open) => {
              if (!open) setEditorTarget(null);
            }}
            client={clientRef.current}
            remotePath={editorTarget.remotePath}
            fileName={editorTarget.entry.name}
            onSaved={() => void loadDirectory(remotePath)}
          />
        </Suspense>
      )}
    </div>
  );
}
