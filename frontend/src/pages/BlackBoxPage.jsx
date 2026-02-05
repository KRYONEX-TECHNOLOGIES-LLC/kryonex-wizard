import React from "react";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { fetchUserCallRecordings, flagLead } from "../lib/api";
import { supabase } from "../lib/supabase";

const formatDuration = (seconds) => {
  if (typeof seconds === "string" && seconds.includes(":")) {
    return seconds;
  }
  const total = Number(seconds) || 0;
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const formatTimestamp = (value) => {
  if (!value) return "--";
  const date = new Date(value);
  return date.toLocaleString();
};

const outcomeTone = (value) => {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("book")) return "badge-booked";
  if (normalized.includes("miss") || normalized.includes("hangup")) return "badge-missed";
  if (normalized.includes("transfer")) return "badge-transferred";
  return "badge-inquiry";
};

const getSentimentClass = (sentiment) => {
  const s = (sentiment || "").toLowerCase();
  if (s === "positive") return "sentiment-positive";
  if (s === "negative") return "sentiment-negative";
  return "sentiment-neutral";
};

// Waveform Visualizer Component
const WaveformVisualizer = ({ audioRef, isPlaying, playingId, recordId }) => {
  const canvasRef = React.useRef(null);
  const animationRef = React.useRef(null);
  const analyserRef = React.useRef(null);
  const sourceRef = React.useRef(null);
  const audioContextRef = React.useRef(null);
  
  React.useEffect(() => {
    if (!isPlaying || playingId !== recordId || !canvasRef.current) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }
    
    const audio = audioRef.current;
    if (!audio) return;
    
    // Create audio context if not exists
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    const ctx = audioContextRef.current;
    
    // Create analyser if not exists
    if (!analyserRef.current) {
      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = 128;
    }
    
    // Create source if not exists
    if (!sourceRef.current) {
      try {
        sourceRef.current = ctx.createMediaElementSource(audio);
        sourceRef.current.connect(analyserRef.current);
        analyserRef.current.connect(ctx.destination);
      } catch (e) {
        // Source already created for this element
      }
    }
    
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext("2d");
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      
      canvasCtx.fillStyle = "rgba(0, 0, 0, 0.2)";
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
      
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        
        // Cyan gradient
        const gradient = canvasCtx.createLinearGradient(0, canvas.height, 0, 0);
        gradient.addColorStop(0, "#06b6d4");
        gradient.addColorStop(1, "#22d3ee");
        canvasCtx.fillStyle = gradient;
        
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };
    
    draw();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, playingId, recordId, audioRef]);
  
  return (
    <canvas 
      ref={canvasRef} 
      className="waveform-canvas"
      width="200"
      height="40"
    />
  );
};

// Real data only - no mock data for production

