import React from "react";
import { motion } from "framer-motion";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Activity,
  AlertTriangle,
  Gauge,
  Globe,
  Power,
  Sparkles,
  Users,
  Phone,
  Calendar,
  DollarSign,
  TrendingUp,
  Shield,
  Zap,
  Eye,
  Flag,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { syncRetellTemplates, getAdminMetricsEnhanced, getAdminMetrics, getAdminHealthScores, getAdminChurnAlerts, getAdminErrorLogs } from "../lib/api";

// Format relative time
const formatRelativeTime = (dateStr) => {
  if (!dateStr) return "--";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
};

// Format currency
const formatCurrency = (cents) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format((cents || 0) / 100);
};

// Active client locations (will be replaced with real data later)
const activeClients = [
  { id: "c1", lng: -118.2437, lat: 34.0522 },
  { id: "c2", lng: -87.6298, lat: 41.8781 },
  { id: "c3", lng: -74.006, lat: 40.7128 },
  { id: "c4", lng: -95.3698, lat: 29.7604 },
  { id: "c5", lng: -122.3321, lat: 47.6062 },
];

const CommandMap = ({ agentCount }) => {
  const mapRef = React.useRef(null);
  const mapInstance = React.useRef(null);

  React.useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = new maplibregl.Map({
      container: mapRef.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [-98.5795, 39.8283],
      zoom: 3,
      interactive: false,
    });
    mapInstance.current = map;
    map.on("load", () => {
      map.addSource("clients", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: activeClients.map((client) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [client.lng, client.lat] },
            properties: {},
          })),
        },
      });
      map.addLayer({
        id: "client-glow",
        type: "circle",
        source: "clients",
        paint: {
          "circle-radius": 10,
          "circle-color": "#22d3ee",
          "circle-opacity": 0.25,
        },
      });
      map.addLayer({
        id: "client-dot",
        type: "circle",
        source: "clients",
        paint: {
          "circle-radius": 4,
          "circle-color": "#34d399",
          "circle-opacity": 0.9,
        },
      });
    });
    return () => map.remove();
  }, []);

  return <div ref={mapRef} className="command-map" />;
};

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [metrics, setMetrics] = React.useState(null);
  const [basicMetrics, setBasicMetrics] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [panic, setPanic] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [syncNote, setSyncNote] = React.useState("");
  const [currentTime, setCurrentTime] = React.useState(new Date());
  const [lastRefresh, setLastRefresh] = React.useState(null);
  const [healthStats, setHealthStats] = React.useState(null);
  const [churnAlertCount, setChurnAlertCount] = React.useState(0);
  const [errorCount, setErrorCount] = React.useState(0);

  // Live clock
  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load metrics
  React.useEffect(() => {
    let mounted = true;
    const loadMetrics = async () => {
      try {
        const [enhancedRes, basicRes, healthRes, churnRes, errorRes] = await Promise.all([
          getAdminMetricsEnhanced().catch(() => ({ data: null })),
          getAdminMetrics().catch(() => ({ data: null })),
          getAdminHealthScores({ limit: 1 }).catch(() => ({ data: null })),
          getAdminChurnAlerts({ resolved: "false", limit: 1 }).catch(() => ({ data: null })),
          getAdminErrorLogs({ resolved: "false", limit: 1 }).catch(() => ({ data: null })),
        ]);
        if (mounted) {
          if (enhancedRes.data) setMetrics(enhancedRes.data);
          if (basicRes.data) setBasicMetrics(basicRes.data);
          if (healthRes.data?.stats) setHealthStats(healthRes.data.stats);
          if (churnRes.data?.stats) setChurnAlertCount(churnRes.data.stats.unresolved_total || 0);
          if (errorRes.data) setErrorCount(errorRes.data.unresolved_count || 0);
          setLastRefresh(new Date());
        }
      } catch (err) {
        console.error("Failed to load admin metrics:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadMetrics();
    const interval = setInterval(loadMetrics, 10000); // Refresh every 10 seconds
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleSyncTemplates = async (industry) => {
    try {
      setSyncing(true);
      setSyncNote("");
      const { data } = await syncRetellTemplates({ industry });
      setSyncNote(
        `Synced ${industry} templates: ${data?.success ?? 0} ok, ${
          data?.failed ?? 0
        } failed.`
      );
    } catch (err) {
      const message =
        err?.response?.data?.error || err?.message || "Sync failed.";
      setSyncNote(message);
    } finally {
      setSyncing(false);
    }
  };

  // Generate activity feed from real data
  const activityFeed = metrics?.activity_feed || [];

  // System health status
  const systemHealth = metrics?.system_health || {};
  const allSystemsGo = systemHealth.api === "operational" && systemHealth.database === "operational";

  return (
    <div className="min-h-screen bg-void-black text-white relative overflow-hidden">
      <TopMenu />
      <div className="absolute inset-0 bg-grid-lines opacity-40" />
      <div className="absolute -top-20 right-0 h-72 w-72 rounded-full bg-neon-purple/20 blur-[140px]" />
      <div className="absolute bottom-0 left-0 h-96 w-96 rounded-full bg-neon-cyan/10 blur-[160px]" />

      {/* Live Ticker */}
      <div className="ticker-bar">
        <div className="ticker-track">
          {activityFeed.length > 0 ? (
            activityFeed.concat(activityFeed).map((item, idx) => (
              <span key={`${item.id}-${idx}`} className="ticker-item">
                <span className={`ticker-badge ${item.status?.toLowerCase().includes("book") ? "booked" : ""}`}>
                  {item.type === "appointment" ? "📅" : "📞"}
                </span>
                {item.name} - {item.summary?.slice(0, 50) || item.status}
              </span>
            ))
          ) : (
            <>
              <span className="ticker-item">🔄 Loading live activity feed...</span>
              <span className="ticker-item">📡 Connecting to command center...</span>
            </>
          )}
        </div>
      </div>

      <div className="relative z-10 px-6 py-10 dashboard-layout w-full">
        <SideNav
          eligibleNewAgent
          onUpgrade={() => navigate("/billing")}
          onNewAgent={() => navigate("/wizard?new=1")}
          billingStatus="admin"
          tier="admin"
          agentLive
          lastUpdated={lastRefresh}
          isAdmin
        />

        <div className="space-y-6">
          {/* Header Panel */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel rounded-3xl p-6 border border-white/10"
          >
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-white/50">
                  GRANDMASTER COMMAND CENTER
                </p>
                <h1 className="mt-2 text-3xl font-semibold">Kryonex Empire HQ</h1>
                <p className="mt-2 text-white/60 flex items-center gap-4">
                  <span className="live-clock-admin">
                    {currentTime.toLocaleTimeString()}
                  </span>
                  <span className="text-xs">
                    Last sync: {lastRefresh ? formatRelativeTime(lastRefresh.toISOString()) : "--"}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="status-ring">
                  <div className="status-ring-item">
                    <span className={`ring-dot ${allSystemsGo ? "good" : "warn"}`} />
                    <span>Systems</span>
                  </div>
                  <div className="status-ring-item">
                    <span className={`ring-dot ${systemHealth.webhooks === "operational" ? "good" : "warn"}`} />
                    <span>Webhooks</span>
                  </div>
                  <div className="status-ring-item">
                    <span className={`ring-dot ${(metrics?.subscriptions?.past_due || 0) === 0 ? "good" : "warn"}`} />
                    <span>Billing</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      className="px-3 py-2 text-xs uppercase tracking-[0.2em] border border-white/20 rounded-full hover:border-white/40 transition"
                      onClick={() => handleSyncTemplates("plumbing")}
                      disabled={syncing}
                    >
                      {syncing ? "Syncing..." : "Sync Plumbing"}
                    </button>
                    <button
                      className="px-3 py-2 text-xs uppercase tracking-[0.2em] border border-white/20 rounded-full hover:border-white/40 transition"
                      onClick={() => handleSyncTemplates("hvac")}
                      disabled={syncing}
                    >
                      {syncing ? "Syncing..." : "Sync HVAC"}
                    </button>
                    <button
                      className={`panic-button ${panic ? "active" : ""}`}
                      onClick={() => setPanic((prev) => !prev)}
                    >
                      <Power size={14} /> EMERGENCY STOP
                    </button>
                  </div>
                  {syncNote ? (
                    <div className="text-xs text-white/60">{syncNote}</div>
                  ) : null}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Primary Metrics Grid */}
          <div className="admin-metrics-grid">
            {/* Total Users */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="admin-metric-card glass-panel"
            >
              <div className="metric-icon">
                <Users size={24} />
              </div>
              <div className="metric-content">
                <div className="metric-value">{metrics?.totals?.users || 0}</div>
                <div className="metric-label">Total Users</div>
                <div className="metric-sub">
                  +{metrics?.today?.new_users || 0} today
                </div>
              </div>
            </motion.div>

            {/* Total Leads */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="admin-metric-card glass-panel"
            >
              <div className="metric-icon text-neon-cyan">
                <Phone size={24} />
              </div>
              <div className="metric-content">
                <div className="metric-value text-neon-cyan">{metrics?.totals?.leads || 0}</div>
                <div className="metric-label">Total Calls/Leads</div>
                <div className="metric-sub">
                  +{metrics?.today?.leads || 0} today | +{metrics?.this_week?.leads || 0} this week
                </div>
              </div>
            </motion.div>

            {/* Appointments */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="admin-metric-card glass-panel"
            >
              <div className="metric-icon text-neon-green">
                <Calendar size={24} />
              </div>
              <div className="metric-content">
                <div className="metric-value text-neon-green">{metrics?.totals?.appointments || 0}</div>
                <div className="metric-label">Appointments</div>
                <div className="metric-sub">
                  +{metrics?.today?.appointments || 0} today | {metrics?.performance?.booking_rate || 0}% rate
                </div>
              </div>
            </motion.div>

            {/* MRR */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="admin-metric-card glass-panel glow-gold"
            >
              <div className="metric-icon text-neon-gold">
                <DollarSign size={24} />
              </div>
              <div className="metric-content">
                <div className="metric-value text-neon-gold">
                  {formatCurrency(basicMetrics?.mrr?.amount_cents || 0)}
                </div>
                <div className="metric-label">Monthly Revenue</div>
                <div className="metric-sub">
                  {metrics?.subscriptions?.active || 0} active subs
                </div>
              </div>
            </motion.div>

            {/* Active Agents */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="admin-metric-card glass-panel"
            >
              <div className="metric-icon text-neon-purple">
                <Zap size={24} />
              </div>
              <div className="metric-content">
                <div className="metric-value text-neon-purple">{metrics?.totals?.agents || 0}</div>
                <div className="metric-label">Active AI Agents</div>
                <div className="metric-sub">
                  HVAC: {metrics?.performance?.agents_hvac || 0} | Plumbing: {metrics?.performance?.agents_plumbing || 0}
                </div>
              </div>
            </motion.div>

            {/* Platform Usage */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="admin-metric-card glass-panel"
            >
              <div className="metric-icon">
                <Gauge size={24} />
              </div>
              <div className="metric-content">
                <div className="metric-value">
                  {metrics?.usage?.total_minutes_used?.toLocaleString() || 0}
                </div>
                <div className="metric-label">Total Minutes Used</div>
                <div className="metric-sub">
                  {metrics?.usage?.utilization_percent || 0}% platform utilization
                </div>
              </div>
            </motion.div>
          </div>

          {/* Main Grid */}
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            {/* Live Activity Feed */}
            <div className="glass-panel rounded-3xl border border-white/10 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs uppercase tracking-[0.4em] text-white/50">
                  <Eye size={14} className="inline mr-2" />
                  Live Activity Feed
                </div>
                <div className="status-live">
                  <Sparkles size={12} /> REAL-TIME
                </div>
              </div>
              <div className="activity-feed-admin">
                {loading ? (
                  <div className="activity-item">Loading activity...</div>
                ) : activityFeed.length > 0 ? (
                  activityFeed.slice(0, 10).map((item) => (
                    <div key={item.id} className="activity-item">
                      <div className="activity-time">{formatRelativeTime(item.time)}</div>
                      <div className="activity-type">
                        {item.type === "appointment" ? "📅" : "📞"}
                      </div>
                      <div className="activity-content">
                        <div className="activity-name">{item.name}</div>
                        <div className="activity-summary">{item.summary?.slice(0, 60) || item.status}</div>
                      </div>
                      <div className={`activity-status ${
                        item.status?.toLowerCase().includes("book") ? "booked" : 
                        item.sentiment === "positive" ? "positive" : ""
                      }`}>
                        {item.status}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="activity-item">No recent activity</div>
                )}
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Subscription Breakdown */}
              <div className="glass-panel rounded-3xl border border-white/10 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-xs uppercase tracking-[0.4em] text-white/50">
                    Subscription Status
                  </div>
                  <div className="text-neon-green text-xs">
                    {basicMetrics?.conversion_rate || 0}% CONVERSION
                  </div>
                </div>
                <div className="subscription-breakdown">
                  <div className="sub-item active">
                    <div className="sub-dot"></div>
                    <span className="sub-label">Active</span>
                    <span className="sub-value">{metrics?.subscriptions?.active || 0}</span>
                  </div>
                  <div className="sub-item trialing">
                    <div className="sub-dot"></div>
                    <span className="sub-label">Trialing</span>
                    <span className="sub-value">{metrics?.subscriptions?.trialing || 0}</span>
                  </div>
                  <div className="sub-item past-due">
                    <div className="sub-dot"></div>
                    <span className="sub-label">Past Due</span>
                    <span className="sub-value">{metrics?.subscriptions?.past_due || 0}</span>
                  </div>
                  <div className="sub-item cancelled">
                    <div className="sub-dot"></div>
                    <span className="sub-label">Cancelled</span>
                    <span className="sub-value">{metrics?.subscriptions?.cancelled || 0}</span>
                  </div>
                </div>
              </div>

              {/* Flagged for Review */}
              {(metrics?.totals?.flagged_for_review || 0) > 0 && (
                <div className="glass-panel rounded-3xl border border-neon-gold/30 p-6">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs uppercase tracking-[0.4em] text-neon-gold">
                      <Flag size={14} className="inline mr-2" />
                      Flagged for Review
                    </div>
                    <div className="text-neon-gold text-xl font-bold">
                      {metrics?.totals?.flagged_for_review || 0}
                    </div>
                  </div>
                  <button 
                    className="admin-action-btn"
                    onClick={() => navigate("/admin/leads?flagged=true")}
                  >
                    Review Flagged Leads
                  </button>
                </div>
              )}

              {/* Map */}
              <div className="glass-panel rounded-3xl border border-white/10 p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs uppercase tracking-[0.4em] text-white/50">
                    Active Client Map
                  </div>
                  <div className="text-xs text-white/50 flex items-center gap-2">
                    <Globe size={12} /> {metrics?.totals?.agents || 0} Agents Live
                  </div>
                </div>
                <div className="map-shell">
                  <CommandMap agentCount={metrics?.totals?.agents || 0} />
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Stats Row */}
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr_1fr_1fr]">
            <div className="glass-panel rounded-3xl border border-white/10 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-widest text-white/40">
                    API Status
                  </div>
                  <div className={`mt-2 text-xl font-mono ${
                    systemHealth.api === "operational" ? "text-neon-green" : "text-neon-gold"
                  }`}>
                    {systemHealth.api === "operational" ? "Operational" : "Degraded"}
                  </div>
                </div>
                <Activity size={20} className="text-neon-green" />
              </div>
            </div>

            <div className="glass-panel rounded-3xl border border-white/10 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-widest text-white/40">
                    Webhook Health
                  </div>
                  <div className={`mt-2 text-xl font-mono ${
                    systemHealth.webhooks === "operational" ? "text-neon-green" : "text-neon-gold"
                  }`}>
                    {systemHealth.last_webhook ? formatRelativeTime(systemHealth.last_webhook) : "Unknown"}
                  </div>
                </div>
                <Shield size={20} className="text-neon-cyan" />
              </div>
            </div>

            <div className="glass-panel rounded-3xl border border-white/10 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-widest text-white/40">
                    Today's Calls
                  </div>
                  <div className="mt-2 text-xl font-mono text-neon-cyan">
                    {metrics?.today?.leads || 0}
                  </div>
                </div>
                <Phone size={20} className="text-neon-cyan" />
              </div>
            </div>

            <div className="glass-panel rounded-3xl border border-white/10 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-widest text-white/40">
                    Booking Rate
                  </div>
                  <div className="mt-2 text-xl font-mono text-neon-green">
                    {metrics?.performance?.booking_rate || 0}%
                  </div>
                </div>
                <TrendingUp size={20} className="text-neon-green" />
              </div>
            </div>
          </div>

          {/* Operations & Health Overview */}
          <div className="glass-panel rounded-3xl border border-white/10 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs uppercase tracking-[0.4em] text-white/50">
                Operations & Health
              </div>
              <button 
                className="text-xs text-neon-cyan hover:underline"
                onClick={() => navigate("/admin/ops")}
              >
                View Details →
              </button>
            </div>
            <div className="admin-ops-summary-grid">
              {/* Error Count */}
              <div className={`ops-summary-card ${errorCount > 0 ? "alert" : ""}`}>
                <div className="ops-icon error">
                  <AlertTriangle size={18} />
                </div>
                <div className="ops-info">
                  <span className="ops-value">{errorCount}</span>
                  <span className="ops-label">Unresolved Errors</span>
                </div>
              </div>
              
              {/* Churn Alerts */}
              <div className={`ops-summary-card ${churnAlertCount > 0 ? "warning" : ""}`}>
                <div className="ops-icon churn">
                  <Flag size={18} />
                </div>
                <div className="ops-info">
                  <span className="ops-value">{churnAlertCount}</span>
                  <span className="ops-label">Churn Alerts</span>
                </div>
              </div>
              
              {/* Health Score Distribution */}
              {healthStats && (
                <>
                  <div className="ops-summary-card healthy">
                    <div className="ops-icon healthy">
                      <TrendingUp size={18} />
                    </div>
                    <div className="ops-info">
                      <span className="ops-value">{(healthStats.by_grade?.A || 0) + (healthStats.by_grade?.B || 0)}</span>
                      <span className="ops-label">Healthy (A/B)</span>
                    </div>
                  </div>
                  
                  <div className={`ops-summary-card ${(healthStats.by_risk?.critical || 0) > 0 ? "critical" : ""}`}>
                    <div className="ops-icon risk">
                      <Shield size={18} />
                    </div>
                    <div className="ops-info">
                      <span className="ops-value">{healthStats.by_risk?.critical || 0}</span>
                      <span className="ops-label">Critical Risk</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="glass-panel rounded-3xl border border-white/10 p-6">
            <div className="text-xs uppercase tracking-[0.4em] text-white/50 mb-4">
              Quick Actions
            </div>
            <div className="admin-quick-actions">
              <button className="admin-action-btn" onClick={() => navigate("/admin/users")}>
                <Users size={16} /> Fleet Registry
              </button>
              <button className="admin-action-btn" onClick={() => navigate("/admin/leads")}>
                <Phone size={16} /> All Leads
              </button>
              <button className="admin-action-btn" onClick={() => navigate("/admin/calendar")}>
                <Calendar size={16} /> All Appointments
              </button>
              <button className="admin-action-btn" onClick={() => navigate("/admin/financials")}>
                <DollarSign size={16} /> Revenue Telemetry
              </button>
              <button className="admin-action-btn" onClick={() => navigate("/admin/black-box")}>
                <Eye size={16} /> Black Box
              </button>
              <button className="admin-action-btn" onClick={() => navigate("/admin/wizard/create")}>
                <Zap size={16} /> Deploy Client
              </button>
              <button className="admin-action-btn" onClick={() => navigate("/admin/ops")}>
                <Activity size={16} /> Ops Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>

      {panic ? (
        <div className="toast danger">
          <AlertTriangle size={14} /> EMERGENCY STOP ACTIVATED - All outbound paused.
        </div>
      ) : null}
    </div>
  );
}
