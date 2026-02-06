import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Webhook,
  Plus,
  Trash2,
  Check,
  X,
  AlertTriangle,
  Settings,
  Play,
  RefreshCw,
  ExternalLink,
  Clock,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  Zap,
  MessageSquare,
  Code,
  FileSpreadsheet,
  Users,
  Database,
  History,
  RotateCcw,
  CheckCircle,
  XCircle,
  Timer,
} from "lucide-react";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { getWebhooks, createWebhook, updateWebhook, deleteWebhook, testWebhook, getWebhookDeliveries, retryWebhookDelivery } from "../lib/api";
import { supabase } from "../lib/supabase";

const AVAILABLE_EVENTS = [
  { id: "call_ended", label: "Call Ended", description: "When a call completes" },
  { id: "call_started", label: "Call Started", description: "When a call begins" },
  { id: "appointment_booked", label: "Appointment Booked", description: "New appointment created" },
  { id: "appointment_updated", label: "Appointment Updated", description: "Appointment modified" },
  { id: "lead_created", label: "Lead Created", description: "New lead from call" },
  { id: "sms_received", label: "SMS Received", description: "Inbound text message" },
];

// Example payloads for documentation
const EXAMPLE_PAYLOADS = {
  call_ended: {
    call_id: "call_abc123",
    agent_id: "agent_xyz",
    user_id: "user_456",
    duration_seconds: 245,
    recording_url: "https://storage.kryonex.com/recordings/abc123.mp3",
    transcript: "Hello, thank you for calling Acme Plumbing...",
    from_number: "+15551234567",
    to_number: "+15559876543",
    disposition: "completed",
    lead_id: "lead_789",
    customer_name: "John Smith",
    customer_phone: "+15551234567",
    summary: "Customer needs water heater repair. Scheduled for tomorrow.",
    sentiment: "positive",
    service_address: "123 Main St, Austin TX",
    issue_type: "water_heater",
    call_outcome: "appointment_booked",
    appointment_booked: true,
    ended_at: "2026-02-06T14:30:00Z",
  },
  call_started: {
    call_id: "call_abc123",
    agent_id: "agent_xyz",
    user_id: "user_456",
    from_number: "+15551234567",
    to_number: "+15559876543",
    direction: "inbound",
    started_at: "2026-02-06T14:25:00Z",
  },
  appointment_booked: {
    appointment_id: "appt_001",
    cal_booking_uid: "cal_abc123",
    user_id: "user_456",
    customer_name: "John Smith",
    customer_phone: "+15551234567",
    start_time: "2026-02-07T10:00:00Z",
    end_time: "2026-02-07T11:00:00Z",
    location: "123 Main St, Austin TX 78701",
    notes: "Water heater not producing hot water",
    source: "api",
    eta_link: "https://app.kryonex.com/track/abc123",
    created_at: "2026-02-06T14:30:00Z",
  },
  lead_created: {
    lead_id: "lead_789",
    user_id: "user_456",
    agent_id: "agent_xyz",
    call_id: "call_abc123",
    name: "John Smith",
    phone: "+15551234567",
    status: "new",
    summary: "Customer needs water heater repair",
    sentiment: "positive",
    service_address: "123 Main St, Austin TX",
    issue_type: "water_heater",
    call_outcome: "appointment_booked",
    appointment_booked: true,
    recording_url: "https://storage.kryonex.com/recordings/abc123.mp3",
    call_duration_seconds: 245,
    created_at: "2026-02-06T14:30:00Z",
  },
  sms_received: {
    user_id: "user_456",
    agent_id: "agent_xyz",
    from_number: "+15551234567",
    body: "Yes, I confirm my appointment for tomorrow at 10am",
    direction: "inbound",
    keyword_detected: null,
    is_opt_out: false,
    received_at: "2026-02-06T15:00:00Z",
  },
};

