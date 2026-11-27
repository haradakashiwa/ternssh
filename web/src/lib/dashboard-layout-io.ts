import { ADDABLE_WIDGETS, type AddableWidgetType } from "../dashboard/widgets.ts";
import type { Dashboard } from "@/lib/api";
import { newId } from "./id.ts";

export const DASHBOARD_LAYOUT_EXPORT_VERSION = 1;

export interface DashboardLayoutExportWidget {
  type: AddableWidgetType;
  config_json: string | null;
  grid_x: number;
  grid_y: number;
  grid_w: number;
  grid_h: number;
}

export interface DashboardLayoutExport {
  version: typeof DASHBOARD_LAYOUT_EXPORT_VERSION;
  exportedAt: string;
  name: string;
  widgets: DashboardLayoutExportWidget[];
}

const ADDABLE_WIDGET_TYPES = new Set<string>(
  ADDABLE_WIDGETS.map((widget) => widget.type),
);

export class DashboardLayoutImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DashboardLayoutImportError";
  }
}

export function buildDashboardLayoutExport(
  dashboard: Dashboard,
): DashboardLayoutExport {
  return {
    version: DASHBOARD_LAYOUT_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    name: dashboard.dashboard.name,
    widgets: dashboard.widgets.map((widget) => ({
      type: widget.type as AddableWidgetType,
      config_json: widget.type === "mcp_access" ? null : widget.config_json,
      grid_x: widget.grid_x,
      grid_y: widget.grid_y,
      grid_w: widget.grid_w,
      grid_h: widget.grid_h,
    })),
  };
}

export function serializeDashboardLayoutExport(
  payload: DashboardLayoutExport,
): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function clampGrid(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function parseWidget(raw: unknown): DashboardLayoutExportWidget {
  if (typeof raw !== "object" || raw === null) {
    throw new DashboardLayoutImportError("Invalid widget entry");
  }

  const widget = raw as Partial<DashboardLayoutExportWidget>;
  if (typeof widget.type !== "string" || !ADDABLE_WIDGET_TYPES.has(widget.type)) {
    throw new DashboardLayoutImportError(`Unknown widget type: ${widget.type ?? ""}`);
  }

  for (const key of ["grid_x", "grid_y", "grid_w", "grid_h"] as const) {
    if (typeof widget[key] !== "number" || !Number.isFinite(widget[key])) {
      throw new DashboardLayoutImportError(`Widget ${widget.type} has invalid ${key}`);
    }
  }

  let configJson: string | null = null;
  if (widget.config_json !== undefined && widget.config_json !== null) {
    if (typeof widget.config_json !== "string") {
      throw new DashboardLayoutImportError(
        `Widget ${widget.type} has invalid config_json`,
      );
    }
    configJson = widget.config_json;
  }

  return {
    type: widget.type as AddableWidgetType,
    config_json: widget.type === "mcp_access" ? null : configJson,
    grid_x: clampGrid(widget.grid_x!, 0, 11),
    grid_y: clampGrid(widget.grid_y!, 0, 9999),
    grid_w: clampGrid(widget.grid_w!, 1, 12),
    grid_h: clampGrid(widget.grid_h!, 1, 9999),
  };
}

export function parseDashboardLayoutImport(text: string): DashboardLayoutExport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DashboardLayoutImportError("Invalid JSON file");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new DashboardLayoutImportError("Invalid layout file");
  }

  const file = parsed as Partial<DashboardLayoutExport>;
  if (file.version !== DASHBOARD_LAYOUT_EXPORT_VERSION) {
    throw new DashboardLayoutImportError("Unsupported layout file version");
  }

  if (!Array.isArray(file.widgets) || file.widgets.length === 0) {
    throw new DashboardLayoutImportError("Layout file must include widgets");
  }

  const widgets = file.widgets.map(parseWidget);
  const types = new Set<string>();
  for (const widget of widgets) {
    if (types.has(widget.type)) {
      throw new DashboardLayoutImportError(
        `Duplicate widget type in layout file: ${widget.type}`,
      );
    }
    types.add(widget.type);
  }

  return {
    version: DASHBOARD_LAYOUT_EXPORT_VERSION,
    exportedAt:
      typeof file.exportedAt === "string" ? file.exportedAt : new Date().toISOString(),
    name: typeof file.name === "string" && file.name.trim() ? file.name.trim() : "Imported",
    widgets,
  };
}

export function layoutImportToDashboardWidgets(
  payload: DashboardLayoutExport,
): Array<{
  id: string;
  type: string;
  config_json: string | null;
  grid_x: number;
  grid_y: number;
  grid_w: number;
  grid_h: number;
}> {
  return payload.widgets.map((widget) => ({
    id: newId(),
    type: widget.type,
    config_json: widget.config_json,
    grid_x: widget.grid_x,
    grid_y: widget.grid_y,
    grid_w: widget.grid_w,
    grid_h: widget.grid_h,
  }));
}

export function downloadDashboardLayoutExport(payload: DashboardLayoutExport): void {
  const blob = new Blob([serializeDashboardLayoutExport(payload)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const stamp = payload.exportedAt.slice(0, 10);
  anchor.href = url;
  anchor.download = `ternssh-layout-${stamp}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
