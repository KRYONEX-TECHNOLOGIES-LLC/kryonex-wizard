import React from "react";
import { motion } from "framer-motion";
import { Play } from "lucide-react";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { fetchCallRecordings } from "../lib/api.js";

const formatDuration = (seconds = 0) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.max(0, seconds % 60);
  return `${mins}m ${secs}s`;
};

export default function AdminLogsPage() {
  const navigate = useNavigate();
  const [logs, setLogs] = React.useState([]);

  React.useEffect(() => {
    const load = async () => {
      try {
        const response = await fetchCallRecordings({ limit: 100 });
        setLogs(response.data?.recordings || []);
      } catch (err) {
        console.error(err);
      }
    };
    load();
  }, []);

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
              Sales Floor Live Feed
            </p>
            <h1 className="mt-2 text-4xl font-semibold">Sales Floor Activity</h1>
            <p className="mt-1 text-white/60">
              Monitor all human seller calls and flag moments that need coaching.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="glass-panel rounded-3xl border border-white/10 p-6 overflow-hidden"
          >
            <div className="grid grid-cols-[1fr_1fr_0.9fr_0.9fr_1fr] gap-4 text-[0.65rem] uppercase tracking-[0.3em] text-white/40 border-b border-white/10 pb-3">
              <div>Timestamp</div>
              <div>Seller</div>
              <div>Result</div>
              <div>Duration</div>
              <div>Listen</div>
            </div>
            <div className="mt-3 space-y-3 max-h-[620px] overflow-y-auto pr-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="grid grid-cols-[1fr_1fr_0.9fr_0.9fr_0.8fr] gap-4 items-center rounded-2xl border border-white/5 bg-black/40 px-4 py-3 transition"
                >
                  <div className="text-xs text-neon-cyan font-mono">
                    {new Date(log.created_at).toLocaleString()}
                  </div>
                  <div className="text-sm font-semibold">{log.seller_name}</div>
                  <div className="text-xs uppercase tracking-[0.3em] text-neon-green">
                    {log.outcome === "Demo Set" ? "Yes" : "No"}
                  </div>
                  <div className="text-xs text-white/40">
                    {formatDuration(log.duration)}
                  </div>
                  <button
                    className="flex items-center justify-center text-neon-purple hover:text-white transition p-1 rounded hover:bg-white/10"
                    title="Play recording"
                  >
                    <Play size={16} />
                    {log.recording_url ? (
                      <audio className="hidden" src={log.recording_url} />
                    ) : null}
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
