import React from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function RequireRole({ roles, children, fallback = "/dashboard" }) {
  const [checking, setChecking] = React.useState(true);
  const [allowed, setAllowed] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    const checkRole = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) {
        if (mounted) {
          setAllowed(false);
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
        const role = profile?.role || "";
        setAllowed(Array.isArray(roles) ? roles.includes(role) : role === roles);
        setChecking(false);
      }
    };

    checkRole();
    return () => {
      mounted = false;
    };
  }, [roles]);

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
        AUTHORIZING...
      </div>
    );
  }

  if (!allowed) {
    return <Navigate to={fallback} replace />;
  }

  return children;
}
