import React from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import {
  createCheckoutSession,
  createTopupSession,
  getUsageStatus,
  manageBilling,
} from "../lib/api";
import { supabase } from "../lib/supabase";
import TopMenu from "../components/TopMenu.jsx";
import { getTierOptions, TOP_UPS, VALUE_PROPS } from "../lib/billingConstants";

export default function BillingPage() {
  const [loadingPlan, setLoadingPlan] = React.useState(null);
  const [error, setError] = React.useState("");
  const [industry, setIndustry] = React.useState("");
  const [planTier, setPlanTier] = React.useState("pro");
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [adminMode, setAdminMode] = React.useState(
    window.localStorage.getItem("kryonex_admin_mode") || "user"
  );
  const [usage, setUsage] = React.useState(null);
  const [topupLoading, setTopupLoading] = React.useState("");
  const coreOffer =
    new URLSearchParams(window.location.search).get("core") === "1" ||
    window.localStorage.getItem("kryonex_core_offer") === "1";
  const visiblePlans = React.useMemo(
    () => getTierOptions(coreOffer || planTier === "core"),
    [coreOffer, planTier]
  );

  React.useEffect(() => {
    let mounted = true;
    const loadProfile = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("industry, role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (mounted && data?.industry) {
        setIndustry(data.industry.toLowerCase());
      }
      if (mounted && data?.role === "admin") {
        setIsAdmin(true);
      }
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("plan_type")
        .eq("user_id", user.id)
        .maybeSingle();
      if (mounted && sub?.plan_type) {
        const normalized = sub.plan_type.toLowerCase();
        setPlanTier(normalized === "white_glove" ? "scale" : normalized);
      }
      const usageRes = await getUsageStatus();
      if (mounted) setUsage(usageRes.data || null);
    };
    loadProfile();
    return () => {
      mounted = false;
    };
  }, []);

  const handleCheckout = async (planType) => {
    setError("");
    setLoadingPlan(planType);
    try {
      const response = await createCheckoutSession({ planTier: planType });
      if (response.data?.url) {
        window.location.href = response.data.url;
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoadingPlan(null);
    }
  };

  const handlePortal = async () => {
    setError("");
    try {
      const response = await manageBilling();
      if (response.data?.url) {
        window.location.href = response.data.url;
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const handleTopup = async (topupType) => {
    setTopupLoading(topupType);
    setError("");
    try {
      const successUrl = `${window.location.origin}/billing?topup=success`;
      const cancelUrl = `${window.location.origin}/billing?topup=canceled`;
      const res = await createTopupSession({ topupType, successUrl, cancelUrl });
      if (res.data?.url) {
        window.location.href = res.data.url;
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setTopupLoading("");
    }
  };

  return (
    <div style={{ minHeight: "100vh", padding: "4rem 1.5rem" }}>
      <TopMenu />
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{ textAlign: "center", marginBottom: "2rem" }}
        >
          <p className="mono" style={{ letterSpacing: "0.2rem", color: "#22d3ee", marginBottom: "0.5rem" }}>
            TIERS & TOP-UPS
          </p>
          <h2 style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>
            Billing Control
          </h2>
          <p style={{ color: "#9ca3af", marginBottom: "1rem" }}>
            Upgrade, downgrade, or top-up without interruption.
          </p>
          <p style={{ 
            color: "#22d3ee", 
            fontWeight: 600, 
            fontSize: "1.1rem",
            padding: "0.75rem 1.5rem",
            background: "rgba(34, 211, 238, 0.1)",
            borderRadius: "8px",
            display: "inline-block",
          }}>
            {VALUE_PROPS.anchor}
          </p>
        </motion.div>
        
        {isAdmin && adminMode === "admin" ? (
          <div className="glass" style={{ padding: "1rem", marginBottom: "1.5rem" }}>
            Admin override active. Billing is optional for admin accounts.
          </div>
        ) : null}

        {error ? (
          <div style={{ color: "#f87171", marginBottom: "1.5rem" }}>{error}</div>
        ) : null}

        {/* Current Plan Summary */}
        <div className="glass" style={{ padding: "1.25rem", marginBottom: "2rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <p className="mono" style={{ color: "#9ca3af", marginBottom: "0.25rem" }}>CURRENT PLAN</p>
              <p style={{ fontSize: "1.25rem", fontWeight: 600 }}>
                {planTier ? planTier.toUpperCase() : "No plan"}
              </p>
            </div>
            {usage && (
              <>
                <div>
                  <p className="mono" style={{ color: "#9ca3af", marginBottom: "0.25rem" }}>Minutes</p>
                  <p>{usage.call_minutes_remaining ?? 0} / {usage.call_minutes_total ?? 0}</p>
                </div>
                <div>
                  <p className="mono" style={{ color: "#9ca3af", marginBottom: "0.25rem" }}>Texts</p>
                  <p>{usage.sms_remaining ?? 0} / {usage.sms_total ?? 0}</p>
                </div>
                <div>
                  <p className="mono" style={{ color: "#9ca3af", marginBottom: "0.25rem" }}>Billing cycle ends</p>
                  <p>{usage.cycle_end ? new Date(usage.cycle_end).toLocaleDateString() : "--"}</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Upgrade / Downgrade Section */}
        <p className="mono" style={{ color: "#9ca3af", marginBottom: "1rem", letterSpacing: "0.15rem" }}>
          UPGRADE / DOWNGRADE
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "1.5rem",
            marginBottom: "1rem",
          }}
        >
          {visiblePlans.map((plan) => (
            <motion.div
              key={plan.id}
              className={`glass plan-card ${
                planTier === plan.id ? "plan-active" : ""
              }`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              style={{
                padding: "1.75rem",
                borderColor: `${plan.accent}40`,
                position: "relative",
              }}
            >
              {plan.popular && (
                <div style={{
                  position: "absolute",
                  top: "-12px",
                  right: "16px",
                  background: "linear-gradient(135deg, #22d3ee, #0ea5e9)",
                  color: "#000",
                  padding: "4px 12px",
                  borderRadius: "12px",
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.05rem",
                }}>
                  MOST POPULAR
                </div>
              )}
              <div style={{ fontSize: "1.3rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                {plan.title}
              </div>
              <div className="mono" style={{ fontSize: "2rem", marginBottom: "0.5rem", color: plan.accent }}>
                {plan.price}
              </div>
              <div style={{ color: "#9ca3af", fontSize: "0.9rem", marginBottom: "0.75rem" }}>
                {plan.minutes} minutes · {plan.sms || 0} texts
              </div>
              <div style={{ 
                color: "#22d3ee", 
                fontSize: "0.85rem", 
                marginBottom: "1rem",
                padding: "0.5rem",
                background: "rgba(34, 211, 238, 0.08)",
                borderRadius: "6px",
                lineHeight: 1.4,
              }}>
                {plan.whoFor}
              </div>
              {plan.highlights && (
                <ul style={{ margin: "0 0 1rem 0", padding: 0, listStyle: "none" }}>
                  {plan.highlights.slice(0, 4).map((h, i) => (
                    <li key={i} style={{ 
                      display: "flex", 
                      alignItems: "flex-start", 
                      gap: "8px", 
                      marginBottom: "6px",
                      fontSize: "0.85rem",
                      color: "#d1d5db",
                    }}>
                      <Check size={14} style={{ color: "#22c55e", flexShrink: 0, marginTop: "2px" }} />
                      {h}
                    </li>
                  ))}
                </ul>
              )}
              <p style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: "1rem" }}>
                Top-ups: +300 min $195, +800 min $520, +500 SMS $50, +1000 SMS $100
              </p>
              <button
                className="button-primary"
                style={{ 
                  width: "100%", 
                  background: planTier === plan.id ? "#374151" : undefined,
                }}
                onClick={() => handleCheckout(plan.id)}
                disabled={loadingPlan === plan.id || planTier === plan.id}
              >
                {loadingPlan === plan.id
                  ? "Processing..."
                  : planTier === plan.id
                  ? "Current Plan"
                  : `Switch to ${plan.title}`}
              </button>
            </motion.div>
          ))}
        </div>
        <p style={{ color: "#6b7280", fontSize: "0.85rem", textAlign: "center", marginBottom: "2rem" }}>
          Upgrades and downgrades are handled as a single active plan.
        </p>

        {/* Top-Ups Section */}
        <p className="mono" style={{ color: "#9ca3af", marginBottom: "1rem", letterSpacing: "0.15rem" }}>
          TOP-UPS
        </p>
        <p style={{ color: "#6b7280", fontSize: "0.9rem", marginBottom: "1rem" }}>
          Growing fast? Add more capacity instantly — no plan change needed.
        </p>
        <div
          style={{
            display: "grid",
            gap: "1rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            marginBottom: "2rem",
          }}
        >
          {TOP_UPS.map((topup) => (
            <div 
              key={topup.id} 
              className="glass" 
              style={{ padding: "1.25rem" }}
            >
              <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
                {topup.name}
              </p>
              <p style={{ color: "#9ca3af", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                {topup.description}
              </p>
              <p style={{ color: "#22d3ee", fontWeight: 600, marginBottom: "0.75rem" }}>
                {topup.priceLabel}
              </p>
              <button
                className="button-primary"
                style={{ width: "100%" }}
                onClick={() => handleTopup(topup.id)}
                disabled={topupLoading === topup.id}
              >
                {topupLoading === topup.id ? "Processing..." : "Buy Top-Up"}
              </button>
            </div>
          ))}
        </div>

        {/* Manage Subscription */}
        <div
          className="glass"
          style={{ padding: "1.5rem", textAlign: "center" }}
        >
          <p style={{ marginBottom: "0.75rem", color: "#9ca3af" }}>
            Need to update payment method or cancel?
          </p>
          <button className="button-primary pulse-gold" onClick={handlePortal}>
            Manage Subscription
          </button>
        </div>
      </div>
    </div>
  );
}
