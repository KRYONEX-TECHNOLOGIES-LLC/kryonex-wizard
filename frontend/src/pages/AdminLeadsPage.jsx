import React from "react";
import { motion } from "framer-motion";
import { Mail, MessageSquare, Phone, Search, Tag, Sparkles, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { supabase, supabaseReady } from "../lib/supabase";
import { transferLeadsToDialer } from "../lib/api";
import { getSavedState, saveState } from "../lib/persistence.js";

const TAG_OPTIONS = [
  "Hot Lead",
  "Gatekeeper",
  "Wrong Number",
  "Requested Quote",
  "VIP",
  "Follow Up",
  "Do Not Call",
  "Payment Ready",
];

const STATUS_COLORS = {
  new: "bg-neon-cyan/20 text-neon-cyan border-neon-cyan/40",
  contacted: "bg-neon-purple/20 text-neon-purple border-neon-purple/40",
  nurture: "bg-neon-green/20 text-neon-green border-neon-green/40",
  stalled: "bg-neon-pink/20 text-neon-pink border-neon-pink/40",
};

const OUTCOMES = [
  "Left voicemail",
  "Requested ETA link",
  "Wants pricing",
  "No answer",
  "Booked demo",
  "Not qualified",
];

const industries = ["Plumbing", "HVAC"];
const STORAGE_KEYS = {
  leads: "leadGrid.leads",
  selectedIds: "leadGrid.selectedIds",
  tagEditor: "leadGrid.tagEditor",
  tagSearch: "leadGrid.tagSearch",
  textModal: "leadGrid.textModal",
};
const CALL_CENTER_QUEUE_KEY = "callCenter.queue";

const buildLead = (idx) => {
  const dayOffset = Math.floor(Math.random() * 12);
  const statusKeys = Object.keys(STATUS_COLORS);
  const status = statusKeys[idx % statusKeys.length];
  return {
    id: `lead-${idx}`,
    business_name: `Sector ${idx + 1} ${industries[idx % industries.length]}`,
    contact: `Agent ${String.fromCharCode(65 + (idx % 12))}.`,
    phone: `(555) 01${idx % 10}-2${(idx * 3) % 10}${(idx * 5) % 10}${idx % 10}`,
    email: `lead${idx + 10}@sector.io`,
    status,
    tags: TAG_OPTIONS.filter((_, tagIdx) => (idx + tagIdx) % 5 === 0),
    lastOutcome: OUTCOMES[idx % OUTCOMES.length],
    lastActivity: new Date(Date.now() - dayOffset * 86400000),
  };
};

const buildBatch = (start, count) =>
  Array.from({ length: count }).map((_, idx) => buildLead(start + idx));

const dayDiff = (value) =>
  Math.floor((Date.now() - new Date(value).getTime()) / 86400000);

const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );

