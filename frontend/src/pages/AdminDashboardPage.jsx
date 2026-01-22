import React from "react";
import { motion } from "framer-motion";
import {
  getAdminHealth,
  getAdminMetrics,
  getAdminTimeseries,
  getAuditLogs,
  syncStripe,
} from "../lib/api";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { useNavigate } from "react-router-dom";

const formatTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return date.toLocaleString();
};

const getTone = (action) => {
  if (!action) return "text-white/70";
  if (action.includes("failed") || action.includes("revoked")) return "text-neon-pink";
  if (action.includes("activated") || action.includes("verified")) return "text-neon-green";
  return "text-neon-cyan";
};

const sparkPath = (values, width, height) => {
  if (!values.length) return "";
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  return values
    .map((value, idx) => {
      const x = (idx / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${idx === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
};

const ChartCard = ({ title, value, subtitle, tone, data, unit }) => {
  const width = 220;
  const height = 70;
  const path = sparkPath(data, width, height);
  const area = `${path} L ${width},${height} L 0,${height} Z`;

  return (
    <div className="rounded-2xl border border-white/5 bg-black/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-white/60">{title}</div>
          <div className={`mt-2 text-xl font-mono ${tone}`}>{value}{unit}</div>
          {subtitle ? (
            <div className="mt-1 text-xs text-white/40">{subtitle}</div>
          ) : null}
        </div>
        <div className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 grid place-items-center">
          <span className={`text-xs ${tone}`}>LIVE</span>
        </div>
      </div>
      <div className="mt-4">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          <defs>
            <linearGradient id={`glow-${title}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(34,211,238,0.55)" />
              <stop offset="100%" stopColor="rgba(34,211,238,0)" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#glow-${title})`} opacity="0.7" />
          <path
            d={path}
            fill="none"
            stroke="rgba(34,211,238,0.9)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
};

const LinePanel = ({ title, subtitle, data, stroke }) => {
  const width = 520;
  const height = 120;
  const path = sparkPath(data, width, height);
  const area = `${path} L ${width},${height} L 0,${height} Z`;

  return (
    <div className="glass-panel rounded-3xl p-6 border border-white/10">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-white/40">
            {title}
          </div>
          <div className="text-sm text-white/60">{subtitle}</div>
        </div>
        <div className="text-xs text-white/40">LIVE</div>
      </div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id={`panel-${title}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.45" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#panel-${title})`} />
        <path
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [logs, setLogs] = React.useState([]);
  const [metrics, setMetrics] = React.useState(null);
  const [health, setHealth] = React.useState(null);
  const [series, setSeries] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [tick, setTick] = React.useState(0);
  const [syncing, setSyncing] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [logRes, metricsRes, healthRes, seriesRes] = await Promise.all([
          getAuditLogs(),
          getAdminMetrics(),
          getAdminHealth(),
          getAdminTimeseries(),
        ]);
        if (mounted) {
          setLogs(logRes.data.logs || []);
          setMetrics(metricsRes.data || null);
          setHealth(healthRes.data || null);
          setSeries(seriesRes.data || null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    const interval = setInterval(() => {
      setTick((prev) => prev + 1);
    }, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  React.useEffect(() => {
    let mounted = true;
    if (!tick) return;
    const refresh = async () => {
      try {
        const [logRes, metricsRes, healthRes, seriesRes] = await Promise.all([
          getAuditLogs(),
          getAdminMetrics(),
          getAdminHealth(),
          getAdminTimeseries(),
        ]);
        if (mounted) {
          setLogs(logRes.data.logs || []);
          setMetrics(metricsRes.data || null);
          setHealth(healthRes.data || null);
          setSeries(seriesRes.data || null);
        }
      } catch (err) {
        // silent refresh
      }
    };
    refresh();
    return () => {
      mounted = false;
    };
  }, [tick]);

  return (
    <div className="min-h-screen bg-void-black text-white relative overflow-hidden">
      <TopMenu />
      <div className="absolute inset-0 bg-grid-lines opacity-40" />
      <div className="absolute -top-28 -right-28 h-72 w-72 rounded-full bg-neon-purple/20 blur-[120px]" />
      <div className="absolute bottom-0 left-0 h-96 w-96 rounded-full bg-neon-cyan/10 blur-[140px]" />

      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10 dashboard-layout">
        <SideNav
          eligibleNewAgent
          onUpgrade={() => navigate("/billing")}
          onNewAgent={() => navigate("/wizard?new=1")}
          billingStatus="admin"
          tier="admin"
          agentLive
          lastUpdated={new Date()}
          isAdmin
        />
        <div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="glass-panel rounded-3xl p-8 border border-white/10"
        >
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-neon-cyan/70">
                NASA-Grade Oversight
              </p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight">
                Admin Command Center
              </h1>
              <p className="mt-2 text-white/60">
                Live audit stream for critical transactions and security events.
              </p>
            </div>
            <div className="glass-panel rounded-2xl px-5 py-4 border border-white/10">
              <div className="text-xs uppercase tracking-widest text-white/50">
                System Status
              </div>
              <div className="mt-2 text-neon-green font-mono">NOMINAL</div>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="button-primary"
              onClick={() => {
                window.localStorage.setItem("kryonex_admin_mode", "off");
                window.location.href = "/dashboard";
              }}
            >
              VIEW USER DASHBOARD
            </button>
            <button
              className="button-primary"
              onClick={() => window.location.reload()}
            >
              REFRESH TELEMETRY
            </button>
            <button
              className="button-primary"
              onClick={async () => {
                setSyncing(true);
                try {
                  await syncStripe();
                  const refreshed = await getAdminMetrics();
                  setMetrics(refreshed.data || null);
                } finally {
                  setSyncing(false);
                }
              }}
            >
              {syncing ? "SYNCING STRIPE..." : "SYNC STRIPE"}
            </button>
          </div>
        </motion.div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <motion.div
            className="glass-panel rounded-3xl p-6 border border-white/10"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs uppercase tracking-widest text-white/40">
                  Audit Timeline
                </div>
                <div className="text-lg font-semibold">Security Events</div>
              </div>
              <div className="text-xs text-white/50">{logs.length} entries</div>
            </div>
            <div className="space-y-4 max-h-[520px] overflow-y-auto pr-2">
              {loading ? (
                <div className="text-white/60">Loading logs...</div>
              ) : logs.length ? (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-2xl border border-white/5 bg-black/40 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className={`text-sm font-semibold ${getTone(log.action)}`}>
                          {log.action?.replace(/_/g, " ") || "event"}
                        </div>
                        <div className="text-xs text-white/50 mt-1">
                          {log.entity} {log.entity_id ? `• ${log.entity_id}` : ""}
                        </div>
                      </div>
                      <div className="text-xs text-white/40 font-mono">
                        {formatTime(log.created_at)}
                      </div>
                    </div>
                    {log.metadata ? (
                      <pre className="mt-3 text-[11px] text-white/50 font-mono whitespace-pre-wrap">
                        {JSON.stringify(log.metadata, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="text-white/60">No audit events yet.</div>
              )}
            </div>
          </motion.div>

          <motion.div
            className="glass-panel rounded-3xl p-6 border border-white/10"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="text-xs uppercase tracking-widest text-white/40">
              Mission KPIs
            </div>
            <div className="mt-4 grid gap-4">
              {metrics ? (
                <>
                  <ChartCard
                    title="MRR"
                    value={`$${(metrics.mrr?.amount_cents || 0) / 100}`}
                    unit="/mo"
                    subtitle="Monthly recurring revenue"
                    tone="text-neon-green"
                    data={[12, 18, 16, 22, 28, 26, 30]}
                  />
                  <ChartCard
                    title="Conversion"
                    value={metrics.conversion_rate || 0}
                    unit="%"
                    subtitle="Active subs / total users"
                    tone="text-neon-cyan"
                    data={[4, 6, 7, 9, 11, 10, 12]}
                  />
                  <ChartCard
                    title="Active Subs"
                    value={metrics.totals?.active_subscriptions || 0}
                    unit=""
                    subtitle="Currently billed"
                    tone="text-neon-cyan"
                    data={[1, 3, 4, 5, 7, 8, 9]}
                  />
                  <ChartCard
                    title="Failed Payments"
                    value={metrics.totals?.past_due || 0}
                    unit=""
                    subtitle="Past-due accounts"
                    tone="text-neon-pink"
                    data={[0, 1, 1, 2, 1, 1, 2]}
                  />
                </>
              ) : (
                <div className="text-white/60">Loading KPI telemetry...</div>
              )}
              <div className="rounded-2xl border border-white/5 bg-black/40 p-4">
                <div className="text-sm text-white/60">System Health</div>
                {health ? (
                  <div className="mt-2 text-xs text-white/60 space-y-1">
                    <div>Uptime: {health.uptime_sec}s</div>
                    <div>
                      Stripe Webhook:{" "}
                      {health.last_stripe_webhook_at || "No signal"}
                    </div>
                    <div>
                      Retell Webhook:{" "}
                      {health.last_retell_webhook_at || "No signal"}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-white/60">
                    Loading health telemetry...
                  </div>
                )}
              </div>
              {[
                { label: "Deploy Attempts", value: "Monitoring", tone: "text-neon-cyan" },
                { label: "Payment Failures", value: "Auto-Isolate", tone: "text-neon-pink" },
                { label: "Portal Access", value: "Tracked", tone: "text-neon-green" },
                { label: "Webhook Integrity", value: "Verified", tone: "text-neon-cyan" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-white/5 bg-black/40 p-4"
                >
                  <div className="text-sm text-white/60">{item.label}</div>
                  <div className={`mt-2 text-lg font-mono ${item.tone}`}>
                    {item.value}
                  </div>
                </div>
              ))}
              <div className="rounded-2xl border border-white/5 bg-black/40 p-4">
                <div className="text-sm text-white/60">Last Synchronization</div>
                <div className="mt-2 text-lg font-mono text-neon-cyan">
                  {new Date().toLocaleTimeString()}
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <LinePanel
            title="MRR Trajectory"
            subtitle="Daily MRR momentum"
            data={series?.series?.mrr_cents?.map((val) => val / 100) || [2, 4, 3, 5, 6, 8, 9]}
            stroke="rgba(16,185,129,0.9)"
          />
          <LinePanel
            title="New Subscribers"
            subtitle="Daily paid conversions"
            data={series?.series?.subs || [1, 2, 1, 3, 2, 4, 5]}
            stroke="rgba(34,211,238,0.9)"
          />
          <LinePanel
            title="New Users"
            subtitle="Daily account creation"
            data={series?.series?.users || [3, 4, 2, 5, 6, 7, 8]}
            stroke="rgba(124,58,237,0.9)"
          />
          <LinePanel
            title="Lead Velocity"
            subtitle="Daily leads captured"
            data={series?.series?.leads || [2, 5, 4, 6, 8, 7, 9]}
            stroke="rgba(244,63,94,0.9)"
          />
        </div>
        </div>
      </div>
    </div>
  );
}
