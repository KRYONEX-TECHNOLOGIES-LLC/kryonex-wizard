import React from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import BackgroundGrid from "../components/BackgroundGrid.jsx";
import { supabase } from "../lib/supabase";
import { autoGrantAdmin, logBlackBoxEvent, verifyAdminCode } from "../lib/api";

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [mode, setMode] = React.useState("login");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [checkingSession, setCheckingSession] = React.useState(true);
  const [adminCode, setAdminCode] = React.useState("");

  React.useEffect(() => {
    const reason = searchParams.get("reason");
    if (reason === "idle") {
      setNotice("You were signed out due to inactivity. Sign in again.");
      setSearchParams({}, { replace: true });
    } else if (reason === "session") {
      setNotice("Your session ended. Sign in again.");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  React.useEffect(() => {
    let mounted = true;
    const bootstrap = async () => {
      const { data } = await supabase.auth.getSession();
      if (mounted && data?.session) {
        if (adminCode) {
          try {
            const response = await autoGrantAdmin(adminCode);
            if (response.data?.ok) {
              window.localStorage.setItem("kryonex_admin_mode", "admin");
              navigate("/admin");
              return;
            }
          } catch (err) {
            // not admin
          }
        }
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("user_id", data.session.user.id)
          .maybeSingle();
        if (profile?.role === "admin") {
          window.localStorage.setItem("kryonex_admin_mode", "admin");
          navigate("/admin");
          return;
        }
        if (profile?.role === "seller") {
          navigate("/console/dialer");
          return;
        }
        window.localStorage.setItem("kryonex_admin_mode", "user");
        navigate("/wizard");
      }
      if (mounted) setCheckingSession(false);
    };
    bootstrap();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  React.useEffect(() => {
    const handleKey = (event) => {
      if (event.ctrlKey && event.shiftKey && event.code === "KeyA") {
        event.preventDefault();
        const code = window.prompt("Admin Access Code");
        if (code) {
          setAdminCode(code);
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    const authResult =
      mode === "signup"
        ? await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/login`,
            },
          })
        : await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authResult.error) {
      const message = authResult.error.message || "Authentication failed";
      if (
        mode === "signup" &&
        /already registered|already in use|user already/i.test(message)
      ) {
        setNotice("Account exists. Switch to Sign In.");
        setMode("login");
      } else if (mode === "login" && /invalid login|credentials|invalid credentials/i.test(message)) {
        setError("Invalid credentials. Use Forgot Password to reset your password, then sign in again.");
      } else {
        setError(message);
      }
      return;
    }
    if (mode === "signup" && !authResult.data?.session) {
      setNotice("Check your email to confirm your account, then log in.");
      return;
    }
    window.localStorage.setItem("kryonex_session_ok", "1");
    try {
      await logBlackBoxEvent("LOGIN", { mode, email });
    } catch {
      // best-effort logging
    }
    if (adminCode) {
      try {
        const response = await autoGrantAdmin(adminCode);
        if (response.data?.ok) {
          window.localStorage.setItem("kryonex_admin_mode", "admin");
          navigate("/admin");
          return;
        }
      } catch (adminErr) {
        // Not an admin account, continue to role check.
      }
    }
    if (adminCode) {
      try {
        const response = await verifyAdminCode(adminCode);
        if (response.data?.ok) {
          window.localStorage.setItem("kryonex_admin_mode", "admin");
          navigate("/admin");
          return;
        }
      } catch (codeErr) {
        setError("Invalid admin access code.");
        return;
      }
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", sessionData?.session?.user?.id)
      .maybeSingle();
    if (profile?.role === "admin") {
      window.localStorage.setItem("kryonex_admin_mode", "admin");
      navigate("/admin");
      return;
    }
    if (profile?.role === "seller") {
      navigate("/console/dialer");
      return;
    }
    window.localStorage.setItem("kryonex_admin_mode", "user");
    navigate("/wizard");
  };

  const handleReset = async () => {
    if (!email) {
      setError("Enter your email first.");
      return;
    }
    setError("");
    setNotice("");
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo: `${window.location.origin}/login` }
    );
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setNotice("Password reset email sent.");
  };

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      <BackgroundGrid />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: "420px",
          margin: "0 auto",
          padding: "7rem 1.5rem",
        }}
      >
        {checkingSession ? (
          <div
            className="glass"
            style={{
              padding: "2rem",
              textAlign: "center",
              letterSpacing: "0.2rem",
              color: "#8b5cf6",
            }}
          >
            AUTHORIZING...
          </div>
        ) : (
        <motion.h2
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{
            letterSpacing: "0.2rem",
            marginBottom: "2rem",
            textAlign: "center",
          }}
        >
          {mode === "signup"
            ? "NEW USER SYNTHESIS"
            : "BIO-METRIC SECURITY GATE"}
        </motion.h2>
        )}
        {!checkingSession && (
        <form className="glass" style={{ padding: "2.5rem" }} onSubmit={handleSubmit}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.6rem",
              marginBottom: "1.5rem",
            }}
          >
            <button
              type="button"
              onClick={() => setMode("login")}
              style={{
                padding: "0.6rem",
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,0.2)",
                background:
                  mode === "login" ? "rgba(34,211,238,0.2)" : "transparent",
                color: mode === "login" ? "#22d3ee" : "#9ca3af",
                fontWeight: 600,
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              style={{
                padding: "0.6rem",
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,0.2)",
                background:
                  mode === "signup" ? "rgba(34,211,238,0.2)" : "transparent",
                color: mode === "signup" ? "#22d3ee" : "#9ca3af",
                fontWeight: 600,
              }}
            >
              Create
            </button>
          </div>
          <label style={{ display: "block", marginBottom: "1.5rem" }}>
            <span style={{ color: "#9ca3af" }}>Email</span>
            <input
              className="input-field"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label style={{ display: "block", marginBottom: "1.5rem" }}>
            <span style={{ color: "#9ca3af" }}>Access Key</span>
            <input
              className="input-field"
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? (
            <div style={{ color: "#f87171", marginBottom: "1rem" }}>{error}</div>
          ) : null}
          {notice ? (
            <div style={{ color: "#10b981", marginBottom: "1rem" }}>
              {notice}
            </div>
          ) : null}
          <motion.button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "0.9rem",
              borderRadius: "999px",
              border: "none",
              background:
                "linear-gradient(90deg, rgba(16,185,129,1) 0%, rgba(5,5,5,1) 100%)",
              color: "#e5e7eb",
              fontWeight: 600,
              letterSpacing: "0.15rem",
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {loading
              ? "VERIFYING..."
              : mode === "signup"
              ? "CREATE PROFILE"
              : "SIGN IN"}
          </motion.button>
          {mode === "login" ? (
            <div style={{ marginTop: "0.9rem", textAlign: "center" }}>
              <button
                type="button"
                onClick={handleReset}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#8b5cf6",
                  letterSpacing: "0.08rem",
                  cursor: "pointer",
                }}
              >
                Forgot Password
              </button>
            </div>
          ) : null}
        </form>
        )}
      </div>
    </div>
  );
}
