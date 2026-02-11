import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { SCRIPT_CATEGORIES, SCRIPTS } from "../lib/salesScripts.js";

// Persist notes in localStorage
const NOTES_STORAGE_KEY = "kryonex_live_scripts_notes";

export default function AdminLiveScriptsPage() {
  const navigate = useNavigate();
  const [activeScript, setActiveScript] = React.useState("intro");
  const [openScripts, setOpenScripts] = React.useState(["intro"]);
  const [notes, setNotes] = React.useState(() => {
    try {
      return localStorage.getItem(NOTES_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });
  const [objectionModal, setObjectionModal] = React.useState(null);
  const [toast, setToast] = React.useState("");
  const [expandedSections, setExpandedSections] = React.useState({ intro: true });

  // Save notes to localStorage
  React.useEffect(() => {
    try {
      localStorage.setItem(NOTES_STORAGE_KEY, notes);
    } catch {
      // Ignore storage errors
    }
  }, [notes]);

  // Refs for scrolling to sections
  const sectionRefs = React.useRef({});

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 2000);
  };

  const handleCategoryClick = (categoryId) => {
    setActiveScript(categoryId);
    if (!openScripts.includes(categoryId)) {
      setOpenScripts([...openScripts, categoryId]);
    }
    setExpandedSections((prev) => ({ ...prev, [categoryId]: true }));
    
    // Scroll to the section after a brief delay to allow expansion
    setTimeout(() => {
      sectionRefs.current[categoryId]?.scrollIntoView({ 
        behavior: "smooth", 
        block: "start" 
      });
    }, 100);
  };

  const handleCloseScript = (categoryId, e) => {
    e.stopPropagation();
    setOpenScripts((prev) => prev.filter((id) => id !== categoryId));
    setExpandedSections((prev) => {
      const next = { ...prev };
      delete next[categoryId];
      return next;
    });
    if (activeScript === categoryId) {
      const remaining = openScripts.filter((id) => id !== categoryId);
      setActiveScript(remaining[remaining.length - 1] || "intro");
    }
  };

  const toggleSection = (categoryId) => {
    setExpandedSections((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }));
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text.replace(/\*\*/g, "").replace(/\n---\n/g, "\n\n"));
    showToast("Copied to clipboard!");
  };

  const clearNotes = () => {
    if (window.confirm("Clear all notes?")) {
      setNotes("");
      showToast("Notes cleared");
    }
  };

  // Parse markdown-style bold for display
  const renderContent = (content) => {
    const lines = content.split("\n");
    return lines.map((line, i) => {
      // Handle horizontal rules
      if (line.trim() === "---") {
        return <hr key={i} className="my-4 border-white/10" />;
      }
      // Handle bold text
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      return (
        <div key={i} className={line.trim() === "" ? "h-3" : ""}>
          {parts.map((part, j) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return (
                <strong key={j} className="text-neon-cyan font-semibold">
                  {part.slice(2, -2)}
                </strong>
              );
            }
            // Handle italic with *text*
            if (part.startsWith("*") && part.endsWith("*") && !part.startsWith("**")) {
              return (
                <em key={j} className="text-white/70 italic">
                  {part.slice(1, -1)}
                </em>
              );
            }
            return <span key={j}>{part}</span>;
          })}
        </div>
      );
    });
  };

  return (
    <div className="min-h-screen bg-void-black text-white relative overflow-hidden">
      <TopMenu />
      <div className="absolute inset-0 bg-grid-lines opacity-30" />
      <div className="absolute -top-28 right-0 h-72 w-72 rounded-full bg-neon-cyan/10 blur-[140px]" />
      <div className="absolute bottom-0 left-0 h-96 w-96 rounded-full bg-neon-purple/10 blur-[160px]" />

      <div className="relative z-10 px-4 py-6 dashboard-layout w-full">
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

        <div className="space-y-4">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel rounded-2xl p-4 border border-white/10"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/50">
                  Sales Command
                </p>
                <h1 className="mt-1 text-2xl font-semibold">Live Script Templates</h1>
              </div>
              <div className="text-xs text-white/40">
                {openScripts.length} scripts open
              </div>
            </div>
          </motion.div>

          {/* 3-Panel Layout */}
          <div className="grid gap-4" style={{ gridTemplateColumns: "220px 1fr 280px" }}>
            {/* Left Sidebar - Categories */}
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="glass-panel rounded-2xl border border-white/10 p-3 h-[calc(100vh-200px)] overflow-y-auto"
            >
              <div className="text-[10px] uppercase tracking-widest text-white/40 mb-3 px-2">
                Script Categories
              </div>
              <div className="space-y-1">
                {SCRIPT_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => handleCategoryClick(cat.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${
                      activeScript === cat.id
                        ? "bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30"
                        : openScripts.includes(cat.id)
                        ? "bg-white/10 text-white/90 border border-white/10"
                        : "text-white/60 hover:bg-white/5 hover:text-white/80 border border-transparent"
                    }`}
                  >
                    <span className="mr-2">{cat.icon}</span>
                    {cat.label}
                  </button>
                ))}
              </div>
            </motion.div>

            {/* Main Script Panel */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-panel rounded-2xl border border-white/10 h-[calc(100vh-200px)] overflow-hidden flex flex-col"
            >
              {/* Tabs */}
              <div className="flex items-center gap-1 p-2 border-b border-white/10 overflow-x-auto flex-shrink-0">
                {openScripts.map((scriptId) => {
                  const cat = SCRIPT_CATEGORIES.find((c) => c.id === scriptId);
                  return (
                    <button
                      key={scriptId}
                      onClick={() => {
                        setActiveScript(scriptId);
                        setExpandedSections((prev) => ({ ...prev, [scriptId]: true }));
                        setTimeout(() => {
                          sectionRefs.current[scriptId]?.scrollIntoView({ 
                            behavior: "smooth", 
                            block: "start" 
                          });
                        }, 50);
                      }}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition ${
                        activeScript === scriptId
                          ? "bg-neon-cyan/20 text-neon-cyan"
                          : "text-white/60 hover:bg-white/10"
                      }`}
                    >
                      <span>{cat?.icon}</span>
                      <span>{cat?.label}</span>
                      <button
                        onClick={(e) => handleCloseScript(scriptId, e)}
                        className="ml-1 text-white/40 hover:text-white/80"
                      >
                        ×
                      </button>
                    </button>
                  );
                })}
              </div>

              {/* Script Content - Accordion Style */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {openScripts.map((scriptId) => {
                  const script = SCRIPTS[scriptId];
                  const cat = SCRIPT_CATEGORIES.find((c) => c.id === scriptId);
                  const isExpanded = expandedSections[scriptId];

                  return (
                    <div
                      key={scriptId}
                      ref={(el) => (sectionRefs.current[scriptId] = el)}
                      className={`rounded-xl border transition-all ${
                        activeScript === scriptId
                          ? "border-neon-cyan/30 bg-black/40"
                          : "border-white/10 bg-black/20"
                      }`}
                    >
                      {/* Accordion Header */}
                      <button
                        onClick={() => {
                          toggleSection(scriptId);
                          setActiveScript(scriptId);
                        }}
                        className="w-full flex items-center justify-between p-3 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span>{cat?.icon}</span>
                          <span className="font-medium">{script?.title}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(script?.content || "");
                            }}
                            className="text-[10px] px-2 py-1 rounded bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
                          >
                            Copy
                          </button>
                          <span className="text-white/40">{isExpanded ? "▼" : "▶"}</span>
                        </div>
                      </button>

                      {/* Accordion Content */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-4 text-sm text-white/80 leading-relaxed">
                              {renderContent(script?.content || "")}

                              {/* Objection Sub-Items */}
                              {script?.hasSubItems && script.subItems && (
                                <div className="mt-4 pt-4 border-t border-white/10">
                                  <div className="text-[10px] uppercase tracking-widest text-white/40 mb-3">
                                    Quick Handlers (Click for Summary)
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    {script.subItems.map((item) => (
                                      <button
                                        key={item.id}
                                        onClick={() => setObjectionModal(item)}
                                        className="text-left px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white/70 hover:bg-neon-purple/10 hover:border-neon-purple/30 hover:text-white transition"
                                      >
                                        {item.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}

                {openScripts.length === 0 && (
                  <div className="text-center text-white/40 py-12">
                    Click a category on the left to load a script
                  </div>
                )}
              </div>
            </motion.div>

            {/* Right Notes Panel */}
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="glass-panel rounded-2xl border border-white/10 h-[calc(100vh-200px)] flex flex-col"
            >
              <div className="p-3 border-b border-white/10 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-widest text-white/40">
                    Call Notes
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyToClipboard(notes)}
                      className="text-[10px] px-2 py-1 rounded bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
                      disabled={!notes.trim()}
                    >
                      Copy
                    </button>
                    <button
                      onClick={clearNotes}
                      className="text-[10px] px-2 py-1 rounded bg-white/10 text-white/60 hover:bg-neon-pink/20 hover:text-neon-pink"
                      disabled={!notes.trim()}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Take notes during the call...

- Lead name:
- Business:
- Pain points:
- Objections:
- Next steps:
- Follow-up date:"
                className="flex-1 w-full bg-transparent text-sm text-white/80 p-3 resize-none outline-none placeholder:text-white/30"
              />
              <div className="p-2 border-t border-white/10 text-[10px] text-white/30 text-center flex-shrink-0">
                Notes persist across sessions
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Objection Modal */}
      <AnimatePresence>
        {objectionModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setObjectionModal(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-panel rounded-2xl border border-neon-purple/30 p-5 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="text-lg font-semibold text-neon-purple">
                  {objectionModal.label}
                </div>
                <button
                  onClick={() => setObjectionModal(null)}
                  className="text-white/40 hover:text-white text-xl"
                >
                  ×
                </button>
              </div>
              <p className="text-white/80 text-sm leading-relaxed mb-4">
                {objectionModal.summary}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    copyToClipboard(objectionModal.summary);
                  }}
                  className="flex-1 py-2 rounded-xl bg-neon-purple/20 text-neon-purple text-sm hover:bg-neon-purple/30 transition"
                >
                  Copy to Clipboard
                </button>
                <button
                  onClick={() => setObjectionModal(null)}
                  className="px-4 py-2 rounded-xl bg-white/10 text-white/60 text-sm hover:bg-white/20 transition"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-neon-green/20 border border-neon-green/40 text-neon-green text-sm">
          {toast}
        </div>
      )}
    </div>
  );
}
