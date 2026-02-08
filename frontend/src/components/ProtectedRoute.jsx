import React from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function ProtectedRoute({ children }) {
  const [checking, setChecking] = React.useState(true);
  const [session, setSession] = React.useState(null);
  const navigate = useNavigate();

  React.useEffect(() => {
    let mounted = true;
    
    // Timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      if (mounted && checking) {
        console.warn("[ProtectedRoute] Session check timed out");
        setChecking(false);
        setSession(null);
      }
    }, 5000);
    
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error("[ProtectedRoute] Session error:", error);
      }
      if (mounted) {
        setSession(data?.session || null);
        setChecking(false);
        clearTimeout(timeout);
      }
    }).catch((err) => {
      console.error("[ProtectedRoute] getSession failed:", err);
      if (mounted) {
        setSession(null);
        setChecking(false);
        clearTimeout(timeout);
      }
    });
    
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (mounted) {
          setSession(newSession);
        }
      }
    );
    return () => {
      mounted = false;
      clearTimeout(timeout);
      listener?.subscription?.unsubscribe();
    };
  }, []);

  React.useEffect(() => {
    if (!session) return;
    if (!window.localStorage.getItem("kryonex_session_ok")) {
      supabase.auth.signOut();
      navigate("/login?reason=session", { replace: true });
      return;
    }
    let timeoutId = null;
    const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        await supabase.auth.signOut();
        navigate("/login?reason=idle", { replace: true });
      }, IDLE_TIMEOUT_MS);
    };

    const events = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
    ];
    events.forEach((evt) => window.addEventListener(evt, resetTimer, true));
    resetTimer();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach((evt) =>
        window.removeEventListener(evt, resetTimer, true)
      );
    };
  }, [session, navigate]);

  if (checking) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          color: "#8b5cf6",
          letterSpacing: "0.2rem",
        }}
      >
        INITIALIZING...
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
