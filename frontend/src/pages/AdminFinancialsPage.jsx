import React from "react";
import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";

const kpis = [
  {
    label: "Total MRR",
    value: "$42,800",
    tone: "text-neon-green",
    trend: "↑ 12% vs last week",
  },
  {
    label: "Active Clients",
    value: "128",
    tone: "text-neon-cyan",
    trend: "↑ 3 new onboardings",
  },
  {
    label: "ARPU",
    value: "$334",
    tone: "text-neon-purple",
    trend: "↑ $18 avg ticket",
  },
  {
    label: "Churn Rate",
    value: "2.4%",
    tone: "text-neon-pink",
    trend: "↓ 0.2% MoM",
  },
];

const transactions = [
  { id: "txn_1093", client: "Apex Heating", amount: "$1,250", status: "Success", time: "Just now" },
  { id: "txn_1092", client: "Flow Plumbing Co", amount: "$980", status: "Success", time: "6m ago" },
  { id: "txn_1091", client: "Northstar HVAC", amount: "$249", status: "Pending", time: "12m ago" },
  { id: "txn_1090", client: "Zenith Cooling", amount: "$399", status: "Success", time: "20m ago" },
];

const chartPoints = [
  [0, 50],
  [1, 120],
  [2, 95],
  [3, 165],
  [4, 145],
  [5, 190],
  [6, 210],
  [7, 240],
];

const buildPath = (points) => {
  const maxValue = Math.max(...points.map((point) => point[1]));
  const height = 200;
  return points
    .map(
      ([x, y], index) =>
        `${index === 0 ? "M" : "L"}${(x / (points.length - 1)) * 100}%,${
          height - (y / maxValue) * height
        }`
    )
    .join(" ");
};

export default function AdminFinancialsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen w-full bg-void-black text-white relative overflow-hidden font-sans">
      <TopMenu />
      <div className="absolute inset-0 bg-grid-lines opacity-40" />
      <div className="relative z-10 flex w-full h-screen">
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
        <div className="flex-1 px-6 py-8 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="glass-panel rounded-3xl border border-white/10 p-6"
          >
            <p className="text-xs uppercase tracking-[0.4em] text-neon-cyan/70">
              Revenue Telemetry
            </p>
            <h1 className="mt-2 text-4xl font-semibold">Financial Command</h1>
            <p className="mt-1 text-white/60">
              KPI and trend surface for the Kryonex fleet.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="grid gap-4 lg:grid-cols-4"
          >
            {kpis.map((kpi) => (
              <div
                key={kpi.label}
                className="glass-panel rounded-3xl border border-white/10 p-5 flex flex-col gap-2"
              >
                <div className="text-[0.65rem] uppercase tracking-[0.3em] text-white/40">
                  {kpi.label}
                </div>
                <div className={`text-3xl font-mono ${kpi.tone}`}>{kpi.value}</div>
                <div className="flex items-center text-[0.7rem] text-white/60 gap-2">
                  <TrendingUp size={16} />
                  {kpi.trend}
                </div>
              </div>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="grid gap-6 lg:grid-cols-[1.5fr_1fr]"
          >
            <div className="glass-panel rounded-3xl border border-white/10 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs uppercase tracking-[0.4em] text-white/40">
                  MRR Growth
                </div>
                <span className="text-xs text-white/60">Last 8 weeks</span>
              </div>
              <div className="relative h-[250px]">
                <svg
                  viewBox="0 0 100 200"
                  className="w-full h-full overflow-visible"
                  preserveAspectRatio="none"
                >
                  <path
                    d={buildPath(chartPoints)}
                    fill="none"
                    stroke="url(#gradient)"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#22d3ee" />
                      <stop offset="100%" stopColor="#a855f7" />
                    </linearGradient>
                  </defs>
                  <path
                    d={`${buildPath(chartPoints)} L100,200 L0,200 Z`}
                    fill="rgba(34, 211, 238, 0.25)"
                  />
                </svg>
              </div>
            </div>
            <div className="glass-panel rounded-3xl border border-white/10 p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-[0.4em] text-white/40">
                  Recent Transactions
                </div>
                <button className="text-[0.6rem] uppercase tracking-[0.4em] text-neon-cyan">
                  View All
                </button>
              </div>
              <div className="space-y-3 overflow-y-auto">
                {transactions.map((txn) => (
                  <div
                    key={txn.id}
                    className="rounded-2xl border border-white/5 bg-black/40 px-4 py-3 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="text-sm font-semibold">{txn.client}</div>
                      <div className="text-[0.65rem] text-white/40">{txn.id}</div>
                    </div>
                    <div className="text-sm text-neon-green">{txn.amount}</div>
                    <div className="text-[0.65rem] uppercase tracking-[0.3em] text-white/60">
                      {txn.status}
                    </div>
                    <div className="text-[0.65rem] text-white/50">{txn.time}</div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
