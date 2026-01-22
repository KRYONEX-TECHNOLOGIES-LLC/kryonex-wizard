import React from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Signal, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import {
  approveCommissionPayout,
  fetchSellerDossier,
  fetchSellerRoster,
} from "../lib/api.js";

const formatCurrency = (value) =>
  Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        hour12: true,
      })
    : "--";

export default function AdminSellersPage() {
  const navigate = useNavigate();
  const [sellers, setSellers] = React.useState([]);
  const [selectedSellerId, setSelectedSellerId] = React.useState(null);
  const [dossier, setDossier] = React.useState(null);
  const [loadingRoster, setLoadingRoster] = React.useState(false);
  const [loadingDossier, setLoadingDossier] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");
  const [approvingCommissionId, setApprovingCommissionId] = React.useState(null);

  const loadRoster = React.useCallback(async () => {
    setLoadingRoster(true);
    setError("");
    try {
      const res = await fetchSellerRoster();
      const team = res.data?.sellers || [];
      setSellers(team);
      if (team.length) {
        setSelectedSellerId((prev) => prev || team[0].user_id);
      }
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Failed to load personnel.");
    } finally {
      setLoadingRoster(false);
    }
  }, []);

  const loadDossier = React.useCallback(async (sellerId) => {
    if (!sellerId) return;
    setLoadingDossier(true);
    setMessage("");
    try {
      const res = await fetchSellerDossier(sellerId);
      setDossier(res.data);
    } catch (err) {
      setMessage("Unable to load dossier.");
    } finally {
      setLoadingDossier(false);
    }
  }, []);

  React.useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  React.useEffect(() => {
    if (selectedSellerId) {
      loadDossier(selectedSellerId);
    }
  }, [selectedSellerId, loadDossier]);

  const handleApprove = async (commission) => {
    if (!commission?.id) return;
    const promptValue = window.prompt(
      "Enter payout amount (leave blank to keep current):",
      commission.commission_amount || commission.deal_amount
    );
    if (promptValue === null) return;
    let overrideAmount = null;
    if (promptValue.trim().length) {
      overrideAmount = Number(promptValue.replace(/[^0-9.]/g, ""));
      if (Number.isNaN(overrideAmount)) {
        setMessage("Invalid override value.");
        return;
      }
    }
    setApprovingCommissionId(commission.id);
    try {
      await approveCommissionPayout(commission.id, {
        overrideAmount,
      });
      setMessage("Payout approved.");
      await loadDossier(selectedSellerId);
    } catch (err) {
      setMessage(err?.response?.data?.error || err?.message || "Approve failed.");
    } finally {
      setApprovingCommissionId(null);
    }
  };

  const activeSeller = sellers.find((seller) => seller.user_id === selectedSellerId);

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
        <div className="flex-1 px-6 py-8 space-y-6 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="glass-panel rounded-3xl border border-white/10 p-6 flex items-center justify-between gap-4"
          >
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-neon-cyan/70">
                Personnel Command
              </p>
              <h1 className="mt-2 text-4xl font-semibold">The Boiler Room</h1>
              <p className="text-sm text-white/60 mt-1">
                Live telemetry for every seller. Approve payouts and audit activity in one frame.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <ShieldCheck className="text-neon-green" size={28} />
              <div className="text-right">
                <p className="text-xs uppercase tracking-[0.3em] text-white/60">Security</p>
                <p className="text-lg text-neon-green font-semibold">Locked</p>
              </div>
            </div>
          </motion.div>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <motion.div
              className="glass-panel rounded-3xl border border-white/10 p-6 space-y-4 shadow-glow"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05 }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.4em] text-white/40">Roster</p>
                  <h2 className="text-3xl font-semibold">Sales Operators</h2>
                </div>
                <Users className="text-neon-cyan" size={28} />
              </div>
              {error && (
                <div className="text-neon-pink text-sm">{error}</div>
              )}
              <div className="grid grid-cols-[2fr_0.8fr_0.9fr_0.9fr_0.9fr_0.9fr] gap-4 text-[0.65rem] uppercase tracking-[0.4em] text-white/40 border-b border-white/10 pb-3">
                <div>Name</div>
                <div>Status</div>
                <div>Calls Today</div>
                <div>Deals MTD</div>
                <div>Commission</div>
                <div>Conversion</div>
              </div>
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-2">
                {loadingRoster ? (
                  <div className="text-white/60">Loading sellers...</div>
                ) : sellers.length ? (
                  sellers.map((seller) => {
                    const isSelected = seller.user_id === selectedSellerId;
                    const statusOnline = seller.status === "active";
                    return (
                      <button
                        key={seller.user_id}
                        type="button"
                        className={`grid grid-cols-[2fr_0.8fr_0.9fr_0.9fr_0.9fr_0.9fr] gap-4 items-start rounded-2xl border px-4 py-3 text-left transition ${
                          isSelected
                            ? "border-neon-cyan/60 bg-neon-cyan/5"
                            : "border-white/5 bg-black/30 hover:border-neon-cyan/40 hover:bg-cyan-900/10"
                        }`}
                        onClick={() => setSelectedSellerId(seller.user_id)}
                      >
                        <div>
                          <div className="text-sm font-semibold text-white">
                            {seller.full_name || seller.business_name || seller.user_id}
                          </div>
                          <div className="text-[0.7rem] text-white/40 mt-1">
                            {seller.business_name || seller.user_id}
                          </div>
                        </div>
                        <div>
                          <span
                            className={`px-2 py-0.5 text-[0.65rem] uppercase rounded-full border ${
                              statusOnline
                                ? "border-neon-green/70 bg-neon-green/10 text-neon-green"
                                : "border-white/20 bg-white/5 text-white/60"
                            }`}
                          >
                            {statusOnline ? "Online" : "Offline"}
                          </span>
                        </div>
                        <div className="text-base font-semibold">
                          {seller.callsToday || 0}
                        </div>
                        <div className="text-base font-semibold">
                          {seller.dealsClosed || 0}
                        </div>
                        <div className="text-base font-semibold text-neon-cyan">
                          {formatCurrency(seller.commissionOwed || 0)}
                        </div>
                        <div className="text-base font-semibold text-white">
                          {Number(seller.conversionRate || 0).toFixed(1)}%
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="text-white/60">No sellers yet.</div>
                )}
              </div>
            </motion.div>

            <motion.div
              className="glass-panel rounded-3xl border border-white/10 p-6 space-y-5 flex flex-col"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.4em] text-white/40">
                    Agent Dossier
                  </p>
                  <h2 className="text-2xl font-semibold">
                    {activeSeller
                      ? activeSeller.full_name || activeSeller.business_name
                      : "Select an operator"}
                  </h2>
                </div>
                <Signal className="text-neon-cyan/80" size={26} />
              </div>
              {message ? (
                <div className="text-sm text-neon-green/80">{message}</div>
              ) : null}
              <div className="space-y-4 flex-1 overflow-hidden">
                <div className="space-y-3">
                  <div className="text-xs uppercase tracking-[0.4em] text-white/50">
                    Activity Feed
                  </div>
                  <div className="max-h-[170px] overflow-y-auto space-y-3 border border-white/5 rounded-2xl p-3 bg-black/40">
                    {loadingDossier ? (
                      <div className="text-white/60 text-sm">Fetching activity...</div>
                    ) : dossier?.activity?.length ? (
                      dossier.activity.map((entry) => (
                        <div
                          key={entry.id}
                          className="border-b border-white/5 pb-2 text-sm last:border-0"
                        >
                          <div className="text-white/80 font-semibold">
                            {entry.action_type || entry.action}
                          </div>
                          <div className="text-white/50 text-[0.7rem]">
                            {formatDate(entry.created_at)}
                          </div>
                          {entry.metadata ? (
                            <div className="text-[0.7rem] text-white/40 mt-1">
                              {JSON.stringify(entry.metadata)}
                            </div>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <div className="text-white/50 text-sm">No recorded activity.</div>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.4em] text-white/50">
                        Commission Ledger
                      </p>
                      <p className="text-sm text-white/60 mt-1">
                        Deal value & payout status.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-[1.1fr_1fr_0.8fr_0.6fr] gap-3 text-[0.65rem] uppercase tracking-[0.4em] text-white/40">
                    <div>Deal Value</div>
                    <div>Payout</div>
                    <div>Status</div>
                    <div />
                  </div>
                  <div className="space-y-2 max-h-[180px] overflow-y-auto">
                    {dossier?.commissions?.length ? (
                      dossier.commissions.map((commission) => (
                        <div
                          key={commission.id}
                          className="grid grid-cols-[1.1fr_1fr_0.8fr_0.6fr] gap-3 items-center rounded-2xl border border-white/5 bg-black/40 px-3 py-2"
                        >
                          <div className="text-sm font-semibold">
                            {formatCurrency(commission.deal_amount)}
                          </div>
                          <div className="text-sm text-neon-cyan font-semibold">
                            {formatCurrency(commission.commission_amount)}
                          </div>
                          <div>
                            <span
                              className={`px-2 py-0.5 text-[0.65rem] uppercase rounded-full border ${
                                commission.status === "paid"
                                  ? "border-neon-green/70 bg-neon-green/10 text-neon-green"
                                  : "border-neon-cyan/60 bg-neon-cyan/10 text-neon-cyan"
                              }`}
                            >
                              {commission.status}
                            </span>
                          </div>
                          <div>
                            {commission.status !== "paid" ? (
                              <button
                                type="button"
                                className="glow-button text-[0.6rem] px-3 py-1"
                                onClick={() => handleApprove(commission)}
                                disabled={approvingCommissionId === commission.id}
                              >
                                {approvingCommissionId === commission.id
                                  ? "Processing..."
                                  : "Approve Payout"}
                              </button>
                            ) : (
                              <span className="text-[0.65rem] text-white/50">Settled</span>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-white/50">Awaiting commissions.</div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-[0.4em] text-white/50">
                    Security Audit
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {dossier?.ipLog?.length ? (
                      dossier.ipLog.map((entry) => (
                        <span
                          key={entry.ip}
                          className="px-3 py-1 rounded-full border border-white/10 text-[0.75rem] text-white/70"
                        >
                          {entry.ip}
                        </span>
                      ))
                    ) : (
                      <span className="text-[0.75rem] text-white/40">No IPs recorded.</span>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
