import React from "react";
import { motion } from "framer-motion";
import {
  createCheckoutSession,
  createTopupSession,
  getUsageStatus,
  manageBilling,
} from "../lib/api";
import { supabase } from "../lib/supabase";
import TopMenu from "../components/TopMenu.jsx";
import { getTierOptions } from "../lib/billingConstants";

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
        <motion.h2
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{ letterSpacing: "0.2rem", marginBottom: "1.5rem" }}
        >
          BILLING CORE
        </motion.h2>
        {isAdmin && adminMode === "admin" ? (
          <div className="glass" style={{ padding: "1rem", marginBottom: "1.5rem" }}>
            Admin override active. Billing is optional for admin accounts.
          </div>
        ) : null}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          style={{ color: "#9ca3af", marginBottom: "2rem" }}
        >
          Choose your deployment tier and manage subscription access.
        </motion.p>

        {usage ? (
          <div className="glass" style={{ padding: "1rem", marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <div className="mono">Call Minutes</div>
                <div>
                  {usage.call_minutes_remaining} / {usage.call_minutes_total} remaining
                </div>
              </div>
              <div>
                <div className="mono">SMS</div>
                <div>
                  {usage.sms_remaining} / {usage.sms_total} remaining
                </div>
              </div>
            </div>
            <div style={{ marginTop: "0.8rem", color: "#9ca3af" }}>
              Status: {usage.limit_state}
            </div>
          </div>
        ) : null}

        {error ? (
          <div style={{ color: "#f87171", marginBottom: "1.5rem" }}>{error}</div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "1.5rem",
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
                padding: "2rem",
                borderColor: `${plan.accent}40`,
              }}
            >
              <div style={{ fontSize: "1.2rem", marginBottom: "0.7rem" }}>
                {plan.title}
              </div>
              <div className="mono" style={{ fontSize: "2.2rem", marginBottom: "1rem" }}>
                {plan.price}
              </div>
              <div style={{ color: "#9ca3af", marginBottom: "1.5rem" }}>
                {plan.description}
              </div>
              <button
                className="button-primary"
                style={{ width: "100%" }}
                onClick={() => handleCheckout(plan.id)}
                disabled={loadingPlan === plan.id}
              >
                {loadingPlan === plan.id
                  ? "INITIALIZING..."
                  : "ACTIVATE PROTOCOL"}
              </button>
            </motion.div>
          ))}
        </div>

        <div
          className="glass"
          style={{ marginTop: "2rem", padding: "1.5rem" }}
        >
          <div style={{ marginBottom: "0.8rem" }}>Already subscribed?</div>
          <button className="button-primary pulse-gold" onClick={handlePortal}>
            MANAGE SUBSCRIPTION
          </button>
        </div>

        <div className="glass" style={{ marginTop: "2rem", padding: "1.5rem" }}>
          <div style={{ marginBottom: "0.8rem" }}>Prepaid Top-Ups</div>
          <div
            style={{
              display: "grid",
              gap: "0.8rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            }}
          >
            <button
              className="button-primary"
              onClick={() => handleTopup("call_300")}
              disabled={topupLoading === "call_300"}
            >
              {topupLoading === "call_300" ? "LOADING..." : "300 MINS ($99)"}
            </button>
            <button
              className="button-primary"
              onClick={() => handleTopup("call_800")}
              disabled={topupLoading === "call_800"}
            >
              {topupLoading === "call_800" ? "LOADING..." : "800 MINS ($265)"}
            </button>
            <button
              className="button-primary"
              onClick={() => handleTopup("sms_500")}
              disabled={topupLoading === "sms_500"}
            >
              {topupLoading === "sms_500" ? "LOADING..." : "500 SMS ($40)"}
            </button>
            <button
              className="button-primary"
              onClick={() => handleTopup("sms_1000")}
              disabled={topupLoading === "sms_1000"}
            >
              {topupLoading === "sms_1000" ? "LOADING..." : "1000 SMS ($80)"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
