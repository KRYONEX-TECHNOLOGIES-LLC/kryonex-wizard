import React from "react";
import { motion } from "framer-motion";
import {
  createCheckoutSession,
  createTopupSession,
  getSubscriptionStatus,
  getUsageStatus,
} from "../lib/api";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { TIERS, TOP_UPS } from "../lib/billingConstants";

const TIER_CAPS = {
  pro: { minutesCap: 300, smsCap: 1000 },
  elite: { minutesCap: 800, smsCap: 3000 },
  scale: { minutesCap: 3000, smsCap: 5000 },
};

const TIER_ORDER = ["pro", "elite", "scale"];

const normalizeTier = (value) => {
  const tier = String(value || "").toLowerCase();
  if (tier.includes("scale")) return "scale";
  if (tier.includes("elite")) return "elite";
  if (tier.includes("pro")) return "pro";
  return null;
};

export default function BillingTiersPage() {
  const [subscription, setSubscription] = React.useState({
    status: "none",
    plan_type: null,
    current_period_end: null,
  });
  const [usage, setUsage] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [checkoutLoading, setCheckoutLoading] = React.useState("");
  const [topupLoading, setTopupLoading] = React.useState("");

  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      setError("");
      try {
        const [subRes, usageRes] = await Promise.all([
          getSubscriptionStatus(),
          getUsageStatus(),
        ]);
        if (!mounted) return;
        setSubscription(subRes.data || {});
        setUsage(usageRes.data || null);
      } catch (err) {
        if (mounted) {
          setError(err.response?.data?.error || err.message);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const currentTier = normalizeTier(subscription.plan_type);
  const callTotal = usage?.call_minutes_total ?? 0;
  const callRemaining = usage?.call_minutes_remaining ?? 0;
  const callUsed = Math.max(0, callTotal - callRemaining);
  const smsTotal = usage?.sms_total ?? 0;
  const smsRemaining = usage?.sms_remaining ?? 0;
  const smsUsed = Math.max(0, smsTotal - smsRemaining);
  const eligibleNewAgent =
    currentTier === "elite" || currentTier === "scale";

  const handleSwitchTier = async (tierId) => {
    setCheckoutLoading(tierId);
    try {
      const origin = window.location.origin;
      const response = await createCheckoutSession({
        planTier: tierId,
        successUrl: `${origin}/billing/tiers?success=true`,
        cancelUrl: `${origin}/billing/tiers?canceled=true`,
      });
      if (response.data?.url) {
        window.location.href = response.data.url;
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setCheckoutLoading("");
    }
  };

  const handleTopup = async (topupType) => {
    setTopupLoading(topupType);
    try {
      const origin = window.location.origin;
      const response = await createTopupSession({
        topupType,
        successUrl: `${origin}/billing/tiers?topup=success`,
        cancelUrl: `${origin}/billing/tiers?topup=canceled`,
      });
      if (response.data?.url) {
        window.location.href = response.data.url;
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setTopupLoading("");
    }
  };

  const visibleTiers = TIERS.filter((tier) => TIER_ORDER.includes(tier.id));

  return (
    <div className="min-h-screen w-full bg-void-black text-white">
      <TopMenu />
      <div className="relative z-10 flex w-full h-screen">
        <SideNav
          eligibleNewAgent={eligibleNewAgent}
          onUpgrade={() => handleSwitchTier(currentTier || "pro")}
          onNewAgent={() => {}}
          billingStatus={subscription.status}
          tier={subscription.plan_type}
          agentLive={true}
          lastUpdated={new Date()}
        />
        <div className="flex-1 px-6 py-8 space-y-6 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="glass-panel rounded-3xl border border-white/10 p-6"
          >
            <p className="text-xs uppercase tracking-[0.4em] text-neon-cyan/70">
              Tiers & Top-Ups
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Billing Control</h1>
            <p className="mt-1 text-white/60">
              Upgrade, downgrade, or top-up without interruption.
            </p>
          </motion.div>

          {error ? <div className="text-neon-pink text-sm">{error}</div> : null}
          {loading ? (
            <div className="text-white/60">Loading billing data...</div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="glass-panel rounded-3xl border border-white/10 p-6 space-y-4 lg:col-span-1">
              <div className="text-xs uppercase tracking-[0.3em] text-white/40">
                Current Plan
              </div>
              <div className="text-lg font-semibold">
                {subscription.plan_type || "No plan"}
              </div>
              <div className="text-sm text-white/60">
                Minutes: {callUsed} / {callTotal}
              </div>
              <div className="text-sm text-white/60">
                Texts: {smsUsed} / {smsTotal}
              </div>
              <div className="text-sm text-white/60">
                Billing cycle ends:{" "}
                {subscription.current_period_end
                  ? new Date(subscription.current_period_end).toLocaleDateString()
                  : "--"}
              </div>
            </div>

            <div className="glass-panel rounded-3xl border border-white/10 p-6 space-y-4 lg:col-span-2">
              <div className="text-xs uppercase tracking-[0.3em] text-white/40">
                Upgrade / Downgrade
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {visibleTiers.map((tier) => {
                  const caps = TIER_CAPS[tier.id];
                  const isCurrent = currentTier === tier.id;
                  const buttonLabel = isCurrent
                    ? "Current Tier"
                    : `Switch to ${tier.title}`;
                  const disabled = isCurrent || checkoutLoading === tier.id;
                  return (
                    <div
                      key={tier.id}
                      className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-3"
                    >
                      <div className="text-sm font-semibold">{tier.title}</div>
                      <div className="text-xs text-white/60">{tier.price}</div>
                      <div className="text-xs text-white/60">
                        {caps?.minutesCap ?? tier.minutes} minutes ·{" "}
                        {caps?.smsCap ?? "--"} texts
                      </div>
                      <div className="text-xs text-white/40 mt-1">
                        Top-ups: {TOP_UPS.map((t) =>
                          t.call_minutes ? `+${t.call_minutes} min ${t.priceLabel}` : `+${t.sms_count} SMS ${t.priceLabel}`
                        ).join(", ")}
                      </div>
                      <button
                        type="button"
                        className="button-primary w-full"
                        onClick={() => handleSwitchTier(tier.id)}
                        disabled={disabled}
                      >
                        {checkoutLoading === tier.id
                          ? "Processing..."
                          : buttonLabel}
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="text-xs text-white/40">
                Upgrades and downgrades are handled as a single active plan.
              </div>
            </div>

            <div className="glass-panel rounded-3xl border border-white/10 p-6 space-y-4 lg:col-span-3">
              <div className="text-xs uppercase tracking-[0.3em] text-white/40">
                Top-Ups
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {TOP_UPS.map((topup) => (
                  <div
                    key={topup.id}
                    className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-3"
                  >
                    <div className="text-sm font-semibold">{topup.name}</div>
                    <div className="text-xs text-white/60">
                      {topup.description}
                    </div>
                    <div className="text-xs text-white/60">{topup.priceLabel}</div>
                    <button
                      type="button"
                      className="button-primary w-full"
                      disabled={topupLoading === topup.id}
                      onClick={() => handleTopup(topup.id)}
                    >
                      {topupLoading === topup.id ? "Processing..." : "Buy Top-Up"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
