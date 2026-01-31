import React, { useState, useEffect } from "react";
import { 
  X, 
  Zap, 
  TrendingUp, 
  AlertTriangle, 
  Rocket, 
  Check,
  Clock,
  ArrowRight
} from "lucide-react";
import { createCheckoutSession, createTopupSession } from "../lib/api";
import { TIERS, TOP_UPS } from "../lib/billingConstants";

const MODAL_DISMISSED_KEY = "kryonex_upsell_modal_dismissed";
const MODAL_DISMISSED_TIME_KEY = "kryonex_upsell_modal_dismissed_time";
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export default function UpsellModal({ 
  isOpen, 
  onClose, 
  usagePercent = 0, 
  limitState = "ok",
  currentTier = "core",
  callMinutesUsed = 0,
  callMinutesTotal = 0,
  smsUsed = 0,
  smsTotal = 0,
}) {
  const [loading, setLoading] = useState(null);
  const [activeTab, setActiveTab] = useState("upgrade");

  // Check if modal was recently dismissed
  useEffect(() => {
    if (isOpen) {
      const dismissedTime = localStorage.getItem(MODAL_DISMISSED_TIME_KEY);
      if (dismissedTime) {
        const elapsed = Date.now() - parseInt(dismissedTime, 10);
        if (elapsed < DISMISS_DURATION_MS) {
          onClose();
        }
      }
    }
  }, [isOpen, onClose]);

  const handleDismiss = () => {
    localStorage.setItem(MODAL_DISMISSED_KEY, "true");
    localStorage.setItem(MODAL_DISMISSED_TIME_KEY, String(Date.now()));
    onClose();
  };

  const handleUpgrade = async (tierId) => {
    try {
      setLoading(tierId);
      const tier = TIERS.find(t => t.id === tierId);
      const successUrl = `${window.location.origin}/dashboard?upgrade=success`;
      const cancelUrl = `${window.location.origin}/dashboard?upgrade=canceled`;
      
      const response = await createCheckoutSession({
        planTier: tierId,
        minutesCap: tier?.minutes || 500,
        smsCap: 500,
        successUrl,
        cancelUrl,
      });
      
      if (response.data?.url) {
        window.location.href = response.data.url;
      }
    } catch (err) {
      console.error("Upgrade error:", err);
    } finally {
      setLoading(null);
    }
  };

  const handleTopup = async (topupId) => {
    try {
      setLoading(topupId);
      const successUrl = `${window.location.origin}/dashboard?topup=success`;
      const cancelUrl = `${window.location.origin}/dashboard?topup=canceled`;
      
      const response = await createTopupSession({
        topupType: topupId,
        successUrl,
        cancelUrl,
      });
      
      if (response.data?.url) {
        window.location.href = response.data.url;
      }
    } catch (err) {
      console.error("Topup error:", err);
    } finally {
      setLoading(null);
    }
  };

  const getUrgencyLevel = () => {
    if (limitState === "blocked") return "critical";
    if (limitState === "warning" || usagePercent >= 90) return "high";
    if (usagePercent >= 80) return "medium";
    return "low";
  };

  const urgency = getUrgencyLevel();
  const currentTierData = TIERS.find(t => t.id === currentTier);
  const currentTierIndex = TIERS.findIndex(t => t.id === currentTier);
  const upgradeTiers = TIERS.slice(currentTierIndex + 1);

  if (!isOpen) return null;

  return (
    <div className="upsell-modal-overlay" onClick={handleDismiss}>
      <div className="upsell-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={`upsell-modal-header ${urgency}`}>
          <div className="header-content">
            {urgency === "critical" ? (
              <AlertTriangle size={28} className="pulse" />
            ) : urgency === "high" ? (
              <Zap size={28} className="pulse" />
            ) : (
              <TrendingUp size={28} />
            )}
            <div className="header-text">
              <h2>
                {limitState === "blocked" 
                  ? "SERVICE PAUSED" 
                  : usagePercent >= 90 
                    ? "CRITICAL: Almost Out of Minutes!"
                    : "Running Low on Minutes"}
              </h2>
              <p>
                {limitState === "blocked"
                  ? "Your AI agent is offline. Add minutes to resume."
                  : `You've used ${usagePercent}% of your monthly allocation.`}
              </p>
            </div>
          </div>
          <button className="close-btn" onClick={handleDismiss}>
            <X size={20} />
          </button>
        </div>

        {/* Usage Display */}
        <div className="upsell-usage-display">
          <div className="usage-bar-container">
            <div className="usage-bar">
              <div 
                className={`usage-fill ${urgency}`}
                style={{ width: `${Math.min(usagePercent, 100)}%` }}
              />
            </div>
            <div className="usage-labels">
              <span>{callMinutesUsed} mins used</span>
              <span>{callMinutesTotal - callMinutesUsed} mins remaining</span>
            </div>
          </div>
          {smsTotal > 0 && (
            <div className="usage-stats">
              <span className="stat">
                <Clock size={14} />
                {smsUsed}/{smsTotal} SMS used
              </span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="upsell-tabs">
          <button 
            className={`tab ${activeTab === "upgrade" ? "active" : ""}`}
            onClick={() => setActiveTab("upgrade")}
          >
            <Rocket size={16} />
            Upgrade Plan
          </button>
          <button 
            className={`tab ${activeTab === "topup" ? "active" : ""}`}
            onClick={() => setActiveTab("topup")}
          >
            <Zap size={16} />
            Quick Top-Up
          </button>
        </div>

        {/* Content */}
        <div className="upsell-content">
          {activeTab === "upgrade" ? (
            <div className="upgrade-options">
              {upgradeTiers.length > 0 ? (
                upgradeTiers.map((tier) => (
                  <div key={tier.id} className="upgrade-card" style={{ borderColor: tier.accent }}>
                    <div className="tier-header">
                      <span className="tier-name" style={{ color: tier.accent }}>{tier.title}</span>
                      <span className="tier-price">{tier.price}</span>
                    </div>
                    <div className="tier-minutes">
                      <strong>{tier.minutes}</strong> minutes/month
                    </div>
                    <p className="tier-desc">{tier.description}</p>
                    <ul className="tier-benefits">
                      <li><Check size={14} /> {tier.minutes - (currentTierData?.minutes || 0)} more minutes</li>
                      <li><Check size={14} /> Priority support</li>
                      <li><Check size={14} /> Advanced features</li>
                    </ul>
                    <button 
                      className="upgrade-btn"
                      style={{ background: tier.accent }}
                      onClick={() => handleUpgrade(tier.id)}
                      disabled={loading === tier.id}
                    >
                      {loading === tier.id ? (
                        "Processing..."
                      ) : (
                        <>
                          Upgrade to {tier.title}
                          <ArrowRight size={16} />
                        </>
                      )}
                    </button>
                  </div>
                ))
              ) : (
                <div className="max-tier-message">
                  <Rocket size={32} />
                  <p>You're on our highest tier! Consider a top-up for extra minutes.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="topup-options">
              {TOP_UPS.filter(t => t.call_minutes > 0).map((topup) => (
                <div key={topup.id} className="topup-card">
                  <div className="topup-header">
                    <span className="topup-name">{topup.name}</span>
                    <span className="topup-price">{topup.priceLabel}</span>
                  </div>
                  <p className="topup-desc">{topup.description}</p>
                  <button 
                    className="topup-btn"
                    onClick={() => handleTopup(topup.id)}
                    disabled={loading === topup.id}
                  >
                    {loading === topup.id ? "Processing..." : "Add Minutes"}
                  </button>
                </div>
              ))}
              <div className="topup-sms-section">
                <h4>Need More Texts?</h4>
                <div className="topup-sms-grid">
                  {TOP_UPS.filter(t => t.sms_count > 0).map((topup) => (
                    <button 
                      key={topup.id}
                      className="topup-sms-btn"
                      onClick={() => handleTopup(topup.id)}
                      disabled={loading === topup.id}
                    >
                      {topup.name} - {topup.priceLabel}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="upsell-footer">
          <button className="remind-later-btn" onClick={handleDismiss}>
            Remind Me Later
          </button>
          <span className="footer-note">
            {limitState === "blocked" 
              ? "Your AI agent will resume immediately after purchase."
              : "Upgrade now to avoid service interruptions."}
          </span>
        </div>
      </div>
    </div>
  );
}
