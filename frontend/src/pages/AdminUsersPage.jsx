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
  none: "bg-white/20",
};

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const [fleetUsers, setFleetUsers] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [selectedUser, setSelectedUser] = React.useState(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [activeModal, setActiveModal] = React.useState(null);

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

  const openUserDetail = async (userId, mode) => {
    setActiveModal(mode);
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

  const closeModal = () => {
    setSelectedUser(null);
    setActiveModal(null);
  };

  const getPlanBadge = (user) => {
    const status = String(user.status || "").toLowerCase();
    if (!status || status.startsWith("incomplete")) {
      return {
        label: "NO PLAN",
        className: "border-white/20 text-white/60 bg-white/10",
      };
    }
    if (status === "past_due") {
      return {
        label: "PAST DUE",
        className: "border-neon-pink/60 text-neon-pink bg-neon-pink/10",
      };
    }
    const planLabel = String(user.plan_type || "core").toUpperCase();
    const isPro = planLabel.includes("PRO");
    return {
      label: planLabel,
      className: isPro
        ? "border-amber-300/60 text-amber-200 bg-amber-400/10"
        : "border-neon-cyan/60 text-neon-cyan bg-neon-cyan/10",
    };
  };

  const getStatusLabel = (user) => {
    const status = String(user.status || "").toLowerCase();
    if (!status || status.startsWith("incomplete")) return "NO PLAN";
    if (status === "past_due") return "PAST DUE";
    if (status === "active") return "ACTIVE";
    return status.replace("_", " ").toUpperCase();
  };

  const getUsagePercent = (user) => {
    const used = Number(user.usage_minutes || 0);
    const limit = Number(user.usage_limit_minutes || 0);
    if (!limit) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
  };

  const formatDate = (value) => {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleDateString();
  };

  const formatCurrency = (cents, currency = "usd") => {
    if (!cents) return "$0.00";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
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
                    <span
                      className={`px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-widest border rounded-full ${getPlanBadge(user).className}`}
                    >
                      {getPlanBadge(user).label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        statusDot[String(user.status || "none").toLowerCase()] ||
                        "bg-white/20"
                      }`}
                    />
                    <span className="text-xs uppercase tracking-[0.3em]">
                      {getStatusLabel(user)}
                    </span>
                  </div>
                  <div>
                    {(() => {
                      const usagePercent = getUsagePercent(user);
                      const usageColor =
                        usagePercent >= 100
                          ? "bg-neon-pink"
                          : usagePercent >= 90
                            ? "bg-amber-400"
                            : "bg-neon-cyan";
                      return (
                        <>
                          <div className="h-2 w-full rounded-full bg-white/10">
                            <div
                              className={`h-2 rounded-full ${usageColor}`}
                              style={{ width: `${usagePercent}%` }}
                            />
                          </div>
                          <div className="text-[0.6rem] text-white/40 mt-1">
                            {usagePercent}% usage
                          </div>
                        </>
                      );
                    })()}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      className="p-2 rounded-full border border-white/10 hover:border-neon-cyan/60 transition"
                      onClick={() => openUserDetail(user.id, "dossier")}
                      type="button"
                    >
                      <UserCheck size={16} />
                    </button>
                    <button
                      className="p-2 rounded-full border border-white/10 hover:border-neon-cyan/60 transition"
                      onClick={() => openUserDetail(user.id, "billing")}
                      type="button"
                    >
                      <CreditCard size={16} />
                    </button>
                    <button
                      className="p-2 rounded-full border border-white/10 hover:border-neon-cyan/60 transition"
                      onClick={() => openUserDetail(user.id, "config")}
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
          {selectedUser && activeModal ? (
            <div
              className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
              onClick={closeModal}
            >
              <div
                className="glass-panel rounded-3xl border border-white/10 p-6 w-[min(520px,90vw)]"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="text-xs uppercase tracking-[0.3em] text-white/40">
                  {activeModal === "dossier"
                    ? "The Dossier"
                    : activeModal === "billing"
                      ? "The Financials"
                      : "Agent Configuration"}
                </div>
                {detailLoading ? (
                  <div className="mt-4 text-white/60">Loading profile...</div>
                ) : selectedUser.error ? (
                  <div className="mt-4 text-neon-pink">{selectedUser.error}</div>
                ) : (
                  <div className="mt-4 space-y-3 text-sm">
                    {activeModal === "dossier" ? (
                      <>
                        <div>
                          <span className="text-white/40">Full Name</span>
                          <div className="text-white font-semibold">
                            {selectedUser.user?.full_name || "--"}
                          </div>
                        </div>
                        <div>
                          <span className="text-white/40">Email</span>
                          <div className="text-white">
                            {selectedUser.user?.email}
                          </div>
                        </div>
                        <div>
                          <span className="text-white/40">Phone</span>
                          <div className="text-white">
                            {selectedUser.user?.phone || "--"}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-white/40">Signup Date</span>
                            <div className="text-white">
                              {formatDate(selectedUser.user?.signup_date)}
                            </div>
                          </div>
                          <div>
                            <span className="text-white/40">IP Address</span>
                            <div className="text-white font-mono text-xs">
                              {selectedUser.user?.ip_address || "--"}
                            </div>
                          </div>
                        </div>
                      </>
                    ) : null}
                    {activeModal === "billing" ? (
                      <>
                        <div>
                          <span className="text-white/40">
                            Payment Method
                          </span>
                          <div className="text-white">
                            {selectedUser.billing?.payment_method_last4
                              ? `${selectedUser.billing?.payment_method_brand || "card"} •••• ${
                                  selectedUser.billing?.payment_method_last4
                                }`
                              : "--"}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-white/40">
                              Next Billing Date
                            </span>
                            <div className="text-white">
                              {formatDate(selectedUser.billing?.next_billing_date)}
                            </div>
                          </div>
                          <div>
                            <span className="text-white/40">
                              Lifetime Revenue
                            </span>
                            <div className="text-white">
                              {formatCurrency(
                                selectedUser.billing?.lifetime_revenue_cents,
                                selectedUser.billing?.currency
                              )}
                            </div>
                          </div>
                        </div>
                      </>
                    ) : null}
                    {activeModal === "config" ? (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-white/40">
                            Assigned Twilio Number
                          </span>
                          <div className="text-white font-mono text-xs">
                            {selectedUser.config?.phone_number || "--"}
                          </div>
                        </div>
                        <div>
                          <span className="text-white/40">Agent ID</span>
                          <div className="text-white font-mono text-xs">
                            {selectedUser.config?.agent_id || "--"}
                          </div>
                        </div>
                        <div>
                          <span className="text-white/40">Script Version</span>
                          <div className="text-white font-mono text-xs">
                            {selectedUser.config?.script_version || "--"}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
                <button
                  className="glow-button mt-6 w-full"
                  type="button"
                  onClick={closeModal}
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
