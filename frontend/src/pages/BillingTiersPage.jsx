import React from "react";
import { motion } from "framer-motion";
import { Check, Zap, Shield, Rocket, Crown } from "lucide-react";
import {
  createCheckoutSession,
  createTopupSession,
  getSubscriptionStatus,
  getUsageStatus,
  manageBilling,
} from "../lib/api";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { getTierOptions, TOP_UPS, VALUE_PROPS } from "../lib/billingConstants";

const TIER_ORDER = ["pro", "elite", "scale"];

const normalizeTier = (value) => {
  const tier = String(value || "").toLowerCase();
  if (tier.includes("scale")) return "scale";
  if (tier.includes("elite")) return "elite";
  if (tier.includes("pro")) return "pro";
  if (tier.includes("core")) return "core";
  return null;
};

const TIER_ICONS = {
  core: Shield,
  pro: Zap,
  elite: Crown,
  scale: Rocket,
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
  const eligibleNewAgent = currentTier === "elite" || currentTier === "scale";

  // Show core only if current user is on core
  const coreOffer = currentTier === "core";
  const visibleTiers = getTierOptions(coreOffer).filter((tier) =>
    coreOffer ? true : TIER_ORDER.includes(tier.id)
  );

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
        <div className="flex-1 px-6 py-8 overflow-y-auto">
          <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              style={{ textAlign: "center", marginBottom: "2rem" }}
            >
              <p
                className="mono"
                style={{
                  letterSpacing: "0.2rem",
                  color: "#22d3ee",
                  marginBottom: "0.5rem",
                  fontSize: "0.85rem",
                }}
              >
                TIERS & TOP-UPS
              </p>
              <h2 style={{ fontSize: "2.5rem", marginBottom: "0.75rem", fontWeight: 700 }}>
                Billing Control
              </h2>
              <p style={{ color: "#9ca3af", marginBottom: "1rem" }}>
                Upgrade, downgrade, or top-up without interruption.
              </p>
              <p
                style={{
                  color: "#22d3ee",
                  fontWeight: 600,
                  fontSize: "1.1rem",
                  padding: "0.75rem 1.5rem",
                  background: "rgba(34, 211, 238, 0.1)",
                  borderRadius: "8px",
                  display: "inline-block",
                  border: "1px solid rgba(34, 211, 238, 0.2)",
                }}
              >
                {VALUE_PROPS.anchor}
              </p>
            </motion.div>

            {error ? (
              <div
                style={{
                  color: "#f87171",
                  marginBottom: "1.5rem",
                  padding: "1rem",
                  background: "rgba(248, 113, 113, 0.1)",
                  borderRadius: "8px",
                  border: "1px solid rgba(248, 113, 113, 0.2)",
                }}
              >
                {error}
              </div>
            ) : null}

            {loading ? (
              <div
                className="glass"
                style={{
                  padding: "2rem",
                  textAlign: "center",
                  color: "#9ca3af",
                }}
              >
                Loading billing data...
              </div>
            ) : (
              <>
                {/* Current Plan Summary */}
                <motion.div
                  className="glass"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  style={{ padding: "1.5rem", marginBottom: "2rem" }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "1.5rem",
                    }}
                  >
                    <div>
                      <p
                        className="mono"
                        style={{
                          color: "#9ca3af",
                          marginBottom: "0.25rem",
                          fontSize: "0.75rem",
                          letterSpacing: "0.1rem",
                        }}
                      >
                        CURRENT PLAN
                      </p>
                      <p
                        style={{
                          fontSize: "1.5rem",
                          fontWeight: 700,
                          color: "#22d3ee",
                        }}
                      >
                        {subscription.plan_type
                          ? subscription.plan_type.toUpperCase()
                          : "No plan"}
                      </p>
                    </div>
                    <div>
                      <p
                        className="mono"
                        style={{
                          color: "#9ca3af",
                          marginBottom: "0.25rem",
                          fontSize: "0.75rem",
                        }}
                      >
                        MINUTES USED
                      </p>
                      <p style={{ fontSize: "1.1rem", fontWeight: 600 }}>
                        <span style={{ color: "#10b981" }}>{callUsed}</span>
                        <span style={{ color: "#6b7280" }}> / {callTotal}</span>
                      </p>
                    </div>
                    <div>
                      <p
                        className="mono"
                        style={{
                          color: "#9ca3af",
                          marginBottom: "0.25rem",
                          fontSize: "0.75rem",
                        }}
                      >
                        TEXTS USED
                      </p>
                      <p style={{ fontSize: "1.1rem", fontWeight: 600 }}>
                        <span style={{ color: "#10b981" }}>{smsUsed}</span>
                        <span style={{ color: "#6b7280" }}> / {smsTotal}</span>
                      </p>
                    </div>
                    <div>
                      <p
                        className="mono"
                        style={{
                          color: "#9ca3af",
                          marginBottom: "0.25rem",
                          fontSize: "0.75rem",
                        }}
                      >
                        BILLING CYCLE ENDS
                      </p>
                      <p style={{ fontSize: "1.1rem", fontWeight: 600 }}>
                        {subscription.current_period_end
                          ? new Date(
                              subscription.current_period_end
                            ).toLocaleDateString()
                          : "--"}
                      </p>
                    </div>
                  </div>
                </motion.div>

                {/* Tier Cards */}
                <p
                  className="mono"
                  style={{
                    color: "#9ca3af",
                    marginBottom: "1rem",
                    letterSpacing: "0.15rem",
                    fontSize: "0.8rem",
                  }}
                >
                  UPGRADE / DOWNGRADE
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                    gap: "1.5rem",
                    marginBottom: "1rem",
                  }}
                >
                  {visibleTiers.map((tier, index) => {
                    const isCurrent = currentTier === tier.id;
                    const TierIcon = TIER_ICONS[tier.id] || Zap;
                    return (
                      <motion.div
                        key={tier.id}
                        className={`glass plan-card ${isCurrent ? "plan-active" : ""}`}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
                        style={{
                          padding: "1.75rem",
                          borderColor: `${tier.accent}40`,
                          position: "relative",
                          overflow: "visible",
                        }}
                      >
                        {tier.popular && (
                          <div
                            style={{
                              position: "absolute",
                              top: "-12px",
                              right: "16px",
                              background:
                                "linear-gradient(135deg, #22d3ee, #0ea5e9)",
                              color: "#000",
                              padding: "4px 14px",
                              borderRadius: "12px",
                              fontSize: "11px",
                              fontWeight: 700,
                              letterSpacing: "0.05rem",
                              boxShadow: "0 4px 12px rgba(34, 211, 238, 0.4)",
                            }}
                          >
                            MOST POPULAR
                          </div>
                        )}
                        
                        {/* Tier Icon & Title */}
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "0.5rem" }}>
                          <div
                            style={{
                              width: "40px",
                              height: "40px",
                              borderRadius: "10px",
                              background: `${tier.accent}20`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <TierIcon size={20} style={{ color: tier.accent }} />
                          </div>
                          <div>
                            <div
                              style={{
                                fontSize: "1.4rem",
                                fontWeight: 700,
                                color: "#fff",
                              }}
                            >
                              {tier.title}
                            </div>
                            <div
                              style={{
                                fontSize: "0.75rem",
                                color: tier.accent,
                                fontWeight: 600,
                                letterSpacing: "0.05rem",
                              }}
                            >
                              {tier.subtitle}
                            </div>
                          </div>
                        </div>

                        {/* Price */}
                        <div
                          className="mono"
                          style={{
                            fontSize: "2.25rem",
                            fontWeight: 700,
                            marginBottom: "0.5rem",
                            color: tier.accent,
                            textShadow: `0 0 20px ${tier.accent}40`,
                          }}
                        >
                          {tier.price}
                        </div>

                        {/* Capacity */}
                        <div
                          style={{
                            color: "#9ca3af",
                            fontSize: "0.9rem",
                            marginBottom: "0.75rem",
                          }}
                        >
                          <span style={{ color: "#fff", fontWeight: 600 }}>
                            {tier.minutes}
                          </span>{" "}
                          minutes ·{" "}
                          <span style={{ color: "#fff", fontWeight: 600 }}>
                            {tier.sms || 0}
                          </span>{" "}
                          texts
                        </div>

                        {/* Description */}
                        <p
                          style={{
                            color: "#9ca3af",
                            fontSize: "0.85rem",
                            marginBottom: "1rem",
                            lineHeight: 1.5,
                          }}
                        >
                          {tier.description}
                        </p>

                        {/* Highlights */}
                        {tier.highlights && (
                          <ul
                            style={{
                              margin: "0 0 1rem 0",
                              padding: 0,
                              listStyle: "none",
                            }}
                          >
                            {tier.highlights.slice(0, 5).map((h, i) => (
                              <li
                                key={i}
                                style={{
                                  display: "flex",
                                  alignItems: "flex-start",
                                  gap: "10px",
                                  marginBottom: "8px",
                                  fontSize: "0.85rem",
                                  color: "#d1d5db",
                                }}
                              >
                                <Check
                                  size={15}
                                  style={{
                                    color: "#22c55e",
                                    flexShrink: 0,
                                    marginTop: "2px",
                                  }}
                                />
                                {h}
                              </li>
                            ))}
                          </ul>
                        )}

                        {/* Note */}
                        {tier.note && (
                          <p
                            style={{
                              color: "#6b7280",
                              fontSize: "0.75rem",
                              fontStyle: "italic",
                              marginBottom: "1rem",
                              paddingTop: "0.5rem",
                              borderTop: "1px solid rgba(255,255,255,0.05)",
                            }}
                          >
                            {tier.note}
                          </p>
                        )}

                        {/* CTA Button */}
                        <button
                          className="button-primary"
                          style={{
                            width: "100%",
                            background: isCurrent ? "#374151" : undefined,
                            boxShadow: isCurrent
                              ? "none"
                              : `0 0 20px ${tier.accent}40`,
                            marginTop: "auto",
                          }}
                          onClick={() => handleSwitchTier(tier.id)}
                          disabled={isCurrent || checkoutLoading === tier.id}
                        >
                          {checkoutLoading === tier.id
                            ? "Processing..."
                            : isCurrent
                            ? "Current Plan"
                            : `Switch to ${tier.title}`}
                        </button>
                      </motion.div>
                    );
                  })}
                </div>
                <p
                  style={{
                    color: "#6b7280",
                    fontSize: "0.85rem",
                    textAlign: "center",
                    marginBottom: "2.5rem",
                  }}
                >
                  Upgrades and downgrades are handled as a single active plan.
                </p>

                {/* Top-Ups Section */}
                <p
                  className="mono"
                  style={{
                    color: "#9ca3af",
                    marginBottom: "0.5rem",
                    letterSpacing: "0.15rem",
                    fontSize: "0.8rem",
                  }}
                >
                  TOP-UPS
                </p>
                <p
                  style={{
                    color: "#6b7280",
                    fontSize: "0.9rem",
                    marginBottom: "1.25rem",
                  }}
                >
                  Growing fast? Add more capacity instantly — no plan change needed.
                </p>
                <div
                  style={{
                    display: "grid",
                    gap: "1rem",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    marginBottom: "2.5rem",
                  }}
                >
                  {TOP_UPS.map((topup, index) => {
                    const isMinutes = topup.call_minutes > 0;
                    return (
                      <motion.div
                        key={topup.id}
                        className="glass"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.4 + index * 0.05 }}
                        style={{
                          padding: "1.25rem",
                          borderColor: isMinutes
                            ? "rgba(34, 211, 238, 0.2)"
                            : "rgba(16, 185, 129, 0.2)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            marginBottom: "0.5rem",
                          }}
                        >
                          <div
                            style={{
                              width: "32px",
                              height: "32px",
                              borderRadius: "8px",
                              background: isMinutes
                                ? "rgba(34, 211, 238, 0.1)"
                                : "rgba(16, 185, 129, 0.1)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {isMinutes ? (
                              <Zap
                                size={16}
                                style={{ color: "#22d3ee" }}
                              />
                            ) : (
                              <Shield
                                size={16}
                                style={{ color: "#10b981" }}
                              />
                            )}
                          </div>
                          <p
                            style={{
                              fontWeight: 700,
                              fontSize: "1rem",
                              color: "#fff",
                            }}
                          >
                            {topup.name}
                          </p>
                        </div>
                        <p
                          style={{
                            color: "#9ca3af",
                            fontSize: "0.85rem",
                            marginBottom: "0.75rem",
                            lineHeight: 1.4,
                          }}
                        >
                          {topup.description}
                        </p>
                        <p
                          className="mono"
                          style={{
                            color: isMinutes ? "#22d3ee" : "#10b981",
                            fontWeight: 700,
                            fontSize: "1.25rem",
                            marginBottom: "0.75rem",
                          }}
                        >
                          {topup.priceLabel}
                        </p>
                        <button
                          className="button-primary"
                          style={{
                            width: "100%",
                            background: isMinutes
                              ? "linear-gradient(135deg, #22d3ee, #0ea5e9)"
                              : "linear-gradient(135deg, #10b981, #059669)",
                          }}
                          onClick={() => handleTopup(topup.id)}
                          disabled={topupLoading === topup.id}
                        >
                          {topupLoading === topup.id
                            ? "Processing..."
                            : "Buy Top-Up"}
                        </button>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Manage Subscription */}
                <motion.div
                  className="glass"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.6 }}
                  style={{
                    padding: "1.5rem",
                    textAlign: "center",
                    marginBottom: "2rem",
                  }}
                >
                  <p
                    style={{
                      marginBottom: "0.75rem",
                      color: "#9ca3af",
                      fontSize: "0.95rem",
                    }}
                  >
                    Need to update payment method or cancel?
                  </p>
                  <button
                    className="button-primary pulse-gold"
                    onClick={handlePortal}
                    style={{
                      background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
                      color: "#000",
                    }}
                  >
                    Manage Subscription
                  </button>
                </motion.div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
