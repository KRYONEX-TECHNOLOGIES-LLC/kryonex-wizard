import React from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  getLeads,
  getMessages,
  getStats,
  getSubscriptionStatus,
  getUsageStatus,
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
  const [messages, setMessages] = React.useState([]);
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
  const [businessName, setBusinessName] = React.useState("");
  const [transferNumber, setTransferNumber] = React.useState("");
  const [profileStatus, setProfileStatus] = React.useState("");
  const [lastUpdated, setLastUpdated] = React.useState(null);

  React.useEffect(() => {
    let mounted = true;
    const load = async (isInitial = false) => {
      try {
        const [statsRes, leadsRes, subRes, usageRes, messagesRes] =
          await Promise.all([
            getStats(),
            getLeads(),
            getSubscriptionStatus(),
            getUsageStatus(),
            getMessages(),
          ]);
        if (mounted) {
          setStats(statsRes.data);
          setLeads(leadsRes.data.leads || []);
          setSubscription(subRes.data || { status: "none", plan_type: null });
          setUsage(usageRes.data || null);
          setMessages(messagesRes.data.messages || []);
          setLastUpdated(new Date());
        }

        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData?.session?.user;
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("business_name, transfer_number")
            .eq("user_id", user.id)
            .maybeSingle();
          if (mounted && profile) {
            setBusinessName(profile.business_name || "");
            setTransferNumber(profile.transfer_number || "");
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

  const handleSaveProfile = async () => {
    setProfileStatus("");
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({
        business_name: businessName || null,
        transfer_number: transferNumber || null,
      })
      .eq("user_id", user.id);
    if (error) {
      setProfileStatus(error.message);
      return;
    }
    await supabase
      .from("agents")
      .update({ transfer_number: transferNumber || null })
      .eq("user_id", user.id);
    setProfileStatus("Saved.");
  };

  const planTier = String(subscription.plan_type || "").toLowerCase();
  const eligibleNewAgent =
    planTier.includes("elite") ||
    planTier.includes("white") ||
    planTier.includes("glove");

  const formatDate = (value) => {
    if (!value) return "N/A";
    const date = new Date(value);
    return date.toLocaleDateString();
  };

  const statusTone = () => {
    if (subscription.status === "active" || subscription.status === "trialing") {
      return "status-active";
    }
    if (subscription.status === "past_due") return "status-past-due";
    if (subscription.status === "canceled") return "status-canceled";
    return "status-none";
  };

  const usagePercent = (remaining, total) => {
    if (!total) return 0;
    const used = total - remaining;
    return Math.min(100, Math.max(0, Math.round((used / total) * 100)));
  };

  return (
    <div className="war-room">
      <TopMenu />
      <div className="dashboard-layout">
        <SideNav
          eligibleNewAgent={eligibleNewAgent}
          onUpgrade={handleBilling}
          onNewAgent={() => navigate("/wizard?new=1")}
          billingStatus={subscription.status}
          tier={subscription.plan_type}
          agentLive={agentProfile.is_active}
          lastUpdated={lastUpdated}
          isSeller
        />
        <div className="war-room-shell">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="war-room-header"
        >
          <div>
            <div className="war-room-kicker">THE WAR ROOM</div>
            <div className="war-room-title">Kryonex Command Deck</div>
          </div>
          <div className="war-room-actions">
            <button className="button-primary pulse-gold" onClick={handleBilling}>
              MANAGE SUBSCRIPTION
            </button>
          </div>
        </motion.div>

        <div className="status-bar">
          <div className="status-live">
            <span className="live-dot" />
            <span>LIVE</span>
            <span className="live-time">
              {lastUpdated ? lastUpdated.toLocaleTimeString() : "--"}
            </span>
          </div>
          <div className="status-pill status-active">
            Agent {agentProfile.is_active ? "LIVE" : "PAUSED"}
          </div>
          <div className={`status-pill ${statusTone()}`}>
            Billing {subscription.status || "none"}
          </div>
          <div className="status-pill status-unknown">
            Tier {subscription.plan_type || "none"}
          </div>
          <div className="status-pill status-unknown">
            Next Bill {formatDate(subscription.current_period_end)}
          </div>
          <div className="status-pill status-unknown">
            AI Line {agentProfile.phone_number || "unassigned"}
          </div>
        </div>

        <div className="command-grid" id="command-deck">
          <div className="deck-card glass-panel">
            <div className="deck-title">Business Profile</div>
            <label className="deck-label">Business Name</label>
            <input
              className="glass-input"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Kryonex Operations"
            />
            <label className="deck-label">Transfer Number</label>
            <input
              className="glass-input mono"
              value={transferNumber}
              onChange={(e) => setTransferNumber(e.target.value)}
              placeholder="+1 800 555 0123"
            />
            <button className="glow-button deck-action" onClick={handleSaveProfile}>
              SAVE CHANGES
            </button>
            {profileStatus ? (
              <div className="deck-status">{profileStatus}</div>
            ) : null}
          </div>

          <div className="deck-card glass-panel">
            <div className="deck-title">Agent Control</div>
            <div className="deck-row">
              <span>AI Line</span>
              <span className="mono text-neon-cyan">
                {agentProfile.phone_number || "unassigned"}
              </span>
            </div>
            <div className="deck-row">
              <span>Status</span>
              <span
                className={`mono ${
                  agentProfile.is_active ? "text-neon-green" : "text-neon-pink"
                }`}
              >
                {agentProfile.is_active ? "LIVE" : "PAUSED"}
              </span>
            </div>
            {eligibleNewAgent ? (
              <button
                className="button-primary deck-action"
                onClick={() => navigate("/wizard?new=1")}
              >
                NEW AGENT
              </button>
            ) : (
              <button className="button-primary deck-action" onClick={handleBilling}>
                UPGRADE FOR NEW AGENT
              </button>
            )}
            <a
              className="button-primary deck-action"
              href="mailto:support@kryonextech.com?subject=Industry%20Change%20Request"
            >
              REQUEST INDUSTRY CHANGE
            </a>
          </div>

          <div className="deck-card glass-panel">
            <div className="deck-title">Usage Pulse</div>
            <div className="deck-row">
              <span>Call Minutes</span>
              <span className="mono">
                {usage?.call_minutes_remaining ?? 0}/{usage?.call_minutes_total ?? 0}
              </span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${usagePercent(
                    usage?.call_minutes_remaining ?? 0,
                    usage?.call_minutes_total ?? 0
                  )}%`,
                }}
              />
            </div>
            <div className="deck-row">
              <span>SMS</span>
              <span className="mono">
                {usage?.sms_remaining ?? 0}/{usage?.sms_total ?? 0}
              </span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${usagePercent(
                    usage?.sms_remaining ?? 0,
                    usage?.sms_total ?? 0
                  )}%`,
                }}
              />
            </div>
            <div className="deck-row">
              <span>Limit State</span>
              <span className="mono">{usage?.limit_state || "ok"}</span>
            </div>
          </div>

          <div className="deck-card glass-panel">
            <div className="deck-title">KPI Snapshot</div>
            <div className="kpi-grid">
              <div className="kpi">
                <div>Total Leads</div>
                <div className="mono text-neon-green">{stats.total_leads}</div>
              </div>
              <div className="kpi">
                <div>Booked</div>
                <div className="mono text-neon-green">{stats.booked_leads}</div>
              </div>
              <div className="kpi">
                <div>Missed</div>
                <div className="mono text-neon-pink">
                  {Math.max(0, stats.total_leads - stats.booked_leads)}
                </div>
              </div>
              <div className="kpi">
                <div>Call Volume</div>
                <div className="mono text-neon-purple">{stats.call_volume}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="intel-grid">
          <div className="glass-panel intel-card" id="lead-grid">
            <div className="intel-title">Lead Grid</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ textAlign: "left", color: "#9ca3af" }}>
                  <tr>
                    <th style={{ paddingBottom: "0.8rem" }}>Name</th>
                    <th style={{ paddingBottom: "0.8rem" }}>Status</th>
                    <th style={{ paddingBottom: "0.8rem" }}>Summary</th>
                    <th style={{ paddingBottom: "0.8rem" }}>Sentiment</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="4" style={{ padding: "1rem" }}>
                        Loading...
                      </td>
                    </tr>
                  ) : leads.length ? (
                    leads.map((lead) => (
                      <tr key={lead.id} className="scanline-row">
                        <td style={{ padding: "0.8rem 0" }}>
                          {lead.name || "Unknown"}
                        </td>
                        <td style={{ padding: "0.8rem 0" }}>
                          <span
                            className={`badge ${
                              lead.status?.toLowerCase() === "booked"
                                ? "badge-booked"
                                : "badge-missed"
                            }`}
                          >
                            {lead.status || "MISSED"}
                          </span>
                        </td>
                        <td style={{ padding: "0.8rem 0", color: "#9ca3af" }}>
                          {lead.summary || "No summary."}
                        </td>
                        <td style={{ padding: "0.8rem 0" }}>{lead.sentiment}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" style={{ padding: "1rem" }}>
                        No leads captured yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="glass-panel intel-card" id="black-box">
            <div className="intel-title">Black Box</div>
            {leads.length ? (
              <div className="blackbox-list">
                {leads.slice(0, 3).map((lead) => (
                  <div key={lead.id} className="blackbox-item">
                    <div className="blackbox-head">
                      <div>{lead.name || "Unknown Caller"}</div>
                      <span className="mono text-neon-cyan">
                        {lead.status || "MISSED"}
                      </span>
                    </div>
                    <div className="blackbox-body">
                      {lead.transcript || lead.summary || "Transcript unavailable."}
                    </div>
                    {lead.call_duration_seconds ? (
                      <div className="blackbox-meta">
                        Duration: {Math.round(lead.call_duration_seconds / 60)}m
                      </div>
                    ) : null}
                    {lead.recording_url ? (
                      <audio className="blackbox-audio" controls src={lead.recording_url}>
                        Your browser does not support audio playback.
                      </audio>
                    ) : (
                      <div className="blackbox-meta">Recording unavailable.</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="blackbox-empty">
                No recordings yet. Calls will appear here.
              </div>
            )}
          </div>

          <div className="glass-panel intel-card" id="sms-log">
            <div className="intel-title">SMS Log</div>
            {messages.length ? (
              <div className="blackbox-list">
                {messages.slice(0, 5).map((msg) => (
                  <div key={msg.id} className="blackbox-item">
                    <div className="blackbox-head">
                      <div>{msg.direction?.toUpperCase()}</div>
                      <span className="mono text-neon-purple">
                        {new Date(msg.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="blackbox-body">{msg.body}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="blackbox-empty">No SMS yet.</div>
            )}
          </div>
        </div>
        <div className="intel-grid" id="calendar">
          <div className="glass-panel intel-card">
            <div className="intel-title">Calendar</div>
            <div className="blackbox-empty">
              Calendar integration launches with Elite.
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
