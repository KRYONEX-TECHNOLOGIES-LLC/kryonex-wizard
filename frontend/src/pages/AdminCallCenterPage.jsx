import React from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { createCallRecording, getDialerQueue, triggerDemoCall } from "../lib/api.js";
import { getSavedState, saveState } from "../lib/persistence.js";
import { normalizePhone } from "../lib/phone.js";

const keypadKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
const FINAL_LOGS_KEY = "kryonex_final_logs";
const CALL_CENTER_QUEUE_KEY = "callCenter.queue";
const CALL_CENTER_SELECTED_KEY = "callCenter.selectedLeadId";
const LOCAL_DIALER_QUEUE_KEY = "kryonex_dialer_queue";

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

  const buildMockLeads = () => {
    const names = [
      "Sector 7 Plumbing",
      "Omega HVAC",
      "Titan Plumbing",
      "Nova HVAC",
      "Cedar Plumbing",
      "Summit HVAC",
      "Ridgeway Plumbing",
      "Apex HVAC",
      "Ironclad Plumbing",
      "Atlas HVAC",
      "Prairie Plumbing",
      "Vertex HVAC",
      "Union Plumbing",
      "Pulse HVAC",
      "Northwind Plumbing",
      "Sterling HVAC",
      "Copperline Plumbing",
      "Forge HVAC",
      "Harbor Plumbing",
      "Evergreen HVAC",
    ];
    const statuses = ["New", "No Answer", "Warm"];
    return names.map((name, index) => ({
      id: `mock-${index + 1}`,
      business_name: name,
      phone: `(555) 01${String(index).padStart(2, "0")}-000${index % 9}`,
      status: statuses[index % statuses.length],
      last_outcome: statuses[(index + 1) % statuses.length],
    }));
  };

  const isQueueMissing = (message = "") =>
    message.toLowerCase().includes("dialer_queue") ||
    message.toLowerCase().includes("schema cache") ||
    message.toLowerCase().includes("relation");

  const fetchLeads = React.useCallback(async (options = {}) => {
    const { force = false } = options;
    setLoading(true);
    setError("");
    try {
      const persistedQueue = getSavedState(CALL_CENTER_QUEUE_KEY);
      if (!force && Array.isArray(persistedQueue)) {
        persistQueue(persistedQueue);
        if (persistedQueue.length && !selectedLeadId) {
          const first = persistedQueue[0];
          persistSelectedLeadId(first?.id || "");
          setDialNumber(first?.phone || "");
        } else if (!persistedQueue.length) {
          persistSelectedLeadId("");
          setDialNumber("");
        }
        setLoading(false);
        setError("");
        return;
      }
      const response = await getDialerQueue();
      const queueLeads = response.data?.queue || [];
      const cachedQueue = window.localStorage.getItem(LOCAL_DIALER_QUEUE_KEY);
      const parsedQueue = cachedQueue ? JSON.parse(cachedQueue) : [];
      const nextLeads = queueLeads.length ? queueLeads : parsedQueue;
      persistQueue(nextLeads);
      if (nextLeads.length && !selectedLeadId) {
        const first = nextLeads[0];
        persistSelectedLeadId(first.id);
        setDialNumber(first.phone || "");
      } else if (!nextLeads.length) {
        persistSelectedLeadId("");
        setDialNumber("");
      }
    } catch (err) {
      const status = err.response?.status;
      const message = err.response?.data?.error || err.message || "";
      if (
        status === 404 ||
        String(message).toLowerCase().includes("network") ||
        isQueueMissing(String(message))
      ) {
        const cachedQueue = window.localStorage.getItem(LOCAL_DIALER_QUEUE_KEY);
        const parsedQueue = cachedQueue ? JSON.parse(cachedQueue) : [];
        const nextLeads = parsedQueue;
        persistQueue(nextLeads);
        if (nextLeads.length && !selectedLeadId) {
          const first = nextLeads[0];
          persistSelectedLeadId(first.id);
          setDialNumber(first.phone || "");
        } else if (!nextLeads.length) {
          persistSelectedLeadId("");
          setDialNumber("");
        }
        triggerToast("Dialer queue offline. Using local queue.");
        setError("");
      } else {
        setError(message);
      }
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

  const handleResetQueue = () => {
    const next = buildMockLeads();
    persistQueue(next);
    const first = next[0];
    persistSelectedLeadId(first?.id || "");
    setDialNumber(first?.phone || "");
    triggerToast("Dialer queue reset.");
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
                  <button className="button-secondary" onClick={handleResetQueue} type="button">
                    Reset Data
                  </button>
                  <button className="button-primary" onClick={() => fetchLeads({ force: true })}>
                    Refresh
                  </button>
                </div>
              </div>
              {error ? <div className="text-neon-pink">{error}</div> : null}
              <div className="text-xs uppercase tracking-widest text-white/40 grid grid-cols-[1fr_1fr_0.7fr_0.9fr_0.7fr_0.9fr] gap-4 pb-3 border-b border-white/10">
                <div>Business Name</div>
                <div>Contact</div>
                <div>Status</div>
                <div>Last Outcome</div>
                <div>Tags</div>
                <div className="text-right">Actions</div>
              </div>
              <div className="mt-4 h-[600px] overflow-y-auto pr-2 space-y-2 lead-scroll">
                {loading ? (
                  <div className="text-white/60">Fetching leads...</div>
                ) : leads.length ? (
                  leads.map((lead) => (
                    <div
                      key={lead.id}
                      className={`grid grid-cols-[1fr_1fr_0.7fr_0.9fr_0.7fr_0.9fr] gap-4 items-center rounded-2xl border border-white/5 bg-black/40 px-4 py-3 transition hover:bg-cyan-900/20 cursor-pointer ${
                        selectedLeadId === lead.id
                          ? "lead-active-gold border-neon-gold/80"
                          : ""
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
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="action-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleEraseLead(lead.id);
                          }}
                        >
                          Erase
                        </button>
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
