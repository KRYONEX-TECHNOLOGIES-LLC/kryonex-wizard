import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  autoGrantAdmin,
  getSubscriptionStatus,
  logBlackBoxEvent,
  logImpersonationEnd,
  verifyAdminCode,
} from "../lib/api";
import AdminModeToggle from "./AdminModeToggle.jsx";
import { getImpersonation, clearImpersonation, IMPERSONATION_EVENT } from "../lib/impersonation";

export default function TopMenu() {
  const location = useLocation();
  const navigate = useNavigate();
  const wizardMaintenance =
    String(import.meta.env.VITE_WIZARD_MAINTENANCE || "").toLowerCase() === "true";
  const [open, setOpen] = React.useState(false);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [isSeller, setIsSeller] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [onboardingComplete, setOnboardingComplete] = React.useState(false);
  const [subscription, setSubscription] = React.useState({
    status: "unknown",
    plan_type: null,
  });
  const [adminError, setAdminError] = React.useState("");
  const [viewMode, setViewMode] = React.useState(
    () => window.localStorage.getItem("kryonex_admin_mode") || "user"
  );
  const [impersonation, setImpersonationState] = React.useState(getImpersonation);
  const adminEmails = String(
    import.meta.env.VITE_ADMIN_EMAIL || import.meta.env.VITE_ADMIN_EMAILS || ""
  )
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const isAdminEmail = adminEmails.includes(email.toLowerCase());
  const canAccessAdmin = isAdmin || isAdminEmail;

  React.useEffect(() => {
    let mounted = true;
    const loadProfile = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, business_name, area_code")
        .eq("user_id", user.id)
        .maybeSingle();
      if (mounted) {
        setIsAdmin(profile?.role === "admin");
        setIsSeller(profile?.role === "seller");
        setEmail(user.email || "");
        setOnboardingComplete(
          Boolean(profile?.business_name) && Boolean(profile?.area_code)
        );
      }
      try {
        const subRes = await getSubscriptionStatus();
        if (mounted) {
          setSubscription(subRes.data || { status: "unknown", plan_type: null });
        }
      } catch {
        if (mounted) {
          setSubscription({ status: "unknown", plan_type: null });
        }
      }
    };
    loadProfile();
    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    const updateMode = () => {
      setViewMode(window.localStorage.getItem("kryonex_admin_mode") || "user");
    };
    updateMode();
    window.addEventListener("kryonex-admin-mode", updateMode);
    return () => {
      window.removeEventListener("kryonex-admin-mode", updateMode);
    };
  }, []);

  React.useEffect(() => {
    const updateImpersonation = () => setImpersonationState(getImpersonation());
    updateImpersonation();
    window.addEventListener(IMPERSONATION_EVENT, updateImpersonation);
    return () => window.removeEventListener(IMPERSONATION_EVENT, updateImpersonation);
  }, []);

  React.useEffect(() => {
    if (canAccessAdmin && location.pathname.startsWith("/admin") && viewMode !== "admin") {
      window.localStorage.setItem("kryonex_admin_mode", "admin");
      window.dispatchEvent(new Event("kryonex-admin-mode"));
      setViewMode("admin");
    }
  }, [location.pathname, canAccessAdmin, viewMode]);

  const handleLogout = async () => {
    try {
      await logBlackBoxEvent("LOGOUT");
    } catch {
      // best-effort logging
    }
    await supabase.auth.signOut();
    window.localStorage.removeItem("kryonex_session_ok");
    setOpen(false);
    navigate("/login", { replace: true });
  };

  const isOnAdminRoute = location.pathname.startsWith("/admin");
  const adminEnabled = canAccessAdmin && (viewMode === "admin" || isOnAdminRoute);
  const items = [];
  if (isSeller) {
    items.push({ to: "/console/dialer", label: "Call Center" });
    items.push({ to: "/calendar", label: "Calendar" });
    if (!onboardingComplete && (!wizardMaintenance || isAdmin)) {
      items.push({ to: "/wizard", label: "Wizard" });
    }
  } else {
    if (canAccessAdmin) {
      items.push({ to: "/admin", label: "Access Admin" });
    }
    items.push({ to: "/dashboard", label: "Dashboard" });
    if ((!onboardingComplete || viewMode === "user") && (!wizardMaintenance || canAccessAdmin)) {
      items.push({ to: "/wizard", label: "Wizard" });
    }
    items.push({ to: "/billing", label: "Billing" });
  }

  const badgeLabel = impersonation.active
    ? "IMPERSONATING"
    : adminEnabled
    ? "ADMIN VIEW"
    : isSeller
    ? "AGENT VIEW"
    : "USER VIEW";
  const badgeClass = impersonation.active
    ? "view-admin"
    : adminEnabled
    ? "view-admin"
    : isSeller
    ? "view-agent"
    : "view-user";

  const handleExitImpersonation = async () => {
    const { userId } = impersonation;
    try {
      if (userId) await logImpersonationEnd(userId);
    } catch {
      // best-effort
    }
    clearImpersonation();
    setOpen(false);
    navigate(canAccessAdmin ? "/admin/users" : "/dashboard");
  };

  const handleAdminUnlock = async () => {
    const code = window.prompt("Admin Access Code");
    if (!code) return;
    setAdminError("");
    try {
      const response = await autoGrantAdmin(code);
      if (response.data?.ok) {
        window.localStorage.setItem("kryonex_admin_mode", "admin");
        window.dispatchEvent(new Event("kryonex-admin-mode"));
        setViewMode("admin");
        setOpen(false);
        navigate("/admin");
        return;
      }
      setAdminError("Admin access denied.");
    } catch (err) {
      try {
        const fallback = await verifyAdminCode(code);
        if (fallback.data?.ok) {
          window.localStorage.setItem("kryonex_admin_mode", "admin");
          window.dispatchEvent(new Event("kryonex-admin-mode"));
          setViewMode("admin");
          setOpen(false);
          navigate("/admin");
          return;
        }
        setAdminError("Admin access denied.");
      } catch (fallbackErr) {
        setAdminError(
          fallbackErr.response?.data?.error || "Unable to unlock admin access."
        );
      }
    }
  };

  const handleSwitchToAdmin = () => {
    window.localStorage.setItem("kryonex_admin_mode", "admin");
    window.dispatchEvent(new Event("kryonex-admin-mode"));
    setViewMode("admin");
    setOpen(false);
    navigate("/admin");
  };

  return (
    <>
      <div className={`top-menu-view-badge ${badgeClass}`}>{badgeLabel}</div>
      <div className="top-menu">
        <button
          className="top-menu-button"
          onClick={() => setOpen((prev) => !prev)}
          type="button"
        >
          <span>MENU</span>
          <span
            className={`status-dot status-${String(subscription.status || "")
              .toLowerCase()
              .replace("_", "-")}`}
          />
        </button>
        {open ? (
          <div className="top-menu-panel">
            <div className="top-menu-header">
              <div className="top-menu-title">Kryonex Control</div>
              {email ? <div className="top-menu-email">{email}</div> : null}
            </div>
            <div className="top-menu-links">
              {items.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`top-menu-item${
                    location.pathname === item.to ? " is-active" : ""
                  }`}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="top-menu-status">
              <div className="top-menu-status-label">Billing</div>
              <div className={`status-pill status-${String(subscription.status || "")
                .toLowerCase()
                .replace("_", "-")}`}>
                {subscription.plan_type
                  ? `${subscription.plan_type} • ${subscription.status}`
                  : subscription.status}
              </div>
            </div>
            {impersonation.active ? (
              <button
                type="button"
                className="top-menu-logout"
                style={{ marginTop: "0.75rem" }}
                onClick={handleExitImpersonation}
              >
                Exit Impersonation
              </button>
            ) : canAccessAdmin ? (
              <div className="top-menu-section">
                <AdminModeToggle
                  align="left"
                  onModeChange={(mode) => setViewMode(mode)}
                  canAccessAdmin={canAccessAdmin}
                />
                {viewMode !== "admin" && !isOnAdminRoute ? (
                  <button
                    type="button"
                    className="top-menu-logout"
                    style={{ marginTop: "0.75rem" }}
                    onClick={handleSwitchToAdmin}
                  >
                    Access Admin
                  </button>
                ) : null}
                {viewMode === "admin" || isOnAdminRoute ? (
                  <button
                    type="button"
                    className="top-menu-logout"
                    style={{ marginTop: "0.75rem" }}
                    onClick={() => {
                      window.localStorage.setItem("kryonex_admin_mode", "user");
                      window.dispatchEvent(new Event("kryonex-admin-mode"));
                      setViewMode("user");
                      setOpen(false);
                      navigate("/dashboard");
                    }}
                  >
                    Switch to User View
                  </button>
                ) : null}
              </div>
            ) : null}
            <button className="top-menu-logout" type="button" onClick={handleLogout}>
              Log Out
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
