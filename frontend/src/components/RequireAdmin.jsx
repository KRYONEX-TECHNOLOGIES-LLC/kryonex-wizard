import React from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function RequireAdmin({ children }) {
  const [checking, setChecking] = React.useState(true);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const adminEmails = String(
    import.meta.env.VITE_ADMIN_EMAIL || import.meta.env.VITE_ADMIN_EMAILS || ""
  )
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  React.useEffect(() => {
    let mounted = true;
    const checkRole = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) {
        if (mounted) {
          setIsAdmin(false);
          setChecking(false);
        }
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (mounted) {
        const emailMatch = adminEmails.includes(String(user.email || "").toLowerCase());
        setIsAdmin(profile?.role === "admin" || emailMatch);
        setChecking(false);
      }
    };

    checkRole();
    return () => {
      mounted = false;
    };
  }, []);

  if (checking) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          color: "#22d3ee",
          letterSpacing: "0.2rem",
        }}
      >
        AUTHORIZING ADMIN...
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
