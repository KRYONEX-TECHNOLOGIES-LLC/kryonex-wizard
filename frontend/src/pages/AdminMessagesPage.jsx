import React from "react";
import { motion } from "framer-motion";
import {
  MessageSquare,
  RefreshCw,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  Phone,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";

// Real data fetch from admin endpoint
const fetchAdminMessages = async (token) => {
  const baseUrl = import.meta.env.VITE_API_URL || "";
  const response = await fetch(`${baseUrl}/admin/messages`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error("Failed to fetch messages");
  }
  return response.json();
};

const formatTime = (dateString) => {
  if (!dateString) return "--";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export default function AdminMessagesPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [search, setSearch] = React.useState("");

  const loadMessages = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Get token from supabase session
      const { supabase } = await import("../lib/supabase");
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      
      if (!token) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }
      
      const data = await fetchAdminMessages(token);
      setMessages(data.messages || []);
    } catch (err) {
      console.error("Error loading messages:", err);
      setError(err.message || "Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Auto-refresh every 30 seconds
  React.useEffect(() => {
    const interval = setInterval(loadMessages, 30000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  const filteredMessages = messages.filter((msg) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      (msg.body || "").toLowerCase().includes(searchLower) ||
      (msg.from_number || "").includes(search) ||
      (msg.to_number || "").includes(search) ||
      (msg.business_name || "").toLowerCase().includes(searchLower)
    );
  });

  const inboundCount = messages.filter(m => m.direction === "inbound").length;
  const outboundCount = messages.filter(m => m.direction === "outbound").length;

  return (
    <div className="min-h-screen bg-void-black text-white relative overflow-hidden">
      <TopMenu />
      <div className="absolute inset-0 bg-grid-lines opacity-35" />

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
            <div className="flex items-center justify-between flex-wrap gap-6">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-white/50">
                  Platform SMS Intel
                </p>
                <h1 className="mt-2 text-3xl font-semibold">Admin Messages</h1>
                <p className="mt-2 text-white/60">
                  View all SMS messages across all tenants.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <ArrowDownLeft size={14} className="text-green-400" />
                    <span className="text-white/60">{inboundCount} inbound</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ArrowUpRight size={14} className="text-cyan-400" />
                    <span className="text-white/60">{outboundCount} outbound</span>
                  </div>
                </div>
                <button 
                  className="button-primary flex items-center gap-2" 
                  onClick={loadMessages}
                  disabled={loading}
                >
                  <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                  Refresh
                </button>
              </div>
            </div>
          </motion.div>

          {error && (
            <div className="glass-panel rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400">
              {error}
            </div>
          )}

          <div className="glass-panel rounded-3xl border border-white/10 p-6">
            <div className="flex items-center gap-3 mb-6">
              <Search size={18} className="text-white/40" />
              <input
                className="glass-input flex-1"
                placeholder="Search messages, phone numbers, businesses..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {loading ? (
                <div className="text-center py-12 text-white/60">
                  Loading messages...
                </div>
              ) : filteredMessages.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare size={48} className="mx-auto mb-4 text-white/20" />
                  <p className="text-white/60">
                    {search ? "No messages match your search" : "No messages yet"}
                  </p>
                </div>
              ) : (
                filteredMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="glass-panel rounded-xl border border-white/5 p-4 hover:border-white/20 transition"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          {msg.direction === "inbound" ? (
                            <ArrowDownLeft size={16} className="text-green-400" />
                          ) : (
                            <ArrowUpRight size={16} className="text-cyan-400" />
                          )}
                          <span className="text-xs uppercase tracking-wider text-white/40">
                            {msg.direction}
                          </span>
                          {msg.keyword_detected && (
                            <span className="px-2 py-0.5 text-[10px] uppercase bg-purple-500/20 text-purple-400 rounded-full">
                              {msg.keyword_detected}
                            </span>
                          )}
                          {msg.auto_handled && (
                            <span className="px-2 py-0.5 text-[10px] uppercase bg-blue-500/20 text-blue-400 rounded-full">
                              Auto-handled
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-white/90 mb-2">{msg.body || "—"}</p>
                        <div className="flex items-center gap-4 text-xs text-white/40">
                          <span className="flex items-center gap-1">
                            <Phone size={12} />
                            {msg.direction === "inbound" ? msg.from_number : msg.to_number}
                          </span>
                          {msg.business_name && (
                            <span className="text-white/60">{msg.business_name}</span>
                          )}
                          {msg.routing_method && (
                            <span className="text-white/30">via {msg.routing_method}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right text-xs text-white/40 shrink-0">
                        {formatTime(msg.created_at)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 text-center text-xs text-white/30">
              {filteredMessages.length} messages • Auto-refresh every 30s
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
