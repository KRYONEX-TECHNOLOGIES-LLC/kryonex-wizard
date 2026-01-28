import React from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function RequireOnboarding({ children }) {
  const [checking, setChecking] = React.useState(true);
  const [isComplete, setIsComplete] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    const checkProfile = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) {
        if (mounted) {
          setIsComplete(false);
          setChecking(false);
        }
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("business_name, area_code, role")
        .eq("user_id", user.id)
        .maybeSingle();

      const adminEmails = String(
        import.meta.env.VITE_ADMIN_EMAIL || import.meta.env.VITE_ADMIN_EMAILS || ""
      )
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);
      const isAdminByEmail = adminEmails.includes(String(user.email || "").toLowerCase());
      const isAdminByRole = profile?.role === "admin";
      const canAccessAdmin = isAdminByRole || isAdminByEmail;

      const adminMode =
        typeof window === "undefined"
          ? "user"
          : window.localStorage.getItem("kryonex_admin_mode") || "user";
      if (mounted) {
        if (error || !profile) {
          // No profile: still allow bypass if admin-by-email so they can reach dashboard
          setIsComplete(isAdminByEmail);
        } else {
          // Admins (by role or env email) bypass wizard gating and can use user dashboard without an agent
          if (canAccessAdmin && (adminMode === "admin" || adminMode === "user")) {
            setIsComplete(true);
            setChecking(false);
            return;
          }
          const hasBusiness = Boolean(profile.business_name);
          const hasAreaCode = Boolean(profile.area_code);
          setIsComplete(hasBusiness && hasAreaCode);
        }
        setChecking(false);
      }
    };

    checkProfile();
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
          color: "#10b981",
          letterSpacing: "0.2rem",
        }}
      >
        SCANNING PROFILE...
      </div>
    );
  }

  if (!isComplete) {
    return <Navigate to="/wizard" replace />;
  }

  return children;
}