export default function AdminLeadsPage() {
  const navigate = useNavigate();
  const [leads, setLeads] = React.useState(() => getSavedState(STORAGE_KEYS.leads) || buildBatch(0, 24));
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState(() => getSavedState(STORAGE_KEYS.selectedIds) || []);
  const [tagEditor, setTagEditor] = React.useState(() => getSavedState(STORAGE_KEYS.tagEditor) || null);
  const [tagSearch, setTagSearch] = React.useState(() => getSavedState(STORAGE_KEYS.tagSearch) || "");
  const [textModal, setTextModal] = React.useState(() => getSavedState(STORAGE_KEYS.textModal) || null);
  const [toast, setToast] = React.useState("");
  const [transfering, setTransfering] = React.useState(false);
  const toastTimer = React.useRef(null);
  const sentinelRef = React.useRef(null);
  const leadsSaveTimer = React.useRef(null);

  React.useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore) {
          if (leads.length === 0) return;
          setLoadingMore(true);
          setTimeout(() => {
            setLeads((prev) => {
              const next = [...prev, ...buildBatch(prev.length, 18)];
              saveState(STORAGE_KEYS.leads, next);
              return next;
            });
            setLoadingMore(false);
          }, 600);
        }
      },
      { threshold: 0.6 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loadingMore, leads.length]);

  React.useEffect(() => {
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
      if (leadsSaveTimer.current) {
        clearTimeout(leadsSaveTimer.current);
      }
    };
  }, []);

  const showToast = (message) => {
    setToast(message);
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
    toastTimer.current = setTimeout(() => {
      setToast("");
    }, 2600);
  };

  const persistTagEditor = (value) => {
    setTagEditor(value);
    saveState(STORAGE_KEYS.tagEditor, value);
  };

  const persistTagSearch = (value) => {
    setTagSearch(value);
    saveState(STORAGE_KEYS.tagSearch, value);
  };

  const persistTextModal = (value) => {
    setTextModal(value);
    saveState(STORAGE_KEYS.textModal, value);
  };

  const persistSelectedIdsValue = (value) => {
    setSelectedIds(value);
    saveState(STORAGE_KEYS.selectedIds, value);
  };

  const scheduleLeadsSave = (next) => {
    if (leadsSaveTimer.current) {
      clearTimeout(leadsSaveTimer.current);
    }
    leadsSaveTimer.current = setTimeout(() => {
      saveState(STORAGE_KEYS.leads, next);
    }, 120);
  };

  const handleDeleteLead = (leadId) => {
    setLeads((prev) => {
      const next = prev.filter((lead) => lead.id !== leadId);
      scheduleLeadsSave(next);
      return next;
    });
    setSelectedIds((prev) => {
      const next = prev.filter((id) => id !== leadId);
      saveState(STORAGE_KEYS.selectedIds, next);
      return next;
    });
    showToast("Lead removed.");
  };

  const handleResetLeads = () => {
    const next = buildBatch(0, 24);
    setLeads(next);
    saveState(STORAGE_KEYS.leads, next);
    persistSelectedIdsValue([]);
    persistTagEditor(null);
    persistTagSearch("");
    persistTextModal(null);
    showToast("Lead grid reset.");
  };

  const toggleTag = async (leadId, tag) => {
    let nextTags = [];
    setLeads((prev) => {
      const next = prev.map((lead) => {
        if (lead.id !== leadId) return lead;
        const exists = lead.tags.includes(tag);
        nextTags = exists
          ? lead.tags.filter((item) => item !== tag)
          : [...lead.tags, tag];
        return { ...lead, tags: nextTags };
      });
      saveState(STORAGE_KEYS.leads, next);
      return next;
    });

    if (!supabaseReady) return;
    const lead = leads.find((item) => item.id === leadId);
    if (!lead) return;
    try {
      await supabase
        .from("leads")
        .update({ metadata: { ...(lead.metadata || {}), tags: nextTags } })
        .eq("id", leadId);
    } catch (err) {
      // Best-effort update only; UI stays responsive.
    }
  };

  const handleCheckboxChange = (leadId) => {
    setSelectedIds((prev) => {
      const next = prev.includes(leadId) ? prev.filter((id) => id !== leadId) : [...prev, leadId];
      saveState(STORAGE_KEYS.selectedIds, next);
      return next;
    });
  };

  const handleTransferToDialer = async () => {
    if (!selectedIds.length) {
      showToast("Select at least one lead to transfer.");
      return;
    }
    const selectedLeads = leads.filter((lead) => selectedIds.includes(lead.id));
    saveState(CALL_CENTER_QUEUE_KEY, selectedLeads);
    window.localStorage.setItem("kryonex_dialer_queue", JSON.stringify(selectedLeads));
    const uuidIds = selectedIds.filter((id) => isUuid(id));
    const localQueue = selectedLeads.filter((lead) => !isUuid(lead.id));
    setTransfering(true);
    try {
      if (uuidIds.length) {
        await transferLeadsToDialer(uuidIds);
      }
      if (localQueue.length) {
        window.localStorage.setItem(
          "kryonex_dialer_queue",
          JSON.stringify(localQueue)
        );
      }
      showToast(
        localQueue.length
          ? "Dialer queue staged locally. Opening call center."
          : "Leads transferred to call center."
      );
      persistSelectedIdsValue([]);
      navigate("/admin/call-center");
    } catch (err) {
      const status = err.response?.status;
      const message = err.response?.data?.error || err.message || "";
      const lowered = message.toLowerCase();
      if (
        status === 404 ||
        lowered.includes("network") ||
        lowered.includes("dialer_queue") ||
        lowered.includes("schema cache") ||
        lowered.includes("relation") ||
        lowered.includes("invalid input syntax for type uuid")
      ) {
        const queuePayload = selectedLeads;
        window.localStorage.setItem(
          "kryonex_dialer_queue",
          JSON.stringify(queuePayload)
        );
        showToast("Dialer offline. Stored queue locally.");
        persistSelectedIdsValue([]);
        navigate("/admin/call-center");
      } else {
        showToast(message);
      }
    } finally {
      setTransfering(false);
    }
  };

  const filteredTags = TAG_OPTIONS.filter((tag) =>
    tag.toLowerCase().includes(tagSearch.toLowerCase())
  );

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
                The Pipeline Engine
              </p>
              <h1 className="mt-2 text-3xl font-semibold">
                Lead Grid Command
              </h1>
              <p className="mt-2 text-white/60">
                Select leads, tag instantly, and move targets to the dialer.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="glass-panel flex items-center gap-2 rounded-2xl border border-white/10 px-3 py-2">
                <Search size={16} className="text-white/40" />
                <input
                  className="bg-transparent text-sm text-white/70 outline-none placeholder:text-white/30"
                  placeholder="Search lead, tag, status..."
                />
              </div>
              <button className="button-secondary" onClick={handleResetLeads} type="button">
                Reset Data
              </button>
              <button
                className="glow-button"
                onClick={handleTransferToDialer}
                disabled={transfering}
              >
                {transfering ? "Transferring..." : "Transfer to Dialer"}
              </button>
            </div>
          </div>
            <div className="mt-5 flex flex-wrap gap-3 text-xs text-white/60">
              <div className="status-live">
                <Sparkles size={12} />
                {selectedIds.length} selected
              </div>
              <div className="status-live">Auto-assign: Armed</div>
              <div className="status-live">Queue: 24 leads</div>
            </div>
          </motion.div>

          <div className="glass-panel rounded-3xl border border-white/10 bg-black/40 overflow-hidden">
            <div className="lead-grid-header">
              <div>Select</div>
              <div>Business</div>
              <div>Contact</div>
              <div>Status</div>
              <div>Last Outcome</div>
              <div>Tags</div>
              <div className="text-right">Actions</div>
            </div>
            <div className="lead-grid-body">
              {leads.map((lead) => {
                const days = dayDiff(lead.lastActivity);
                const rowTone =
                  days >= 7
                    ? "lead-row-stale"
                    : days <= 2
                    ? "lead-row-hot"
                    : "lead-row-active";
                return (
                  <div
                    key={lead.id}
                    className={`lead-row ${rowTone} ${
                      selectedIds.includes(lead.id) ? "selected" : ""
                    }`}
                  >
                    <div className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        className="lead-checkbox"
                        checked={selectedIds.includes(lead.id)}
                        onChange={() => handleCheckboxChange(lead.id)}
                      />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">
                        {lead.business_name}
                      </div>
                      <div className="text-xs text-white/40">{lead.phone}</div>
                    </div>
                    <div>
                      <div className="text-sm">{lead.contact}</div>
                      <div className="text-xs text-white/40">{lead.email}</div>
                    </div>
                    <div>
                      <span
                        className={`status-pill ${
                          STATUS_COLORS[lead.status] || ""
                        }`}
                      >
                        {lead.status}
                      </span>
                      <div className="text-[11px] text-white/40 mt-1">
                        {days}d ago
                      </div>
                    </div>
                    <div className="text-sm text-white/60">
                      {lead.lastOutcome}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-wrap gap-2">
                        {lead.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className="tag-pill">
                            {tag}
                          </span>
                        ))}
                        {lead.tags.length > 2 && (
                          <span className="tag-pill muted">
                            +{lead.tags.length - 2}
                          </span>
                        )}
                      </div>
                      <button
                        className="tag-edit-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          persistTagEditor(lead.id);
                          persistTagSearch("");
                        }}
                      >
                        <Tag size={14} />
                      </button>
                      {tagEditor === lead.id ? (
                        <div className="tag-picker" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-2 mb-2 text-xs text-white/50">
                            <Search size={12} />
                          <input
                            className="bg-transparent text-xs text-white/70 outline-none placeholder:text-white/30"
                            placeholder="Search tags"
                            value={tagSearch}
                            onChange={(event) => persistTagSearch(event.target.value)}
                          />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {filteredTags.map((tag) => (
                              <button
                                key={tag}
                                className={`tag-pill ${
                                  lead.tags.includes(tag) ? "active" : ""
                                }`}
                                onClick={() => toggleTag(lead.id, tag)}
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                          <button
                            className="tag-close"
                            onClick={() => persistTagEditor(null)}
                          >
                            Close
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="lead-row-actions">
                          <button
                            className="action-button"
                            onClick={() => persistTextModal(lead)}
                          >
                        <MessageSquare size={14} /> Text
                      </button>
                      <button className="action-button">
                        <Phone size={14} /> Call
                      </button>
                      <button className="action-button">
                        <Mail size={14} /> Email
                      </button>
                      <button
                        className="action-button"
                        onClick={() => handleDeleteLead(lead.id)}
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </div>
                );
              })}
              <div ref={sentinelRef} className="lead-grid-sentinel">
                {loadingMore ? "Loading more leads..." : "Scroll to load more"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {textModal ? (
        <div className="glass-modal">
          <div className="glass-modal-card">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs uppercase tracking-widest text-white/40">
                  Quick Text
                </div>
                <div className="text-lg font-semibold">{textModal.business_name}</div>
              </div>
              <button className="text-white/60" onClick={() => persistTextModal(null)}>
                Close
              </button>
            </div>
            <textarea
              className="glass-input w-full min-h-[120px] text-sm text-white"
              defaultValue={`Hi ${textModal.contact}, this is Kryonex. Quick question — are you still looking for help with your ${textModal.lastOutcome.toLowerCase()}?`}
            />
            <div className="mt-4 flex justify-end">
              <button className="glow-button" onClick={() => persistTextModal(null)}>
                Send Message
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
