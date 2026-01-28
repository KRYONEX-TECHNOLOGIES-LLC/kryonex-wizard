import React from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import LandingPage from "../pages/LandingPage.jsx";
import BackgroundGrid from "./BackgroundGrid.jsx";

/**
 * Renders "/" (landing). Logged-in users with an agent, or admins (by role or env email),
 * are sent to /dashboard. Others see the marketing landing (no screen glitch).
 */
export default function LandingGate() {
  const [status, setStatus] = React.useState("checking"); // 'checking' | 'no-session' | 'has-agent' | 'no-agent'

  React.useEffect(() => {
    let mounted = true;

    const run = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      const user = session?.user;

      if (!mounted) return;

      if (!user) {
        setStatus("no-session");
        return;
      }

      const adminEmails = String(
        import.meta.env.VITE_ADMIN_EMAIL || import.meta.env.VITE_ADMIN_EMAILS || ""
      )
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);
      const isAdminByEmail = adminEmails.includes(String(user.email || "").toLowerCase());

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      const isAdminByRole = profile?.role === "admin";
      const canAccessAdmin = isAdminByRole || isAdminByEmail;

      if (!mounted) return;
      // Admins can go straight to user dashboard without an agent
      if (canAccessAdmin) {
        setStatus("has-agent");
        return;
      }

      const { data: agent } = await supabase
        .from("agents")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (!mounted) return;
      setStatus(agent ? "has-agent" : "no-agent");
    };

    run();
    return () => {
      mounted = false;
    };
  }, []);

  if (status === "has-agent") {
    return <Navigate to="/dashboard" replace />;
  }

  if (status === "no-session" || status === "no-agent") {
    return <LandingPage />;
  }

  // status === 'checking': same visual as landing (no glitch) but no content
  return (
    <div style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      <BackgroundGrid />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      />
    </div>
  );
}
