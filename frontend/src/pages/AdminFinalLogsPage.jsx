import React from "react";
import { motion } from "framer-motion";
import { Search, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";

const FINAL_LOGS_KEY = "kryonex_final_logs";

const readFinalLogs = () => {
  try {
    const raw = window.localStorage.getItem(FINAL_LOGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
};

const writeFinalLogs = (logs) => {
  window.localStorage.setItem(FINAL_LOGS_KEY, JSON.stringify(logs));
};

export default function AdminFinalLogsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = React.useState("");
  const [logs, setLogs] = React.useState(() => readFinalLogs());

  const filteredLogs = logs.filter((entry) =>
    String(entry.email || "").toLowerCase().includes(query.toLowerCase())
  );

  const handleRemove = (logId) => {
    const next = logs.filter((entry) => entry.id !== logId);
    setLogs(next);
    writeFinalLogs(next);
  };

  return (
    <div className="min-h-screen bg-void-black text-white relative overflow-hidden">
      <TopMenu />
      <div className="absolute inset-0 bg-grid-lines opacity-40" />
      <div className="absolute -top-28 right-0 h-72 w-72 rounded-full bg-neon-cyan/15 blur-[140px]" />
      <div className="absolute bottom-0 left-0 h-96 w-96 rounded-full bg-neon-purple/10 blur-[160px]" />

      <div className="relative z-10 px-6 py-10 dashboard-layout w-full">
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

        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel rounded-3xl p-6 border border-white/10"
          >
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-white/50">
                  Final Logs
                </p>
                <h1 className="mt-2 text-3xl font-semibold">Lead Activity Archive</h1>
                <p className="mt-2 text-white/60">
                  Search by email to find every logged lead action.
                </p>
              </div>
              <div className="glass-panel flex items-center gap-2 rounded-2xl border border-white/10 px-3 py-2">
                <Search size={16} className="text-white/40" />
                <input
                  className="bg-transparent text-sm text-white/70 outline-none placeholder:text-white/30"
                  placeholder="Search by email..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel rounded-3xl border border-white/10 bg-black/40 overflow-hidden"
          >
            <div className="final-logs-header">
              <div>Business</div>
              <div>Email</div>
              <div>Action</div>
              <div>Status</div>
              <div>Outcome</div>
              <div className="text-right">Remove</div>
            </div>
            <div className="final-logs-body">
              {filteredLogs.length ? (
                filteredLogs.map((entry) => (
                  <div key={entry.id} className="final-logs-row">
                    <div className="text-sm font-semibold">
                      {entry.business_name}
                    </div>
                    <div className="text-xs text-white/60">{entry.email}</div>
                    <div className="text-xs text-neon-cyan">{entry.action}</div>
                    <div className="text-xs uppercase tracking-widest text-white/60">
                      {entry.status}
                    </div>
                    <div className="text-xs text-white/50">{entry.outcome || "—"}</div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        className="action-button"
                        onClick={() => handleRemove(entry.id)}
                      >
                        <Trash2 size={12} /> Remove
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 text-white/60">
                  No logs yet. Use "Sim Log" or "Send AI Sim" to archive.
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
