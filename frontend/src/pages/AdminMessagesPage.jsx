import React from "react";
import { motion } from "framer-motion";
import {
  Bolt,
  Mail,
  MessageSquare,
  Phone,
  Send,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { getSavedState, saveState } from "../lib/persistence.js";

const CHANNEL_ICON = {
  sms: MessageSquare,
  email: Mail,
  whatsapp: Phone,
};

const MACROS = [
  "Booking Confirmed ✅",
  "Sending price list now.",
  "Technician is en route.",
  "Can we confirm your address?",
];

const mockThreads = [
  {
    id: "thread-1",
    name: "Apex Plumbing",
    channel: "sms",
    unread: 2,
    messages: [
      { id: 1, from: "client", text: "Do you handle emergency leaks?", time: "2:18 PM", channel: "sms" },
      { id: 2, from: "system", text: "We can dispatch within 30 mins. Need your address.", time: "2:19 PM", channel: "sms" },
    ],
  },
  {
    id: "thread-2",
    name: "Northwind HVAC",
    channel: "email",
    unread: 0,
    messages: [
      { id: 1, from: "client", text: "Can I get a quote for 2 locations?", time: "1:05 PM", channel: "email" },
      { id: 2, from: "system", text: "Absolutely. Please share addresses and preferred time.", time: "1:06 PM", channel: "email" },
    ],
  },
  {
    id: "thread-3",
    name: "Ridgeway HVAC",
    channel: "whatsapp",
    unread: 1,
    messages: [
      { id: 1, from: "client", text: "Are you open this weekend?", time: "11:32 AM", channel: "whatsapp" },
    ],
  },
];

const getSuggestions = (thread) => {
  const last = thread.messages[thread.messages.length - 1]?.text || "";
  if (last.toLowerCase().includes("quote")) {
    return ["We can do that. Which addresses?", "Are both sites in the same city?", "We offer multi-location pricing tiers."];
  }
  if (last.toLowerCase().includes("weekend")) {
    return ["Yes, we have weekend coverage.", "We can schedule Saturday or Sunday.", "Any preferred time window?"];
  }
  return ["Got it — can you share your address?", "Thanks! What time works best?", "We can dispatch in 30 minutes."];
};

export default function AdminMessagesPage() {
  const navigate = useNavigate();
  const [threads, setThreads] = React.useState(() => getSavedState("messages.threads") || mockThreads);
  const [activeId, setActiveId] = React.useState(() => getSavedState("messages.activeId") || mockThreads[0]?.id);
  const [draft, setDraft] = React.useState(() => getSavedState("messages.draft") || "");
  const [showMacros, setShowMacros] = React.useState(false);
  const [typing, setTyping] = React.useState(false);

  const persistThreads = (value) => {
    setThreads(value);
    saveState("messages.threads", value);
  };

  const updateThreads = (updater) => {
    setThreads((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveState("messages.threads", next);
      return next;
    });
  };

  const persistActiveId = (value) => {
    setActiveId(value);
    saveState("messages.activeId", value);
  };

  const persistDraft = (value) => {
    setDraft(value);
    saveState("messages.draft", value);
  };

  const activeThread = threads.find((thread) => thread.id === activeId) || threads[0];
  const suggestions = activeThread ? getSuggestions(activeThread) : [];

  const handleArchiveThread = (threadId) => {
    updateThreads((prev) => {
      const next = prev.filter((thread) => thread.id !== threadId);
      const nextActive = next[0]?.id || "";
      persistActiveId(nextActive);
      return next;
    });
  };

  const handleResetThreads = () => {
    persistThreads(mockThreads);
    persistActiveId(mockThreads[0]?.id || "");
    persistDraft("");
  };

  const sendMessage = (text) => {
    if (!text.trim() || !activeThread) return;
    updateThreads((prev) =>
      prev.map((thread) => {
        if (thread.id !== activeThread.id) return thread;
        return {
          ...thread,
          messages: [
            ...thread.messages,
            {
              id: Date.now(),
              from: "agent",
              text,
              time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              channel: thread.channel,
            },
          ],
        };
      })
    );
    persistDraft("");
    setTyping(true);
    setTimeout(() => {
      updateThreads((prev) =>
        prev.map((thread) => {
          if (thread.id !== activeThread.id) return thread;
          return {
            ...thread,
            messages: [
              ...thread.messages,
              {
                id: Date.now() + 1,
                from: "system",
                text: "Follow-up queued. Awaiting client response.",
                time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                channel: thread.channel,
              },
            ],
          };
        })
      );
      setTyping(false);
    }, 1600);
  };

  return (
    <div className="min-h-screen bg-void-black text-white relative overflow-hidden">
      <TopMenu />
      <div className="absolute inset-0 bg-grid-lines opacity-35" />
      <div className="absolute -top-20 right-0 h-72 w-72 rounded-full bg-neon-purple/20 blur-[140px]" />
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
            <div className="flex items-center justify-between flex-wrap gap-6">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-white/50">
                  Tactical Comms Link
                </p>
                <h1 className="mt-2 text-3xl font-semibold">Messages</h1>
                <p className="mt-2 text-white/60">
                  Orchestrate omnichannel conversations with AI-accelerated replies.
                </p>
              </div>
              <div className="status-live">
                <Sparkles size={12} /> {threads.length} active threads
              </div>
              <button className="button-secondary" onClick={handleResetThreads} type="button">
                Reset Data
              </button>
            </div>
          </motion.div>

          <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="glass-panel rounded-3xl border border-white/10 bg-black/40 p-4">
              <div className="text-xs uppercase tracking-[0.4em] text-white/50 mb-4">
                Threads
              </div>
              <div className="space-y-3 max-h-[620px] overflow-y-auto pr-1">
                {threads.length ? (
                  threads.map((thread) => {
                    const Icon = CHANNEL_ICON[thread.channel] || MessageSquare;
                    return (
                      <button
                        key={thread.id}
                        onClick={() => persistActiveId(thread.id)}
                        className={`thread-item ${
                          thread.id === activeId ? "active" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Icon size={16} className="text-neon-cyan" />
                            <div>
                              <div className="text-sm font-semibold">{thread.name}</div>
                              <div className="text-xs text-white/40">
                                {thread.messages[thread.messages.length - 1]?.text}
                              </div>
                            </div>
                          </div>
                          {thread.unread ? (
                            <span className="thread-unread">{thread.unread}</span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="text-white/60 px-2">No threads archived yet.</div>
                )}
              </div>
            </div>

            <div className="glass-panel rounded-3xl border border-white/10 bg-black/40 p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.4em] text-white/50">
                    Active Thread
                  </div>
                  <div className="text-lg font-semibold">{activeThread?.name}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="status-live">Omnichannel Online</div>
                  {activeThread ? (
                    <button
                      className="button-secondary"
                      onClick={() => handleArchiveThread(activeThread.id)}
                      type="button"
                    >
                      Archive
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="glass-panel rounded-2xl border border-white/10 p-4">
                <div className="text-xs uppercase tracking-widest text-white/40 mb-2">
                  AI Suggested Replies
                </div>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((reply) => (
                    <button
                      key={reply}
                      className="suggestion-pill"
                      onClick={() => sendMessage(reply)}
                    >
                      {reply}
                    </button>
                  ))}
                </div>
              </div>

              <div className="chat-window">
                {activeThread?.messages?.length ? (
                  activeThread.messages.map((message) => {
                    const Icon = CHANNEL_ICON[message.channel] || MessageSquare;
                    return (
                      <div
                        key={message.id}
                        className={`chat-bubble ${message.from}`}
                      >
                        <div className="flex items-center gap-2 text-xs text-white/50">
                          <Icon size={12} />
                          {message.time}
                        </div>
                        <div className="text-sm">{message.text}</div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-white/60">No active thread selected.</div>
                )}
                {typing ? <div className="typing-indicator">System is typing…</div> : null}
              </div>

              <div className="glass-panel rounded-2xl border border-white/10 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs uppercase tracking-widest text-white/40">
                    Send Message
                  </div>
                  <button
                    className="macro-button"
                    onClick={() => setShowMacros((prev) => !prev)}
                  >
                    <Bolt size={14} /> Macros
                  </button>
                </div>
                {showMacros ? (
                  <div className="macro-panel">
                    {MACROS.map((macro) => (
                    <button
                      key={macro}
                      className="macro-item"
                      onClick={() => {
                        persistDraft(macro);
                        setShowMacros(false);
                      }}
                    >
                        {macro}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="flex gap-3 mt-3">
                    <input
                      className="glass-input w-full text-sm text-white"
                      placeholder="Type your response..."
                      value={draft}
                      onChange={(event) => persistDraft(event.target.value)}
                    />
                  <button className="glow-button" onClick={() => sendMessage(draft)}>
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
