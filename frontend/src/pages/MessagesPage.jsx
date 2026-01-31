import React from "react";
import { useNavigate } from "react-router-dom";
import { Search, RefreshCw } from "lucide-react";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { getMessages, sendSms, getSubscriptionStatus } from "../lib/api";
import { normalizePhone } from "../lib/phone.js";
import { supabase } from "../lib/supabase";

const formatTime = (value) => {
  if (!value) return "--";
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "2-digit",
  });
};

const QUICK_ACTIONS = [
  {
    label: "EN ROUTE",
    statusText: "EN ROUTE sent",
    payload: "Technician is en route to your location now. See you soon.",
    tone: "tactical-green",
  },
  {
    label: "ARRIVED",
    statusText: "ARRIVED sent",
    payload: "Technician has arrived at the location.",
    tone: "tactical-cyan",
  },
  {
    label: "DELAYED",
    statusText: "DELAYED sent",
    payload:
      "Running slightly behind schedule due to traffic. Will update shortly.",
    tone: "tactical-amber",
  },
  {
    label: "GATE ACCESS",
    statusText: "GATE ACCESS sent",
    payload: "Technician is at the gate/door. Please provide access.",
    tone: "tactical-purple",
  },
  {
    label: "COMPLETE",
    statusText: "COMPLETE sent",
    payload: "Service complete. Thank you for choosing {business}.",
    tone: "tactical-slate",
  },
];

