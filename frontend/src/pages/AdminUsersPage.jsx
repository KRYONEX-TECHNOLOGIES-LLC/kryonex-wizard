import React from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { getAdminUsers, getAdminUserProfile } from "../lib/api.js";

const statusDot = {
  "pending setup": "bg-amber-400",
  live: "bg-neon-green",
  "payment failed": "bg-neon-pink",
  "low minutes": "bg-orange-400",
  unknown: "bg-white/30",
};

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const [fleetUsers, setFleetUsers] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [selectedUser, setSelectedUser] = React.useState(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [copyNotice, setCopyNotice] = React.useState("");

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
    setDrawerOpen(true);
    setDetailLoading(true);
    setSelectedUser(null);
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

  const closeDrawer = () => {
    setSelectedUser(null);
    setDrawerOpen(false);
    setCopyNotice("");
  };

  const handleCopy = async (value, label) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopyNotice(`${label} copied`);
      setTimeout(() => setCopyNotice(""), 1800);
    } catch (err) {
      setCopyNotice("Copy failed");
      setTimeout(() => setCopyNotice(""), 1800);
    }
  };

  const getPlanBadge = (user) => {
    const status = String(user.subscription_status || "").toLowerCase();
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
    const status = String(user.fleet_status || "").toLowerCase();
    if (!status) return "UNKNOWN";
    return status.replace("_", " ").toUpperCase();
  };

  const getUsagePercent = (user) => {
    const total = Number(user.usage_limit_minutes || 0);
    const remaining = Number(user.usage_minutes_remaining || 0);
    const used = Math.max(0, total - remaining);
    const limit = total;
    if (!limit) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
  };

  const formatDate = (value) => {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleDateString();
  };

  const getDaysActive = (value) => {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    const diffMs = Date.now() - date.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  };

  const getDaysRemaining = (value) => {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    const diffMs = date.getTime() - Date.now();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  };

  const filteredUsers = fleetUsers.filter((user) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      String(user.business_name || "").toLowerCase().includes(term) ||
      String(user.email || "").toLowerCase().includes(term) ||
      String(user.area_code || "").toLowerCase().includes(term)
    );
  });
  const sortedUsers = [...filteredUsers].sort((a, b) => {
    const aDate = new Date(a.created_at || 0).getTime();
    const bDate = new Date(b.created_at || 0).getTime();
    return bDate - aDate;
  });

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
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <input
                className="glass-input w-full max-w-sm text-sm"
                placeholder="Search by business, email, or area code"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
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
            <div
              className="mt-3 space-y-2 max-h-[calc(100vh-360px)] overflow-y-auto pr-2"
              style={{ scrollBehavior: "smooth" }}
            >
              {sortedUsers.map((user) => (
                <div
                  key={user.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openUserDetail(user.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") openUserDetail(user.id);
                  }}
                  className="grid grid-cols-[1fr_1fr_1fr_0.7fr_0.8fr_0.8fr] gap-4 items-center rounded-2xl border border-white/5 bg-black/40 px-4 py-3 hover:border-neon-cyan/40 transition cursor-pointer"
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
                        statusDot[
                          String(user.fleet_status || "unknown").toLowerCase()
                        ] || "bg-white/20"
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
                      className="glow-button text-xs px-3 py-2"
                      onClick={(event) => {
                        event.stopPropagation();
                        openUserDetail(user.id);
                      }}
                      type="button"
                    >
                      View
                    </button>
                  </div>
                </div>
              ))}
              {!sortedUsers.length && !loading ? (
                <div className="text-sm text-white/50 px-4 py-6">
                  No users captured yet.
                </div>
              ) : null}
            </div>
          </motion.div>
          {drawerOpen ? (
            <div
              role="presentation"
              className="fleet-drawer-backdrop"
              onClick={closeDrawer}
            />
          ) : null}
          <div className={`fleet-drawer ${drawerOpen ? "open" : ""}`}>
            <div className="fleet-drawer-header">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-white/40">
                  Fleet Registry
                </div>
                <div className="text-xl font-semibold">
                  {selectedUser?.user?.business_name || "Select a client"}
                </div>
                <div className="text-xs text-white/50">
                  {selectedUser?.user?.email || ""}
                </div>
              </div>
              <button className="button-primary" onClick={closeDrawer}>
                Close
              </button>
            </div>

            {copyNotice ? (
              <div className="text-xs text-neon-green">{copyNotice}</div>
            ) : null}

            {detailLoading ? (
              <div className="text-white/60">Loading profile...</div>
            ) : selectedUser?.error ? (
              <div className="text-neon-pink">{selectedUser.error}</div>
            ) : selectedUser ? (
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="text-xs uppercase tracking-[0.4em] text-white/40">
                    Quick Summary
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/40 p-4 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-white/40 text-xs">Business Name</div>
                      <div className="text-white font-semibold">
                        {selectedUser.user?.business_name || "--"}
                      </div>
                    </div>
                    <div>
                      <div className="text-white/40 text-xs">Email</div>
                      <div className="text-white text-xs break-all">
                        {selectedUser.user?.email || "--"}
                      </div>
                    </div>
                    <div>
                      <div className="text-white/40 text-xs">Tier</div>
                      <div className="text-white">
                        {selectedUser.user?.plan_type || "--"}
                      </div>
                    </div>
                    <div>
                      <div className="text-white/40 text-xs">Status</div>
                      <div className="text-white">
                        {selectedUser.user?.fleet_status || "--"}
                      </div>
                    </div>
                    <div>
                      <div className="text-white/40 text-xs">Minutes Remaining</div>
                      <div className="text-white">
                        {selectedUser.user?.usage_minutes_remaining ?? "--"}
                      </div>
                    </div>
                    <div>
                      <div className="text-white/40 text-xs">Texts Remaining</div>
                      <div className="text-white">
                        {selectedUser.user?.sms_remaining ?? "--"}
                      </div>
                    </div>
                    <div>
                      <div className="text-white/40 text-xs">Billing Cycle End</div>
                      <div className="text-white">
                        {formatDate(selectedUser.billing?.next_billing_date)}
                      </div>
                    </div>
                    <div>
                      <div className="text-white/40 text-xs">Days Remaining</div>
                      <div className="text-white">
                        {getDaysRemaining(selectedUser.billing?.next_billing_date)}
                      </div>
                    </div>
                    <div>
                      <div className="text-white/40 text-xs">Agent Phone</div>
                      <div className="text-white font-mono text-xs">
                        {selectedUser.config?.phone_number || "--"}
                      </div>
                    </div>
                    <div>
                      <div className="text-white/40 text-xs">Cal.com URL</div>
                      <div className="text-white text-xs break-all">
                        {selectedUser.user?.cal_com_url || "--"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-xs uppercase tracking-[0.4em] text-white/40">
                    Quick Copy
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-3">
                    {[
                      {
                        label: "Business Name",
                        value: selectedUser.user?.business_name,
                      },
                      {
                        label: "Agent Phone Number",
                        value: selectedUser.config?.phone_number,
                      },
                      {
                        label: "Cal.com URL",
                        value: selectedUser.user?.cal_com_url,
                      },
                      {
                        label: "Transfer Number",
                        value: selectedUser.config?.transfer_number,
                      },
                      {
                        label: "Retell Agent ID",
                        value: selectedUser.config?.agent_id,
                      },
                      {
                        label: "User ID",
                        value: selectedUser.user?.id,
                      },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs text-white/40">{item.label}</div>
                          <div className="text-white text-sm break-all">
                            {item.value || "--"}
                          </div>
                        </div>
                        <button
                          className="button-primary"
                          type="button"
                          disabled={!item.value}
                          onClick={() => handleCopy(item.value, item.label)}
                        >
                          Copy
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-white/40">Select a client to view data.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
