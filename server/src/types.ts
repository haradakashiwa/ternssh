export interface User {
  id: string;
  email: string | null;
  display_name: string | null;
  site_name: string | null;
  created_at: string;
  updated_at: string;
}

export type ServerConnectionType = "direct" | "cloudflare_tunnel";

export interface ServerRecord {
  id: string;
  user_id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: "password" | "private_key";
  credential_ref: string;
  connection_type: ServerConnectionType;
  tunnel_credential_ref: string | null;
  group_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ServerPublic {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: "password" | "private_key";
  connection_type: ServerConnectionType;
  /** Whether a Cloudflare Access service token is stored; the token itself never is returned. */
  has_tunnel_token: boolean;
  group_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface GroupRecord {
  id: string;
  user_id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type TreeNode =
  | {
      type: "group";
      id: string;
      name: string;
      parent_id: string | null;
      sort_order: number;
      children: TreeNode[];
    }
  | ({
      type: "server";
    } & ServerPublic);

export interface DashboardRecord {
  id: string;
  user_id: string;
  name: string;
  is_default: number;
  layout_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface DashboardWidgetRecord {
  id: string;
  dashboard_id: string;
  type: string;
  config_json: string | null;
  grid_x: number;
  grid_y: number;
  grid_w: number;
  grid_h: number;
}

export type Variables = {
  user: User;
};
