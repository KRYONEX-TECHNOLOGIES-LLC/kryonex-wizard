import React from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { getAdminLeads } from "../lib/api";
import { supabase } from "../lib/supabase";

const keypadKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

export default function AdminCallCenterPage() {
  const navigate = useNavigate();
  const [leads, setLeads] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [selectedLeadId, setSelectedLeadId] = React.useState("");
  const [dialNumber, setDialNumber] = React.useState("");
  const [callState, setCallState] = React.useState("idle");

  const fetchLeads = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getAdminLeads();
      const nextLeads = response.data?.leads || [];
      setLeads(nextLeads);
      if (nextLeads.length && !selectedLeadId) {
        const first = nextLeads[0];
        setSelectedLeadId(first.id);
        setDialNumber(first.phone || "");
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedLeadId]);

  React.useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  React.useEffect(() => {
    const channel = supabase
      .channel("admin-call-center-leads")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        () => fetchLeads()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchLeads]);

  const selectedLead = React.useMemo(
    () => leads.find((lead) => String(lead.id) === String(selectedLeadId)),
    [leads, selectedLeadId]
  );

  const handleSelectLead = (lead) => {
    setSelectedLeadId(lead.id);
    setDialNumber(lead.phone || "");
  };

  const handleDialKey = (key) => {
    setDialNumber((prev) => `${prev}${key}`);
  };

  const handleCall = () => {
    if (!dialNumber) return;
    setCallState("calling");
    window.location.href = `tel:${dialNumber}`;
  };

  const handleEndCall = () => {
    setCallState("idle");
  };

  const handleCreateClient = () => {
    const query = selectedLead?.id ? `?leadId=${selectedLead.id}` : "";
    navigate(`/admin/wizard/create${query}`);
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
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-neon-cyan/70">
                Live Dialer
              </p>
              <h1 className="text-4xl font-semibold">Admin Call Center</h1>
            </div>
            <button className="button-primary" onClick={handleCreateClient}>
              Create Client Deployment
            </button>
          </div>
          <div className="grid gap-6" style={{ gridTemplateColumns: "3fr 1fr" }}>
            <motion.div
              className="glass-panel rounded-3xl border border-white/10 p-6 min-h-[600px]"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs uppercase tracking-widest text-white/40">
                  Lead Grid
                </div>
                <button className="button-primary" onClick={fetchLeads}>
                  Refresh
                </button>
              </div>
              {error ? <div className="text-neon-pink">{error}</div> : null}
              <div className="text-xs uppercase tracking-widest text-white/40 grid grid-cols-[1fr_1fr_0.7fr_0.9fr_0.7fr] gap-4 pb-3 border-b border-white/10">
                <div>Business Name</div>
                <div>Contact</div>
                <div>Status</div>
                <div>Last Outcome</div>
                <div>Tags</div>
              </div>
              <div className="mt-4 max-h-[620px] overflow-y-auto pr-2 space-y-2">
                {loading ? (
                  <div className="text-white/60">Fetching leads...</div>
                ) : leads.length ? (
                  leads.map((lead) => (
                    <div
                      key={lead.id}
                      className={`grid grid-cols-[1fr_1fr_0.7fr_0.9fr_0.7fr] gap-4 items-center rounded-2xl border border-white/5 bg-black/40 px-4 py-3 transition hover:bg-cyan-900/20 cursor-pointer ${
                        selectedLeadId === lead.id ? "border-neon-cyan/70 bg-neon-cyan/5" : ""
                      }`}
                      onClick={() => handleSelectLead(lead)}
                    >
                      <div className="text-sm font-semibold">
                        {lead.business_name || "Unnamed"}
                      </div>
                      <div className="text-xs text-white/60">
                        {lead.phone || "No phone"}
                      </div>
                      <div className="text-xs uppercase tracking-widest text-white/70">
                        {lead.status || "new"}
                      </div>
                      <div className="text-xs text-white/50">
                        {lead.last_outcome || "—"}
                      </div>
                      <div className="flex gap-1">
                        <span className="px-2 py-0.5 text-[10px] uppercase tracking-widest bg-white/10 rounded-full">
                          VIP
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-white/60">No leads assigned.</div>
                )}
              </div>
            </motion.div>
            <motion.div
              className="glass-panel rounded-3xl border border-white/10 p-6 min-h-[600px] flex flex-col"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="text-xs uppercase tracking-widest text-white/40 mb-3">
                Dialer
              </div>
              <div className="glass-panel rounded-2xl border border-white/10 p-4 mb-4">
                <div className="text-xs text-white/50">Active Lead</div>
                <div className="text-lg font-semibold">
                  {selectedLead?.business_name || selectedLead?.name || "Select a lead"}
                </div>
                <div className="text-xs text-white/40">
                  {selectedLead?.phone || "No phone"}
                </div>
              </div>
              <button className="glow-button w-full mb-3" onClick={handleCall}>
                {callState === "calling"
                  ? "CALLING..."
                  : `CALL ${selectedLead?.business_name || "LEAD"}`}
              </button>
              <div className="flex gap-2 mb-3">
                <button className="button-primary flex-1" onClick={handleEndCall}>
                  End Call
                </button>
                <button
                  className="glow-button flex-1"
                  onClick={handleCreateClient}
                  type="button"
                >
                  Create Client Deployment
                </button>
              </div>
              <div className="mt-2 rounded-2xl border border-white/10 bg-black/40 p-4">
                <input
                  className="input-field w-full mb-3"
                  value={dialNumber}
                  onChange={(event) => setDialNumber(event.target.value)}
                  placeholder="Dial number"
                />
                <div className="grid grid-cols-3 gap-2">
                  {keypadKeys.map((key) => (
                    <button
                      key={key}
                      className="button-primary py-2 text-base"
                      onClick={() => handleDialKey(key)}
                    >
                      {key}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
