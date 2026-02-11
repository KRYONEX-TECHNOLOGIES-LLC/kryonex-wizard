import React from "react";
import { motion } from "framer-motion";
import { Mail, MessageSquare, Phone, Search, Tag, Sparkles, Trash2, RefreshCw, Upload, CheckSquare, Square, Filter } from "lucide-react";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { supabase, supabaseReady } from "../lib/supabase";
import { getAdminLeads, transferLeadsToDialer, importLeads } from "../lib/api";
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

// Call outcome statuses for admin workflow
const CALL_OUTCOMES = {
  NOT_CALLED: "not_called",
  CALLED: "called",
  NO_ANSWER: "no_answer",
  FOLLOW_UP: "follow_up",
};

const CALL_OUTCOME_LABELS = {
  not_called: { label: "Not Called", color: "bg-white/10 text-white/60 border-white/20" },
  called: { label: "Called ✓", color: "bg-neon-green/20 text-neon-green border-neon-green/40" },
  no_answer: { label: "No Answer", color: "bg-neon-gold/20 text-neon-gold border-neon-gold/40" },
  follow_up: { label: "Follow Up", color: "bg-neon-purple/20 text-neon-purple border-neon-purple/40" },
};

const STATUS_COLORS = {
  new: "bg-neon-cyan/20 text-neon-cyan border-neon-cyan/40",
  contacted: "bg-neon-purple/20 text-neon-purple border-neon-purple/40",
  nurture: "bg-neon-green/20 text-neon-green border-neon-green/40",
  stalled: "bg-neon-pink/20 text-neon-pink border-neon-pink/40",
  booked: "bg-neon-green/20 text-neon-green border-neon-green/40",
};

const STORAGE_KEYS = {
  selectedIds: "leadGrid.selectedIds",
  tagEditor: "leadGrid.tagEditor",
  tagSearch: "leadGrid.tagSearch",
  textModal: "leadGrid.textModal",
};
const CALL_CENTER_QUEUE_KEY = "callCenter.queue";

const dayDiff = (value) => {
  if (!value) return 0;
  return Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
};

const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );

