import React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function AdminModeToggle({ align = "right", onModeChange }) {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = React.useState(false);
  const readMode = () =>
    window.localStorage.getItem("kryonex_admin_mode") || "user";
  const [mode, setMode] = React.useState(readMode);

  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (mounted) setIsAdmin(profile?.role === "admin");
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    const syncMode = () => setMode(readMode());
    window.addEventListener("kryonex-admin-mode", syncMode);
    return () => {
      window.removeEventListener("kryonex-admin-mode", syncMode);
    };
  }, []);

  if (!isAdmin) return null;

  const setAdminMode = (next) => {
    if (readMode() === next) return;
    window.localStorage.setItem("kryonex_admin_mode", next);
    setMode(next);
    window.dispatchEvent(new Event("kryonex-admin-mode"));
    if (onModeChange) {
      onModeChange(next);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "0.6rem",
        justifyContent: align === "right" ? "flex-end" : "flex-start",
        flexWrap: "wrap",
      }}
    >
      <button
        className="button-primary"
        onClick={() => {
          setAdminMode("admin");
          navigate("/admin");
        }}
      >
        ADMIN COMMAND
      </button>
      <button
        className="button-primary"
        onClick={() => {
          setAdminMode("user");
          navigate("/wizard");
        }}
      >
        USER VIEW
      </button>
      <div style={{ color: "#9ca3af", alignSelf: "center" }}>
        Mode: <span style={{ color: "#22d3ee" }}>{mode.toUpperCase()}</span>
      </div>
    </div>
  );
}
