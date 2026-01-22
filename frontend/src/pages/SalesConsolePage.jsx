import React from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import { getLeads, updateLeadStatus } from "../lib/api";
import { supabase } from "../lib/supabase";

const dispositionOptions = [
  { id: "contacted", label: "Contacted" },
  { id: "demo_set", label: "Demo Set" },
  { id: "closed_won", label: "Closed Won" },
  { id: "dead", label: "Dead" },
];

const keypadKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

const formatTime = (value) => {
  if (!value) return "--";
  const date = new Date(value);
  return date.toLocaleString();
};

export default function SalesConsolePage() {
  const navigate = useNavigate();
  const [leads, setLeads] = React.useState([]);
  const [selectedLeadId, setSelectedLeadId] = React.useState("");
  const [dialNumber, setDialNumber] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [updatingStatus, setUpdatingStatus] = React.useState("");
  const [callState, setCallState] = React.useState("idle");

  const fetchLeads = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getLeads();
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
      .channel("sales-console-leads")
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

  const handleDisposition = async (status) => {
    if (!selectedLead?.id) return;
    setUpdatingStatus(status);
    setError("");
    try {
      await updateLeadStatus(selectedLead.id, status);
      setLeads((prev) =>
        prev.map((lead) =>
          lead.id === selectedLead.id ? { ...lead, status } : lead
        )
      );
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setUpdatingStatus("");
    }
  };

  const handleCreateClient = () => {
    const query = selectedLead?.id ? `?leadId=${selectedLead.id}` : "";
    navigate(`/admin/wizard/create${query}`);
  };

  return (
    <div className="min-h-screen bg-void-black text-white relative overflow-hidden font-sans">
      <TopMenu />
      <div className="absolute inset-0 bg-grid-lines opacity-40" />
      <div className="absolute -top-28 -right-28 h-72 w-72 rounded-full bg-neon-purple/20 blur-[120px]" />
      <div className="absolute bottom-0 left-0 h-96 w-96 rounded-full bg-neon-cyan/10 blur-[140px]" />

      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="glass-panel rounded-3xl p-8 border border-white/10"
        >
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-neon-cyan/70">
                Sales Console
              </p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight">
                Seller Dialer
              </h1>
              <p className="mt-2 text-white/60">
                Focused call operations for assigned leads.
              </p>
            </div>
            <button className="button-primary" onClick={handleCreateClient}>
              Create Client Deployment
            </button>
          </div>
        </motion.div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <motion.div
            className="glass-panel rounded-3xl p-6 border border-white/10"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs uppercase tracking-widest text-white/40">
                  Lead List
                </div>
                <div className="text-sm text-white/60">
                  {loading ? "Loading leads..." : `${leads.length} assigned`}
                </div>
              </div>
              <button className="button-primary" onClick={() => window.location.reload()}>
                Refresh
              </button>
            </div>
            {error ? <div className="text-neon-pink">{error}</div> : null}
            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-2">
              {loading ? (
                <div className="text-white/60">Fetching leads...</div>
              ) : leads.length ? (
                leads.map((lead) => (
                  <button
                    key={lead.id}
                    type="button"
                    className="w-full text-left rounded-2xl border border-white/5 bg-black/40 p-4 hover:border-neon-cyan/40 transition"
                    onClick={() => handleSelectLead(lead)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">
                          {lead.business_name || lead.name || "Unnamed Lead"}
                        </div>
                        <div className="text-xs text-white/50 mt-1">
                          {lead.phone || "No phone"} •{" "}
                          {lead.status || "new"}
                        </div>
                      </div>
                      <div className="text-xs text-white/40 font-mono">
                        {formatTime(lead.created_at)}
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-white/60">No leads assigned.</div>
              )}
            </div>
          </motion.div>

          <motion.div
            className="glass-panel rounded-3xl p-6 border border-white/10"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="text-xs uppercase tracking-widest text-white/40">
              Call Controls
            </div>
            <div className="mt-4 glass-panel rounded-2xl p-4 border border-white/10">
              <div className="text-xs text-white/50">Active Lead</div>
              <div className="mt-1 text-lg font-semibold">
                {selectedLead?.business_name ||
                  selectedLead?.name ||
                  "Select a lead"}
              </div>
              <div className="text-xs text-white/50">
                {selectedLead?.phone || "No phone"}
              </div>
            </div>

            <div className="mt-4">
              <input
                className="input-field"
                value={dialNumber}
                onChange={(event) => setDialNumber(event.target.value)}
                placeholder="Dial number"
              />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              {keypadKeys.map((key) => (
                <button
                  key={key}
                  className="button-primary"
                  type="button"
                  onClick={() => handleDialKey(key)}
                >
                  {key}
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button className="button-primary" onClick={handleCall}>
                {callState === "calling" ? "CALLING..." : "START CALL"}
              </button>
              <button className="button-primary" onClick={handleEndCall}>
                END CALL
              </button>
              <button
                className="button-primary"
                onClick={() => setDialNumber("")}
              >
                CLEAR
              </button>
            </div>

            <div className="mt-6">
              <div className="text-xs uppercase tracking-widest text-white/40">
                Dispositions
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {dispositionOptions.map((option) => (
                  <button
                    key={option.id}
                    className="button-primary"
                    onClick={() => handleDisposition(option.id)}
                    disabled={updatingStatus === option.id}
                  >
                    {updatingStatus === option.id ? "UPDATING..." : option.label}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
