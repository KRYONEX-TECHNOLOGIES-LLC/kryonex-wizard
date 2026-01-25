import React from "react";
import { motion } from "framer-motion";
import { Settings, UserCheck, CreditCard } from "lucide-react";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { getAdminUsers, getAdminUserProfile } from "../lib/api.js";

const statusDot = {
  active: "bg-neon-green",
  past_due: "bg-neon-pink",
  canceled: "bg-white/40",
  inactive: "bg-white/30",
};

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const [fleetUsers, setFleetUsers] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [selectedUser, setSelectedUser] = React.useState(null);
  const [detailLoading, setDetailLoading] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    const loadUsers = async () => {
      setError("");
      try {
        const response = await getAdminUsers();
        if (mounted) {
          setFleetUsers(response.data?.users || []);
        }
      } catch (err) {
        if (mounted) {
          setError(err.response?.data?.error || err.message);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadUsers();
    const interval = setInterval(loadUsers, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const openUserDetail = async (userId) => {
    setDetailLoading(true);
    try {
      const response = await getAdminUserProfile(userId);
      setSelectedUser(response.data || null);
    } catch (err) {
      setSelectedUser({
        error: err.response?.data?.error || err.message,
      });
    } finally {
      setDetailLoading(false);
    }
  };

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
              Fleet Registry
            </p>
            <h1 className="mt-2 text-4xl font-semibold">System Users</h1>
            <p className="mt-1 text-white/60">
              Live roster of every deployment across the Kryonex fleet.
            </p>
            {loading ? (
              <p className="mt-3 text-xs uppercase tracking-[0.3em] text-white/40">
                Syncing live registry...
              </p>
            ) : null}
            {error ? (
              <p className="mt-3 text-sm text-neon-pink">{error}</p>
            ) : null}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="glass-panel rounded-3xl border border-white/10 p-6 overflow-hidden"
          >
            <div className="grid grid-cols-[1fr_1fr_1fr_0.7fr_0.8fr_0.8fr] gap-4 text-[0.65rem] uppercase tracking-widest text-white/40 border-b border-white/10 pb-3">
              <div>Client</div>
              <div>Email</div>
              <div>Plan</div>
              <div>Status</div>
              <div>Usage</div>
              <div>Actions</div>
            </div>
            <div className="mt-3 space-y-2">
              {fleetUsers.map((user) => (
                <div
                  key={user.id}
                  className="grid grid-cols-[1fr_1fr_1fr_0.7fr_0.8fr_0.8fr] gap-4 items-center rounded-2xl border border-white/5 bg-black/40 px-4 py-3 hover:border-neon-cyan/40 transition"
                >
                  <div>
                    <div className="text-sm font-semibold">
                      {user.business_name}
                    </div>
                    <div className="text-xs text-white/40">{user.id}</div>
                  </div>
                  <div className="text-xs text-slate-400">{user.email}</div>
                  <div>
                    <span className="px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-widest border border-white/20 rounded-full bg-white/5">
                      {String(user.plan_type || "core").toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${statusDot[user.status] || "bg-white/20"}`}
                    />
                    <span className="text-xs uppercase tracking-[0.3em]">
                      {String(user.status || "inactive").replace("_", " ")}
                    </span>
                  </div>
                  <div>
                    <div className="h-2 w-full rounded-full bg-white/10">
                      <div
                        className="h-2 rounded-full bg-neon-cyan"
                        style={{ width: `${user.usage_percent || 0}%` }}
                      />
                    </div>
                    <div className="text-[0.6rem] text-white/40 mt-1">
                      {user.usage_percent || 0}% usage
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button className="p-2 rounded-full border border-white/10 hover:border-neon-cyan/60 transition">
                      <UserCheck size={16} />
                    </button>
                    <button className="p-2 rounded-full border border-white/10 hover:border-neon-cyan/60 transition">
                      <CreditCard size={16} />
                    </button>
                    <button
                      className="p-2 rounded-full border border-white/10 hover:border-neon-cyan/60 transition"
                      onClick={() => openUserDetail(user.id)}
                      type="button"
                    >
                      <Settings size={16} />
                    </button>
                  </div>
                </div>
              ))}
              {!fleetUsers.length && !loading ? (
                <div className="text-sm text-white/50 px-4 py-6">
                  No users captured yet.
                </div>
              ) : null}
            </div>
          </motion.div>
          {selectedUser ? (
            <div
              className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
              onClick={() => setSelectedUser(null)}
            >
              <div
                className="glass-panel rounded-3xl border border-white/10 p-6 w-[min(520px,90vw)]"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="text-xs uppercase tracking-[0.3em] text-white/40">
                  Fleet Profile
                </div>
                {detailLoading ? (
                  <div className="mt-4 text-white/60">Loading profile...</div>
                ) : selectedUser.error ? (
                  <div className="mt-4 text-neon-pink">{selectedUser.error}</div>
                ) : (
                  <div className="mt-4 space-y-3 text-sm">
                    <div>
                      <span className="text-white/40">Client</span>
                      <div className="text-white font-semibold">
                        {selectedUser.user?.business_name}
                      </div>
                    </div>
                    <div>
                      <span className="text-white/40">Email</span>
                      <div className="text-white">
                        {selectedUser.user?.email}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-white/40">Agent ID</span>
                        <div className="text-white font-mono text-xs">
                          {selectedUser.agent?.agent_id || "--"}
                        </div>
                      </div>
                      <div>
                        <span className="text-white/40">Agent Phone</span>
                        <div className="text-white font-mono text-xs">
                          {selectedUser.agent?.phone_number || "--"}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <button
                  className="glow-button mt-6 w-full"
                  type="button"
                  onClick={() => setSelectedUser(null)}
                >
                  Close
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
