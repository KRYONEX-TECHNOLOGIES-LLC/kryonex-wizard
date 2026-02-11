import React from "react";
import { assistantConfirm, assistantExecute } from "../../lib/api.js";
import { useAssistant } from "./AssistantContext.jsx";

const QUICK_ACTIONS = [
  { id: "command_brief", label: "Today’s Command Brief" },
  { id: "bookings_capacity", label: "Bookings + Capacity" },
  { id: "missed_recovery", label: "Missed Call Recovery" },
  { id: "ad_builder", label: "Ad Builder" },
  { id: "optimize_setup", label: "Optimize My Setup" },
];

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  React.useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
}

export default function AssistantRoot() {
  const { open, setOpen } = useAssistant();
  const isMobile = useIsMobile();

  const [tab, setTab] = React.useState("ops"); // ops | chat
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [cards, setCards] = React.useState([]);
  const [proposals, setProposals] = React.useState([]);
  const [suggestions, setSuggestions] = React.useState([]);
  const [chatInput, setChatInput] = React.useState("");
  const [chatLog, setChatLog] = React.useState([]); // {role, text}

  const runExecute = async (payload) => {
    setError("");
    setLoading(true);
    try {
      const res = await assistantExecute(payload);
      const data = res.data || {};
      setCards(data.cards || []);
      setProposals(data.proposals || []);
      setSuggestions(data.suggestions || []);
      return data;
    } catch (e) {
      setError(e.userMessage || e.message || "Assistant failed.");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const runQuickAction = async (id) => {
    setTab("ops");
    await runExecute({ quick_action: id, mode: "ops" });
  };

  const submitChat = async (e) => {
    e?.preventDefault?.();
    const msg = String(chatInput || "").trim();
    if (!msg || loading) return;
    setChatInput("");
    setTab("chat");
    setChatLog((prev) => [...prev, { role: "user", text: msg }]);
    const data = await runExecute({ message: msg, mode: "chat" });
    const firstCard = (data?.cards || [])[0];
    const assistantText = firstCard?.body || "Done.";
    setChatLog((prev) => [...prev, { role: "assistant", text: assistantText }]);
  };

  const confirmProposal = async (proposalId) => {
    setError("");
    setLoading(true);
    try {
      await assistantConfirm(proposalId);
      // Remove proposal from list and show success card
      setProposals((prev) => prev.filter((p) => p.id !== proposalId));
      setCards((prev) => [
        { id: `ok-${Date.now()}`, type: "note", title: "Applied", body: "Change confirmed and applied." },
        ...prev,
      ]);
    } catch (e) {
      setError(e.userMessage || e.message || "Confirm failed.");
    } finally {
      setLoading(false);
    }
  };

  const close = () => setOpen(false);

  return (
    <>
      {/* FAB */}
      <button
        type="button"
        className="assistant-fab"
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close assistant" : "Open assistant"}
      >
        <span className="assistant-fab-icon">⚡</span>
      </button>

      {/* Overlay */}
      {open ? <div className="assistant-overlay" onClick={close} /> : null}

      {/* Panel / Drawer */}
      <div
        className={
          isMobile
            ? `assistant-drawer ${open ? "open" : ""}`
            : `assistant-panel ${open ? "open" : ""}`
        }
        aria-hidden={!open}
      >
        <div className="assistant-header">
          <div>
            <div className="assistant-kicker">AI HELPER</div>
            <div className="assistant-title">City Domination OS</div>
          </div>
          <button type="button" className="assistant-close" onClick={close}>
            ×
          </button>
        </div>

        <div className="assistant-tabs">
          <button
            type="button"
            className={`assistant-tab ${tab === "ops" ? "active" : ""}`}
            onClick={() => setTab("ops")}
          >
            Ops
          </button>
          <button
            type="button"
            className={`assistant-tab ${tab === "chat" ? "active" : ""}`}
            onClick={() => setTab("chat")}
          >
            Chat
          </button>
        </div>

        {error ? <div className="assistant-error">{error}</div> : null}

        <div className="assistant-body">
          {tab === "ops" ? (
            <>
              <div className="assistant-actions">
                {QUICK_ACTIONS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="assistant-action"
                    onClick={() => runQuickAction(a.id)}
                    disabled={loading}
                  >
                    {a.label}
                  </button>
                ))}
              </div>

              <div className="assistant-cards">
                {loading ? (
                  <div className="assistant-loading">Working...</div>
                ) : null}
                {(proposals || []).map((p) => (
                  <div key={p.id} className="assistant-card proposal">
                    <div className="assistant-card-title">Confirm to apply</div>
                    <div className="assistant-card-body">{p.summary || p.kind}</div>
                    {p.diff ? (
                      <pre className="assistant-diff">{JSON.stringify(p.diff, null, 2)}</pre>
                    ) : null}
                    <button
                      type="button"
                      className="assistant-confirm"
                      onClick={() => confirmProposal(p.id)}
                      disabled={loading}
                    >
                      Confirm
                    </button>
                  </div>
                ))}
                {(cards || []).map((c) => (
                  <div key={c.id} className="assistant-card">
                    {c.title ? <div className="assistant-card-title">{c.title}</div> : null}
                    <div className="assistant-card-body">{c.body}</div>
                  </div>
                ))}
              </div>

              {(suggestions || []).length ? (
                <div className="assistant-suggestions">
                  {(suggestions || []).slice(0, 6).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="assistant-suggestion"
                      onClick={() => runExecute({ message: s.label, mode: "chat" })}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="assistant-chat-log">
                {chatLog.map((m, idx) => (
                  <div
                    key={`${m.role}-${idx}`}
                    className={`assistant-bubble ${m.role === "user" ? "user" : "assistant"}`}
                  >
                    {m.text}
                  </div>
                ))}
              </div>
              <form className="assistant-chat-input" onSubmit={submitChat}>
                <input
                  className="assistant-input"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask for analytics, bookings, ads, or setup fixes…"
                />
                <button type="submit" className="assistant-send" disabled={loading}>
                  Send
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );
}