export default function AdminLeadsPage() {
  const navigate = useNavigate();
  const [leads, setLeads] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [searchFilter, setSearchFilter] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState(() => getSavedState(STORAGE_KEYS.selectedIds) || []);
  const [tagEditor, setTagEditor] = React.useState(() => getSavedState(STORAGE_KEYS.tagEditor) || null);
  const [tagSearch, setTagSearch] = React.useState(() => getSavedState(STORAGE_KEYS.tagSearch) || "");
  const [textModal, setTextModal] = React.useState(() => getSavedState(STORAGE_KEYS.textModal) || null);
  const [toast, setToast] = React.useState("");
  const [transfering, setTransfering] = React.useState(false);
  const toastTimer = React.useRef(null);
  const [importModal, setImportModal] = React.useState(false);
  const [importText, setImportText] = React.useState("");
  const [importing, setImporting] = React.useState(false);
  const [dateFilter, setDateFilter] = React.useState("all"); // all, today, week, new
  const [statusFilter, setStatusFilter] = React.useState("all"); // all, new, contacted, interested, not_interested
  const [outcomeTab, setOutcomeTab] = React.useState("active"); // active, no_answer, called, follow_up, all
  const [cityFilter, setCityFilter] = React.useState("all");
  const [stateFilter, setStateFilter] = React.useState("all");

  // Fetch real leads from backend
  const fetchLeads = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getAdminLeads();
      const allLeads = (response.data?.leads || []).map((lead) => ({
        id: lead.id,
        business_name: lead.business_name || lead.name || "Unknown Caller",
        contact: lead.name || lead.customer_name || "--",
        phone: lead.phone || lead.customer_phone || "--",
        email: lead.email || "--",
        status: lead.status || "new",
        tags: lead.metadata?.tags || [],
        city: lead.metadata?.city || lead.city || "",
        state: lead.metadata?.state || lead.state || "",
        call_outcome: lead.metadata?.call_outcome || CALL_OUTCOMES.NOT_CALLED,
        lastOutcome: lead.outcome || lead.summary?.slice(0, 50) || "--",
        lastActivity: lead.created_at || new Date().toISOString(),
        user_id: lead.user_id,
        sentiment: lead.sentiment,
        flagged: lead.flagged,
        metadata: lead.metadata || {},
      }));
      setLeads(allLeads);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchLeads();
    const interval = setInterval(fetchLeads, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchLeads]);

  React.useEffect(() => {
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
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

  // Date filtering helpers
  const isToday = (dateStr) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  };

  const isThisWeek = (dateStr) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return d >= weekAgo;
  };

  // Get unique cities and states for filter dropdowns
  const uniqueCities = React.useMemo(() => {
    const cities = [...new Set(leads.map(l => l.city).filter(Boolean))].sort();
    return cities;
  }, [leads]);

  const uniqueStates = React.useMemo(() => {
    const states = [...new Set(leads.map(l => l.state).filter(Boolean))].sort();
    return states;
  }, [leads]);

  // Apply all filters to leads
  const getFilteredLeads = () => {
    return leads.filter((lead) => {
      // Text search (includes city/state)
      if (searchFilter) {
        const term = searchFilter.toLowerCase();
        const matchesSearch = 
          (lead.business_name || "").toLowerCase().includes(term) ||
          (lead.contact || "").toLowerCase().includes(term) ||
          (lead.phone || "").toLowerCase().includes(term) ||
          (lead.city || "").toLowerCase().includes(term) ||
          (lead.state || "").toLowerCase().includes(term) ||
          (lead.status || "").toLowerCase().includes(term) ||
          (lead.tags || []).some(tag => tag.toLowerCase().includes(term));
        if (!matchesSearch) return false;
      }
      
      // City filter
      if (cityFilter !== "all" && lead.city !== cityFilter) return false;
      
      // State filter
      if (stateFilter !== "all" && lead.state !== stateFilter) return false;
      
      // Call outcome tab filter
      if (outcomeTab !== "all") {
        const outcome = lead.call_outcome || CALL_OUTCOMES.NOT_CALLED;
        if (outcomeTab === "active" && outcome !== CALL_OUTCOMES.NOT_CALLED) return false;
        if (outcomeTab === "no_answer" && outcome !== CALL_OUTCOMES.NO_ANSWER) return false;
        if (outcomeTab === "called" && outcome !== CALL_OUTCOMES.CALLED) return false;
        if (outcomeTab === "follow_up" && outcome !== CALL_OUTCOMES.FOLLOW_UP) return false;
      }
      
      // Date filter
      if (dateFilter === "today" && !isToday(lead.lastActivity)) return false;
      if (dateFilter === "week" && !isThisWeek(lead.lastActivity)) return false;
      if (dateFilter === "new" && lead.status?.toLowerCase() !== "new") return false;
      
      // Status filter
      if (statusFilter !== "all") {
        const leadStatus = (lead.status || "").toLowerCase();
        if (statusFilter === "new" && leadStatus !== "new") return false;
        if (statusFilter === "contacted" && leadStatus !== "contacted") return false;
        if (statusFilter === "interested" && leadStatus !== "interested") return false;
        if (statusFilter === "not_interested" && leadStatus !== "not interested" && leadStatus !== "not_interested") return false;
      }
      
      return true;
    });
  };

  const filteredLeads = getFilteredLeads();

  // Get counts for each outcome tab
  const outcomeCounts = React.useMemo(() => ({
    active: leads.filter(l => (l.call_outcome || CALL_OUTCOMES.NOT_CALLED) === CALL_OUTCOMES.NOT_CALLED).length,
    no_answer: leads.filter(l => l.call_outcome === CALL_OUTCOMES.NO_ANSWER).length,
    called: leads.filter(l => l.call_outcome === CALL_OUTCOMES.CALLED).length,
    follow_up: leads.filter(l => l.call_outcome === CALL_OUTCOMES.FOLLOW_UP).length,
    all: leads.length,
  }), [leads]);

  // Select all visible (filtered) leads
  const handleSelectAll = () => {
    const allFilteredIds = filteredLeads.map(lead => lead.id);
    persistSelectedIdsValue(allFilteredIds);
    showToast(`Selected ${allFilteredIds.length} leads`);
  };

  // Deselect all
  const handleDeselectAll = () => {
    persistSelectedIdsValue([]);
    showToast("Deselected all leads");
  };

  // Parse pasted lead data (supports multiple formats)
  // Format: Business Name, Phone, Email, City, State (or tab-separated)
  const parseImportText = (text) => {
    const lines = text.trim().split("\n").filter(line => line.trim());
    const leads = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Try CSV format: "Business Name, Phone, Email, City, State"
      if (trimmed.includes(",")) {
        const parts = trimmed.split(",").map(p => p.trim());
        leads.push({
          business_name: parts[0] || "Unknown",
          phone: parts[1] || "",
          email: parts[2] || "",
          city: parts[3] || "",
          state: parts[4] || "",
        });
      } 
      // Try tab-separated
      else if (trimmed.includes("\t")) {
        const parts = trimmed.split("\t").map(p => p.trim());
        leads.push({
          business_name: parts[0] || "Unknown",
          phone: parts[1] || "",
          email: parts[2] || "",
          city: parts[3] || "",
          state: parts[4] || "",
        });
      }
      // Single value - assume it's a business name or phone
      else {
        const isPhone = /^[\d\s\-\(\)\+]+$/.test(trimmed) && trimmed.replace(/\D/g, "").length >= 10;
        leads.push({
          business_name: isPhone ? "Unknown" : trimmed,
          phone: isPhone ? trimmed : "",
          email: "",
          city: "",
          state: "",
        });
      }
    }
    
    return leads;
  };

  const handleImport = async () => {
    if (!importText.trim()) {
      showToast("Paste some leads first.");
      return;
    }
    
    const parsedLeads = parseImportText(importText);
    if (parsedLeads.length === 0) {
      showToast("No leads found. Check format.");
      return;
    }
    
    setImporting(true);
    try {
      const response = await importLeads(parsedLeads);
      const inserted = response.data?.inserted || parsedLeads.length;
      showToast(`Imported ${inserted} leads!`);
      setImportModal(false);
      setImportText("");
      fetchLeads(); // Refresh the list
    } catch (err) {
      showToast(err.response?.data?.error || err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteLead = async (leadId) => {
    if (!window.confirm("Are you sure you want to delete this lead?")) return;
    try {
      // Remove from local state immediately
      setLeads((prev) => prev.filter((lead) => lead.id !== leadId));
      setSelectedIds((prev) => prev.filter((id) => id !== leadId));
      
      // Delete from database if it's a real UUID
      if (isUuid(leadId)) {
        await supabase.from("leads").delete().eq("id", leadId);
      }
      showToast("Lead deleted.");
    } catch (err) {
      showToast("Failed to delete lead.");
      fetchLeads(); // Refresh to restore state
    }
  };

  // Update call outcome for a lead
  const updateCallOutcome = async (leadId, outcome) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;

    // Update local state immediately
    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? { ...l, call_outcome: outcome, metadata: { ...l.metadata, call_outcome: outcome } }
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

    const label = CALL_OUTCOME_LABELS[outcome]?.label || outcome;
    showToast(`Marked as ${label}`);
  };

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
                All Platform Leads
              </p>
              <h1 className="mt-2 text-3xl font-semibold">
                Lead Grid Command
              </h1>
              <p className="mt-2 text-white/60">
                Real leads from all users. Select, tag, and move to dialer.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="glass-panel flex items-center gap-2 rounded-2xl border border-white/10 px-3 py-2">
                <Search size={16} className="text-white/40" />
                <input
                  className="bg-transparent text-sm text-white/70 outline-none placeholder:text-white/30"
                  placeholder="Search lead, tag, status..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                />
              </div>
              <button className="button-secondary" onClick={fetchLeads} type="button" disabled={loading}>
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
              </button>
              <button 
                className="button-secondary" 
                onClick={() => setImportModal(true)} 
                type="button"
              >
                <Upload size={14} /> Import Leads
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
            {error && <div className="mt-3 text-neon-pink text-sm">{error}</div>}
            
            {/* Call Outcome Tabs */}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
                <button
                  className={`px-3 py-1.5 text-xs rounded-lg transition ${outcomeTab === "active" ? "bg-neon-cyan/20 text-neon-cyan" : "text-white/60 hover:text-white"}`}
                  onClick={() => setOutcomeTab("active")}
                >
                  📞 Active ({outcomeCounts.active})
                </button>
                <button
                  className={`px-3 py-1.5 text-xs rounded-lg transition ${outcomeTab === "no_answer" ? "bg-neon-gold/20 text-neon-gold" : "text-white/60 hover:text-white"}`}
                  onClick={() => setOutcomeTab("no_answer")}
                >
                  📵 No Answer ({outcomeCounts.no_answer})
                </button>
                <button
                  className={`px-3 py-1.5 text-xs rounded-lg transition ${outcomeTab === "follow_up" ? "bg-neon-purple/20 text-neon-purple" : "text-white/60 hover:text-white"}`}
                  onClick={() => setOutcomeTab("follow_up")}
                >
                  🔄 Follow Up ({outcomeCounts.follow_up})
                </button>
                <button
                  className={`px-3 py-1.5 text-xs rounded-lg transition ${outcomeTab === "called" ? "bg-neon-green/20 text-neon-green" : "text-white/60 hover:text-white"}`}
                  onClick={() => setOutcomeTab("called")}
                >
                  ✓ Called ({outcomeCounts.called})
                </button>
                <button
                  className={`px-3 py-1.5 text-xs rounded-lg transition ${outcomeTab === "all" ? "bg-white/20 text-white" : "text-white/60 hover:text-white"}`}
                  onClick={() => setOutcomeTab("all")}
                >
                  All ({outcomeCounts.all})
                </button>
              </div>
            </div>

            {/* Filter Row */}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {/* Date Filters */}
              <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
                <button
                  className={`px-3 py-1.5 text-xs rounded-lg transition ${dateFilter === "all" ? "bg-neon-cyan/20 text-neon-cyan" : "text-white/60 hover:text-white"}`}
                  onClick={() => setDateFilter("all")}
                >
                  All Time
                </button>
                <button
                  className={`px-3 py-1.5 text-xs rounded-lg transition ${dateFilter === "today" ? "bg-neon-cyan/20 text-neon-cyan" : "text-white/60 hover:text-white"}`}
                  onClick={() => setDateFilter("today")}
                >
                  Today
                </button>
                <button
                  className={`px-3 py-1.5 text-xs rounded-lg transition ${dateFilter === "week" ? "bg-neon-cyan/20 text-neon-cyan" : "text-white/60 hover:text-white"}`}
                  onClick={() => setDateFilter("week")}
                >
                  This Week
                </button>
                <button
                  className={`px-3 py-1.5 text-xs rounded-lg transition ${dateFilter === "new" ? "bg-neon-cyan/20 text-neon-cyan" : "text-white/60 hover:text-white"}`}
                  onClick={() => setDateFilter("new")}
                >
                  New Only
                </button>
              </div>

              {/* City Filter */}
              {uniqueCities.length > 0 && (
                <select
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 outline-none"
                  value={cityFilter}
                  onChange={(e) => setCityFilter(e.target.value)}
                >
                  <option value="all">All Cities</option>
                  {uniqueCities.map((city) => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              )}

              {/* State Filter */}
              {uniqueStates.length > 0 && (
                <select
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 outline-none"
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value)}
                >
                  <option value="all">All States</option>
                  {uniqueStates.map((state) => (
                    <option key={state} value={state}>{state}</option>
                  ))}
                </select>
              )}

              {/* Status Filter */}
              <select
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 outline-none"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="interested">Interested</option>
                <option value="not_interested">Not Interested</option>
              </select>

              <div className="flex-1" />

              {/* Select All / Deselect All */}
              <button
                className="button-secondary text-xs"
                onClick={handleSelectAll}
                title="Select all visible leads"
              >
                <CheckSquare size={14} /> Select All ({filteredLeads.length})
              </button>
              <button
                className="button-secondary text-xs"
                onClick={handleDeselectAll}
                title="Deselect all"
                disabled={selectedIds.length === 0}
              >
                <Square size={14} /> Deselect
              </button>
            </div>

            {/* Stats Row */}
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-white/60">
              <div className="status-live">
                <Sparkles size={12} />
                {selectedIds.length} selected
              </div>
              <div className="status-live">Showing: {filteredLeads.length} of {leads.length} leads</div>
              {loading && <div className="status-live">Loading...</div>}
            </div>
          </motion.div>

          <div className="glass-panel rounded-3xl border border-white/10 bg-black/40 overflow-hidden">
            <div className="lead-grid-header-extended">
              <div>Select</div>
              <div>Business</div>
              <div>Location</div>
              <div>Contact</div>
              <div>Call Status</div>
              <div>Tags</div>
              <div className="text-right">Actions</div>
            </div>
            <div className="lead-grid-body">
              {loading && leads.length === 0 ? (
                <div className="lead-row">
                  <div className="col-span-7 text-center text-white/60 py-8">Loading leads...</div>
                </div>
              ) : filteredLeads.length === 0 ? (
                <div className="lead-row">
                  <div className="col-span-7 text-center text-white/60 py-8">
                    {leads.length === 0 
                      ? "No leads yet. Import leads or wait for calls to come in." 
                      : "No leads match your filters. Try adjusting filters above."}
                  </div>
                </div>
              ) : filteredLeads.map((lead) => {
                const days = dayDiff(lead.lastActivity);
                const rowTone =
                  days >= 7
                    ? "lead-row-stale"
                    : days <= 2
                    ? "lead-row-hot"
                    : "lead-row-active";
                const outcomeInfo = CALL_OUTCOME_LABELS[lead.call_outcome] || CALL_OUTCOME_LABELS.not_called;
                return (
                  <div
                    key={lead.id}
                    className={`lead-row-extended ${rowTone} ${
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
                      {(lead.city || lead.state) ? (
                        <>
                          <div className="text-sm">{lead.city || "--"}</div>
                          <div className="text-xs text-white/40">{lead.state || "--"}</div>
                        </>
                      ) : (
                        <div className="text-xs text-white/30">--</div>
                      )}
                    </div>
                    <div>
                      <div className="text-sm">{lead.contact}</div>
                      <div className="text-xs text-white/40">{lead.email}</div>
                      <div className="text-[11px] text-white/40 mt-1">{days}d ago</div>
                    </div>
                    <div>
                      <span className={`status-pill text-[10px] px-2 py-0.5 rounded-full border ${outcomeInfo.color}`}>
                        {outcomeInfo.label}
                      </span>
                      {/* Quick outcome buttons */}
                      <div className="flex gap-1 mt-2">
                        <button
                          className={`text-[9px] px-1.5 py-0.5 rounded border transition ${lead.call_outcome === CALL_OUTCOMES.CALLED ? "bg-neon-green/30 border-neon-green/50 text-neon-green" : "border-white/20 text-white/40 hover:border-neon-green/50 hover:text-neon-green"}`}
                          onClick={() => updateCallOutcome(lead.id, CALL_OUTCOMES.CALLED)}
                          title="Mark as Called"
                        >
                          ✓
                        </button>
                        <button
                          className={`text-[9px] px-1.5 py-0.5 rounded border transition ${lead.call_outcome === CALL_OUTCOMES.NO_ANSWER ? "bg-neon-gold/30 border-neon-gold/50 text-neon-gold" : "border-white/20 text-white/40 hover:border-neon-gold/50 hover:text-neon-gold"}`}
                          onClick={() => updateCallOutcome(lead.id, CALL_OUTCOMES.NO_ANSWER)}
                          title="No Answer"
                        >
                          NA
                        </button>
                        <button
                          className={`text-[9px] px-1.5 py-0.5 rounded border transition ${lead.call_outcome === CALL_OUTCOMES.FOLLOW_UP ? "bg-neon-purple/30 border-neon-purple/50 text-neon-purple" : "border-white/20 text-white/40 hover:border-neon-purple/50 hover:text-neon-purple"}`}
                          onClick={() => updateCallOutcome(lead.id, CALL_OUTCOMES.FOLLOW_UP)}
                          title="Follow Up"
                        >
                          FU
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-wrap gap-1">
                        {lead.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className="tag-pill text-[10px]">
                            {tag}
                          </span>
                        ))}
                        {lead.tags.length > 2 && (
                          <span className="tag-pill muted text-[10px]">
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
                        <Tag size={12} />
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
                            className="action-button text-[10px]"
                            onClick={() => persistTextModal(lead)}
                          >
                        <MessageSquare size={12} /> Text
                      </button>
                      <button className="action-button text-[10px]">
                        <Phone size={12} /> Call
                      </button>
                      <button className="action-button text-[10px]">
                        <Mail size={12} /> Email
                      </button>
                      <button
                        className="action-button text-[10px]"
                        onClick={() => handleDeleteLead(lead.id)}
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </div>
                );
              })}
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

      {/* Import Leads Modal */}
      {importModal ? (
        <div className="glass-modal" onClick={() => setImportModal(false)}>
          <div 
            className="glass-modal-card" 
            style={{ maxWidth: "600px", width: "90%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs uppercase tracking-widest text-white/40">
                  Import Leads
                </div>
                <div className="text-lg font-semibold">Paste Your Lead List</div>
              </div>
              <button className="text-white/60 hover:text-white" onClick={() => setImportModal(false)}>
                ✕
              </button>
            </div>
            
            <p className="mb-3 text-sm text-white/60">
              Paste leads from your AI, spreadsheet, or any list.
            </p>

            <div className="mb-4 rounded-xl border border-white/15 bg-white/5 p-3 text-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-white/50">AI Prompt — Copy this to ChatGPT/Claude</span>
                <button
                  type="button"
                  className="rounded bg-white/10 px-2 py-1 text-xs text-white/80 hover:bg-white/20"
                  onClick={() => {
                    const example = `Give me a list of 100 HVAC/plumbing companies in [YOUR AREA].

Format each as: Business Name, Phone, Email, City, State
One company per line. Example:

ABC Plumbing, 614-555-1234, abc@email.com, Columbus, OH
Johnson HVAC, 555-987-6543, johnson@email.com, Cleveland, OH
Elite Heating, 555-123-4567, elite@email.com, Cincinnati, OH`;
                    navigator.clipboard.writeText(example);
                    showToast("Prompt copied — paste into your AI.");
                  }}
                >
                  Copy example
                </button>
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-white/80 text-xs leading-relaxed">
{`Give me a list of 100 HVAC/plumbing companies in [YOUR AREA].

Format each as: Business Name, Phone, Email, City, State
One company per line. Example:

ABC Plumbing, 614-555-1234, abc@email.com, Columbus, OH
Johnson HVAC, 555-987-6543, johnson@email.com, Cleveland, OH
Elite Heating, 555-123-4567, elite@email.com, Cincinnati, OH`}
              </pre>
            </div>
            
            <textarea
              className="glass-input w-full text-sm text-white font-mono"
              style={{ minHeight: "200px" }}
              placeholder={`Paste your full list here — one lead per line:

Format: Business Name, Phone, Email, City, State

ABC Plumbing, 614-555-1234, abc@email.com, Columbus, OH
Johnson HVAC, 555-987-6543, johnson@email.com, Cleveland, OH
Elite Heating, 555-123-4567, elite@email.com, Cincinnati, OH
Quality Air, 555-222-3333, quality@email.com, Dayton, OH
Pro Plumbers, 555-444-5555, pro@email.com, Toledo, OH`}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            
            <div className="mt-2 text-xs text-white/40">
              {importText.trim() ? `${importText.trim().split("\n").filter(l => l.trim()).length} lines detected` : "Paste your leads above"}
            </div>
            
            <div className="mt-4 flex justify-end gap-3">
              <button 
                className="button-secondary" 
                onClick={() => { setImportModal(false); setImportText(""); }}
              >
                Cancel
              </button>
              <button 
                className="glow-button" 
                onClick={handleImport}
                disabled={importing || !importText.trim()}
              >
                {importing ? "Importing..." : "Import Leads"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