export default function IntegrationsPage() {
  const navigate = useNavigate();
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    url: "",
    events: [],
    secret: "",
  });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [showSecret, setShowSecret] = useState(false);
  const [isSeller, setIsSeller] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeDocsTab, setActiveDocsTab] = useState("zapier");
  const [expandedPayload, setExpandedPayload] = useState(null);
  const [copiedPayload, setCopiedPayload] = useState(null);
  
  // Delivery history state
  const [expandedDeliveries, setExpandedDeliveries] = useState(null);
  const [deliveries, setDeliveries] = useState({});
  const [deliveriesLoading, setDeliveriesLoading] = useState({});
  const [retrying, setRetrying] = useState({});

  const loadWebhooks = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getWebhooks();
      setWebhooks(res.data?.webhooks || []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Error loading webhooks:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWebhooks();
  }, [loadWebhooks]);

  useEffect(() => {
    let mounted = true;
    const loadRole = async () => {
      const { data } = await supabase.auth.getSession();
      const user = data?.session?.user;
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
    return () => { mounted = false; };
  }, []);

  const handleAddNew = () => {
    setEditingId(null);
    setFormData({ name: "", url: "", events: [], secret: "" });
    setFormError("");
    setShowForm(true);
  };

  const handleEdit = (webhook) => {
    setEditingId(webhook.id);
    setFormData({
      name: webhook.name,
      url: webhook.url,
      events: webhook.events || [],
      secret: "", // Don't prefill secret
    });
    setFormError("");
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormError("");
  };

  const handleEventToggle = (eventId) => {
    setFormData(prev => ({
      ...prev,
      events: prev.events.includes(eventId)
        ? prev.events.filter(e => e !== eventId)
        : [...prev.events, eventId],
    }));
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setFormError("Name is required");
      return;
    }
    if (!formData.url.trim()) {
      setFormError("URL is required");
      return;
    }
    if (formData.events.length === 0) {
      setFormError("Select at least one event");
      return;
    }

    try {
      setSaving(true);
      setFormError("");

      if (editingId) {
        await updateWebhook(editingId, {
          name: formData.name,
          url: formData.url,
          events: formData.events,
          secret: formData.secret || undefined,
        });
      } else {
        await createWebhook({
          name: formData.name,
          url: formData.url,
          events: formData.events,
          secret: formData.secret || undefined,
        });
      }

      setShowForm(false);
      setEditingId(null);
      loadWebhooks();
    } catch (err) {
      setFormError(err.response?.data?.error || "Failed to save webhook");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this webhook?")) return;

    try {
      await deleteWebhook(id);
      loadWebhooks();
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const handleToggleActive = async (webhook) => {
    try {
      await updateWebhook(webhook.id, { is_active: !webhook.is_active });
      loadWebhooks();
    } catch (err) {
      console.error("Toggle error:", err);
    }
  };

  const handleTest = async (id) => {
    try {
      setTestingId(id);
      setTestResult(null);
      const res = await testWebhook(id);
      setTestResult({ id, ...res.data });
    } catch (err) {
      setTestResult({ id, ok: false, error: err.message });
    } finally {
      setTestingId(null);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const copyPayload = (eventId) => {
    const payload = EXAMPLE_PAYLOADS[eventId];
    if (payload) {
      navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopiedPayload(eventId);
      setTimeout(() => setCopiedPayload(null), 2000);
    }
  };

  // Load deliveries for a webhook
  const loadDeliveries = async (webhookId) => {
    if (deliveries[webhookId]) return; // Already loaded
    
    try {
      setDeliveriesLoading(prev => ({ ...prev, [webhookId]: true }));
      const res = await getWebhookDeliveries(webhookId, { limit: 20 });
      setDeliveries(prev => ({ ...prev, [webhookId]: res.data?.deliveries || [] }));
    } catch (err) {
      console.error("Load deliveries error:", err);
    } finally {
      setDeliveriesLoading(prev => ({ ...prev, [webhookId]: false }));
    }
  };

  // Toggle delivery history view
  const toggleDeliveries = (webhookId) => {
    if (expandedDeliveries === webhookId) {
      setExpandedDeliveries(null);
    } else {
      setExpandedDeliveries(webhookId);
      loadDeliveries(webhookId);
    }
  };

  // Retry a failed delivery
  const handleRetryDelivery = async (webhookId, deliveryId) => {
    try {
      setRetrying(prev => ({ ...prev, [deliveryId]: true }));
      const res = await retryWebhookDelivery(webhookId, deliveryId);
      
      // Refresh deliveries
      const deliveriesRes = await getWebhookDeliveries(webhookId, { limit: 20 });
      setDeliveries(prev => ({ ...prev, [webhookId]: deliveriesRes.data?.deliveries || [] }));
      
      if (res.data?.success) {
        // Optionally show success message
      }
    } catch (err) {
      console.error("Retry error:", err);
    } finally {
      setRetrying(prev => ({ ...prev, [deliveryId]: false }));
    }
  };

  // Get delivery status badge
  const getDeliveryStatusBadge = (status) => {
    switch (status) {
      case "delivered":
        return { icon: CheckCircle, color: "#10b981", label: "Delivered" };
      case "failed":
        return { icon: XCircle, color: "#f59e0b", label: "Failed" };
      case "exhausted":
        return { icon: XCircle, color: "#ef4444", label: "Exhausted" };
      case "pending":
        return { icon: Timer, color: "#6366f1", label: "Pending" };
      default:
        return { icon: Clock, color: "#94a3b8", label: status || "Unknown" };
    }
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
          {/* Hero Section */}
          <div className="integrations-hero">
            <div className="hero-content">
              <h1 className="hero-title">Connect Kryonex to 5,000+ Apps</h1>
              <p className="hero-subtitle">
                Send real-time call data, leads, and appointments to your favorite tools automatically.
                No code required.
              </p>
              <div className="hero-logos">
                <div className="logo-badge" title="Zapier">
                  <Zap size={24} />
                  <span>Zapier</span>
                </div>
                <div className="logo-badge" title="Slack">
                  <MessageSquare size={24} />
                  <span>Slack</span>
                </div>
                <div className="logo-badge" title="Google Sheets">
                  <FileSpreadsheet size={24} />
                  <span>Sheets</span>
                </div>
                <div className="logo-badge" title="HubSpot">
                  <Users size={24} />
                  <span>HubSpot</span>
                </div>
                <div className="logo-badge" title="Salesforce">
                  <Database size={24} />
                  <span>Salesforce</span>
                </div>
                <div className="logo-badge" title="Custom API">
                  <Code size={24} />
                  <span>Custom</span>
                </div>
              </div>
            </div>
            <div className="hero-actions">
              <button className="button-primary button-lg" onClick={handleAddNew}>
                <Plus size={20} />
                Add Webhook
              </button>
            </div>
          </div>

          {/* Premium Badge */}
          <div className="integration-premium-notice">
            <Webhook size={20} />
            <div>
              <strong>Zapier & Webhook Integration</strong>
              <p>Connect Kryonex to thousands of apps. Send data to your CRM, Google Sheets, Slack, and more.</p>
            </div>
            <span className="premium-badge">$49/mo Add-On</span>
          </div>

          {/* Webhook Form */}
          {showForm && (
            <div className="webhook-form-card glass-panel">
              <h3>{editingId ? "Edit Webhook" : "New Webhook"}</h3>
              
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="My Zapier Integration"
                  className="glass-input"
                />
              </div>

              <div className="form-group">
                <label>Webhook URL</label>
                <input
                  type="url"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  placeholder="https://hooks.zapier.com/..."
                  className="glass-input"
                />
                <span className="form-hint">
                  Get this URL from Zapier, Make.com, or your custom endpoint
                </span>
              </div>

              <div className="form-group">
                <label>Events to Send</label>
                <div className="events-grid">
                  {AVAILABLE_EVENTS.map(event => (
                    <label key={event.id} className="event-checkbox">
                      <input
                        type="checkbox"
                        checked={formData.events.includes(event.id)}
                        onChange={() => handleEventToggle(event.id)}
                      />
                      <span className="checkbox-custom"></span>
                      <div className="event-info">
                        <span className="event-label">{event.label}</span>
                        <span className="event-desc">{event.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>
                  Secret Key (Optional)
                  <button 
                    type="button" 
                    className="show-secret-btn"
                    onClick={() => setShowSecret(!showSecret)}
                  >
                    {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </label>
                <input
                  type={showSecret ? "text" : "password"}
                  value={formData.secret}
                  onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
                  placeholder="For HMAC signature verification"
                  className="glass-input"
                />
                <span className="form-hint">
                  If set, we'll sign requests with X-Kryonex-Signature header
                </span>
              </div>

              {formError && (
                <div className="form-error">
                  <AlertTriangle size={16} />
                  {formError}
                </div>
              )}

              <div className="form-actions">
                <button className="btn-secondary" onClick={handleCancel}>
                  Cancel
                </button>
                <button className="btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : (editingId ? "Update Webhook" : "Create Webhook")}
                </button>
              </div>
            </div>
          )}

          {/* Webhooks List */}
          <div className="webhooks-list">
            {loading ? (
              <div className="webhooks-loading">
                <div className="loading-spinner" />
                <p>Loading webhooks...</p>
              </div>
            ) : webhooks.length === 0 ? (
              <div className="webhooks-empty">
                <Webhook size={48} />
                <p>No webhooks configured</p>
                <span>Add a webhook to start sending data to external apps</span>
                <button className="btn-primary" onClick={handleAddNew}>
                  <Plus size={18} />
                  Add Your First Webhook
                </button>
              </div>
            ) : (
              webhooks.map(webhook => (
                <div key={webhook.id} className={`webhook-card ${webhook.is_active ? "active" : "inactive"}`}>
                  <div className="webhook-header">
                    <div className="webhook-info">
                      <div className="webhook-status">
                        <span className={`status-dot ${webhook.is_active ? "active" : "inactive"}`} />
                        <h4>{webhook.name}</h4>
                      </div>
                      <p className="webhook-url">{webhook.url}</p>
                    </div>
                    
                    <div className="webhook-actions">
                      <button 
                        className="action-btn test"
                        onClick={() => handleTest(webhook.id)}
                        disabled={testingId === webhook.id}
                        title="Test Webhook"
                      >
                        {testingId === webhook.id ? (
                          <RefreshCw size={16} className="spinning" />
                        ) : (
                          <Play size={16} />
                        )}
                      </button>
                      <button 
                        className="action-btn toggle"
                        onClick={() => handleToggleActive(webhook)}
                        title={webhook.is_active ? "Disable" : "Enable"}
                      >
                        {webhook.is_active ? <Check size={16} /> : <X size={16} />}
                      </button>
                      <button 
                        className="action-btn edit"
                        onClick={() => handleEdit(webhook)}
                        title="Edit"
                      >
                        <Settings size={16} />
                      </button>
                      <button 
                        className="action-btn delete"
                        onClick={() => handleDelete(webhook.id)}
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="webhook-events">
                    {(webhook.events || []).map(event => {
                      const eventInfo = AVAILABLE_EVENTS.find(e => e.id === event);
                      return (
                        <span key={event} className="event-tag">
                          {eventInfo?.label || event}
                        </span>
                      );
                    })}
                  </div>

                  <div className="webhook-stats">
                    <span>
                      <Check size={14} />
                      {webhook.stats?.successful_deliveries || 0} delivered
                    </span>
                    <span>
                      <Clock size={14} />
                      {webhook.stats?.total_deliveries || 0} total
                    </span>
                    <span>
                      Created {formatDate(webhook.created_at)}
                    </span>
                  </div>

                  {/* Test Result */}
                  {testResult?.id === webhook.id && (
                    <div className={`test-result ${testResult.ok ? "success" : "error"}`}>
                      {testResult.ok ? (
                        <>
                          <Check size={16} />
                          Test successful! Status: {testResult.status_code}
                        </>
                      ) : (
                        <>
                          <AlertTriangle size={16} />
                          Test failed: {testResult.error || `Status ${testResult.status_code}`}
                        </>
                      )}
                    </div>
                  )}

                  {/* Delivery History Toggle */}
                  <button 
                    className={`delivery-history-toggle ${expandedDeliveries === webhook.id ? "expanded" : ""}`}
                    onClick={() => toggleDeliveries(webhook.id)}
                  >
                    <History size={16} />
                    <span>Delivery History</span>
                    {expandedDeliveries === webhook.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  {/* Delivery History Panel */}
                  {expandedDeliveries === webhook.id && (
                    <div className="delivery-history-panel">
                      {deliveriesLoading[webhook.id] ? (
                        <div className="loading-state">
                          <RefreshCw size={18} className="spinning" />
                          <span>Loading deliveries...</span>
                        </div>
                      ) : (deliveries[webhook.id]?.length || 0) === 0 ? (
                        <div className="empty-state">
                          <span>No deliveries yet</span>
                        </div>
                      ) : (
                        <div className="deliveries-list">
                          {deliveries[webhook.id].map(delivery => {
                            const statusBadge = getDeliveryStatusBadge(delivery.delivery_status);
                            const StatusIcon = statusBadge.icon;
                            const canRetry = delivery.delivery_status === "failed" || delivery.delivery_status === "exhausted";
                            
                            return (
                              <div key={delivery.id} className={`delivery-item ${delivery.delivery_status}`}>
                                <div className="delivery-info">
                                  <div className="delivery-status" style={{ color: statusBadge.color }}>
                                    <StatusIcon size={14} />
                                    <span>{statusBadge.label}</span>
                                  </div>
                                  <div className="delivery-event">{delivery.event_type}</div>
                                  <div className="delivery-time">{formatDate(delivery.created_at)}</div>
                                </div>
                                <div className="delivery-details">
                                  {delivery.status_code && (
                                    <span className="status-code">HTTP {delivery.status_code}</span>
                                  )}
                                  {delivery.retry_count > 0 && (
                                    <span className="retry-count">{delivery.retry_count} retries</span>
                                  )}
                                  {delivery.last_error && (
                                    <span className="error-preview" title={delivery.last_error}>
                                      {delivery.last_error.substring(0, 50)}...
                                    </span>
                                  )}
                                </div>
                                {canRetry && (
                                  <button
                                    className="retry-btn"
                                    onClick={() => handleRetryDelivery(webhook.id, delivery.id)}
                                    disabled={retrying[delivery.id]}
                                    title="Retry delivery"
                                  >
                                    {retrying[delivery.id] ? (
                                      <RefreshCw size={14} className="spinning" />
                                    ) : (
                                      <RotateCcw size={14} />
                                    )}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Tabbed Documentation */}
          <div className="integration-docs glass-panel">
            <h4>Setup Guides</h4>
            <div className="docs-tabs">
              <button 
                className={`docs-tab ${activeDocsTab === "zapier" ? "active" : ""}`}
                onClick={() => setActiveDocsTab("zapier")}
              >
                <Zap size={16} />
                Zapier
              </button>
              <button 
                className={`docs-tab ${activeDocsTab === "slack" ? "active" : ""}`}
                onClick={() => setActiveDocsTab("slack")}
              >
                <MessageSquare size={16} />
                Slack
              </button>
              <button 
                className={`docs-tab ${activeDocsTab === "custom" ? "active" : ""}`}
                onClick={() => setActiveDocsTab("custom")}
              >
                <Code size={16} />
                Custom
              </button>
            </div>

            <div className="docs-content">
              {activeDocsTab === "zapier" && (
                <div className="docs-section">
                  <h5>Connect with Zapier</h5>
                  <p>Automate your workflow by connecting Kryonex to 5,000+ apps like Google Sheets, HubSpot, Salesforce, and more.</p>
                  <ol>
                    <li>Create a new Zap in Zapier</li>
                    <li>Choose <strong>"Webhooks by Zapier"</strong> as the trigger</li>
                    <li>Select <strong>"Catch Hook"</strong> as the trigger event</li>
                    <li>Copy the webhook URL provided by Zapier</li>
                    <li>Add it as a webhook here and select your events</li>
                    <li>Click "Test" to send sample data and verify the connection</li>
                  </ol>
                  <div className="docs-tip">
                    <strong>Pro Tip:</strong> Start with "Call Ended" and "Lead Created" events to automatically add new leads to your CRM or spreadsheet.
                  </div>
                  <a href="https://zapier.com/apps/webhook/integrations" target="_blank" rel="noopener noreferrer" className="docs-link">
                    <ExternalLink size={14} />
                    Learn more about Zapier Webhooks
                  </a>
                </div>
              )}

              {activeDocsTab === "slack" && (
                <div className="docs-section">
                  <h5>Connect with Slack</h5>
                  <p>Get instant notifications in your Slack channel when calls complete, appointments are booked, or new leads come in.</p>
                  <ol>
                    <li>Open your Slack workspace settings</li>
                    <li>Go to <strong>Apps → Manage → Build → Create New App</strong></li>
                    <li>Select <strong>"From scratch"</strong> and name your app (e.g., "Kryonex Alerts")</li>
                    <li>Navigate to <strong>Incoming Webhooks</strong> and turn it on</li>
                    <li>Click <strong>"Add New Webhook to Workspace"</strong></li>
                    <li>Select the channel for notifications and copy the webhook URL</li>
                    <li>Add it as a webhook here and select your events</li>
                  </ol>
                  <div className="docs-tip">
                    <strong>Pro Tip:</strong> Create a dedicated #calls or #leads channel for Kryonex notifications to keep things organized.
                  </div>
                  <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noopener noreferrer" className="docs-link">
                    <ExternalLink size={14} />
                    Slack Incoming Webhooks Guide
                  </a>
                </div>
              )}

              {activeDocsTab === "custom" && (
                <div className="docs-section">
                  <h5>Custom Webhook Integration</h5>
                  <p>For developers: receive real-time POST requests to your own endpoint with structured JSON payloads.</p>
                  <ul>
                    <li>All webhooks use <strong>POST</strong> with <code>Content-Type: application/json</code></li>
                    <li>Include <code>X-Kryonex-Event</code> header with the event type</li>
                    <li>Include <code>X-Kryonex-Timestamp</code> header with ISO timestamp</li>
                    <li>If you set a secret, we include <code>X-Kryonex-Signature</code> (HMAC-SHA256)</li>
                    <li>Your endpoint should return <strong>2xx</strong> within 10 seconds</li>
                    <li>Failed deliveries are retried 3 times with exponential backoff</li>
                  </ul>
                  <div className="docs-code">
                    <code>
                      {`// Verify signature (Node.js example)
const crypto = require('crypto');
const signature = req.headers['x-kryonex-signature'];
const expected = crypto
  .createHmac('sha256', YOUR_SECRET)
  .update(JSON.stringify(req.body))
  .digest('hex');
const valid = signature === expected;`}
                    </code>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Example Payloads */}
          <div className="example-payloads glass-panel">
            <h4>Example Payloads</h4>
            <p className="payloads-intro">Click to expand and see the JSON structure for each event type.</p>
            
            <div className="payloads-grid">
              {AVAILABLE_EVENTS.filter(e => EXAMPLE_PAYLOADS[e.id]).map(event => (
                <div key={event.id} className="payload-item">
                  <button 
                    className="payload-header"
                    onClick={() => setExpandedPayload(expandedPayload === event.id ? null : event.id)}
                  >
                    <div className="payload-info">
                      <span className="payload-label">{event.label}</span>
                      <span className="payload-desc">{event.description}</span>
                    </div>
                    {expandedPayload === event.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                  
                  {expandedPayload === event.id && (
                    <div className="payload-content">
                      <button 
                        className="copy-payload-btn"
                        onClick={() => copyPayload(event.id)}
                      >
                        {copiedPayload === event.id ? <Check size={14} /> : <Copy size={14} />}
                        {copiedPayload === event.id ? "Copied!" : "Copy"}
                      </button>
                      <pre className="payload-json">
                        {JSON.stringify(EXAMPLE_PAYLOADS[event.id], null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