export default function BlackBoxPage() {
  const navigate = useNavigate();
  const [records, setRecords] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [activeRecord, setActiveRecord] = React.useState(null);
  const [isSeller, setIsSeller] = React.useState(false);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [playingId, setPlayingId] = React.useState(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const audioRef = React.useRef(new Audio());
  const filteredRecords = React.useMemo(() => {
    const needle = searchTerm.toLowerCase().trim();
    if (!needle) return records;
    return records.filter((row) =>
      `${
        row.caller_name || ""
      } ${row.caller_phone || row.caller_id || ""} ${row.summary || ""}`.toLowerCase().includes(needle)
    );
  }, [records, searchTerm]);
  const [lastUpdated, setLastUpdated] = React.useState(null);

  React.useEffect(() => {
    let mounted = true;
    const load = async (isInitial = false) => {
      try {
        const response = await fetchUserCallRecordings();
        if (mounted) {
          setRecords(response.data.recordings || []);
          setLastUpdated(new Date());
        }
      } catch (error) {
        if (mounted) {
          setRecords([]);
        }
      } finally {
        if (mounted && isInitial) setLoading(false);
      }
    };
    load(true);
    const interval = setInterval(() => load(false), 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const togglePlay = (record) => {
    if (!record.recording_url) return;
    const audio = audioRef.current;
    if (playingId !== record.id) {
      audio.pause();
      audio.src = record.recording_url;
      audio.play().catch(() => {});
      setPlayingId(record.id);
      setIsPlaying(true);
      return;
    }
    if (audio.paused) {
      audio.play().catch(() => {});
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const handlePlayClick = (event, record) => {
    event.stopPropagation();
    togglePlay(record);
  };

  const handleDownloadClick = (event) => {
    event.stopPropagation();
  };

  // Handle flag for review
  const handleFlag = async (record) => {
    try {
      const newFlagged = !record.flagged_for_review;
      // If we have a lead_id, flag it
      if (record.lead_id || record.id) {
        await flagLead(record.lead_id || record.id, newFlagged);
      }
      // Update local state
      setRecords((prev) =>
        prev.map((r) =>
          r.id === record.id ? { ...r, flagged_for_review: newFlagged } : r
        )
      );
      if (activeRecord?.id === record.id) {
        setActiveRecord({ ...activeRecord, flagged_for_review: newFlagged });
      }
    } catch (err) {
      console.error("Failed to flag recording:", err);
    }
  };

  React.useEffect(() => {
    const audio = audioRef.current;
    const handleEnded = () => setIsPlaying(false);
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    return () => {
      audio.pause();
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, []);

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

  return (
    <div className="war-room bg-black text-cyan-400 font-mono">
      <TopMenu />
      <div className="dashboard-grid">
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
        <div className="main-content">
          <div className="war-room-header">
            <div>
              <div className="war-room-kicker">COMMUNICATION INTERCEPTS</div>
              <div className="war-room-title">BLACK BOX</div>
            </div>
            <button className="button-primary" onClick={() => navigate("/dashboard")}>
              Back to War Room
            </button>
          </div>

          <div className="glass-panel" style={{ padding: "1.4rem" }}>
            <input
              className="glass-input"
              placeholder="Search caller name, phone, or summary..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              style={{ width: "100%", marginBottom: "1rem" }}
            />
          </div>

          <div className="blackbox-table glass-panel">
            <div className="blackbox-row blackbox-header">
              <span>Timestamp</span>
              <span>Caller ID</span>
              <span>Duration</span>
              <span>Outcome</span>
              <span>Playback</span>
              <span>Actions</span>
            </div>
            <div className="blackbox-scroll">
              {loading ? (
                <div className="blackbox-empty-row">Loading transmissions...</div>
              ) : filteredRecords.length ? (
                filteredRecords.map((row) => (
                  <div 
                    key={row.id} 
                    className={`blackbox-row ${row.flagged_for_review ? "flagged-row" : ""}`}
                    onClick={() => setActiveRecord(row)}
                  >
                    <span className="blackbox-time">{formatTimestamp(row.created_at)}</span>
                    <span className="blackbox-caller">
                      <div className="caller-name-row">
                        {row.flagged_for_review && <span className="flag-icon">⚑</span>}
                        {row.caller_name}
                      </div>
                      <span className="blackbox-sub">
                        {row.caller_phone || row.caller_id || "--"}
                      </span>
                    </span>
                    <span>{formatDuration(row.duration)}</span>
                    <span
                      className={`badge ${outcomeTone(row.status || row.outcome)}`}
                    >
                      {(row.status || row.outcome || "Inquiry").toString()}
                    </span>
                    <span className="blackbox-player">
                      <button
                        className="action-button"
                        onClick={(event) => handlePlayClick(event, row)}
                      >
                        {playingId === row.id && isPlaying ? "❚❚" : "▶"} Play
                      </button>
                      {playingId === row.id && isPlaying ? (
                        <WaveformVisualizer 
                          audioRef={audioRef}
                          isPlaying={isPlaying}
                          playingId={playingId}
                          recordId={row.id}
                        />
                      ) : (
                        <span className="waveform static">
                          <span /><span /><span /><span />
                        </span>
                      )}
                    </span>
                    <span className="blackbox-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="action-button"
                        onClick={() => setActiveRecord(row)}
                      >
                        View
                      </button>
                      <button
                        className={`action-button flag-btn ${row.flagged_for_review ? "flagged" : ""}`}
                        onClick={() => handleFlag(row)}
                        title={row.flagged_for_review ? "Unflag" : "Flag for Review"}
                      >
                        {row.flagged_for_review ? "⚑" : "⚐"}
                      </button>
                      {row.recording_url ? (
                        <a
                          className="action-button"
                          href={row.recording_url}
                          download={`recording-${row.id}.mp3`}
                          onClick={handleDownloadClick}
                        >
                          ⬇
                        </a>
                      ) : null}
                    </span>
                  </div>
                ))
              ) : records.length ? (
                <div className="blackbox-empty-row">No matches found.</div>
              ) : (
                <div className="blackbox-empty-row">
                  <span className="blackbox-radar">📡</span>
                  NO TRANSMISSIONS DETECTED
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Slide Panel with AI Summary */}
      {activeRecord ? (
        <>
          <div className="slide-overlay" onClick={() => setActiveRecord(null)} />
          <div className="slide-panel enhanced">
            <div className="slide-panel-header">
              <div>
                <div className="war-room-kicker">CALL INTEL</div>
                <div className="war-room-title" style={{ fontSize: "1.4rem" }}>
                  {activeRecord.caller_name}
                </div>
              </div>
              <div className="slide-panel-actions">
                <button
                  className={`btn-flag ${activeRecord.flagged_for_review ? "flagged" : ""}`}
                  onClick={() => handleFlag(activeRecord)}
                >
                  {activeRecord.flagged_for_review ? "⚑ Flagged" : "⚐ Flag for Review"}
                </button>
                <button className="button-primary" onClick={() => setActiveRecord(null)}>
                  Close
                </button>
              </div>
            </div>
            
            {/* AI Summary Card */}
            <div className="ai-summary-card glass-panel">
              <h3>AI CALL SUMMARY</h3>
              <div className="summary-grid">
                <div className="summary-item">
                  <label>Customer</label>
                  <span>{activeRecord.caller_name || "Unknown"}</span>
                </div>
                <div className="summary-item">
                  <label>Phone</label>
                  <span>{activeRecord.caller_phone || activeRecord.caller_id || "--"}</span>
                </div>
                <div className="summary-item">
                  <label>Issue Type</label>
                  <span>{activeRecord.issue_type || "N/A"}</span>
                </div>
                <div className="summary-item">
                  <label>Duration</label>
                  <span>{formatDuration(activeRecord.duration)}</span>
                </div>
                <div className="summary-item">
                  <label>Outcome</label>
                  <span className={`badge ${outcomeTone(activeRecord.status || activeRecord.outcome)}`}>
                    {activeRecord.status || activeRecord.outcome || "Inquiry"}
                  </span>
                </div>
                <div className="summary-item">
                  <label>Sentiment</label>
                  <span className={`sentiment-badge ${getSentimentClass(activeRecord.sentiment)}`}>
                    {activeRecord.sentiment || "Neutral"}
                  </span>
                </div>
                <div className="summary-item">
                  <label>Booked</label>
                  <span className={activeRecord.appointment_booked ? "text-green" : "text-muted"}>
                    {activeRecord.appointment_booked ? "Yes ✓" : "No"}
                  </span>
                </div>
                {activeRecord.service_address && (
                  <div className="summary-item full-width">
                    <label>Service Address</label>
                    <span>{activeRecord.service_address}</span>
                  </div>
                )}
              </div>
              <div className="summary-text-section">
                <label>Summary</label>
                <p className="summary-text">{activeRecord.summary || "No summary available."}</p>
              </div>
            </div>
            
            {/* Audio Player with Waveform */}
            {activeRecord.recording_url && (
              <div className="audio-section glass-panel">
                <h4>Recording</h4>
                <div className="audio-player-container">
                  <button
                    className="play-btn large"
                    onClick={() => togglePlay(activeRecord)}
                  >
                    {playingId === activeRecord.id && isPlaying ? "❚❚" : "▶"}
                  </button>
                  <div className="waveform-container">
                    {playingId === activeRecord.id ? (
                      <WaveformVisualizer 
                        audioRef={audioRef}
                        isPlaying={isPlaying}
                        playingId={playingId}
                        recordId={activeRecord.id}
                      />
                    ) : (
                      <div className="waveform-placeholder">Click play to visualize</div>
                    )}
                  </div>
                  <a
                    className="download-btn"
                    href={activeRecord.recording_url}
                    download={`recording-${activeRecord.id}.mp3`}
                  >
                    ⬇ Download
                  </a>
                </div>
              </div>
            )}
            
            {/* Transcript Section */}
            <div className="transcript-section glass-panel">
              <h4>Full Transcript</h4>
              <div className="blackbox-transcript">
                {activeRecord.transcript || "No transcript available."}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
