import React from "react";
import { motion } from "framer-motion";
import { Play } from "lucide-react";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";

const logs = [
  {
    timestamp: "2026-01-18 21:12",
    client: "Apex Heating",
    result: "Booked",
    sentiment: "positive",
    cost: 0.45,
    recording: "https://recordings.kryonex/rec_102",
  },
  {
    timestamp: "2026-01-18 21:09",
    client: "Flow Plumbing Co",
    result: "Transfer",
    sentiment: "neutral",
    cost: 0.18,
    recording: "https://recordings.kryonex/rec_101",
  },
  {
    timestamp: "2026-01-18 20:56",
    client: "Northstar HVAC",
    result: "Hangup",
    sentiment: "negative",
    cost: 0.06,
    recording: "https://recordings.kryonex/rec_100",
  },
];

const sentimentColor = {
  positive: "bg-neon-green",
  neutral: "bg-white/40",
  negative: "bg-neon-pink",
};

export default function AdminLogsPage() {
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
              Global Neural Logs
            </p>
            <h1 className="mt-2 text-4xl font-semibold">AI Call Stream</h1>
            <p className="mt-1 text-white/60">
              Matrix-style feed for every AI interaction.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="glass-panel rounded-3xl border border-white/10 p-6 overflow-hidden"
          >
            <div className="grid grid-cols-[1fr_1fr_0.9fr_0.7fr_0.9fr_0.8fr] gap-4 text-[0.65rem] uppercase tracking-[0.3em] text-white/40 border-b border-white/10 pb-3">
              <div>Timestamp</div>
              <div>Client</div>
              <div>Result</div>
              <div>Sentiment</div>
              <div>API Cost</div>
              <div>Playback</div>
            </div>
            <div className="mt-3 space-y-3 max-h-[620px] overflow-y-auto pr-2">
              {logs.map((log, index) => (
                <div
                  key={`${log.timestamp}-${log.client}`}
                  className={`grid grid-cols-[1fr_1fr_0.9fr_0.7fr_0.9fr_0.8fr] gap-4 items-center rounded-2xl border border-white/5 bg-black/40 px-4 py-3 transition ${
                    index === 0 ? "animate-pulse border-neon-cyan/40" : ""
                  }`}
                >
                  <div className="text-xs text-neon-cyan font-mono">{log.timestamp}</div>
                  <div className="text-sm font-semibold">{log.client}</div>
                  <div className="text-xs uppercase tracking-[0.3em] text-neon-green">
                    {log.result}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-3 w-3 rounded-full ${sentimentColor[log.sentiment]}`}
                    />
                    <span className="text-[0.7rem] uppercase tracking-[0.3em] text-white/60">
                      {log.sentiment}
                    </span>
                  </div>
                  <div className="text-xs text-white/40">${log.cost.toFixed(2)}</div>
                  <a
                    href={log.recording}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center text-neon-purple hover:text-white transition p-1 rounded hover:bg-white/10"
                    title="Play recording"
                  >
                    <Play size={16} />
                  </a>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
