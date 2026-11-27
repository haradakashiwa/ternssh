import {
  Activity,
  Box,
  Container,
  Cpu,
  FolderOpen,
  Network,
  Plug,
  Server,
  Sparkles,
  Terminal,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { ADDABLE_WIDGETS, widgetTitleKey, type AddableWidgetType } from "./widgets";

const WIDGET_ICONS: Record<AddableWidgetType, LucideIcon> = {
  server_list: Server,
  terminal: Terminal,
  file_manager: FolderOpen,
  status: Activity,
  network: Network,
  process: Cpu,
  container: Container,
  quick_commands: Zap,
  ai_command: Sparkles,
  mcp_access: Plug,
};

export function widgetIcon(type: string): LucideIcon {
  return WIDGET_ICONS[type as AddableWidgetType] ?? Box;
}

export function widgetDescriptionKey(type: string): string {
  return `widget.descriptions.${type}`;
}

export { ADDABLE_WIDGETS, widgetTitleKey };
