export const ADDABLE_WIDGETS = [
  { type: "server_list", defaultSize: { w: 3, h: 8 } },
  { type: "terminal", defaultSize: { w: 6, h: 8 } },
  { type: "file_manager", defaultSize: { w: 3, h: 8 } },
  { type: "status", defaultSize: { w: 3, h: 6 } },
  { type: "network", defaultSize: { w: 3, h: 6 } },
  { type: "process", defaultSize: { w: 4, h: 7 } },
  { type: "container", defaultSize: { w: 4, h: 7 } },
  { type: "quick_commands", defaultSize: { w: 3, h: 6 } },
  { type: "ai_command", defaultSize: { w: 3, h: 7 } },
  { type: "mcp_access", defaultSize: { w: 3, h: 7 } },
] as const;

export type AddableWidgetType = (typeof ADDABLE_WIDGETS)[number]["type"];

export function widgetTitleKey(type: string): string {
  return `widget.${type}`;
}
