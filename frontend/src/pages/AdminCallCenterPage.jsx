import React from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { createCallRecording, triggerDemoCall } from "../lib/api.js";
import { getSavedState, saveState } from "../lib/persistence.js";
import { normalizePhone } from "../lib/phone.js";
import { supabase, supabaseReady } from "../lib/supabase";

const keypadKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
const FINAL_LOGS_KEY = "kryonex_final_logs";
const CALL_CENTER_QUEUE_KEY = "callCenter.queue";
const CALL_CENTER_SELECTED_KEY = "callCenter.selectedLeadId";
const LOCAL_DIALER_QUEUE_KEY = "kryonex_dialer_queue"; // Sync key for other components

// Call outcome constants - sync with AdminLeadsPage
const CALL_OUTCOMES = {
  NOT_CALLED: "not_called",
  CALLED: "called",
  NO_ANSWER: "no_answer",
  FOLLOW_UP: "follow_up",
};

const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );

export default function AdminCallCenterPage() {
  const navigate = useNavigate();
  const [leads, setLeads] = React.useState(
    () => getSavedState(CALL_CENTER_QUEUE_KEY) || []
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [selectedLeadId, setSelectedLeadId] = React.useState(
    () => getSavedState(CALL_CENTER_SELECTED_KEY) || ""
  );
  const [dialNumber, setDialNumber] = React.useState("");
  const [callState, setCallState] = React.useState("idle");
  const [toast, setToast] = React.useState("");
  const queueSaveTimer = React.useRef(null);
  const [callLoading, setCallLoading] = React.useState(false);

  const triggerToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 1600);
  };

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

  const syncLocalDialerQueue = (nextQueue) => {
    window.localStorage.setItem(LOCAL_DIALER_QUEUE_KEY, JSON.stringify(nextQueue || []));
  };

  const appendFinalLog = (lead, actionLabel) => {
    const logs = readFinalLogs();
    const phoneValue = lead?.phone || lead?.customer_phone || "";
    const actionText =
      actionLabel === "sim"
        ? `SMS Sent to ${phoneValue || "Unknown"} via Retell AI`
        : actionLabel;
    const entry = {
      id: `log-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      lead_id: lead?.id || null,
      business_name: lead?.business_name || "Unnamed",
      email: lead?.email || "unknown@lead.io",
      phone: phoneValue,
      status: lead?.status || "new",
      outcome: lead?.last_outcome || "",
      action: actionText,
      created_at: new Date().toISOString(),
    };
    writeFinalLogs([entry, ...logs]);
  };

  const persistQueue = (value) => {
    setLeads(value);
    saveState(CALL_CENTER_QUEUE_KEY, value);
    syncLocalDialerQueue(value);
  };

  const mutateQueue = (updater) => {
    setLeads((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (queueSaveTimer.current) {
        clearTimeout(queueSaveTimer.current);
      }
      queueSaveTimer.current = setTimeout(() => {
        saveState(CALL_CENTER_QUEUE_KEY, next);
        syncLocalDialerQueue(next);
      }, 120);
      return next;
    });
  };

  const persistSelectedLeadId = (value) => {
    setSelectedLeadId(value);
    saveState(CALL_CENTER_SELECTED_KEY, value);
  };

  const removeLeadFromQueue = (leadId) => {
    mutateQueue((prev) => {
      const next = prev.filter((lead) => lead.id !== leadId);
      if (selectedLeadId === leadId) {
        const fallback = next[0];
        persistSelectedLeadId(fallback?.id || "");
        setDialNumber(fallback?.phone || "");
      }
      return next;
    });
  };

  // Update call outcome for a lead and optionally remove from queue
  const markCallOutcome = async (leadId, outcome) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;

    // Update local state with new outcome
    mutateQueue((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? { ...l, call_outcome: outcome, metadata: { ...(l.metadata || {}), call_outcome: outcome } }
          : l
      )
    );

    // Update database if it's a real UUID
    if (isUuid(leadId) && supabaseReady) {
      try {
        const newMetadata = { ...(lead.metadata || {}), call_outcome: outcome };
        await supabase
          .from("leads")
          .update({ metadata: newMetadata })
          .eq("id", leadId);
      } catch (err) {
        console.error("Failed to update call outcome:", err);
      }
    }

    // If marked as "Called", remove from queue (completed)
    if (outcome === CALL_OUTCOMES.CALLED) {
      appendFinalLog(lead, "Called - Completed");
      removeLeadFromQueue(leadId);
      triggerToast("Marked as Called - Removed from queue");
    } else if (outcome === CALL_OUTCOMES.NO_ANSWER) {
      appendFinalLog(lead, "No Answer - Callback later");
      triggerToast("Marked No Answer - Will stay in queue");
    } else if (outcome === CALL_OUTCOMES.FOLLOW_UP) {
      appendFinalLog(lead, "Follow Up - Try again");
      triggerToast("Marked Follow Up - Will stay in queue");
    }
  };

  // Load leads from local dialer queue only - leads must be explicitly transferred
  const fetchLeads = React.useCallback(async (options = {}) => {
    const { force = false } = options;
    setLoading(true);
    setError("");
    try {
      // Only load from local storage queue - leads must be explicitly transferred from Lead Grid
      const persistedQueue = getSavedState(CALL_CENTER_QUEUE_KEY) || [];
      
      // If force refresh requested but queue is empty, show empty state
      // Don't auto-populate from all leads - that defeats the purpose of "Transfer to Dialer"
      if (Array.isArray(persistedQueue) && persistedQueue.length > 0) {
        persistQueue(persistedQueue);
        if (!selectedLeadId) {
          const first = persistedQueue[0];
          persistSelectedLeadId(first?.id || "");
          setDialNumber(first?.phone || first?.customer_phone || "");
        }
      } else {
        // Queue is empty - show empty state, don't auto-populate
        persistQueue([]);
        persistSelectedLeadId("");
        setDialNumber("");
        if (force) {
          triggerToast("Queue is empty. Transfer leads from Lead Grid Command.");
        }
      }
    } catch (err) {
      const message = err.response?.data?.error || err.message || "";
      setError(message || "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }, [selectedLeadId]);

  React.useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  React.useEffect(() => {
    return () => {
      if (queueSaveTimer.current) {
        clearTimeout(queueSaveTimer.current);
      }
    };
  }, []);

  // Realtime subscription removed to avoid schema-cache errors before migrations run.

  const selectedLead = React.useMemo(
    () => leads.find((lead) => String(lead.id) === String(selectedLeadId)),
    [leads, selectedLeadId]
  );

  const handleSelectLead = (lead) => {
    persistSelectedLeadId(lead.id);
    setDialNumber(normalizePhone(lead.phone) || "");
  };

  const handleDialKey = (key) => {
    setDialNumber((prev) => `${prev}${key}`);
  };

  const resolveTargetNumber = () => {
    const manual = normalizePhone(dialNumber);
    if (manual) return manual;
    return normalizePhone(selectedLead?.phone || "");
  };

  const handleCall = async () => {
    const targetNumber = resolveTargetNumber();
    if (!targetNumber) {
      triggerToast("Enter or select a number before calling.");
      return;
    }
    setCallState("calling");
    if (selectedLead?.id && isUuid(selectedLead.id)) {
      try {
        await createCallRecording({
          leadId: selectedLead.id,
          duration: 0,
          outcome: "Pitch Delivered",
        });
      } catch (err) {
        console.error("recording log failed", err);
      }
    }
    window.location.href = `tel:${targetNumber}`;
  };

  const handleEndCall = () => {
    setCallState("idle");
  };

  const handleCreateClient = () => {
    const query = selectedLead?.id ? `?leadId=${selectedLead.id}` : "";
    navigate(`/admin/wizard${query}`);
  };

  const openSmsComposer = (phone, message) => {
    const cleaned = normalizePhone(phone) || String(phone || "").replace(/[^\d+]/g, "");
    const encoded = encodeURIComponent(message);
    const separator = /iPhone|iPad|iPod/.test(navigator.userAgent) ? "&" : "?";
    window.location.href = `sms:${cleaned}${separator}body=${encoded}`;
  };

  const handleSendDemo = () => {
    const targetNumber = resolveTargetNumber();
    if (!targetNumber) {
      triggerToast("Enter or select a number before sending.");
      return;
    }
    openSmsComposer(
      targetNumber,
      "Here is the link to try the live interactive demo: connect.kryonextech.com/call-now"
    );
    if (selectedLead) {
      appendFinalLog(selectedLead, "sim");
    } else {
      appendFinalLog({ phone: targetNumber, business_name: "Manual" }, "sim");
    }
    triggerToast("SMS composer opened.");
  };

  const handleSendWebsite = () => {
    const targetNumber = resolveTargetNumber();
    if (!targetNumber) {
      triggerToast("Enter or select a number before sending.");
      return;
    }
    openSmsComposer(
      targetNumber,
      "Here is the link to our main site: www.kryonexlabs.com"
    );
    triggerToast("SMS composer opened.");
  };

  const handleAIDemoCall = async () => {
    const targetNumber = resolveTargetNumber();
    if (!targetNumber) {
      triggerToast("Enter or select a number before calling.");
      return;
    }
    if (callLoading) return;
    setCallLoading(true);
    try {
      const response = await triggerDemoCall({
        to: targetNumber,
        name: selectedLead?.business_name || selectedLead?.name || "Customer",
        leadId: selectedLead?.id && isUuid(selectedLead.id) ? selectedLead.id : null,
      });
      if (process.env.NODE_ENV === "development") {
        console.log("Retell demo call response", response.call);
      }
      triggerToast("✅ Live call triggered");
    } catch (err) {
      const errorMsg =
        typeof err.response?.data?.error === "string"
          ? err.response?.data?.error
          : typeof err.response?.data === "string"
          ? err.response.data
          : err.message || "Live call failed.";
      triggerToast(errorMsg);
    } finally {
      setCallLoading(false);
    }
  };

  const handleEraseLead = (leadId) => {
    removeLeadFromQueue(leadId);
    triggerToast("Lead removed from queue.");
  };

  const handleClearQueue = () => {
    persistQueue([]);
    persistSelectedLeadId("");
    setDialNumber("");
    triggerToast("Queue cleared. Click Refresh to reload leads.");
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
          <div>
            <p className="text-xs uppercase tracking-widest text-neon-cyan/70">
              Live Dialer
            </p>
            <h1 className="text-4xl font-semibold">Admin Call Center</h1>
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
                <div className="flex items-center gap-2">
                  <button className="button-secondary" onClick={handleClearQueue} type="button">
                    Clear Queue
                  </button>
                  <button className="button-primary" onClick={() => fetchLeads({ force: true })}>
                    Refresh
                  </button>
                </div>
              </div>
              {error ? <div className="text-neon-pink">{error}</div> : null}
              <div className="text-xs uppercase tracking-widest text-white/40 grid grid-cols-[1fr_0.7fr_0.8fr_0.6fr_0.7fr_0.7fr] gap-3 pb-3 border-b border-white/10">
                <div>Business Name</div>
                <div>Location</div>
                <div>Contact</div>
                <div>Call Status</div>
                <div>Tags</div>
                <div className="text-right">Actions</div>
              </div>
              <div className="mt-4 h-[600px] overflow-y-auto pr-2 space-y-2 lead-scroll">
                {loading ? (
                  <div className="text-white/60">Fetching leads...</div>
                ) : leads.length ? (
                  leads.map((lead) => {
                    const callOutcome = lead.call_outcome || lead.metadata?.call_outcome || CALL_OUTCOMES.NOT_CALLED;
                    const outcomeStyles = {
                      not_called: "bg-white/10 text-white/60",
                      called: "bg-neon-green/20 text-neon-green",
                      no_answer: "bg-neon-gold/20 text-neon-gold",
                      follow_up: "bg-neon-purple/20 text-neon-purple",
                    };
                    const outcomeLabels = {
                      not_called: "Pending",
                      called: "Called ✓",
                      no_answer: "No Answer",
                      follow_up: "Follow Up",
                    };
                    return (
                    <div
                      key={lead.id}
                      className={`grid grid-cols-[1fr_0.7fr_0.8fr_0.6fr_0.7fr_0.7fr] gap-3 items-center rounded-2xl border border-white/5 bg-black/40 px-4 py-3 transition hover:bg-cyan-900/20 cursor-pointer ${
                        selectedLeadId === lead.id
                          ? "lead-active-gold border-neon-gold/80"
                          : ""
                      }`}
                      onClick={() => handleSelectLead(lead)}
                    >
                      <div>
                        <div className="text-sm font-semibold">
                          {lead.business_name || "Unnamed"}
                        </div>
                        <div className="text-[10px] text-white/40">{lead.phone || "No phone"}</div>
                      </div>
                      <div className="text-[10px] text-white/50">
                        {(lead.city || lead.metadata?.city) && (lead.state || lead.metadata?.state) ? (
                          <>
                            <div>{lead.city || lead.metadata?.city}</div>
                            <div className="text-white/30">{lead.state || lead.metadata?.state}</div>
                          </>
                        ) : (
                          "—"
                        )}
                      </div>
                      <div className="text-[10px] text-white/60">
                        {lead.contact || lead.email || "—"}
                      </div>
                      <div>
                        <span className={`px-2 py-0.5 text-[9px] uppercase tracking-widest rounded-full ${outcomeStyles[callOutcome] || outcomeStyles.not_called}`}>
                          {outcomeLabels[callOutcome] || "Pending"}
                        </span>
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {(lead.tags || lead.metadata?.tags || []).slice(0, 1).map((tag) => (
                          <span key={tag} className="px-2 py-0.5 text-[9px] uppercase tracking-widest bg-white/10 rounded-full">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="action-button text-[10px]"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleEraseLead(lead.id);
                          }}
                        >
                          Erase
                        </button>
                      </div>
                    </div>
                  );})
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
            <div className="glass-panel rounded-2xl border border-white/10 p-4 mb-4 flex flex-col gap-2">
              <label className="text-xs text-white/50">
                Active Lead / Manual Number
                <input
                  className="glass-input mt-2"
                  value={dialNumber}
                  placeholder={selectedLead?.phone || "Enter number (E.164 if using Retell)"}
                  onChange={(event) => setDialNumber(event.target.value)}
                  onBlur={(event) => {
                    const normalized = normalizePhone(event.target.value);
                    if (normalized) setDialNumber(normalized);
                  }}
                />
              </label>
              </div>
              <div className="sniper-kit">
                <button
                  type="button"
                  className="sniper-button sniper-purple"
                  onClick={handleSendDemo}
                >
                  🎮 SEND DEMO
                </button>
                <button
                  type="button"
                  className="sniper-button sniper-cyan"
                  onClick={handleSendWebsite}
                >
                  🌐 SEND WEBSITE
                </button>
                <button
                  type="button"
                  className="sniper-button sniper-orange"
                  onClick={handleAIDemoCall}
                  disabled={callLoading}
                >
                  🤖 AI LIVE CALL
                </button>
                <button
                  type="button"
                  className="sniper-button sniper-green"
                  onClick={handleCreateClient}
                >
                  🚀 CLOSE DEAL
                </button>
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
              </div>

              {/* Call Outcome Buttons */}
              {selectedLeadId && (
                <div className="mb-3 rounded-2xl border border-white/10 bg-black/30 p-3">
                  <div className="text-[10px] uppercase tracking-widest text-white/40 mb-2">
                    Mark Outcome
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      className="text-[10px] py-2 px-2 rounded-xl border border-neon-green/40 bg-neon-green/10 text-neon-green hover:bg-neon-green/30 transition"
                      onClick={() => markCallOutcome(selectedLeadId, CALL_OUTCOMES.CALLED)}
                    >
                      ✓ Called
                    </button>
                    <button
                      className="text-[10px] py-2 px-2 rounded-xl border border-neon-gold/40 bg-neon-gold/10 text-neon-gold hover:bg-neon-gold/30 transition"
                      onClick={() => markCallOutcome(selectedLeadId, CALL_OUTCOMES.NO_ANSWER)}
                    >
                      📵 No Answer
                    </button>
                    <button
                      className="text-[10px] py-2 px-2 rounded-xl border border-neon-purple/40 bg-neon-purple/10 text-neon-purple hover:bg-neon-purple/30 transition"
                      onClick={() => markCallOutcome(selectedLeadId, CALL_OUTCOMES.FOLLOW_UP)}
                    >
                      🔄 Follow Up
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-2 rounded-2xl border border-white/10 bg-black/40 p-4">
                <input
                  className="input-field w-full mb-3"
                  value={dialNumber}
                  onChange={(event) => setDialNumber(event.target.value)}
                  onBlur={(event) => {
                    const normalized = normalizePhone(event.target.value);
                    if (normalized) setDialNumber(normalized);
                  }}
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

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
