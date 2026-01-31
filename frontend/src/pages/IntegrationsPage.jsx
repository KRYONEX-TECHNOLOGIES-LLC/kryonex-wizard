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
} from "lucide-react";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { getWebhooks, createWebhook, updateWebhook, deleteWebhook, testWebhook } from "../lib/api";
import { supabase } from "../lib/supabase";

const AVAILABLE_EVENTS = [
  { id: "call_ended", label: "Call Ended", description: "When a call completes" },
  { id: "call_started", label: "Call Started", description: "When a call begins" },
  { id: "appointment_booked", label: "Appointment Booked", description: "New appointment created" },
  { id: "appointment_updated", label: "Appointment Updated", description: "Appointment modified" },
  { id: "lead_created", label: "Lead Created", description: "New lead from call" },
  { id: "sms_received", label: "SMS Received", description: "Inbound text message" },
];

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
              <div className="war-room-kicker">EXTERNAL CONNECTIONS</div>
              <div className="war-room-title">Integrations Hub</div>
            </div>
            <div className="war-room-actions">
              <button className="button-primary" onClick={handleAddNew}>
                <Plus size={18} />
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
                </div>
              ))
            )}
          </div>

          {/* Help Section */}
          <div className="integration-help glass-panel">
            <h4>How to Connect with Zapier</h4>
            <ol>
              <li>Create a new Zap in Zapier</li>
              <li>Choose "Webhooks by Zapier" as the trigger</li>
              <li>Select "Catch Hook" as the trigger event</li>
              <li>Copy the webhook URL provided by Zapier</li>
              <li>Add it as a webhook here and select your events</li>
              <li>Click "Test" to verify the connection</li>
            </ol>
            <a href="https://zapier.com/apps/webhook/integrations" target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} />
              Learn more about Zapier Webhooks
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