// Relative time formatting
const formatRelativeTime = (dateString) => {
  if (!dateString) return "--";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const toStatusText = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message || "Unknown error";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

class MessagesErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "Unknown error" };
  }

  componentDidCatch(error) {
    console.error("MessagesPage error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="glass-panel rounded-3xl border border-white/10 p-6">
          <div className="text-xs uppercase tracking-[0.4em] text-white/50">
            Comms Deck Offline
          </div>
          <h1 className="mt-2 text-2xl font-semibold">Render Error</h1>
          <p className="mt-2 text-white/60">
            The page hit an unexpected error. Reload and try again.
          </p>
          <div className="deck-status mt-3">{this.state.message}</div>
          <button
            className="glow-button deck-action mt-4"
            type="button"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function MessagesPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [status, setStatus] = React.useState("");
  const [businessName, setBusinessName] = React.useState("");
  const [subscription, setSubscription] = React.useState({ status: "none", plan_type: null });
  const [form, setForm] = React.useState({
    to: "",
    body: "",
  });
  const [search, setSearch] = React.useState("");
  const [fatalError, setFatalError] = React.useState("");
  const [lastRefresh, setLastRefresh] = React.useState(new Date());

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await getMessages();
      const nextMessages = Array.isArray(response.data?.messages)
        ? response.data.messages
        : [];
      setMessages(nextMessages);
      setLastRefresh(new Date());
    } catch (err) {
      setMessages([]);
      setStatus(
        toStatusText(err.response?.data?.error || err.response?.data || err.message) ||
          "Unable to load message log."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  React.useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh every 10 seconds
  React.useEffect(() => {
    const interval = setInterval(() => {
      load();
    }, 10000);
    return () => clearInterval(interval);
  }, [load]);

  React.useEffect(() => {
    let mounted = true;
    const handleUnhandled = (event) => {
      if (!mounted) return;
      const message =
        event?.reason?.message ||
        event?.reason?.toString?.() ||
        "Unexpected error";
      setFatalError(message);
    };
    window.addEventListener("unhandledrejection", handleUnhandled);
    
    const loadUserData = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) return;
      
      // Load business name
      const { data: profile } = await supabase
        .from("profiles")
        .select("business_name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (mounted) {
        setBusinessName(profile?.business_name || "");
      }
      
      // Load subscription status
      try {
        const subRes = await getSubscriptionStatus();
        if (mounted) {
          setSubscription(subRes.data || { status: "none", plan_type: null });
        }
      } catch {
        // ignore
      }
    };
    loadUserData();
    return () => {
      mounted = false;
      window.removeEventListener("unhandledrejection", handleUnhandled);
    };
  }, []);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const sendSmsPayload = async (payload, statusText = null) => {
    if (!form.to.trim()) {
      setStatus("Target phone required.");
      return;
    }
    setStatus("");
    setSending(true);
    try {
      const resolvedPayload = payload.includes("{business}")
        ? payload.replace("{business}", businessName || "us")
        : payload;
      await sendSms({
        to: form.to.trim(),
        body: resolvedPayload,
        source: "user_app",
      });
      setStatus(statusText || "Message sent!");
      setForm((prev) => ({ ...prev, body: "" }));
      await load();
    } catch (err) {
      setStatus(
        toStatusText(err.response?.data?.error || err.response?.data || err.message) ||
          "Unable to fire message."
      );
    } finally {
      setSending(false);
    }
  };

  const handleSend = async () => {
    if (!form.to.trim() || !form.body.trim()) {
      setStatus("Enter a number and a message.");
      return;
    }
    await sendSmsPayload(form.body.trim(), "Message sent!");
  };

  const handleQuickAction = (event, action) => {
    event.preventDefault();
    event.stopPropagation();
    sendSmsPayload(action.payload, action.statusText);
  };

  const filteredLog = (Array.isArray(messages) ? messages : [])
    .slice()
    .reverse()
    .filter((message) =>
      search
        ? String(message.body || "")
            .toLowerCase()
            .includes(search.trim().toLowerCase())
        : true
    );

  return (
    <div className="min-h-screen bg-void-black text-white relative overflow-hidden">
      <TopMenu />
      <div className="absolute inset-0 bg-grid-lines opacity-30" />
      <div className="relative z-10 px-6 py-10 dashboard-layout w-full">
        <SideNav
          onUpgrade={() => navigate("/billing")}
          onNewAgent={() => navigate("/wizard?new=1")}
          billingStatus={subscription.status}
          tier={subscription.plan_type}
          lastUpdated={lastRefresh}
        />

        <MessagesErrorBoundary>
          <div className="space-y-6">
            {fatalError ? (
              <div className="glass-panel rounded-3xl border border-white/10 p-6">
                <div className="text-xs uppercase tracking-[0.4em] text-white/50">
                  Comms Deck Offline
                </div>
                <h1 className="mt-2 text-2xl font-semibold">Runtime Error</h1>
                <p className="mt-2 text-white/60">
                  An error interrupted the message console. Reload to continue.
                </p>
                <div className="deck-status mt-3">{fatalError}</div>
                <button
                  className="glow-button deck-action mt-4"
                  type="button"
                  onClick={() => window.location.reload()}
                >
                  Reload
                </button>
              </div>
            ) : null}
            <div className="glass-panel rounded-3xl border border-white/10 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.4em] text-white/50">
                    SMS Command Center
                  </p>
                  <h1 className="mt-2 text-3xl font-semibold">COMMS DECK</h1>
                  <p className="mt-1 text-white/60 max-w-xl">
                    Tactical quick actions for live deployments plus a terminal-inspired intel stream
                    from every inbound/outbound webhook event.
                  </p>
                </div>
                <button 
                  className="icon-button" 
                  onClick={load}
                  disabled={loading}
                  title="Refresh messages"
                >
                  <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                </button>
              </div>
            </div>

            <div className="glass-panel rounded-3xl border border-white/10 p-6 space-y-6">
              <div className="quick-action-grid">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    className={`quick-action ${action.tone}`}
                    type="button"
                    onClick={(event) => handleQuickAction(event, action)}
                    disabled={sending}
                  >
                    <span className="text-xs tracking-[0.4em]">{action.label}</span>
                    <small className="quick-action-subtext">
                      {action.payload}
                    </small>
                  </button>
                ))}
              </div>
              <div className="messages-form compact">
                <div className="messages-form-row">
                  <label className="deck-label">Recipient Phone</label>
                  <input
                    className="glass-input"
                    placeholder="+1 555 220 1399"
                    value={form.to}
                    onChange={(event) => handleChange("to", event.target.value)}
                    onBlur={(event) => {
                      const normalized = normalizePhone(event.target.value);
                      if (normalized) {
                        handleChange("to", normalized);
                      }
                    }}
                  />
                </div>
              </div>
              <div className="status-row">
                {status ? <span className="deck-status">{toStatusText(status)}</span> : null}
                <span className="text-xs text-white/40">
                  {loading ? "Syncing…" : `${filteredLog.length} entries • Auto-refresh on`}
                </span>
              </div>
              <div className="intel-search">
                <Search size={16} className="text-white/60" />
                <input
                  className="glass-input"
                  placeholder="Search intel (e.g., gate code)"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>

            <div className="glass-panel rounded-3xl border border-white/10 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.4em] text-white/50">
                    Intel Stream
                  </div>
                  <h2 className="text-lg font-semibold">
                    Terminal Log {loading ? "(syncing…)" : ""}
                  </h2>
                </div>
              </div>
              <div className="intel-log">
                {filteredLog.length ? (
                  filteredLog.map((message) => (
                    <div key={message.id} className="intel-entry">
                      <div className="intel-meta">
                        <span className={message.direction === "inbound" ? "text-green-400" : "text-cyan-400"}>
                          {message.direction?.toUpperCase() || "UNKNOWN"}
                        </span>
                        <span>{formatRelativeTime(message.created_at || message.timestamp)}</span>
                        <span>{message.phone || "—"}</span>
                      </div>
                      <div className="intel-body">{message.body || "—"}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-white/60">No log entries match your search.</div>
                )}
              </div>
            </div>

            <div className="glass-panel rounded-3xl border border-white/10 p-4 compact-input">
              <div className="messages-form compact">
                <div className="messages-form-row">
                  <label className="deck-label">Custom Message</label>
                  <textarea
                    className="glass-input"
                    rows={2}
                    placeholder="Type a quick SMS..."
                    value={form.body}
                    onChange={(event) => handleChange("body", event.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <button
                  className="glow-button deck-action w-full"
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !form.body.trim()}
                >
                  {sending ? "Sending…" : "Send SMS"}
                </button>
              </div>
            </div>
          </div>
        </MessagesErrorBoundary>
      </div>
    </div>
  );
}
