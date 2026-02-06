import React from "react";
import { useNavigate } from "react-router-dom";
import {
  getLeads,
  getStats,
  getSubscriptionStatus,
  getUsageStatus,
  createTopupSession,
  getCalcomStatus,
  getCalcomAuthorizeUrl,
  disconnectCalcom,
  getEnhancedStats,
} from "../lib/api";
import { supabase } from "../lib/supabase";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import UpsellModal from "../components/UpsellModal.jsx";

// Format seconds to MM:SS
const formatDuration = (seconds) => {
  if (!seconds || seconds <= 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

// Format relative time (e.g., "2 mins ago")
const formatRelativeTime = (dateStr) => {
  if (!dateStr) return "No calls yet";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = React.useState({
    total_leads: 0,
    new_leads: 0,
    booked_leads: 0,
    call_volume: 0,
  });
  const [enhancedStats, setEnhancedStats] = React.useState({
    calls_today: 0,
    calls_this_week: 0,
    calls_all_time: 0,
    appointments_today: 0,
    appointments_this_week: 0,
    appointments_all_time: 0,
    booking_rate_percent: 0,
    avg_call_duration_seconds: 0,
    last_call_at: null,
    last_call_name: null,
    last_call_summary: null,
    pipeline_value: 0,
  });
  const [currentTime, setCurrentTime] = React.useState(new Date());
  const [leads, setLeads] = React.useState([]);
  const [subscription, setSubscription] = React.useState({
    status: "none",
    plan_type: null,
    current_period_end: null,
  });
  const [usage, setUsage] = React.useState(null);
  const [agentProfile, setAgentProfile] = React.useState({
    phone_number: "",
    is_active: true,
  });
  const [loading, setLoading] = React.useState(true);
  const [lastUpdated, setLastUpdated] = React.useState(null);
  const [isSeller, setIsSeller] = React.useState(false);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [userLabel, setUserLabel] = React.useState("Operator");
  const [calConnected, setCalConnected] = React.useState(false);
  const [calComUrl, setCalComUrl] = React.useState("");
  const [calStatusLoading, setCalStatusLoading] = React.useState(true);
  const [calStatusError, setCalStatusError] = React.useState("");
  const [lowUsageDismissed, setLowUsageDismissed] = React.useState(() =>
    typeof window === "undefined"
      ? false
      : window.localStorage.getItem("kryonex_low_usage_dismissed") === "true"
  );
  const [showUpsellModal, setShowUpsellModal] = React.useState(false);
  const [smsApprovalPending, setSmsApprovalPending] = React.useState(false);
  const [smsBannerDismissed, setSmsBannerDismissed] = React.useState(() =>
    typeof window === "undefined"
      ? false
      : window.localStorage.getItem("kryonex_sms_banner_dismissed") === "true"
  );

  // Live clock effect
  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    let mounted = true;
    const load = async (isInitial = false) => {
      try {
        const [statsRes, enhancedRes, leadsRes, subRes, usageRes] = await Promise.all([
          getStats(),
          getEnhancedStats().catch(() => ({ data: {} })),
          getLeads(),
          getSubscriptionStatus(),
          getUsageStatus(),
        ]);
        if (mounted) {
          setStats(statsRes.data);
          if (enhancedRes.data) {
            setEnhancedStats(prev => ({ ...prev, ...enhancedRes.data }));
          }
          setLeads(leadsRes.data.leads || []);
          setSubscription(subRes.data || { status: "none", plan_type: null });
          setUsage(usageRes.data || null);
          setLastUpdated(new Date());
        }

        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData?.session?.user;
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("business_name, full_name, role, cal_com_url")
            .eq("user_id", user.id)
            .maybeSingle();
          if (mounted && profile) {
            setIsSeller(profile.role === "seller");
            setIsAdmin(profile.role === "admin");
            setCalComUrl(profile.cal_com_url || "");
            const label =
              profile.full_name ||
              profile.business_name ||
              user.email ||
              "Operator";
            setUserLabel(label);
          }
          const { data: agent } = await supabase
            .from("agents")
            .select("phone_number, is_active, created_at, sms_approved")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .maybeSingle();
          if (mounted && agent) {
            setAgentProfile({
              phone_number: agent.phone_number || "",
              is_active: agent.is_active !== false,
            });
            // Show SMS pending banner if agent is new (within 2 weeks) and not yet approved
            if (agent.phone_number && !agent.sms_approved) {
              const createdAt = agent.created_at ? new Date(agent.created_at) : null;
              const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
              if (!createdAt || createdAt > twoWeeksAgo) {
                setSmsApprovalPending(true);
              }
            }
          }
        }
      } finally {
        if (mounted && isInitial) setLoading(false);
      }
    };
    load(true);
    const interval = setInterval(() => load(false), 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  React.useEffect(() => {
    let active = true;
    const loadStatus = async () => {
      try {
        const res = await getCalcomStatus();
        if (!active) return;
        const url = res.data?.cal_com_url || "";
        setCalConnected(Boolean(res.data?.connected));
        setCalComUrl(url);
      } catch (err) {
        if (!active) return;
        setCalStatusError("Calendar connection status unavailable.");
        setCalConnected(false);
        setCalComUrl("");
      } finally {
        if (active) setCalStatusLoading(false);
      }
    };
    loadStatus();
    return () => {
      active = false;
    };
  }, []);

  const handleBilling = () => {
    navigate("/billing");
  };
  const handleViewTopups = () => {
    setLowUsageDismissed(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("kryonex_low_usage_dismissed", "true");
    }
    navigate("/billing/tiers");
  };

  const planTier = String(subscription.plan_type || "").toLowerCase();
  const eligibleNewAgent =
    planTier.includes("elite") ||
    planTier.includes("white") ||
    planTier.includes("glove");
  const subscriptionActive = ["active", "trialing"].includes(
    String(subscription.status || "").toLowerCase()
  );

  const usagePercent = (remaining, total) => {
    if (!total) return 0;
    const used = total - remaining;
    return Math.min(100, Math.max(0, Math.round((used / total) * 100)));
  };

  const callTotal = usage?.call_minutes_total ?? 0;
  const callRemaining = usage?.call_minutes_remaining ?? 0;
  const callUsed = Math.max(0, callTotal - callRemaining);
  const callPercent = usagePercent(callRemaining, callTotal);
  const isCritical = callPercent >= 75;
  const smsTotal = usage?.sms_total ?? 0;
  const smsRemaining = usage?.sms_remaining ?? 0;
  const smsUsed = Math.max(0, smsTotal - smsRemaining);
  const smsPercent = usagePercent(smsRemaining, smsTotal);
  const isLowUsage = callPercent >= 75 || smsPercent >= 75;
  const pipelineValue = stats.pipeline_value || 0;

  const formatCurrency = (value) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value || 0);

  React.useEffect(() => {
    if (!isLowUsage) {
      setLowUsageDismissed(false);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("kryonex_low_usage_dismissed");
      }
    }
  }, [isLowUsage]);

  // Show upsell modal at 80%+ usage (after initial load)
  React.useEffect(() => {
    const limitState = usage?.limit_state || "ok";
    const shouldShowModal = 
      !loading && 
      (limitState === "warning" || limitState === "blocked" || callPercent >= 80 || smsPercent >= 80);
    
    if (shouldShowModal) {
      // Check if modal was recently dismissed
      const dismissedTime = localStorage.getItem("kryonex_upsell_modal_dismissed_time");
      if (dismissedTime) {
        const elapsed = Date.now() - parseInt(dismissedTime, 10);
        const dismissDuration = 24 * 60 * 60 * 1000; // 24 hours
        if (elapsed < dismissDuration) {
          return; // Don't show if dismissed recently
        }
      }
      // Small delay so dashboard loads first
      const timer = setTimeout(() => setShowUpsellModal(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [loading, usage, callPercent, smsPercent]);

  const handleTopup = async () => {
    try {
      const successUrl = `${window.location.origin}/billing?topup=success`;
      const cancelUrl = `${window.location.origin}/billing?topup=canceled`;
      const response = await createTopupSession({
        topupType: "call_300",
        successUrl,
        cancelUrl,
      });
      if (response.data?.url) {
        window.location.href = response.data.url;
      } else {
        navigate("/billing");
      }
    } catch (err) {
      navigate("/billing");
    }
  };

  const handleCalcomConnect = async () => {
    setCalStatusError("");
    try {
      const response = await getCalcomAuthorizeUrl();
      const url = response?.data?.url;
      if (!url) {
        setCalStatusError("Unable to start calendar connection. Please try again.");
        return;
      }
      window.location.href = url;
    } catch (err) {
      setCalStatusError(
        err.response?.data?.error ||
          "Unable to start calendar connection. Please try again."
      );
    }
  };

  const handleCalcomDisconnect = async () => {
    setCalStatusError("");
    try {
      await disconnectCalcom();
      setCalConnected(false);
      setCalComUrl("");
    } catch (err) {
      setCalStatusError("Unable to disconnect calendar.");
    }
  };

  const activityFeed = leads.slice(0, 5).map((lead) => ({
    id: lead.id,
    time: lead.created_at
      ? new Date(lead.created_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "--",
    text: lead.summary || lead.business_name || lead.name || "Lead activity",
    status: lead.status || "New",
    sentiment: lead.sentiment || "neutral",
    duration: lead.call_duration_seconds || 0,
    outcome: lead.call_outcome || lead.status || "New",
  }));

  return (
    <div className="war-room bg-black text-cyan-400 font-mono">
      <TopMenu />
      <div className="dashboard-grid">
        <SideNav
          eligibleNewAgent={eligibleNewAgent}
          onUpgrade={handleBilling}
          onNewAgent={() => navigate("/wizard?new=1")}
          billingStatus={subscription.status}
          tier={subscription.plan_type}
          agentLive={agentProfile.is_active}
          lastUpdated={lastUpdated}
          isSeller={isSeller}
          isAdmin={isAdmin}
        />
        <div className="main-content">
          {isLowUsage && !lowUsageDismissed ? (
            <div className="glass-panel low-usage-alert">
              <div>
                You’re running low on minutes/texts. Buy a top-up to avoid
                interruptions.
              </div>
              <button
                type="button"
                className="button-primary"
                onClick={handleViewTopups}
              >
                View Top-Ups
              </button>
            </div>
          ) : null}
          
          {smsApprovalPending && !smsBannerDismissed && (
            <div className="glass-panel sms-pending-banner">
              <div className="sms-pending-content">
                <span className="sms-pending-icon">📱</span>
                <div className="sms-pending-text">
                  <strong>SMS Activation Pending</strong>
                  <p>
                    Text messaging will automatically activate once carrier approval completes (~1-2 weeks).
                    Your settings are saved and will work immediately when approved.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="sms-pending-dismiss"
                onClick={() => {
                  setSmsBannerDismissed(true);
                  window.localStorage.setItem("kryonex_sms_banner_dismissed", "true");
                }}
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          )}
          
          <div className="top-bar glass-panel">
            <div className="status-indicator">
              <span>🟢 SYSTEM ONLINE</span>
              <span className="live-clock">
                {currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </div>
            <div className="usage-pill">
              {callTotal ? `${100 - callPercent}% GAS LEFT` : "GAS LEFT --"}
            </div>
          </div>

          <div className="war-room-header">
            <div>
              <div className="war-room-kicker">WAR ROOM</div>
              <div className="war-room-title">Kryonex Command Deck</div>
            </div>
            <div className="profile-pill">
              {userLabel} · {subscription.plan_type || "Core"} Tier
            </div>
          </div>
          <div className="war-room-subheader">
            <div className="war-room-line">
              <span className="war-room-line-label">Primary Line</span>
              <span className="war-room-line-value">
                {agentProfile.phone_number || "No number yet"}
              </span>
            </div>
            <button
              type="button"
              className="button-primary muted"
              onClick={() => navigate("/numbers")}
            >
              View Numbers
            </button>
          </div>

          <div className="war-room-grid">
            {/* Enhanced KPI Cards */}
            <div className="kpi-hero glass-panel enhanced">
              <div className="kpi-card">
                <div className="kpi-label">Calls Handled</div>
                <div className="kpi-value">{enhancedStats.calls_all_time || stats.call_volume || 0}</div>
                <div className="kpi-breakdown">
                  <span>Today: {enhancedStats.calls_today || 0}</span>
                  <span>This Week: {enhancedStats.calls_this_week || 0}</span>
                </div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Appointments</div>
                <div className="kpi-value">{enhancedStats.appointments_all_time || stats.booked_leads || 0}</div>
                <div className="kpi-breakdown">
                  <span>Today: {enhancedStats.appointments_today || 0}</span>
                  <span>This Week: {enhancedStats.appointments_this_week || 0}</span>
                </div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Booking Rate</div>
                <div className="kpi-value">{enhancedStats.booking_rate_percent || 0}%</div>
                <div className="kpi-breakdown">
                  <span className={enhancedStats.booking_rate_percent >= 30 ? "text-green" : "text-yellow"}>
                    {enhancedStats.booking_rate_percent >= 30 ? "▲ Good" : "▼ Improve"}
                  </span>
                </div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Avg Call Duration</div>
                <div className="kpi-value">{formatDuration(enhancedStats.avg_call_duration_seconds)}</div>
                <div className="kpi-breakdown">
                  <span>{enhancedStats.avg_call_duration_seconds > 0 ? "per call" : "no data"}</span>
                </div>
              </div>
              <div className="kpi-card glow-green">
                <div className="kpi-label">Estimated Revenue</div>
                <div className="kpi-value">{formatCurrency(enhancedStats.pipeline_value || pipelineValue)}</div>
                <div className="kpi-note">(Based on $450 avg. ticket)</div>
              </div>
              <div className="kpi-card last-call-card">
                <div className="kpi-label">Last Call</div>
                <div className="kpi-value last-call-time">
                  {formatRelativeTime(enhancedStats.last_call_at)}
                </div>
                {enhancedStats.last_call_name && (
                  <div className="kpi-breakdown">
                    <span>{enhancedStats.last_call_name}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="usage-card glass-panel">
              <div className="usage-header">Operational Fuel (AI Minutes)</div>
              <div className="progress-track">
                <div
                  className={`progress-fill ${isCritical ? "critical" : ""}`}
                  style={{ width: `${callPercent}%` }}
                />
              </div>
              <div className="usage-footer">
                <span>
                  {callUsed} / {callTotal} Mins Used
                </span>
                {isCritical ? (
                  <button className="btn-glow-red" onClick={handleTopup}>
                    ⚡ SYSTEM LOW: TOP UP NOW
                  </button>
                ) : null}
              </div>
            </div>

            <div className="calendar-connection-card glass-panel">
              <div className="calendar-connection-header">
                <div className="calendar-connection-title">Calendar Sync</div>
                {subscriptionActive ? (
                  calStatusLoading ? (
                    <span className="status-pill status-unknown">Checking</span>
                  ) : calConnected ? (
                    <span className="status-pill status-active">Connected</span>
                  ) : (
                    <span className="status-pill status-none">Not Connected</span>
                  )
                ) : (
                  <span className="status-pill status-none">Locked</span>
                )}
              </div>
              <div className="calendar-connection-body">
                {!subscriptionActive ? (
                  <span className="calendar-connection-note">
                    Complete payment to unlock calendar connection.
                  </span>
                ) : calConnected ? (
                  <span className="calendar-connection-note">
                    Cal.com is linked. The AI can book appointments automatically.
                  </span>
                ) : (
                  <span className="calendar-connection-note">
                    Connect a calendar so the AI can check availability and book.
                  </span>
                )}
                {subscriptionActive && calConnected && calComUrl ? (
                  <div className="text-xs text-white/50 mt-2">
                    {calComUrl}
                  </div>
                ) : null}
                <div className="calendar-connection-actions">
                  {!subscriptionActive ? (
                    <button
                      type="button"
                      className="button-primary"
                      onClick={handleBilling}
                    >
                      Go to Billing
                    </button>
                  ) : calConnected ? (
                    <button
                      type="button"
                      className="button-primary danger"
                      onClick={handleCalcomDisconnect}
                    >
                      Disconnect Calendar
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="button-primary"
                      onClick={handleCalcomConnect}
                    >
                      Connect Cal.com Account
                    </button>
                  )}
                </div>
                {calStatusError ? (
                  <div className="calendar-connection-error">{calStatusError}</div>
                ) : null}
              </div>
            </div>

            <div className="live-feed glass-panel">
              <div className="live-feed-header">🤖 AI ACTIVITY LOG</div>
              {loading ? (
                <div className="feed-item">Loading activity...</div>
              ) : activityFeed.length ? (
                activityFeed.map((item) => (
                  <div key={item.id} className="feed-item enhanced">
                    <div className="feed-item-top">
                      <span className="feed-time">{item.time}</span>
                      <span className={`feed-badge ${item.outcome?.toLowerCase().includes("book") ? "booked" : item.outcome?.toLowerCase().includes("miss") ? "missed" : ""}`}>
                        {item.outcome}
                      </span>
                      {item.duration > 0 && (
                        <span className="feed-duration">{formatDuration(item.duration)}</span>
                      )}
                    </div>
                    <div className="feed-item-text">{item.text}</div>
                    <div className="feed-item-sentiment">
                      <span className={`sentiment-dot ${item.sentiment}`}></span>
                      {item.sentiment}
                    </div>
                  </div>
                ))
              ) : (
                <div className="feed-item">No activity yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Upsell Modal */}
      <UpsellModal
        isOpen={showUpsellModal}
        onClose={() => setShowUpsellModal(false)}
        usagePercent={Math.max(callPercent, smsPercent)}
        limitState={usage?.limit_state || "ok"}
        currentTier={subscription.plan_type || "core"}
        callMinutesUsed={callUsed}
        callMinutesTotal={callTotal}
        smsUsed={smsUsed}
        smsTotal={smsTotal}
      />
    </div>
  );
}
