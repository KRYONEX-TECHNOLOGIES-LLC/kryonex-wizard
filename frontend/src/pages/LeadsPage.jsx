import React from "react";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { getFilteredLeads, logOutboundCallAttempt, flagLead } from "../lib/api";
import { supabase } from "../lib/supabase";

// Helper to fetch recording audio with auth and return blob URL (bypasses CORS)
const fetchRecordingAudio = async (leadId) => {
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  
  const response = await fetch(`${apiUrl}/api/lead-recording-proxy/${leadId}`, {
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
    },
  });
  
  if (!response.ok) {
    throw new Error("Failed to load recording");
  }
  
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};

// Format seconds to MM:SS
const formatDuration = (seconds) => {
  if (!seconds || seconds <= 0) return "--";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

// Format date to readable string
const formatDate = (dateStr) => {
  if (!dateStr) return "--";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function LeadsPage() {
  const navigate = useNavigate();
  const [leads, setLeads] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(null);
  const [query, setQuery] = React.useState("");
  const [lastUpdated, setLastUpdated] = React.useState(null);
  const [isSeller, setIsSeller] = React.useState(false);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [expandedId, setExpandedId] = React.useState(null);
  
  // Audio playback state
  const audioRef = React.useRef(new Audio());
  const blobUrlCache = React.useRef({});
  const [playingId, setPlayingId] = React.useState(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [loadingAudio, setLoadingAudio] = React.useState(null);
  
  // Filter state
  const [filters, setFilters] = React.useState({
    status: "all",
    sentiment: "all",
    dateFrom: "",
    dateTo: "",
  });

  // Load leads with filters
  const loadLeads = React.useCallback(async (isInitial = false) => {
    try {
      const params = {};
      if (filters.status !== "all") params.status = filters.status;
      if (filters.sentiment !== "all") params.sentiment = filters.sentiment;
      if (filters.dateFrom) params.date_from = filters.dateFrom;
      if (filters.dateTo) params.date_to = filters.dateTo;
      
      const leadsRes = await getFilteredLeads(params);
      setLeads(leadsRes.data.leads || []);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Failed to load leads:", error);
      setLoadError(error.userMessage || error.message || "Failed to load leads");
      setLeads([]);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [filters]);

  React.useEffect(() => {
    let mounted = true;
    const load = async (isInitial = false) => {
      if (!mounted) return;
      await loadLeads(isInitial);
    };
    load(true);
    const interval = setInterval(() => load(false), 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [loadLeads]);

  React.useEffect(() => {
    let mounted = true;
    const loadRole = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (mounted && profile) {
        setIsSeller(profile.role === "seller");
        setIsAdmin(profile.role === "admin");
      }
    };
    loadRole();
    return () => {
      mounted = false;
    };
  }, []);

  // Audio event listeners and cleanup
  React.useEffect(() => {
    const audio = audioRef.current;
    const handleEnded = () => setIsPlaying(false);
    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.pause();
      audio.removeEventListener("ended", handleEnded);
      // Clean up blob URLs to prevent memory leaks
      Object.values(blobUrlCache.current).forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, []);

  // Toggle audio playback for a lead
  const togglePlayLead = async (lead) => {
    if (!lead.recording_url) return;
    const audio = audioRef.current;
    
    // If clicking on currently playing lead, toggle pause/play
    if (playingId === lead.id) {
      if (audio.paused) {
        audio.play().catch((err) => console.error("Audio playback failed:", err));
        setIsPlaying(true);
      } else {
        audio.pause();
        setIsPlaying(false);
      }
      return;
    }
    
    // Stop current playback
    audio.pause();
    setPlayingId(lead.id);
    setIsPlaying(false);
    
    // Check if we already have this recording cached
    let blobUrl = blobUrlCache.current[lead.id];
    
    if (!blobUrl) {
      // Fetch the recording through our proxy with auth
      setLoadingAudio(lead.id);
      try {
        blobUrl = await fetchRecordingAudio(lead.id);
        blobUrlCache.current[lead.id] = blobUrl;
      } catch (err) {
        console.error("Failed to load recording:", err);
        setLoadingAudio(null);
        setPlayingId(null);
        return;
      }
      setLoadingAudio(null);
    }
    
    // Play the audio
    audio.src = blobUrl;
    audio.play().catch((err) => console.error("Audio playback failed:", err));
    setIsPlaying(true);
  };

  // Text search filter
  const filtered = leads.filter((lead) => {
    const haystack = [
      lead.name,
      lead.status,
      lead.sentiment,
      lead.phone,
      lead.summary,
      lead.service_address,
      lead.issue_type,
      lead.call_outcome,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  // Handle callback
  const handleCallBack = async (lead) => {
    if (!lead.phone) {
      alert("No phone number available");
      return;
    }
    try {
      await logOutboundCallAttempt({ leadId: lead.id, number: lead.phone });
      window.location.href = `tel:${lead.phone}`;
    } catch (err) {
      console.error("Failed to log callback:", err);
      window.location.href = `tel:${lead.phone}`;
    }
  };

  // Handle flag for review
  const handleFlag = async (lead) => {
    try {
      await flagLead(lead.id, !lead.flagged_for_review);
      setLeads((prev) =>
        prev.map((l) =>
          l.id === lead.id ? { ...l, flagged_for_review: !l.flagged_for_review } : l
        )
      );
    } catch (err) {
      console.error("Failed to flag lead:", err);
    }
  };

  // Handle row expansion
  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // Get status badge class
  const getStatusBadgeClass = (status) => {
    const s = (status || "").toLowerCase();
    if (s.includes("book") || s.includes("confirm")) return "badge-booked";
    if (s.includes("transfer")) return "badge-transferred";
    if (s.includes("callback")) return "badge-callback";
    if (s.includes("miss") || s.includes("not interested")) return "badge-missed";
    return "badge-new";
  };

  // Get sentiment class
  const getSentimentClass = (sentiment) => {
    const s = (sentiment || "").toLowerCase();
    if (s === "positive") return "sentiment-positive";
    if (s === "negative") return "sentiment-negative";
    return "sentiment-neutral";
  };

  return (
    <div className="war-room bg-black text-cyan-400 font-mono">
      <TopMenu />
      <div className="dashboard-layout">
        <SideNav
          eligibleNewAgent={false}
          onUpgrade={() => navigate("/billing")}
          onNewAgent={() => navigate("/wizard?new=1")}
          billingStatus="active"
          tier="core"
          agentLive
          lastUpdated={lastUpdated}
          isSeller={isSeller}
          isAdmin={isAdmin}
        />

        <div className="war-room-shell w-full max-w-full px-4 sm:px-6 lg:px-8">
          <div className="war-room-header">
            <div>
              <div className="war-room-kicker">INTEL LAYER</div>
              <div className="war-room-title">Lead Grid Command</div>
            </div>
            <div className="war-room-actions">
              <button className="button-primary" onClick={() => navigate("/dashboard")}>
                Back to Command Deck
              </button>
            </div>
          </div>

          {loadError && (
            <div className="glass-panel error-banner" style={{ background: "rgba(239, 68, 68, 0.15)", borderColor: "#ef4444", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span style={{ fontSize: "1.25rem" }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <strong style={{ color: "#ef4444" }}>Error loading leads</strong>
                <p style={{ margin: 0, opacity: 0.8 }}>{loadError}</p>
              </div>
              <button
                type="button"
                className="button-secondary"
                onClick={() => { setLoadError(null); loadLeads(true); }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Search & Filters Panel */}
          <div className="glass-panel bg-gray-900/50 border border-cyan-500/30 backdrop-blur-md" style={{ padding: "1.5rem" }}>
            <div className="deck-title">Search & Filters</div>
            
            {/* Search Input */}
            <input
              className="glass-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, phone, address, issue..."
              style={{ marginTop: "0.8rem" }}
            />
            
            {/* Advanced Filters */}
            <div className="filters-row" style={{ marginTop: "1rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              <div className="filter-group">
                <label className="filter-label">Status</label>
                <select
                  className="glass-select"
                  value={filters.status}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                >
                  <option value="all">All Statuses</option>
                  <option value="New">New</option>
                  <option value="Booked">Booked</option>
                  <option value="Transferred">Transferred</option>
                  <option value="Callback">Callback Requested</option>
                  <option value="Not Interested">Not Interested</option>
                </select>
              </div>
              
              <div className="filter-group">
                <label className="filter-label">Sentiment</label>
                <select
                  className="glass-select"
                  value={filters.sentiment}
                  onChange={(e) => setFilters({ ...filters, sentiment: e.target.value })}
                >
                  <option value="all">All Sentiments</option>
                  <option value="positive">Positive</option>
                  <option value="neutral">Neutral</option>
                  <option value="negative">Negative</option>
                </select>
              </div>
              
              <div className="filter-group">
                <label className="filter-label">From Date</label>
                <input
                  type="date"
                  className="glass-input"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                />
              </div>
              
              <div className="filter-group">
                <label className="filter-label">To Date</label>
                <input
                  type="date"
                  className="glass-input"
                  value={filters.dateTo}
                  onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                />
              </div>
              
              <div className="filter-group" style={{ alignSelf: "flex-end" }}>
                <button
                  className="button-secondary"
                  onClick={() => setFilters({ status: "all", sentiment: "all", dateFrom: "", dateTo: "" })}
                >
                  Clear Filters
                </button>
              </div>
            </div>
            
            <div className="deck-status" style={{ marginTop: "0.6rem" }}>
              Results: {filtered.length} leads
            </div>
          </div>

          {/* Leads Table */}
          <div
            className="glass-panel bg-gray-900/50 border border-cyan-500/30 backdrop-blur-md"
            style={{ marginTop: "1.5rem", padding: "1.5rem" }}
          >
            <div className="deck-title">All Leads</div>
            <div style={{ overflowX: "auto", marginTop: "1rem" }}>
              <table className="leads-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ textAlign: "left", color: "#9ca3af" }}>
                  <tr>
                    <th style={{ paddingBottom: "0.8rem" }}>Status</th>
                    <th style={{ paddingBottom: "0.8rem" }}>Name</th>
                    <th style={{ paddingBottom: "0.8rem" }}>Phone</th>
                    <th style={{ paddingBottom: "0.8rem" }}>Address</th>
                    <th style={{ paddingBottom: "0.8rem" }}>Issue</th>
                    <th style={{ paddingBottom: "0.8rem" }}>Outcome</th>
                    <th style={{ paddingBottom: "0.8rem" }}>Duration</th>
                    <th style={{ paddingBottom: "0.8rem" }}>Date</th>
                    <th style={{ paddingBottom: "0.8rem" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="9" style={{ padding: "1rem" }}>
                        Loading...
                      </td>
                    </tr>
                  ) : filtered.length ? (
                    filtered.map((lead) => (
                      <React.Fragment key={lead.id || `${lead.name}-${lead.phone}`}>
                        <tr 
                          className={`scanline-row clickable-row ${expandedId === lead.id ? "expanded" : ""}`}
                          onClick={() => toggleExpand(lead.id)}
                        >
                          <td style={{ padding: "0.8rem 0" }}>
                            <span className={`badge ${getStatusBadgeClass(lead.status)}`}>
                              {lead.status || "NEW"}
                            </span>
                          </td>
                          <td style={{ padding: "0.8rem 0" }}>
                            <div className="lead-name">
                              {lead.flagged_for_review && <span className="flag-icon">⚑</span>}
                              {lead.name || "Unknown"}
                            </div>
                          </td>
                          <td style={{ padding: "0.8rem 0", color: "#9ca3af" }}>
                            {lead.phone || "--"}
                          </td>
                          <td style={{ padding: "0.8rem 0", color: "#9ca3af", maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {lead.service_address || "--"}
                          </td>
                          <td style={{ padding: "0.8rem 0", color: "#9ca3af" }}>
                            {lead.issue_type || "--"}
                          </td>
                          <td style={{ padding: "0.8rem 0" }}>
                            <span className={`badge ${getStatusBadgeClass(lead.call_outcome)}`}>
                              {lead.call_outcome || lead.status || "--"}
                            </span>
                          </td>
                          <td style={{ padding: "0.8rem 0", color: "#9ca3af" }}>
                            {formatDuration(lead.call_duration_seconds)}
                          </td>
                          <td style={{ padding: "0.8rem 0", color: "#9ca3af", fontSize: "0.85rem" }}>
                            {formatDate(lead.created_at)}
                          </td>
                          <td style={{ padding: "0.8rem 0" }} onClick={(e) => e.stopPropagation()}>
                            <div className="action-buttons">
                              {lead.phone && (
                                <button
                                  className="btn-action btn-callback"
                                  onClick={() => handleCallBack(lead)}
                                  title="Call Back"
                                >
                                  📞
                                </button>
                              )}
                              <button
                                className={`btn-action btn-flag ${lead.flagged_for_review ? "flagged" : ""}`}
                                onClick={() => handleFlag(lead)}
                                title={lead.flagged_for_review ? "Unflag" : "Flag for Review"}
                              >
                                {lead.flagged_for_review ? "⚑" : "⚐"}
                              </button>
                            </div>
                          </td>
                        </tr>
                        
                        {/* Expanded Row */}
                        {expandedId === lead.id && (
                          <tr className="expanded-content-row">
                            <td colSpan="9">
                              <div className="expanded-content">
                                <div className="expanded-grid">
                                  <div className="expanded-section">
                                    <h4>AI Summary</h4>
                                    <p className="summary-text">{lead.summary || "No summary available"}</p>
                                  </div>
                                  
                                  <div className="expanded-section">
                                    <h4>Sentiment</h4>
                                    <span className={`sentiment-badge ${getSentimentClass(lead.sentiment)}`}>
                                      {lead.sentiment || "Neutral"}
                                    </span>
                                  </div>
                                  
                                  {lead.service_address && (
                                    <div className="expanded-section">
                                      <h4>Service Address</h4>
                                      <p>{lead.service_address}</p>
                                    </div>
                                  )}
                                </div>
                                
                                {lead.transcript && (
                                  <div className="transcript-section">
                                    <h4>Full Transcript</h4>
                                    <pre className="transcript-text">{lead.transcript}</pre>
                                  </div>
                                )}
                                
                                {lead.recording_url && (
                                  <div className="recording-section">
                                    <h4>Recording</h4>
                                    <div className="audio-player-row">
                                      <button 
                                        className="play-btn"
                                        onClick={() => togglePlayLead(lead)}
                                        disabled={loadingAudio === lead.id}
                                      >
                                        {loadingAudio === lead.id ? "⏳ Loading..." : playingId === lead.id && isPlaying ? "❚❚ Pause" : "▶ Play"}
                                      </button>
                                      {playingId === lead.id && (
                                        <span className="now-playing-indicator">Now Playing</span>
                                      )}
                                    </div>
                                  </div>
                                )}
                                
                                <div className="expanded-actions">
                                  {lead.phone && (
                                    <button className="button-primary" onClick={() => handleCallBack(lead)}>
                                      📞 Call Back
                                    </button>
                                  )}
                                  {lead.recording_url && (
                                    <a 
                                      href={lead.recording_url} 
                                      download 
                                      className="button-secondary"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      ⬇️ Download Recording
                                    </a>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="9" style={{ padding: "1rem", color: "#22d3ee" }}>
                        No leads captured yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
