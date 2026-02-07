import React from "react";
import { Link, useLocation } from "react-router-dom";
import { getImpersonation, IMPERSONATION_EVENT } from "../lib/impersonation";

// Mobile drawer context - allows external control of drawer state
export const MobileNavContext = React.createContext({
  isOpen: false,
  setIsOpen: () => {},
});

export function MobileNavProvider({ children }) {
  const [isOpen, setIsOpen] = React.useState(false);
  
  // Close drawer on route change
  const location = useLocation();
  React.useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);
  
  // Close drawer on escape key
  React.useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);
  
  // Close drawer when resizing to desktop (safety net)
  React.useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    // Check immediately
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  
  // Prevent body scroll when drawer is open (only on mobile)
  React.useEffect(() => {
    if (isOpen && window.innerWidth < 1024) {
      // Simple overflow hidden - don't use position:fixed as it causes content to disappear
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    } else {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    }
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    };
  }, [isOpen]);
  
  return (
    <MobileNavContext.Provider value={{ isOpen, setIsOpen }}>
      {children}
    </MobileNavContext.Provider>
  );
}

// Hook to use mobile nav
export function useMobileNav() {
  return React.useContext(MobileNavContext);
}

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
  const [impersonation, setImpersonation] = React.useState(() =>
    typeof window === "undefined" ? { active: false } : getImpersonation()
  );
  
  // Auto-detect mobile/tablet for drawer mode
  const [isMobile, setIsMobile] = React.useState(() => 
    typeof window !== "undefined" && window.innerWidth < 1024
  );
  
  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    // Check immediately on mount to ensure correct initial state
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  
  const { isOpen, setIsOpen } = useMobileNav();
  
  React.useEffect(() => {
    const updateMode = () => {
      const next =
        typeof window === "undefined"
          ? "user"
          : window.localStorage.getItem("kryonex_admin_mode") || "user";
      setViewMode(next);
    };
    updateMode();
    window.addEventListener("kryonex-admin-mode", updateMode);
    return () => {
      window.removeEventListener("kryonex-admin-mode", updateMode);
    };
  }, []);
  React.useEffect(() => {
    const update = () => setImpersonation(getImpersonation());
    update();
    window.addEventListener(IMPERSONATION_EVENT, update);
    return () => window.removeEventListener(IMPERSONATION_EVENT, update);
  }, []);
  // When impersonating, treat as User View: no admin links, no admin bypass
  const adminEnabled = isAdmin && viewMode === "admin" && !impersonation.active;
  const statusLabel = String(billingStatus || "none").toUpperCase();
  const tierLabel = tier ? tier.toUpperCase() : "NONE";
  const timeLabel = lastUpdated ? lastUpdated.toLocaleTimeString() : "--";
  
  // Close drawer when clicking a link (only on mobile)
  const handleLinkClick = () => {
    if (isMobile) {
      setIsOpen(false);
    }
  };

  const navContent = (
    <>
      <div className="side-nav-header">
        <div className="side-nav-title">Kryonex Command</div>
        <div className="side-nav-sub">War Room</div>
      </div>

      <div className="side-nav-actions">
        {eligibleNewAgent ? (
          <button className="side-nav-button" onClick={() => { onNewAgent?.(); handleLinkClick(); }}>
            Deploy New Agent
          </button>
        ) : (
          <button className="side-nav-button" onClick={() => { onUpgrade?.(); handleLinkClick(); }}>
            Upgrade Tier
          </button>
        )}
      </div>

      <nav className="side-nav-links">
        <div className="side-nav-label">Command Grid</div>
        <Link
          to={adminEnabled ? "/admin/dashboard" : "/dashboard"}
          className="side-nav-link"
          onClick={handleLinkClick}
        >
          <span className="nav-icon">📡</span>
          War Room
        </Link>
        <Link to={adminEnabled ? "/admin/leads" : "/leads"} className="side-nav-link" onClick={handleLinkClick}>
          <span className="nav-icon">💰</span>
          Lead Grid
        </Link>
        <Link to="/customers" className="side-nav-link" onClick={handleLinkClick}>
          <span className="nav-icon">👥</span>
          Customers
        </Link>
        <Link to={adminEnabled ? "/admin/calendar" : "/calendar"} className="side-nav-link" onClick={handleLinkClick}>
          <span className="nav-icon">📍</span>
          Calendar
        </Link>
        <Link to="/numbers" className="side-nav-link" onClick={handleLinkClick}>
          <span className="nav-icon">📞</span>
          Numbers
        </Link>
        <Link to={adminEnabled ? "/admin/messages" : "/messages"} className="side-nav-link" onClick={handleLinkClick}>
          <span className="nav-icon">✉️</span>
          Messages
        </Link>
        <Link to="/billing/tiers" className="side-nav-link" onClick={handleLinkClick}>
          <span className="nav-icon">💳</span>
          Tiers & Top-Ups
        </Link>
        <Link to="/black-box" className="side-nav-link" onClick={handleLinkClick}>
          <span className="nav-icon">🎙️</span>
          Black Box
        </Link>
        <Link to="/analytics" className="side-nav-link" onClick={handleLinkClick}>
          <span className="nav-icon">📊</span>
          Analytics
        </Link>
        <Link to="/referrals" className="side-nav-link" onClick={handleLinkClick}>
          <span className="nav-icon">🎁</span>
          Referrals
        </Link>
        <Link to="/integrations" className="side-nav-link" onClick={handleLinkClick}>
          <span className="nav-icon">🔗</span>
          Integrations
        </Link>
        <Link to="/settings" className="side-nav-link" onClick={handleLinkClick}>
          <span className="nav-icon">⚙️</span>
          Settings
        </Link>
        {adminEnabled && !isSeller ? (
          <div className="side-nav-admin-group">
            <button
              type="button"
              className="side-nav-admin-toggle"
              onClick={() => setAdminOpen((prev) => !prev)}
            >
              <span>ADMIN COMMAND</span>
              <span>{adminOpen ? "▼" : "▶"}</span>
            </button>
            {adminOpen ? (
              <div className="side-nav-admin-links">
                <Link to="/admin/wizard/create" className="side-nav-link" onClick={handleLinkClick}>
                  Client Wizard
                </Link>
                <Link to="/admin/leads" className="side-nav-link" onClick={handleLinkClick}>
                  Lead Grid
                </Link>
                <Link to="/admin/call-center" className="side-nav-link" onClick={handleLinkClick}>
                  Live Dialer
                </Link>
                <Link to="/admin/sellers" className="side-nav-link" onClick={handleLinkClick}>
                  Personnel
                </Link>
                <Link to="/admin/users" className="side-nav-link" onClick={handleLinkClick}>
                  Fleet Registry
                </Link>
                <Link to="/billing/tiers" className="side-nav-link" onClick={handleLinkClick}>
                  Billing & Top-Ups
                </Link>
                <Link to="/admin/logs" className="side-nav-link" onClick={handleLinkClick}>
                  Sales Floor Activity
                </Link>
                <Link to="/admin/final-logs" className="side-nav-link" onClick={handleLinkClick}>
                  Final Logs
                </Link>
                <Link to="/admin/financials" className="side-nav-link" onClick={handleLinkClick}>
                  Revenue Telemetry
                </Link>
                <Link to="/admin/referrals" className="side-nav-link" onClick={handleLinkClick}>
                  Referral Control
                </Link>
                <Link to="/admin/ops" className="side-nav-link" onClick={handleLinkClick}>
                  Ops Dashboard
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
        <Link to="/settings" className="side-nav-link side-nav-settings" onClick={handleLinkClick}>
          ⚙️ Settings
        </Link>
      </div>
    </>
  );

  // On mobile/tablet: render as slide-out drawer
  // On desktop: render as fixed sidebar
  if (isMobile) {
    return (
      <>
        {/* Backdrop overlay */}
        <div 
          className={`mobile-drawer-overlay ${isOpen ? 'active' : ''}`}
          onClick={() => setIsOpen(false)}
          aria-hidden={!isOpen}
          data-drawer-state={isOpen ? 'open' : 'closed'}
        />
        {/* Drawer */}
        <aside 
          className={`side-nav side-nav-drawer ${isOpen ? 'open' : ''}`}
          aria-hidden={!isOpen}
          data-drawer-state={isOpen ? 'open' : 'closed'}
        >
          {navContent}
        </aside>
      </>
    );
  }

  // Regular side nav for desktop
  return (
    <aside className="side-nav">
      {navContent}
    </aside>
  );
}
