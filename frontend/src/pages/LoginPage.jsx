import React from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import BackgroundGrid from "../components/BackgroundGrid.jsx";
import { supabase } from "../lib/supabase";
import { autoGrantAdmin, logBlackBoxEvent, verifyAdminCode, recordReferralSignup } from "../lib/api";

// Referral code storage key
const REFERRAL_CODE_KEY = "kryonex_referral_code";

export default function LoginPage({ embeddedMode, onEmbeddedSubmit }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [mode, setMode] = React.useState("login");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [checkingSession, setCheckingSession] = React.useState(!embeddedMode);
  const [adminCode, setAdminCode] = React.useState("");
  const [recoveryMode, setRecoveryMode] = React.useState(() =>
    typeof window !== "undefined" && window.location.hash.includes("type=recovery")
  );
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [setPasswordLoading, setSetPasswordLoading] = React.useState(false);
  const [setPasswordError, setSetPasswordError] = React.useState("");
  const [resendLoading, setResendLoading] = React.useState(false);
  const [emailNotConfirmed, setEmailNotConfirmed] = React.useState(false);
  const [referralCode, setReferralCode] = React.useState("");

  // Capture referral code from URL on initial load
  React.useEffect(() => {
    const refCode = searchParams.get("ref");
    if (refCode) {
      // Store in localStorage (persists even if user leaves page)
      localStorage.setItem(REFERRAL_CODE_KEY, refCode.toUpperCase());
      setReferralCode(refCode.toUpperCase());
      console.log("[Referral] Code captured:", refCode.toUpperCase());
      // Clean the URL but keep other params
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("ref");
      setSearchParams(newParams, { replace: true });
    } else {
      // Check if we have a stored referral code
      const storedCode = localStorage.getItem(REFERRAL_CODE_KEY);
      if (storedCode) {
        setReferralCode(storedCode);
      }
    }
  }, [searchParams, setSearchParams]);

  React.useEffect(() => {
    const reason = searchParams.get("reason");
    if (reason === "idle") {
      setNotice("You were signed out due to inactivity. Sign in again.");
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("reason");
      setSearchParams(newParams, { replace: true });
    } else if (reason === "session") {
      setNotice("Your session ended. Sign in again.");
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("reason");
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  React.useEffect(() => {
    if (embeddedMode) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
    });
    return () => subscription?.unsubscribe?.();
  }, [embeddedMode]);

  React.useEffect(() => {
    if (embeddedMode) return;
    let mounted = true;
    const bootstrap = async () => {
      const isRecovery = window.location.hash.includes("type=recovery");
      if (isRecovery) setRecoveryMode(true);
      const { data } = await supabase.auth.getSession();
      if (mounted && data?.session && !isRecovery) {
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
  }, [navigate, embeddedMode]);

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
    setEmailNotConfirmed(false);
    if (embeddedMode && onEmbeddedSubmit) {
      setLoading(true);
      try {
        await onEmbeddedSubmit({ email: email.trim(), password, mode });
      } catch (err) {
        const message = err.response?.data?.error ?? err.message ?? "Request failed";
        if (
          mode === "signup" &&
          /already exists|already registered|user already/i.test(message)
        ) {
          setNotice("Account exists. Switch to Sign In.");
          setMode("login");
        } else if (mode === "login" && /not found|user not found/i.test(message)) {
          setError("No account found for this email. Use Create to add a new client.");
        } else if (/rate limit|rate_limit/i.test(message)) {
          setError("Auth email limit reached for this project (Supabase default: 2/hour). Wait up to an hour, or set up custom SMTP in Supabase for higher limits.");
        } else {
          setError(message);
        }
      } finally {
        setLoading(false);
      }
      return;
    }
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
      } else if (mode === "login" && /email not confirmed|not confirmed/i.test(message)) {
        setEmailNotConfirmed(true);
        setError("Email not confirmed. Check your inbox (and spam) for the confirmation link, or resend it below.");
      } else if (/rate limit|rate_limit/i.test(message)) {
        setError("Auth email limit reached for this project (Supabase default: 2/hour). Wait up to an hour, or set up custom SMTP in Supabase for higher limits.");
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
    
    // Record referral on successful signup/login
    const storedRefCode = localStorage.getItem(REFERRAL_CODE_KEY);
    if (storedRefCode && authResult.data?.session) {
      try {
        await recordReferralSignup(storedRefCode);
        // Clear the stored referral code after successful recording
        localStorage.removeItem(REFERRAL_CODE_KEY);
        console.log("[Referral] Successfully recorded referral:", storedRefCode);
      } catch (refErr) {
        console.warn("[Referral] Failed to record referral:", refErr);
        // Don't block login on referral error
      }
    }
    
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

  const handleResendConfirmation = async () => {
    if (!email?.trim()) {
      setError("Enter your email first.");
      return;
    }
    setError("");
    setNotice("");
    setResendLoading(true);
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/login` },
    });
    setResendLoading(false);
    if (resendError) {
      setError(resendError.message);
      return;
    }
    setNotice("Confirmation email sent. Check your inbox and spam, then sign in after clicking the link.");
    setEmailNotConfirmed(false);
  };

  const handleReset = async () => {
    if (!email) {
      setError("Enter your email first.");
      return;
    }
    setError("");
    setNotice("");
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setNotice("Check your email for the reset link. You’ll set a new password when you click it.");
  };

  const handleSetNewPassword = async (e) => {
    e.preventDefault();
    setSetPasswordError("");
    if (newPassword.length < 8) {
      setSetPasswordError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setSetPasswordError("Passwords do not match.");
      return;
    }
    setSetPasswordLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setSetPasswordLoading(false);
    if (updateError) {
      setSetPasswordError(updateError.message);
      return;
    }
    setRecoveryMode(false);
    setNewPassword("");
    setConfirmPassword("");
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    setNotice("Password updated. Signing you in…");
    window.localStorage.setItem("kryonex_admin_mode", "user");
    navigate("/wizard");
  };

  return (
    <div style={{ minHeight: embeddedMode ? "auto" : "100vh", position: "relative" }}>
      <BackgroundGrid />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: "420px",
          margin: embeddedMode ? "0" : "0 auto",
          padding: embeddedMode ? "1.5rem" : "7rem 1.5rem",
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
        ) : recoveryMode ? (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="glass"
            style={{ padding: "2.5rem" }}
          >
            <h2
              style={{
                letterSpacing: "0.2rem",
                marginBottom: "1rem",
                textAlign: "center",
              }}
            >
              SET NEW PASSWORD
            </h2>
            <p style={{ color: "#9ca3af", fontSize: "0.9rem", marginBottom: "1.5rem", textAlign: "center" }}>
              Enter and confirm your new password below.
            </p>
            <form onSubmit={handleSetNewPassword}>
              <label style={{ display: "block", marginBottom: "1rem" }}>
                <span style={{ color: "#9ca3af" }}>New password</span>
                <input
                  className="input-field"
                  type="password"
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </label>
              <label style={{ display: "block", marginBottom: "1.5rem" }}>
                <span style={{ color: "#9ca3af" }}>Confirm password</span>
                <input
                  className="input-field"
                  type="password"
                  required
                  minLength={8}
                  placeholder="Same as above"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </label>
              {setPasswordError ? (
                <div style={{ color: "#f87171", marginBottom: "1rem" }}>{setPasswordError}</div>
              ) : null}
              <button
                type="submit"
                disabled={setPasswordLoading}
                style={{
                  width: "100%",
                  padding: "0.9rem",
                  borderRadius: "999px",
                  border: "none",
                  background: "linear-gradient(90deg, rgba(16,185,129,1) 0%, rgba(5,5,5,1) 100%)",
                  color: "#e5e7eb",
                  fontWeight: 600,
                  letterSpacing: "0.15rem",
                  cursor: setPasswordLoading ? "not-allowed" : "pointer",
                }}
              >
                {setPasswordLoading ? "UPDATING…" : "SET PASSWORD"}
              </button>
            </form>
          </motion.div>
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
        {!checkingSession && !recoveryMode && (
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
              onChange={(event) => {
                setEmail(event.target.value);
                setEmailNotConfirmed(false);
              }}
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
          {emailNotConfirmed && email?.trim() ? (
            <div style={{ marginBottom: "1rem" }}>
              <button
                type="button"
                onClick={handleResendConfirmation}
                disabled={resendLoading}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#22d3ee",
                  letterSpacing: "0.08rem",
                  cursor: resendLoading ? "not-allowed" : "pointer",
                  textDecoration: "underline",
                }}
              >
                {resendLoading ? "Sending…" : "Resend confirmation email"}
              </button>
            </div>
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
        
        {/* Affiliate Program CTA */}
        {!checkingSession && !recoveryMode && !embeddedMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            style={{ marginTop: "1.5rem", textAlign: "center" }}
          >
            <Link
              to="/affiliate"
              className="affiliate-cta-link"
              style={{
                display: "inline-block",
                padding: "0.8rem 1.5rem",
                borderRadius: "999px",
                border: "1px solid rgba(139, 92, 246, 0.4)",
                background: "linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(34, 211, 238, 0.1))",
                color: "#a78bfa",
                fontWeight: 600,
                fontSize: "0.85rem",
                letterSpacing: "0.05rem",
                textDecoration: "none",
                transition: "all 0.2s ease",
              }}
            >
              Make $25 + 10% Monthly — Join Our Affiliate Program
            </Link>
          </motion.div>
        )}
      </div>
    </div>
  );
}
