import React from "react";
import { Link } from "react-router-dom";

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
  const statusLabel = String(billingStatus || "none").toUpperCase();
  const tierLabel = tier ? tier.toUpperCase() : "NONE";
  const timeLabel = lastUpdated ? lastUpdated.toLocaleTimeString() : "--";

  return (
    <aside className="side-nav">
      <div className="side-nav-header">
        <div className="side-nav-title">Kryonex</div>
        <div className="side-nav-sub">Command Suite</div>
      </div>

      <div className="side-nav-actions">
        {eligibleNewAgent ? (
          <button className="side-nav-button" onClick={onNewAgent}>
            Create New Agent
          </button>
        ) : (
          <button className="side-nav-button" onClick={onUpgrade}>
            Upgrade for Multiple Agents
          </button>
        )}
      </div>

      <nav className="side-nav-links">
        <div className="side-nav-label">Daily Sales Ops</div>
        {!isSeller && (
          <a href="#command-deck" className="side-nav-link">
            Command Deck
          </a>
        )}
        {isSeller ? (
          <Link to="/console/dialer" className="side-nav-link">
            Call Center
          </Link>
        ) : isAdmin ? (
          <Link to="/admin/call-center" className="side-nav-link">
            Call Center
          </Link>
        ) : null}
        <a href="#lead-grid" className="side-nav-link">
          Lead Grid
        </a>
        {!isSeller && (
          <>
            <a href="#black-box" className="side-nav-link">
              Black Box
            </a>
            <a href="#sms-log" className="side-nav-link">
              Messages
            </a>
          </>
        )}
        <Link to="/calendar" className="side-nav-link">
          Calendar
        </Link>
        {isAdmin && !isSeller ? (
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
                <Link to="/admin/sellers" className="side-nav-link">
                  Personnel
                </Link>
                <Link to="/admin/users" className="side-nav-link">
                  Fleet Registry
                </Link>
                <Link to="/admin/logs" className="side-nav-link">
                  Global Neural Logs
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
        <div className="side-nav-label">Trust Signals</div>
        <div className="side-nav-pill">
          Agent {agentLive ? "LIVE" : "PAUSED"}
        </div>
        <div className="side-nav-pill">Billing {statusLabel}</div>
        <div className="side-nav-pill">Tier {tierLabel}</div>
        <div className="side-nav-pill">Pulse {timeLabel}</div>
      </div>
    </aside>
  );
}
