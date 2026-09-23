import React, { useEffect, useState } from "react";
import StatusGrid from "./StatusGrid";
import RecentActions from "./RecentActions";
import DeletedHistory from "./DeletedHistory";
import WeekAheadWidget from "@/components/markets/WeekAheadWidget";
import { isWidgetVisible, loadDashCfg } from "./dashboardConfig";

// Donna's widgets, in order: the large panel widgets first, then the status tiles.
// One stack, two homes — the desktop rail (WidgetPanel) and the phone sheet — so a
// widget only ever has to be added here.
export default function WidgetStack({ onExpandWidget }) {
  const [cfg, setCfg] = useState(loadDashCfg);

  // Stay in step with Customize (and with anything Donna changes by voice).
  useEffect(() => {
    const onChange = () => setCfg(loadDashCfg());
    window.addEventListener("donna-dash-change", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("donna-dash-change", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  return (
    <div className="space-y-3">
      <RecentActions />
      <DeletedHistory />
      {isWidgetVisible("market", cfg) && (
        <WeekAheadWidget compact onExpand={onExpandWidget ? () => onExpandWidget("market") : null} />
      )}
      <StatusGrid variant="panel" />
    </div>
  );
}
