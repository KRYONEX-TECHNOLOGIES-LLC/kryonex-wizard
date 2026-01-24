import React from "react";
import { useNavigate } from "react-router-dom";
import {
  getLeads,
  getStats,
  getSubscriptionStatus,
  getUsageStatus,
  createTopupSession,
} from "../lib/api";
import { supabase } from "../lib/supabase";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = React.useState({
    total_leads: 0,
    new_leads: 0,
    booked_leads: 0,
    call_volume: 0,
  });
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

  React.useEffect(() => {
    let mounted = true;
    const load = async (isInitial = false) => {
      try {
        const [statsRes, leadsRes, subRes, usageRes] = await Promise.all([
          getStats(),
          getLeads(),
          getSubscriptionStatus(),
          getUsageStatus(),
        ]);
        if (mounted) {
          setStats(statsRes.data);
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
            .select("business_name, full_name, role")
            .eq("user_id", user.id)
            .maybeSingle();
          if (mounted && profile) {
            setIsSeller(profile.role === "seller");
            setIsAdmin(profile.role === "admin");
            const label =
              profile.full_name ||
              profile.business_name ||
              user.email ||
              "Operator";
            setUserLabel(label);
          }
          const { data: agent } = await supabase
            .from("agents")
            .select("phone_number, is_active")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .maybeSingle();
          if (mounted && agent) {
            setAgentProfile({
              phone_number: agent.phone_number || "",
              is_active: agent.is_active !== false,
            });
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

  const handleBilling = () => {
    navigate("/billing");
  };

  const planTier = String(subscription.plan_type || "").toLowerCase();
  const eligibleNewAgent =
    planTier.includes("elite") ||
    planTier.includes("white") ||
    planTier.includes("glove");

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
  const pipelineValue = stats.pipeline_value || 0;

  const formatCurrency = (value) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value || 0);

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

  const activityFeed = leads.slice(0, 3).map((lead) => ({
    id: lead.id,
    time: lead.created_at
      ? new Date(lead.created_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "--",
    text: lead.summary || lead.business_name || lead.name || "Lead activity",
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
          <div className="top-bar glass-panel">
            <div className="status-indicator">🟢 SYSTEM ONLINE</div>
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

          <div className="war-room-grid">
            <div className="kpi-hero glass-panel">
              <div className="kpi-card">
                <div className="kpi-label">Calls Handled</div>
                <div className="kpi-value">{stats.call_volume || 0}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Appointments Locked</div>
                <div className="kpi-value">{stats.booked_leads || 0}</div>
              </div>
              <div className="kpi-card glow-green">
                <div className="kpi-label">Estimated Revenue</div>
                <div className="kpi-value">{formatCurrency(pipelineValue)}</div>
                <div className="kpi-note">(Based on $450 avg. ticket)</div>
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

            <div className="live-feed glass-panel">
              <div className="live-feed-header">🤖 AI ACTIVITY LOG</div>
              {loading ? (
                <div className="feed-item">Loading activity...</div>
              ) : activityFeed.length ? (
                activityFeed.map((item) => (
                  <div key={item.id} className="feed-item">
                    <span className="feed-time">{item.time}</span>
                    <span>{item.text}</span>
                  </div>
                ))
              ) : (
                <div className="feed-item">No activity yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
