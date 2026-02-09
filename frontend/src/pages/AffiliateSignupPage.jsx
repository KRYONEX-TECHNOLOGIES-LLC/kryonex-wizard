import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import BackgroundGrid from "../components/BackgroundGrid.jsx";
import { supabase } from "../lib/supabase";
import { 
  DollarSign, 
  TrendingUp, 
  Gift, 
  Zap, 
  CheckCircle, 
  AlertCircle,
  Eye,
  EyeOff
} from "lucide-react";

export default function AffiliateSignupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Form state
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [paypalEmail, setPaypalEmail] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);

  // Check if already logged in
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session) {
          // User is already logged in - check their account type
          const { data: profile } = await supabase
            .from("profiles")
            .select("account_type, role")
            .eq("user_id", data.session.user.id)
            .maybeSingle();

          if (profile?.role === "admin") {
            navigate("/admin");
          } else if (profile?.account_type === "affiliate") {
            navigate("/affiliate/dashboard");
          } else {
            navigate("/dashboard");
          }
          return;
        }
      } catch (err) {
        console.error("[AffiliateSignup] Session check error:", err);
      }
      setCheckingSession(false);
    };
    
    checkSession();
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");

    // Validation
    if (!fullName.trim()) {
      setError("Please enter your full name");
      return;
    }
    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (!paypalEmail.trim()) {
      setError("Please enter your PayPal email for payouts");
      return;
    }
    if (!agreedToTerms) {
      setError("Please agree to the affiliate terms to continue");
      return;
    }

    setLoading(true);

    try {
      // 1. Create Supabase auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/affiliate/dashboard`,
          data: {
            full_name: fullName.trim(),
            account_type: "affiliate",
          },
        },
      });

      if (authError) {
        if (/already registered|already in use|user already/i.test(authError.message)) {
          setError("An account with this email already exists. Please sign in instead.");
        } else if (/rate limit|rate_limit/i.test(authError.message)) {
          setError("Too many signup attempts. Please wait a moment and try again.");
        } else {
          setError(authError.message);
        }
        setLoading(false);
        return;
      }

      // Check if email confirmation is required
      if (!authData?.session) {
        setNotice("Check your email to confirm your account, then sign in to access your affiliate dashboard.");
        setLoading(false);
        return;
      }

      // 2. Create/update profile with affiliate account type
      const userId = authData.session.user.id;
      
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({
          user_id: userId,
          account_type: "affiliate",
          affiliate_name: fullName.trim(),
          paypal_email: paypalEmail.trim(),
          created_at: new Date().toISOString(),
        }, {
          onConflict: "user_id",
        });

      if (profileError) {
        console.error("[AffiliateSignup] Profile error:", profileError);
        // Don't block - profile can be created on first dashboard load
      }

      // 3. Generate referral code (API will handle this on dashboard load too)
      try {
        const response = await fetch("/referral/my-code", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authData.session.access_token}`,
          },
        });
        
        if (!response.ok) {
          console.warn("[AffiliateSignup] Referral code generation deferred");
        }
      } catch (refErr) {
        console.warn("[AffiliateSignup] Referral code will be generated on dashboard load");
      }

      // 4. Set session and redirect
      window.localStorage.setItem("kryonex_session_ok", "1");
      window.localStorage.setItem("kryonex_admin_mode", "user");
      
      navigate("/affiliate/dashboard");

    } catch (err) {
      console.error("[AffiliateSignup] Error:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div style={{ minHeight: "100vh", position: "relative" }}>
        <BackgroundGrid />
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "grid",
            placeItems: "center",
            minHeight: "100vh",
          }}
        >
          <div
            className="glass"
            style={{
              padding: "2rem",
              textAlign: "center",
              letterSpacing: "0.2rem",
              color: "#a78bfa",
            }}
          >
            LOADING...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      <BackgroundGrid />
      
      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: "1000px",
          margin: "0 auto",
          padding: "3rem 1.5rem",
        }}
      >
        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{ textAlign: "center", marginBottom: "2.5rem" }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.75rem",
              padding: "0.6rem 1.2rem",
              background: "linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(34, 211, 238, 0.15))",
              borderRadius: "999px",
              border: "1px solid rgba(139, 92, 246, 0.3)",
              marginBottom: "1rem",
            }}
          >
            <Gift size={18} style={{ color: "#a78bfa" }} />
            <span style={{ color: "#a78bfa", fontWeight: 600, letterSpacing: "0.05rem" }}>
              AFFILIATE PROGRAM
            </span>
          </div>
          
          <h1
            style={{
              fontSize: "2.2rem",
              fontWeight: 700,
              letterSpacing: "0.1rem",
              marginBottom: "0.75rem",
              background: "linear-gradient(135deg, #fff, #a78bfa)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Join the Kryonex Affiliate Program
          </h1>
          
          <p
            style={{
              color: "#9ca3af",
              fontSize: "1.1rem",
              maxWidth: "500px",
              margin: "0 auto",
            }}
          >
            Earn <span style={{ color: "#10b981", fontWeight: 600 }}>$25</span> + 
            <span style={{ color: "#22d3ee", fontWeight: 600 }}> 10% monthly</span> for 
            every business you refer
          </p>
        </motion.div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "2rem", alignItems: "start" }}>
          {/* Benefits Section */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="glass" style={{ padding: "2rem" }}>
              <h3
                style={{
                  color: "#e5e7eb",
                  fontSize: "1.1rem",
                  fontWeight: 600,
                  marginBottom: "1.5rem",
                  letterSpacing: "0.05rem",
                }}
              >
                Why Become an Affiliate?
              </h3>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "10px",
                      background: "rgba(16, 185, 129, 0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <DollarSign size={20} style={{ color: "#10b981" }} />
                  </div>
                  <div>
                    <h4 style={{ color: "#e5e7eb", fontWeight: 600, marginBottom: "0.25rem" }}>
                      $25 Instant Bonus
                    </h4>
                    <p style={{ color: "#9ca3af", fontSize: "0.9rem", lineHeight: 1.5 }}>
                      Get $25 for every new customer who subscribes through your link
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "10px",
                      background: "rgba(34, 211, 238, 0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <TrendingUp size={20} style={{ color: "#22d3ee" }} />
                  </div>
                  <div>
                    <h4 style={{ color: "#e5e7eb", fontWeight: 600, marginBottom: "0.25rem" }}>
                      10% Recurring Monthly
                    </h4>
                    <p style={{ color: "#9ca3af", fontSize: "0.9rem", lineHeight: 1.5 }}>
                      Earn 10% of every payment for the first 12 months
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "10px",
                      background: "rgba(139, 92, 246, 0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Zap size={20} style={{ color: "#a78bfa" }} />
                  </div>
                  <div>
                    <h4 style={{ color: "#e5e7eb", fontWeight: 600, marginBottom: "0.25rem" }}>
                      Easy Tracking Dashboard
                    </h4>
                    <p style={{ color: "#9ca3af", fontSize: "0.9rem", lineHeight: 1.5 }}>
                      Track your referrals, earnings, and payouts in real-time
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick Stats Preview */}
              <div
                style={{
                  marginTop: "1.5rem",
                  padding: "1rem",
                  background: "rgba(139, 92, 246, 0.1)",
                  borderRadius: "12px",
                  border: "1px solid rgba(139, 92, 246, 0.2)",
                }}
              >
                <p
                  style={{
                    color: "#a78bfa",
                    fontSize: "0.85rem",
                    fontWeight: 500,
                    textAlign: "center",
                  }}
                >
                  Example: Refer 10 customers paying $199/month
                  <br />
                  <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#10b981" }}>
                    = $250 + $199/month for 12 months = $2,638+
                  </span>
                </p>
              </div>
            </div>
          </motion.div>

          {/* Signup Form */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <form className="glass" style={{ padding: "2rem" }} onSubmit={handleSubmit}>
              <h2
                style={{
                  color: "#e5e7eb",
                  fontSize: "1.2rem",
                  fontWeight: 600,
                  marginBottom: "1.5rem",
                  letterSpacing: "0.05rem",
                  textAlign: "center",
                }}
              >
                Create Your Affiliate Account
              </h2>

              {/* Full Name */}
              <label style={{ display: "block", marginBottom: "1.25rem" }}>
                <span style={{ color: "#9ca3af", fontSize: "0.9rem" }}>Full Name</span>
                <input
                  className="input-field"
                  type="text"
                  required
                  placeholder="John Smith"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  style={{ marginTop: "0.4rem" }}
                />
              </label>

              {/* Email */}
              <label style={{ display: "block", marginBottom: "1.25rem" }}>
                <span style={{ color: "#9ca3af", fontSize: "0.9rem" }}>Email Address</span>
                <input
                  className="input-field"
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ marginTop: "0.4rem" }}
                />
              </label>

              {/* Password */}
              <label style={{ display: "block", marginBottom: "1.25rem" }}>
                <span style={{ color: "#9ca3af", fontSize: "0.9rem" }}>Password</span>
                <div style={{ position: "relative", marginTop: "0.4rem" }}>
                  <input
                    className="input-field"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ paddingRight: "3rem" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "transparent",
                      border: "none",
                      color: "#6b7280",
                      cursor: "pointer",
                      padding: "0.25rem",
                    }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>

              {/* PayPal Email */}
              <label style={{ display: "block", marginBottom: "1.25rem" }}>
                <span style={{ color: "#9ca3af", fontSize: "0.9rem" }}>PayPal Email</span>
                <p style={{ color: "#6b7280", fontSize: "0.8rem", marginTop: "0.2rem", marginBottom: "0.4rem" }}>
                  We'll send your earnings here
                </p>
                <input
                  className="input-field"
                  type="email"
                  required
                  placeholder="paypal@example.com"
                  value={paypalEmail}
                  onChange={(e) => setPaypalEmail(e.target.value)}
                />
              </label>

              {/* Terms Agreement */}
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.75rem",
                  marginBottom: "1.5rem",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  style={{
                    width: "18px",
                    height: "18px",
                    accentColor: "#10b981",
                    marginTop: "2px",
                  }}
                />
                <span style={{ color: "#9ca3af", fontSize: "0.85rem", lineHeight: 1.5 }}>
                  I agree to the{" "}
                  <Link
                    to="/affiliate/terms"
                    style={{ color: "#a78bfa", textDecoration: "underline" }}
                    target="_blank"
                  >
                    affiliate terms
                  </Link>
                  . I understand commissions have a 30-day hold period and fraudulent activity will result in account suspension.
                </span>
              </label>

              {/* Error/Notice Messages */}
              {error && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.75rem 1rem",
                    background: "rgba(239, 68, 68, 0.1)",
                    borderRadius: "8px",
                    marginBottom: "1rem",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                  }}
                >
                  <AlertCircle size={18} style={{ color: "#f87171", flexShrink: 0 }} />
                  <span style={{ color: "#f87171", fontSize: "0.9rem" }}>{error}</span>
                </div>
              )}

              {notice && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.75rem 1rem",
                    background: "rgba(16, 185, 129, 0.1)",
                    borderRadius: "8px",
                    marginBottom: "1rem",
                    border: "1px solid rgba(16, 185, 129, 0.2)",
                  }}
                >
                  <CheckCircle size={18} style={{ color: "#10b981", flexShrink: 0 }} />
                  <span style={{ color: "#10b981", fontSize: "0.9rem" }}>{notice}</span>
                </div>
              )}

              {/* Submit Button */}
              <motion.button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "1rem",
                  borderRadius: "999px",
                  border: "none",
                  background: loading
                    ? "rgba(139, 92, 246, 0.3)"
                    : "linear-gradient(135deg, #8b5cf6 0%, #10b981 100%)",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: "1rem",
                  letterSpacing: "0.1rem",
                  cursor: loading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                }}
                whileHover={!loading ? { scale: 1.02 } : {}}
                whileTap={!loading ? { scale: 0.98 } : {}}
              >
                {loading ? (
                  <>
                    <div
                      style={{
                        width: "18px",
                        height: "18px",
                        border: "2px solid rgba(255,255,255,0.3)",
                        borderTopColor: "#fff",
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />
                    CREATING ACCOUNT...
                  </>
                ) : (
                  <>
                    <Zap size={18} />
                    START EARNING NOW
                  </>
                )}
              </motion.button>

              {/* Already have account link */}
              <div style={{ marginTop: "1.25rem", textAlign: "center" }}>
                <span style={{ color: "#6b7280", fontSize: "0.9rem" }}>
                  Already have an account?{" "}
                </span>
                <Link
                  to="/login"
                  style={{
                    color: "#a78bfa",
                    fontSize: "0.9rem",
                    textDecoration: "none",
                    fontWeight: 500,
                  }}
                >
                  Sign in
                </Link>
              </div>
            </form>
          </motion.div>
        </div>

        {/* Mobile Responsive: Stack on smaller screens */}
        <style>{`
          @media (max-width: 768px) {
            div[style*="grid-template-columns: 1fr 1.2fr"] {
              grid-template-columns: 1fr !important;
            }
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}
