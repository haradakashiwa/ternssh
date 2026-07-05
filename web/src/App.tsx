import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { api, type MeResponse } from "@/lib/api";
import { DashboardView } from "@/dashboard/DashboardView";

export default function App() {
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    void api.getMe().then(setMe).catch(console.error);
  }, []);

  return (
    <div className="app-shell">
      <header className="workspace-header">
        <div className="app-brand">ternssh</div>
        {me && (
          <div className="app-status">
            <Badge>
              {me.authMode === "open"
                ? `开放模式 · ${me.user.display_name ?? "Default"}`
                : me.user.email ?? me.user.display_name ?? me.user.id}
            </Badge>
          </div>
        )}
      </header>
      <DashboardView />
    </div>
  );
}
