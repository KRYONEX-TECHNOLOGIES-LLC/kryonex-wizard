import React from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Brain, Zap, Play } from "lucide-react";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { fetchCallRecordings, updateCallFeedback } from "../lib/api.js";

const QA_TAGS = [
  "Going Off Script",
  "Low Energy",
  "Missed Objection",
  "Rude/Unprofessional",
];

const formatDuration = (seconds = 0) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.max(0, seconds % 60);
  return `${mins}m ${secs}s`;
};

export default function AdminBlackBoxPage() {
  const navigate = useNavigate();
  const [calls, setCalls] = React.useState([]);
  const [activeId, setActiveId] = React.useState(null);
  const [feedback, setFeedback] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [waveSeed, setWaveSeed] = React.useState(1);
  const activeCall =
    calls.find((call) => call.id === activeId) || calls[0] || null;

  React.useEffect(() => {
    const load = async () => {
      try {
        const response = await fetchCallRecordings({
          outcome: ["Hangup", "Not Interested"].join(","),
          limit: 80,
        });
        const recordingList = response.data?.recordings || [];
        setCalls(recordingList);
        setActiveId(recordingList[0]?.id || null);
      } catch (err) {
        console.error(err);
      }
    };
    load();
  }, []);

  const renderWave = () => {
    const seed = waveSeed + (activeCall?.id?.length || 0);
    return Array.from({ length: 48 }).map((_, idx) => {
      const level = 10 + ((idx * 7 + seed) % 40);
      const mood = idx % 5 === 0 ? "negative" : idx % 3 === 0 ? "neutral" : "positive";
      return (
        <span
          key={`${activeCall?.id || "wave"}-${idx}`}
          className={`wave-bar ${mood}`}
          style={{ height: `${level}px` }}
        />
      );
    });
  };

  const toggleTag = (tag) => {
    if (!activeCall) return;
    const next = activeCall.qa_flags || [];
    const contains = next.includes(tag);
    const updated = contains ? next.filter((item) => item !== tag) : [...next, tag];
    setCalls((prev) =>
      prev.map((call) =>
        call.id === activeCall.id ? { ...call, qa_flags: updated } : call
      )
    );
  };

  const submitFeedback = async (flagged = false) => {
    if (!activeCall) return;
    setSaving(true);
    try {
      await updateCallFeedback(activeCall.id, {
        qaFlags: activeCall.qa_flags || [],
        managerNotes: feedback,
        flaggedForReview: flagged || activeCall.flagged_for_review,
      });
      setFeedback("");
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-void-black text-white relative overflow-hidden">
      <TopMenu />
      <div className="absolute inset-0 bg-grid-lines opacity-30" />
      <div className="absolute top-0 right-0 h-72 w-72 rounded-full bg-neon-pink/20 blur-[140px]" />
      <div className="absolute bottom-0 left-0 h-96 w-96 rounded-full bg-neon-cyan/10 blur-[160px]" />

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
                  Sales Quality Assurance
                </p>
                <h1 className="mt-2 text-3xl font-semibold">Black Box</h1>
                <p className="mt-2 text-white/60">
                  Review human seller misses, capture coaching tags, and flag for training.
                </p>
              </div>
              <div className="glass-panel rounded-2xl border border-white/10 px-5 py-4">
                <div className="text-xs uppercase tracking-widest text-white/50">
                  Coaching Opportunities
                </div>
                <div className="mt-2 text-2xl font-mono text-neon-pink">
                  {calls.length}
                </div>
              </div>
            </div>
          </motion.div>

          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="glass-panel rounded-3xl border border-white/10 bg-black/40 p-4">
              <div className="text-xs uppercase tracking-[0.4em] text-white/50 mb-4">
                Failed Calls
              </div>
              <div className="grid grid-cols-[1.6fr_1fr_0.9fr_0.8fr] gap-2 text-[0.65rem] uppercase tracking-[0.3em] text-white/40 border-b border-white/10 pb-2">
                <div>Seller</div>
                <div>Lead</div>
                <div>Duration</div>
                <div>Outcome</div>
              </div>
              <div className="space-y-3 max-h-[620px] overflow-y-auto pr-1 mt-2">
                {calls.map((call) => (
                  <button
                    key={call.id}
                    onClick={() => {
                      setActiveId(call.id);
                      setWaveSeed((prev) => prev + 1);
                    }}
                    className={`blackbox-item grid grid-cols-[1.6fr_1fr_0.9fr_0.8fr] gap-2 rounded-2xl border border-white/5 bg-black/30 px-4 py-3 text-left transition ${
                      call.id === activeCall?.id ? "border-neon-cyan/60" : ""
                    }`}
                  >
                    <div className="text-sm font-semibold text-white">
                      {call.seller_name}
                    </div>
                    <div className="text-xs text-white/40">{call.lead_name}</div>
                    <div className="text-xs text-white/40">
                      {formatDuration(call.duration)}
                    </div>
                    <div className="text-xs text-neon-pink">{call.outcome}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="glass-panel rounded-3xl border border-white/10 bg-black/40 p-6 space-y-5">
              {activeCall ? (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs uppercase tracking-[0.4em] text-white/40">
                        Autopsy
                      </div>
                      <div className="text-lg font-semibold mt-1">
                        {activeCall.lead_name}
                      </div>
                    </div>
                    <div className="text-xs text-white/50">
                      Seller {activeCall.seller_name}
                    </div>
                  </div>

                  <div className="glass-panel rounded-2xl border border-white/10 p-4 space-y-3">
                    <div className="text-xs uppercase tracking-widest text-white/40">
                      Audio Player
                    </div>
                    <div className="blackbox-wave">{renderWave()}</div>
                    {activeCall.recording_url ? (
                      <audio
                        className="w-full"
                        controls
                        src={activeCall.recording_url}
                      />
                    ) : (
                      <div className="text-xs text-white/50">
                        Recording unavailable.
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs text-white/40">
                      <span>Signal Strength</span>
                      <span>{formatDuration(activeCall.duration)}</span>
                    </div>
                  </div>

                  <div className="glass-panel rounded-2xl border border-white/10 p-4 space-y-3">
                    <div className="text-xs uppercase tracking-widest text-white/40">
                      Coaching Tags
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {QA_TAGS.map((tag) => (
                        <button
                          key={tag}
                          className={`pill-toggle ${
                            activeCall.qa_flags?.includes(tag) ? "active" : ""
                          }`}
                          onClick={() => toggleTag(tag)}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                    <div className="text-xs text-white/50 uppercase tracking-[0.3em] flex items-center gap-2">
                      <Zap size={14} className="text-neon-pink" />
                      Manager Feedback
                    </div>
                    <textarea
                      className="glass-input w-full min-h-[120px] text-xs text-white"
                      placeholder="Manager Feedback"
                      value={feedback}
                      onChange={(event) => setFeedback(event.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="glow-button"
                        onClick={() => submitFeedback(false)}
                        disabled={saving}
                      >
                        Save Feedback
                      </button>
                      <button
                        className="button-primary"
                        onClick={() => submitFeedback(true)}
                        disabled={saving}
                      >
                        Flag for Review
                      </button>
                    </div>
                  </div>

                  <div className="glass-panel rounded-2xl border border-white/10 p-4 flex items-center justify-between">
                    <div className="text-xs text-white/50 uppercase tracking-widest">
                      Review Flag
                    </div>
                    <div className="text-sm text-neon-green flex items-center gap-2">
                      <Play size={14} />
                      {activeCall.flagged_for_review ? "Training Example" : "Not flagged"}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-white/60">Select a call for analysis.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
