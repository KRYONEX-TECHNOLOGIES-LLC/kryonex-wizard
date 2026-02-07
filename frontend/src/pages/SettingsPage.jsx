import React from "react";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { getSettings, updateSettings } from "../lib/api";
import { supabase } from "../lib/supabase";
import { normalizePhone } from "../lib/phone.js";

// Auto-generate schedule summary from business hours
const generateScheduleSummary = (businessHours) => {
  if (!businessHours) return "";
  
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const dayAbbrev = { monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun" };
  
  const formatTime = (time24) => {
    if (!time24) return "";
    const [h, m] = time24.split(":");
    const hour = parseInt(h);
    const ampm = hour >= 12 ? "pm" : "am";
    const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return m === "00" ? `${hour12}${ampm}` : `${hour12}:${m}${ampm}`;
  };
  
  // Group consecutive days with same hours
  const groups = [];
  let currentGroup = null;
  
  for (const day of days) {
    const h = businessHours[day] || { closed: true };
    const key = h.closed ? "closed" : `${h.open}-${h.close}`;
    
    if (currentGroup && currentGroup.key === key) {
      currentGroup.endDay = day;
    } else {
      if (currentGroup) groups.push(currentGroup);
      currentGroup = { startDay: day, endDay: day, key, hours: h };
    }
  }
  if (currentGroup) groups.push(currentGroup);
  
  // Format output
  const parts = [];
  for (const g of groups) {
    const dayRange = g.startDay === g.endDay 
      ? dayAbbrev[g.startDay] 
      : `${dayAbbrev[g.startDay]}-${dayAbbrev[g.endDay]}`;
    
    if (g.hours.closed) {
      parts.push(`${dayRange} Closed`);
    } else {
      parts.push(`${dayRange} ${formatTime(g.hours.open)}-${formatTime(g.hours.close)}`);
    }
  }
  
  return parts.join(", ");
};

export default function SettingsPage() {
  const navigate = useNavigate();
  const defaultBusinessHours = {
    monday: { open: "08:00", close: "18:00", closed: false },
    tuesday: { open: "08:00", close: "18:00", closed: false },
    wednesday: { open: "08:00", close: "18:00", closed: false },
    thursday: { open: "08:00", close: "18:00", closed: false },
    friday: { open: "08:00", close: "18:00", closed: false },
    saturday: { open: "09:00", close: "14:00", closed: false },
    sunday: { open: null, close: null, closed: true },
  };
  const [settings, setSettings] = React.useState({
    business_name: "",
    transfer_number: "",
    service_call_fee: "",
    emergency_fee: "",
    schedule_summary: "",
    agent_tone: "Calm & Professional",
    industry: "hvac",
    phone_number: "",
    notification_preferences: {
      email_on_booking: true,
      sms_on_booking: true,
      daily_summary: false,
    },
    // Business Hours
    business_hours: defaultBusinessHours,
    business_timezone: "America/Chicago",
    emergency_24_7: false,
    // SMS Automation
    post_call_sms_enabled: false,
    post_call_sms_template: "Thanks for calling {business}! We appreciate your call and will follow up shortly if needed.",
    post_call_sms_delay_seconds: 60,
    confirmation_sms_enabled: true,
    // User personal phone for receiving notifications
    user_personal_phone: "",
  });
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState("");
  const [isSeller, setIsSeller] = React.useState(false);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [lastUpdated, setLastUpdated] = React.useState(null);

  // Load settings
  React.useEffect(() => {
    let mounted = true;
    const loadSettings = async () => {
      try {
        const res = await getSettings();
        if (mounted && res.data) {
          setSettings((prev) => ({
            ...prev,
            ...res.data,
            notification_preferences: {
              ...prev.notification_preferences,
              ...(res.data.notification_preferences || {}),
            },
            business_hours: res.data.business_hours || prev.business_hours,
            business_timezone: res.data.business_timezone || prev.business_timezone,
            emergency_24_7: res.data.emergency_24_7 ?? prev.emergency_24_7,
            confirmation_sms_enabled: res.data.confirmation_sms_enabled ?? prev.confirmation_sms_enabled,
            user_personal_phone: res.data.user_personal_phone || prev.user_personal_phone,
          }));
          setLastUpdated(new Date());
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
        if (mounted) {
          setLoadError(err.userMessage || err.message || "Failed to load settings");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadSettings();
    return () => { mounted = false; };
  }, []);

  // Load user role
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
    return () => { mounted = false; };
  }, []);

  const handleChange = (field, value) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setSaveStatus("");
  };

  const handleNotificationChange = (field, value) => {
    setSettings((prev) => ({
      ...prev,
      notification_preferences: {
        ...prev.notification_preferences,
        [field]: value,
      },
    }));
    setSaveStatus("");
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus("");
    try {
      // Auto-generate schedule summary from business hours
      const autoScheduleSummary = generateScheduleSummary(settings.business_hours);
      
      // Normalize phone numbers to E.164 format before sending
      const normalizedTransferNumber = normalizePhone(settings.transfer_number) || settings.transfer_number;
      const normalizedPersonalPhone = normalizePhone(settings.user_personal_phone) || settings.user_personal_phone;
      
      await updateSettings({
        business_name: settings.business_name,
        transfer_number: normalizedTransferNumber,
        service_call_fee: settings.service_call_fee,
        emergency_fee: settings.emergency_fee,
        schedule_summary: autoScheduleSummary,
        agent_tone: settings.agent_tone,
        industry: settings.industry,
        notification_preferences: settings.notification_preferences,
        // Business Hours settings
        business_hours: settings.business_hours,
        business_timezone: settings.business_timezone,
        emergency_24_7: settings.emergency_24_7,
        // SMS Automation settings
        post_call_sms_enabled: settings.post_call_sms_enabled,
        post_call_sms_template: settings.post_call_sms_template,
        post_call_sms_delay_seconds: settings.post_call_sms_delay_seconds,
        confirmation_sms_enabled: settings.confirmation_sms_enabled,
        // User personal phone for receiving notifications
        user_personal_phone: normalizedPersonalPhone,
      });
      setSaveStatus("Settings saved successfully!");
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Failed to save settings:", err);
      setSaveStatus("Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const toneOptions = [
    "Calm & Professional",
    "Friendly & Warm",
    "Direct & Efficient",
    "Empathetic & Understanding",
    "Energetic & Enthusiastic",
  ];

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
              <div className="war-room-kicker">SYSTEM CONFIGURATION</div>
              <div className="war-room-title">Settings Command</div>
            </div>
            <div className="war-room-actions">
              <button className="button-primary" onClick={() => navigate("/dashboard")}>
                Back to Command Deck
              </button>
            </div>
          </div>

          {loadError && (
            <div className="glass-panel error-banner" style={{ background: "rgba(239, 68, 68, 0.15)", borderColor: "#ef4444", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span style={{ fontSize: "1.25rem" }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <strong style={{ color: "#ef4444" }}>Error loading settings</strong>
                <p style={{ margin: 0, opacity: 0.8 }}>{loadError}</p>
              </div>
              <button
                type="button"
                className="button-secondary"
                onClick={() => { setLoadError(null); window.location.reload(); }}
              >
                Retry
              </button>
            </div>
          )}

          {loading ? (
            <div className="glass-panel" style={{ padding: "2rem", textAlign: "center" }}>
              Loading settings...
            </div>
          ) : (
            <div className="settings-container">
              {/* Business Information & Call Handling - Side by Side */}
              <div className="settings-section glass-panel">
                <h2 className="settings-section-title">Business Information</h2>
                
                <div className="settings-form-row">
                  <div className="settings-form-group">
                    <label className="settings-label">Business Name</label>
                    <input
                      type="text"
                      className="glass-input"
                      value={settings.business_name}
                      onChange={(e) => handleChange("business_name", e.target.value)}
                      placeholder="Your Business Name"
                    />
                    <span className="settings-hint">Used by the AI when answering calls</span>
                  </div>

                  <div className="settings-form-group">
                    <label className="settings-label">Industry</label>
                    <select
                      className="glass-select"
                      value={settings.industry}
                      onChange={(e) => handleChange("industry", e.target.value)}
                    >
                      <option value="hvac">HVAC</option>
                      <option value="plumbing">Plumbing</option>
                      <option value="electrical">Electrical</option>
                      <option value="general">General Contractor</option>
                    </select>
                  </div>
                </div>

                <div className="settings-form-group" style={{ marginTop: "1rem" }}>
                  <label className="settings-label">AI Phone Number</label>
                  <input
                    type="text"
                    className="glass-input readonly"
                    value={settings.phone_number || "Not assigned"}
                    readOnly
                    disabled
                    style={{ maxWidth: "280px" }}
                  />
                  <span className="settings-hint">Your AI agent's phone number (read-only)</span>
                </div>
              </div>

              {/* Call Handling */}
              <div className="settings-section glass-panel">
                <h2 className="settings-section-title">Call Handling</h2>
                
                <div className="settings-form-row">
                  <div className="settings-form-group">
                    <label className="settings-label">Transfer Number</label>
                    <input
                      type="tel"
                      className="glass-input"
                      value={settings.transfer_number}
                      onChange={(e) => handleChange("transfer_number", e.target.value)}
                      onBlur={(e) => {
                        const normalized = normalizePhone(e.target.value);
                        if (normalized) {
                          handleChange("transfer_number", normalized);
                        }
                      }}
                      placeholder="+1 555 123 4567"
                    />
                    <span className="settings-hint">Transfer destination when needed</span>
                  </div>

                  <div className="settings-form-group">
                    <label className="settings-label">Agent Tone</label>
                    <select
                      className="glass-select"
                      value={settings.agent_tone}
                      onChange={(e) => handleChange("agent_tone", e.target.value)}
                    >
                      {toneOptions.map((tone) => (
                        <option key={tone} value={tone}>{tone}</option>
                      ))}
                    </select>
                    <span className="settings-hint">How the AI should sound on calls</span>
                  </div>
                </div>
              </div>

              {/* Structured Business Hours - Full Width */}
              <div className="settings-section glass-panel full-width">
                <h2 className="settings-section-title">Business Hours</h2>
                
                <div className="settings-form-row" style={{ marginBottom: "1.5rem" }}>
                  <div className="settings-form-group">
                    <label className="settings-label">Timezone</label>
                    <select
                      className="glass-input"
                      value={settings.business_timezone}
                      onChange={(e) => handleChange("business_timezone", e.target.value)}
                      style={{ maxWidth: "200px" }}
                    >
                      <option value="America/New_York">Eastern (ET)</option>
                      <option value="America/Chicago">Central (CT)</option>
                      <option value="America/Denver">Mountain (MT)</option>
                      <option value="America/Phoenix">Arizona (MST)</option>
                      <option value="America/Los_Angeles">Pacific (PT)</option>
                      <option value="America/Anchorage">Alaska (AKT)</option>
                      <option value="Pacific/Honolulu">Hawaii (HT)</option>
                    </select>
                  </div>
                  <div className="settings-form-group">
                    <label className="toggle settings-toggle-row">
                      <input
                        type="checkbox"
                        checked={settings.emergency_24_7}
                        onChange={(e) => handleChange("emergency_24_7", e.target.checked)}
                      />
                      <span className="toggle-slider" />
                      <span className="toggle-label">24/7 Emergency Service</span>
                    </label>
                    <span className="settings-hint">Emergency calls bypass hours check</span>
                  </div>
                </div>

                <div className="business-hours-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.5rem 2rem" }}>
                  {["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((day) => {
                    const dayHours = settings.business_hours?.[day] || { open: "08:00", close: "18:00", closed: false };
                    return (
                      <div key={day} className="hours-day-row">
                        <span className="hours-day-label">{day.charAt(0).toUpperCase() + day.slice(1)}</span>
                        <label className="toggle hours-closed-toggle">
                          <input
                            type="checkbox"
                            checked={!dayHours.closed}
                            onChange={(e) => {
                              const updated = { ...settings.business_hours };
                              updated[day] = { ...dayHours, closed: !e.target.checked };
                              handleChange("business_hours", updated);
                            }}
                          />
                          <span className="toggle-slider small" />
                        </label>
                        {!dayHours.closed ? (
                          <>
                            <input
                              type="time"
                              className="glass-input hours-time-input"
                              value={dayHours.open || "08:00"}
                              onChange={(e) => {
                                const updated = { ...settings.business_hours };
                                updated[day] = { ...dayHours, open: e.target.value };
                                handleChange("business_hours", updated);
                              }}
                            />
                            <span className="hours-separator">to</span>
                            <input
                              type="time"
                              className="glass-input hours-time-input"
                              value={dayHours.close || "18:00"}
                              onChange={(e) => {
                                const updated = { ...settings.business_hours };
                                updated[day] = { ...dayHours, close: e.target.value };
                                handleChange("business_hours", updated);
                              }}
                            />
                          </>
                        ) : (
                          <span className="hours-closed-label">Closed</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pricing */}
              <div className="settings-section glass-panel">
                <h2 className="settings-section-title">Service Pricing</h2>
                
                <div className="settings-form-row">
                  <div className="settings-form-group">
                    <label className="settings-label">Standard Service Call Fee</label>
                    <div className="input-with-prefix">
                      <span className="input-prefix">$</span>
                      <input
                        type="text"
                        className="glass-input"
                        value={settings.service_call_fee}
                        onChange={(e) => handleChange("service_call_fee", e.target.value.replace(/[^0-9.]/g, ""))}
                        placeholder="89"
                      />
                    </div>
                  </div>

                  <div className="settings-form-group">
                    <label className="settings-label">Emergency Service Fee</label>
                    <div className="input-with-prefix">
                      <span className="input-prefix">$</span>
                      <input
                        type="text"
                        className="glass-input"
                        value={settings.emergency_fee}
                        onChange={(e) => handleChange("emergency_fee", e.target.value.replace(/[^0-9.]/g, ""))}
                        placeholder="149"
                      />
                    </div>
                  </div>
                </div>
                <span className="settings-hint" style={{ marginTop: "0.5rem", display: "block" }}>The AI will quote these fees when customers ask about pricing</span>
              </div>

              {/* Notifications */}
              <div className="settings-section glass-panel">
                <h2 className="settings-section-title">Notifications</h2>
                
                <div className="settings-toggle-group" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={settings.notification_preferences.email_on_booking}
                      onChange={(e) => handleNotificationChange("email_on_booking", e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                    <span className="toggle-label">Email me when appointments are booked</span>
                  </label>

                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={settings.notification_preferences.sms_on_booking}
                      onChange={(e) => handleNotificationChange("sms_on_booking", e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                    <span className="toggle-label">SMS me when appointments are booked</span>
                  </label>

                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={settings.notification_preferences.daily_summary}
                      onChange={(e) => handleNotificationChange("daily_summary", e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                    <span className="toggle-label">Send daily summary email</span>
                  </label>
                </div>
              </div>

              {/* SMS Automation - Post-Call Follow-Up - Full Width */}
              <div className="settings-section glass-panel full-width">
                <h2 className="settings-section-title">Post-Call SMS Follow-Up</h2>
                <p className="settings-description">
                  Automatically send a text message to customers after every call. Keeps your business top of mind!
                </p>
                
                <div className="settings-form-row" style={{ alignItems: "start" }}>
                  <div style={{ flex: 1 }}>
                    <div className="settings-toggle-group" style={{ marginBottom: "1rem" }}>
                      <label className="settings-toggle">
                        <input
                          type="checkbox"
                          checked={settings.post_call_sms_enabled}
                          onChange={(e) => handleChange("post_call_sms_enabled", e.target.checked)}
                        />
                        <span className="toggle-slider"></span>
                        <span className="toggle-label">Enable Post-Call SMS</span>
                      </label>
                    </div>

                    {settings.post_call_sms_enabled && (
                      <div className="settings-form-group">
                        <label className="settings-label">Send Delay (seconds)</label>
                        <input
                          type="number"
                          className="glass-input"
                          value={settings.post_call_sms_delay_seconds}
                          onChange={(e) => handleChange("post_call_sms_delay_seconds", parseInt(e.target.value) || 60)}
                          min="30"
                          max="3600"
                          style={{ maxWidth: "150px" }}
                        />
                        <span className="settings-hint">Wait time after call ends (30-3600)</span>
                      </div>
                    )}
                  </div>

                  {settings.post_call_sms_enabled && (
                    <div className="settings-form-group" style={{ flex: 2 }}>
                      <label className="settings-label">SMS Template</label>
                      <textarea
                        className="glass-input glass-textarea"
                        value={settings.post_call_sms_template}
                        onChange={(e) => handleChange("post_call_sms_template", e.target.value)}
                        placeholder="Thanks for calling {business}! We'll follow up shortly."
                        rows={3}
                      />
                      <span className="settings-hint">
                        Variables: {"{business}"} = Your business name, {"{customer_name}"} = Caller's name
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Appointment Confirmation SMS - Full Width */}
              <div className="settings-section glass-panel full-width">
                <h2 className="settings-section-title">Appointment Confirmation SMS</h2>
                <p className="settings-description">
                  Automatically send confirmation texts to customers when they book appointments through the AI.
                </p>
                <div className="settings-row">
                  <div className="settings-form-group">
                    <label className="settings-toggle">
                      <input
                        type="checkbox"
                        checked={settings.confirmation_sms_enabled}
                        onChange={(e) => handleChange("confirmation_sms_enabled", e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                      <span className="toggle-label">Enable Confirmation SMS</span>
                    </label>
                    <span className="settings-hint" style={{ marginTop: "0.5rem", display: "block" }}>
                      Auto-sends: "Your appointment with {"{business}"} is confirmed for {"{date}"} at {"{time}"}. Reply STOP to opt out."
                    </span>
                  </div>
                </div>
              </div>

              {/* Your Notifications - Full Width */}
              <div className="settings-section glass-panel full-width">
                <h2 className="settings-section-title">Your Notifications</h2>
                <p className="settings-description">
                  How do YOU want to be notified when the AI books appointments or handles calls?
                </p>
                <div className="settings-row">
                  <div className="settings-form-group">
                    <label className="settings-label">Your Personal Phone Number</label>
                    <input
                      type="tel"
                      className="glass-input"
                      value={settings.user_personal_phone}
                      onChange={(e) => {
                        const v = e.target.value;
                        handleChange("user_personal_phone", v);
                      }}
                      onBlur={(e) => {
                        const normalized = normalizePhone(e.target.value);
                        if (normalized) {
                          handleChange("user_personal_phone", normalized);
                        }
                      }}
                      placeholder="+1 (555) 123-4567"
                      style={{ maxWidth: "250px" }}
                    />
                    <span className="settings-hint">This is where YOU receive booking alerts (not customer texts)</span>
                  </div>
                </div>
                <div className="settings-row" style={{ marginTop: "1rem" }}>
                  <div className="settings-form-group">
                    <label className="settings-toggle">
                      <input
                        type="checkbox"
                        checked={settings.notification_preferences?.email_on_booking ?? true}
                        onChange={(e) => handleNotificationChange("email_on_booking", e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                      <span className="toggle-label">Email me when AI books an appointment</span>
                    </label>
                  </div>
                  <div className="settings-form-group">
                    <label className="settings-toggle">
                      <input
                        type="checkbox"
                        checked={settings.notification_preferences?.sms_on_booking ?? true}
                        onChange={(e) => handleNotificationChange("sms_on_booking", e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                      <span className="toggle-label">Text me when AI books an appointment</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Save Button - Full Width */}
              <div className="settings-actions full-width" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "1rem" }}>
                {saveStatus && (
                  <div className={`save-status ${saveStatus.includes("success") ? "success" : "error"}`}>
                    {saveStatus}
                  </div>
                )}
                <button
                  className="button-primary glow-button"
                  onClick={handleSave}
                  disabled={saving}
                  style={{ minWidth: "160px" }}
                >
                  {saving ? "Saving..." : "Save Settings"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
