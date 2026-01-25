import React from "react";
import { Link } from "react-router-dom";
import AdminModeToggle from "./AdminModeToggle.jsx";

export default function SideNav({
  eligibleNewAgent,
  onUpgrade,
  onNewAgent,
  billingStatus,
  tier,
  agentLive,
  lastUpdated,
  isAdmin = false,
  isSeller = false,
}) {
  const [adminOpen, setAdminOpen] = React.useState(true);
  const [viewMode, setViewMode] = React.useState(() =>
    typeof window === "undefined"
      ? "user"
      : window.localStorage.getItem("kryonex_admin_mode") || "user"
  );
  React.useEffect(() => {
    const updateMode = () => {
      const next =
        typeof window === "undefined"
          ? "user"
          : window.localStorage.getItem("kryonex_admin_mode") || "user";
      setViewMode(next);
    };
    updateMode();
    window.addEventListener("storage", updateMode);
    window.addEventListener("kryonex-admin-mode", updateMode);
    return () => {
      window.removeEventListener("storage", updateMode);
      window.removeEventListener("kryonex-admin-mode", updateMode);
    };
  }, []);
  const adminEnabled = isAdmin && viewMode === "admin";
  const statusLabel = String(billingStatus || "none").toUpperCase();
  const tierLabel = tier ? tier.toUpperCase() : "NONE";
  const timeLabel = lastUpdated ? lastUpdated.toLocaleTimeString() : "--";

  return (
    <aside className="side-nav">
      <div className="side-nav-header">
        <div className="side-nav-title">Kryonex Command</div>
        <div className="side-nav-sub">War Room</div>
      </div>
      {isAdmin && !isSeller ? (
        <div className="side-nav-admin-toggle-wrap">
          <AdminModeToggle align="left" onModeChange={(mode) => setViewMode(mode)} />
        </div>
      ) : null}

      <div className="side-nav-actions">
        {eligibleNewAgent ? (
          <button className="side-nav-button" onClick={onNewAgent}>
            Deploy New Agent
          </button>
        ) : (
          <button className="side-nav-button" onClick={onUpgrade}>
            Upgrade Tier
          </button>
        )}
      </div>

      <nav className="side-nav-links">
        <div className="side-nav-label">Command Grid</div>
        <Link
          to={adminEnabled ? "/admin/dashboard" : "/dashboard"}
          className="side-nav-link"
        >
          <span className="nav-icon">📡</span>
          War Room
        </Link>
        <Link to={adminEnabled ? "/admin/leads" : "/leads"} className="side-nav-link">
          <span className="nav-icon">💰</span>
          Lead Grid
        </Link>
        <Link to={adminEnabled ? "/admin/calendar" : "/calendar"} className="side-nav-link">
          <span className="nav-icon">📍</span>
          Calendar
        </Link>
        <Link to={adminEnabled ? "/admin/messages" : "/messages"} className="side-nav-link">
          <span className="nav-icon">✉️</span>
          Messages
        </Link>
        <Link to="/black-box" className="side-nav-link">
          <span className="nav-icon">🎙️</span>
          Black Box
        </Link>
        {adminEnabled && !isSeller ? (
          <div className="side-nav-admin-group">
            <button
              type="button"
              className="side-nav-admin-toggle"
              onClick={() => setAdminOpen((prev) => !prev)}
            >
              <span>ADMIN COMMAND</span>
              <span>{adminOpen ? "v" : ">"}</span>
            </button>
            {adminOpen ? (
              <div className="side-nav-admin-links">
                <Link to="/admin/wizard/create" className="side-nav-link">
                  Client Wizard
                </Link>
                <Link to="/admin/call-center" className="side-nav-link">
                  Live Dialer
                </Link>
                <Link to="/admin/sellers" className="side-nav-link">
                  Personnel
                </Link>
                <Link to="/admin/users" className="side-nav-link">
                  Fleet Registry
                </Link>
                <Link to="/admin/logs" className="side-nav-link">
                  Sales Floor Activity
                </Link>
                <Link to="/admin/final-logs" className="side-nav-link">
                  Final Logs
                </Link>
                <Link to="/admin/financials" className="side-nav-link">
                  Revenue Telemetry
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
      </nav>

      <div className="side-nav-status">
        <div className="side-nav-label">Command Status</div>
        <div className="side-nav-pill">System {agentLive ? "Online" : "Paused"}</div>
        <div className="side-nav-pill">Billing {statusLabel}</div>
        <div className="side-nav-pill">Tier {tierLabel}</div>
        <div className="side-nav-pill">Pulse {timeLabel}</div>
        <Link to="/billing" className="side-nav-link side-nav-settings">
          ⚙️ Settings
        </Link>
      </div>
    </aside>
  );
}
