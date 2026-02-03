import React from "react";
import { useNavigate } from "react-router-dom";
import { Search, RefreshCw, MapPin, CheckCircle, Clock, AlertCircle, Phone } from "lucide-react";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { getMessages, getSubscriptionStatus, getAppointments } from "../lib/api";
import { supabase } from "../lib/supabase";

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

const formatAppointmentTime = (dateString) => {
  if (!dateString) return "--";
  const date = new Date(dateString);
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

// Quick actions - only these are allowed (tied to appointments)
const QUICK_ACTIONS = [
  {
    id: "enroute",
    label: "EN ROUTE",
    icon: MapPin,
    description: "Tech is on the way",
    source: "quick_action_enroute",
    tone: "tactical-green",
  },
  {
    id: "arrived",
    label: "ARRIVED",
    icon: CheckCircle,
    description: "Tech has arrived",
    source: "quick_action_arrived",
    tone: "tactical-cyan",
  },
  {
    id: "complete",
    label: "COMPLETE",
    icon: Clock,
    description: "Service finished",
    source: "quick_action_complete",
    tone: "tactical-purple",
  },
];

// Keyword badge colors
const KEYWORD_BADGES = {
  stop: { label: "OPT-OUT", color: "text-red-400 bg-red-400/10" },
  unsubscribe: { label: "OPT-OUT", color: "text-red-400 bg-red-400/10" },
  help: { label: "HELP", color: "text-amber-400 bg-amber-400/10" },
  yes: { label: "CONFIRMED", color: "text-green-400 bg-green-400/10" },
  confirm: { label: "CONFIRMED", color: "text-green-400 bg-green-400/10" },
  ok: { label: "OK", color: "text-green-400 bg-green-400/10" },
  no: { label: "DECLINED", color: "text-red-400 bg-red-400/10" },
  reschedule: { label: "RESCHEDULE", color: "text-amber-400 bg-amber-400/10" },
  collision_pending: { label: "ROUTING...", color: "text-purple-400 bg-purple-400/10" },
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
  const [appointments, setAppointments] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [status, setStatus] = React.useState("");
  const [businessName, setBusinessName] = React.useState("");
  const [subscription, setSubscription] = React.useState({ status: "none", plan_type: null });
  const [selectedAppointment, setSelectedAppointment] = React.useState(null);
  const [search, setSearch] = React.useState("");
  const [fatalError, setFatalError] = React.useState("");
  const [lastRefresh, setLastRefresh] = React.useState(new Date());
  const [activeTab, setActiveTab] = React.useState("inbound"); // inbound | all

  // Load messages
  const loadMessages = React.useCallback(async () => {
    try {
      const response = await getMessages();
      const nextMessages = Array.isArray(response.data?.messages)
        ? response.data.messages
        : [];
      setMessages(nextMessages);
      setLastRefresh(new Date());
    } catch (err) {
      setMessages([]);
      console.error("Failed to load messages:", err);
    }
  }, []);

  // Load today's appointments for quick actions
  const loadAppointments = React.useCallback(async () => {
    try {
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
      const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();
      
      const response = await getAppointments(startOfDay, endOfDay);
      const appts = Array.isArray(response.data?.appointments)
        ? response.data.appointments.filter(a => a.status !== "cancelled")
        : [];
      setAppointments(appts);
      
      // Auto-select first appointment if none selected
      if (appts.length > 0 && !selectedAppointment) {
        setSelectedAppointment(appts[0]);
      }
    } catch (err) {
      setAppointments([]);
      console.error("Failed to load appointments:", err);
    }
  }, [selectedAppointment]);

  // Initial load
  const load = React.useCallback(async () => {
    setLoading(true);
    await Promise.all([loadMessages(), loadAppointments()]);
    setLoading(false);
  }, [loadMessages, loadAppointments]);

  React.useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh every 15 seconds
  React.useEffect(() => {
    const interval = setInterval(loadMessages, 15000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  // Load user data
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
      
      const { data: profile } = await supabase
        .from("profiles")
        .select("business_name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (mounted) {
        setBusinessName(profile?.business_name || "");
      }
      
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

  // Send quick action SMS via API
  const handleQuickAction = async (action) => {
    if (!selectedAppointment) {
      setStatus("Select an appointment first.");
      return;
    }
    
    if (!selectedAppointment.customer_phone) {
      setStatus("Appointment has no customer phone.");
      return;
    }

    setStatus("");
    setSending(true);
    
    try {
      const token = (await supabase.auth.getSession()).data?.session?.access_token;
      
      // Build message based on action type
      let messageBody = "";
      switch (action.id) {
        case "enroute":
          messageBody = `Your technician is on the way! ETA approximately 15-30 minutes.`;
          break;
        case "arrived":
          messageBody = `Your technician has arrived at the location.`;
          break;
        case "complete":
          messageBody = `Service complete. Thank you for choosing ${businessName || "us"}!`;
          break;
        default:
          messageBody = `Update from ${businessName || "your service provider"}.`;
      }
      
      const response = await fetch(`${import.meta.env.VITE_API_URL || ""}/send-sms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to: selectedAppointment.customer_phone,
          body: messageBody,
          source: action.source,
          appointmentId: selectedAppointment.id,
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || "Failed to send");
      }
      
      setStatus(`${action.label} sent to ${selectedAppointment.customer_name || "customer"}!`);
      await loadMessages();
    } catch (err) {
      const errorMsg = err.message || "Unable to send message.";
      // Handle specific error codes
      if (errorMsg.includes("FREEFORM_NOT_ALLOWED")) {
        setStatus("Only quick actions are allowed. Select an action above.");
      } else if (errorMsg.includes("OUTBOUND_THROTTLE")) {
        setStatus("Sending too fast. Please wait a moment.");
      } else if (errorMsg.includes("USAGE_CAP_REACHED")) {
        setStatus("SMS limit reached. Upgrade your plan.");
      } else {
        setStatus(toStatusText(errorMsg));
      }
    } finally {
      setSending(false);
    }
  };

  // Filter messages
  const inboundMessages = messages.filter(m => m.direction === "inbound");
  const filteredMessages = (activeTab === "inbound" ? inboundMessages : messages)
    .slice()
    .reverse()
    .filter((message) =>
      search
        ? String(message.body || "")
            .toLowerCase()
            .includes(search.trim().toLowerCase()) ||
          String(message.from_number || "")
            .includes(search.trim())
        : true
    );

  // Get keyword badge for a message
  const getKeywordBadge = (message) => {
    const keyword = message.keyword_detected?.toLowerCase();
    if (keyword && KEYWORD_BADGES[keyword]) {
      return KEYWORD_BADGES[keyword];
    }
    if (message.auto_handled) {
      return { label: "AUTO", color: "text-blue-400 bg-blue-400/10" };
    }
    return null;
  };

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

            {/* Header */}
            <div className="glass-panel rounded-3xl border border-white/10 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.4em] text-white/50">
                    SMS Notification Center
                  </p>
                  <h1 className="mt-2 text-3xl font-semibold">COMMS DECK</h1>
                  <p className="mt-1 text-white/60 max-w-xl">
                    Send appointment notifications to customers. All messages are logged and tracked.
                  </p>
                </div>
                <button 
                  className="icon-button" 
                  onClick={load}
                  disabled={loading}
                  title="Refresh"
                >
                  <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                </button>
              </div>
            </div>

            {/* Quick Actions Panel */}
            <div className="glass-panel rounded-3xl border border-white/10 p-6 space-y-4">
              <div>
                <div className="text-xs uppercase tracking-[0.4em] text-white/50">
                  Outbound Actions
                </div>
                <h2 className="text-lg font-semibold mt-1">Send Notification</h2>
              </div>

              {/* Appointment Selector */}
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest text-white/50">
                  Select Appointment
                </label>
                {appointments.length === 0 ? (
                  <div className="text-white/40 text-sm py-3">
                    No appointments today. Quick actions require an active appointment.
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {appointments.slice(0, 5).map((appt) => (
                      <button
                        key={appt.id}
                        onClick={() => setSelectedAppointment(appt)}
                        className={`text-left p-3 rounded-xl border transition-all ${
                          selectedAppointment?.id === appt.id
                            ? "border-neon-cyan bg-neon-cyan/10"
                            : "border-white/10 hover:border-white/30 bg-white/5"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">
                              {appt.customer_name || "Customer"}
                            </div>
                            <div className="text-sm text-white/50">
                              {formatAppointmentTime(appt.start_time)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-white/40">
                              {appt.customer_phone || "No phone"}
                            </div>
                            <div className={`text-xs mt-1 ${
                              appt.status === "confirmed" ? "text-green-400" :
                              appt.status === "booked" ? "text-cyan-400" :
                              "text-white/40"
                            }`}>
                              {appt.status?.toUpperCase() || "PENDING"}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick Action Buttons */}
              <div className="quick-action-grid">
                {QUICK_ACTIONS.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.id}
                      className={`quick-action ${action.tone} ${!selectedAppointment ? "opacity-50" : ""}`}
                      type="button"
                      onClick={() => handleQuickAction(action)}
                      disabled={sending || !selectedAppointment}
                    >
                      <Icon size={20} className="mb-1" />
                      <span className="text-xs tracking-[0.4em]">{action.label}</span>
                      <small className="quick-action-subtext">{action.description}</small>
                    </button>
                  );
                })}
              </div>

              {/* Status */}
              {status && (
                <div className={`text-sm ${status.includes("sent") ? "text-green-400" : "text-amber-400"}`}>
                  {toStatusText(status)}
                </div>
              )}
            </div>

            {/* Inbound Intel Section */}
            <div className="glass-panel rounded-3xl border border-white/10 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.4em] text-white/50">
                    Customer Responses
                  </div>
                  <h2 className="text-lg font-semibold">Inbound Intel</h2>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveTab("inbound")}
                    className={`px-3 py-1 rounded-lg text-xs uppercase tracking-wider transition-all ${
                      activeTab === "inbound"
                        ? "bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30"
                        : "bg-white/5 text-white/50 border border-white/10 hover:border-white/30"
                    }`}
                  >
                    Inbound ({inboundMessages.length})
                  </button>
                  <button
                    onClick={() => setActiveTab("all")}
                    className={`px-3 py-1 rounded-lg text-xs uppercase tracking-wider transition-all ${
                      activeTab === "all"
                        ? "bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30"
                        : "bg-white/5 text-white/50 border border-white/10 hover:border-white/30"
                    }`}
                  >
                    All ({messages.length})
                  </button>
                </div>
              </div>

              {/* Search */}
              <div className="intel-search">
                <Search size={16} className="text-white/60" />
                <input
                  className="glass-input"
                  placeholder="Search messages..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              {/* Message List */}
              <div className="intel-log max-h-[400px] overflow-y-auto">
                {loading && messages.length === 0 ? (
                  <div className="text-white/40 text-center py-8">Loading messages...</div>
                ) : filteredMessages.length === 0 ? (
                  <div className="text-white/40 text-center py-8">
                    {search ? "No messages match your search." : "No messages yet."}
                  </div>
                ) : (
                  filteredMessages.map((message) => {
                    const badge = getKeywordBadge(message);
                    return (
                      <div key={message.id} className="intel-entry">
                        <div className="intel-meta">
                          <span className={message.direction === "inbound" ? "text-green-400" : "text-cyan-400"}>
                            {message.direction === "inbound" ? "← IN" : "→ OUT"}
                          </span>
                          {badge && (
                            <span className={`px-2 py-0.5 rounded-full text-[0.65rem] uppercase tracking-wider ${badge.color}`}>
                              {badge.label}
                            </span>
                          )}
                          <span className="text-white/40">
                            {formatRelativeTime(message.created_at || message.timestamp)}
                          </span>
                          <span className="text-white/50 font-mono text-xs">
                            {message.from_number || message.to_number || "—"}
                          </span>
                        </div>
                        <div className="intel-body">{message.body || "—"}</div>
                        {message.routing_method && message.direction === "inbound" && (
                          <div className="text-[0.65rem] text-white/30 mt-1">
                            Routed via: {message.routing_method.replace(/_/g, " ")}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="text-xs text-white/30 text-center">
                {loading ? "Syncing..." : `Auto-refresh every 15s • ${filteredMessages.length} messages`}
              </div>
            </div>

            {/* Info Panel */}
            <div className="glass-panel rounded-3xl border border-white/10 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />
                <div className="text-sm text-white/60">
                  <strong className="text-white/80">Notification-Only Mode:</strong> SMS is restricted to appointment notifications. 
                  Customers can reply with keywords like YES, NO, STOP, or RESCHEDULE. 
                  All other replies are logged for your review.
                </div>
              </div>
            </div>
          </div>
        </MessagesErrorBoundary>
      </div>
    </div>
  );
}
