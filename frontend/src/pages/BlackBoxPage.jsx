import React from "react";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { fetchUserCallRecordings } from "../lib/api";
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
  return "badge-inquiry";
};

const MOCK_DATA = [
  {
    id: 1,
    caller_id: "+1 (555) 019-2834",
    caller_name: "John Doe (Lead)",
    duration: "03:12",
    status: "booked",
    created_at: "2026-01-23T10:42:00",
    recording_url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  },
  {
    id: 2,
    caller_id: "+1 (555) 999-8888",
    caller_name: "Unknown Caller",
    duration: "00:45",
    status: "missed",
    created_at: "2026-01-23T09:15:00",
    recording_url: null,
  },
  {
    id: 3,
    caller_id: "Sarah Smith",
    caller_name: "Sarah Smith",
    duration: "05:30",
    status: "inquiry",
    created_at: "2026-01-22T16:20:00",
    recording_url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  },
];

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
  const audioRef = React.useRef(new Audio());
  const displayRecords = records.length ? records : MOCK_DATA;
  const filteredRecords = React.useMemo(() => {
    const needle = searchTerm.toLowerCase().trim();
    if (!needle) return displayRecords;
    return displayRecords.filter((row) =>
      `${
        row.caller_name || ""
      } ${row.caller_phone || row.caller_id || ""}`.toLowerCase().includes(needle)
    );
  }, [displayRecords, searchTerm]);
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

  React.useEffect(() => {
    const audio = audioRef.current;
    const handleEnded = () => setIsPlaying(false);
    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.pause();
      audio.removeEventListener("ended", handleEnded);
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
              placeholder="Search caller name or phone..."
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
                  <div key={row.id} className="blackbox-row">
                    <span className="blackbox-time">{formatTimestamp(row.created_at)}</span>
                    <span className="blackbox-caller">
                      {row.caller_name}
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
                      <span className="waveform">
                        <span />
                        <span />
                        <span />
                        <span />
                      </span>
                    </span>
                    <span className="blackbox-actions">
                      <button
                        className="action-button"
                        onClick={() => setActiveRecord(row)}
                      >
                        View Transcript
                      </button>
                      {row.recording_url ? (
                        <a
                          className="action-button"
                          href={row.recording_url}
                          download={`recording-${row.id}.mp3`}
                          onClick={handleDownloadClick}
                        >
                          Download
                        </a>
                      ) : (
                        <span className="action-button muted">Download</span>
                      )}
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

      {activeRecord ? (
        <>
          <div className="slide-overlay" onClick={() => setActiveRecord(null)} />
          <div className="slide-panel">
            <div className="slide-panel-header">
              <div>
                <div className="war-room-kicker">TRANSCRIPT</div>
                <div className="war-room-title" style={{ fontSize: "1.4rem" }}>
                  {activeRecord.caller_name}
                </div>
              </div>
              <button className="button-primary" onClick={() => setActiveRecord(null)}>
                Close
              </button>
            </div>
            <div className="blackbox-transcript">
              {activeRecord.transcript || "No transcript available."}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
