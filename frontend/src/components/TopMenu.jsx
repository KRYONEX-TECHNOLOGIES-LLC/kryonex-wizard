import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { autoGrantAdmin, getSubscriptionStatus, logBlackBoxEvent } from "../lib/api";
import AdminModeToggle from "./AdminModeToggle.jsx";

export default function TopMenu() {
  const location = useLocation();
  const navigate = useNavigate();
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

  React.useEffect(() => {
    let mounted = true;
    const loadProfile = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, business_name, industry")
        .eq("user_id", user.id)
        .maybeSingle();
      if (mounted) {
        setIsAdmin(profile?.role === "admin");
        setIsSeller(profile?.role === "seller");
        setEmail(user.email || "");
        setOnboardingComplete(
          Boolean(profile?.business_name) && Boolean(profile?.industry)
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
    window.addEventListener("storage", updateMode);
    window.addEventListener("kryonex-admin-mode", updateMode);
    return () => {
      window.removeEventListener("storage", updateMode);
      window.removeEventListener("kryonex-admin-mode", updateMode);
    };
  }, []);

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

  const adminEnabled = isAdmin && viewMode === "admin";
  const items = [];
  if (isSeller) {
    items.push({ to: "/console/dialer", label: "Call Center" });
    items.push({ to: "/calendar", label: "Calendar" });
    if (!onboardingComplete) {
      items.push({ to: "/wizard", label: "Wizard" });
    }
  } else {
    items.push({ to: "/dashboard", label: "Dashboard" });
    if (!onboardingComplete || viewMode === "user") {
      items.push({ to: "/wizard", label: "Wizard" });
    }
    items.push({ to: "/billing", label: "Billing" });
    if (isAdmin) {
      items.push({ to: "/admin", label: "Admin Command" });
    }
  }

  const badgeLabel =
    adminEnabled
      ? "ADMIN VIEW"
      : isSeller
      ? "AGENT VIEW"
      : "USER VIEW";
  const badgeClass =
    adminEnabled
      ? "view-admin"
      : isSeller
      ? "view-agent"
      : "view-user";

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
      setAdminError(
        err.response?.data?.error || "Unable to unlock admin access."
      );
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
            {isAdmin ? (
              <div className="top-menu-section">
                <AdminModeToggle
                  align="left"
                  onModeChange={(mode) => setViewMode(mode)}
                />
                {viewMode !== "admin" ? (
                  <button
                    type="button"
                    className="top-menu-logout"
                    style={{ marginTop: "0.75rem" }}
                    onClick={handleSwitchToAdmin}
                  >
                    Switch to Admin View
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="top-menu-section">
                <button
                  type="button"
                  className="top-menu-logout"
                  onClick={handleAdminUnlock}
                >
                  Unlock Admin Access
                </button>
                {adminError ? (
                  <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#f472b6" }}>
                    {adminError}
                  </div>
                ) : null}
              </div>
            )}
            <button className="top-menu-logout" type="button" onClick={handleLogout}>
              Log Out
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
