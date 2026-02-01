import React from "react";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { getSettings, updateSettings } from "../lib/api";
import { supabase } from "../lib/supabase";
import { normalizePhone } from "../lib/phone.js";

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
    // Review Requests
    review_request_enabled: false,
    google_review_url: "",
    review_request_template: "Thanks for choosing {business}! We hope you had a great experience. Please leave us a review: {review_link}",
  });
  const [loading, setLoading] = React.useState(true);
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
          }));
          setLastUpdated(new Date());
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
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
      await updateSettings({
        business_name: settings.business_name,
        transfer_number: settings.transfer_number,
        service_call_fee: settings.service_call_fee,
        emergency_fee: settings.emergency_fee,
        schedule_summary: settings.schedule_summary,
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
        // Review Request settings
        review_request_enabled: settings.review_request_enabled,
        google_review_url: settings.google_review_url,
        review_request_template: settings.review_request_template,
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

          {loading ? (
            <div className="glass-panel" style={{ padding: "2rem", textAlign: "center" }}>
              Loading settings...
            </div>
          ) : (
            <div className="settings-container">
              {/* Business Information */}
              <div className="settings-section glass-panel">
                <h2 className="settings-section-title">Business Information</h2>
                
                <div className="settings-form-group">
                  <label className="settings-label">Business Name</label>
                  <input
                    type="text"
                    className="glass-input"
                    value={settings.business_name}
                    onChange={(e) => handleChange("business_name", e.target.value)}
                    placeholder="Your Business Name"
                  />
                  <span className="settings-hint">This name will be used by the AI when answering calls</span>
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

                <div className="settings-form-group">
                  <label className="settings-label">AI Phone Number</label>
                  <input
                    type="text"
                    className="glass-input readonly"
                    value={settings.phone_number || "Not assigned"}
                    readOnly
                    disabled
                  />
                  <span className="settings-hint">This is your AI agent's phone number (read-only)</span>
                </div>
              </div>

              {/* Call Handling */}
              <div className="settings-section glass-panel">
                <h2 className="settings-section-title">Call Handling</h2>
                
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
                  <span className="settings-hint">Calls will be transferred to this number when needed</span>
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
                  <span className="settings-hint">How the AI agent should sound on calls</span>
                </div>

                <div className="settings-form-group">
                  <label className="settings-label">Business Hours Summary (For Prompt)</label>
                  <textarea
                    className="glass-input glass-textarea"
                    value={settings.schedule_summary}
                    onChange={(e) => handleChange("schedule_summary", e.target.value)}
                    placeholder="Monday-Friday 8am-6pm, Saturday 9am-2pm, Closed Sunday"
                    rows={2}
                  />
                  <span className="settings-hint">Brief text the AI uses to describe your hours</span>
                </div>
              </div>

              {/* Structured Business Hours */}
              <div className="settings-section glass-panel">
                <h2 className="settings-section-title">Business Hours</h2>
                
                <div className="settings-row">
                  <div className="settings-form-group">
                    <label className="settings-label">Timezone</label>
                    <select
                      className="glass-input"
                      value={settings.business_timezone}
                      onChange={(e) => handleChange("business_timezone", e.target.value)}
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

                <div className="business-hours-grid">
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
                
                <div className="settings-row">
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
                <span className="settings-hint">The AI will quote these fees when customers ask about pricing</span>
              </div>

              {/* SMS Automation - Post-Call Follow-Up */}
              <div className="settings-section glass-panel premium-feature">
                <div className="section-header-with-badge">
                  <h2 className="settings-section-title">Post-Call SMS Follow-Up</h2>
                  <span className="premium-badge">$29/mo Add-On</span>
                </div>
                <p className="settings-description">
                  Automatically send a text message to customers after every call. Keeps your business top of mind!
                </p>
                
                <div className="settings-toggle-group">
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
                  <>
                    <div className="settings-form-group">
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

                    <div className="settings-form-group">
                      <label className="settings-label">Send Delay (seconds)</label>
                      <input
                        type="number"
                        className="glass-input"
                        value={settings.post_call_sms_delay_seconds}
                        onChange={(e) => handleChange("post_call_sms_delay_seconds", parseInt(e.target.value) || 60)}
                        min="30"
                        max="3600"
                      />
                      <span className="settings-hint">Wait this many seconds after the call ends before sending (30-3600)</span>
                    </div>
                  </>
                )}
              </div>

              {/* Review Request Automation */}
              <div className="settings-section glass-panel premium-feature">
                <div className="section-header-with-badge">
                  <h2 className="settings-section-title">Review Request Automation</h2>
                  <span className="premium-badge">$19/mo Add-On</span>
                </div>
                <p className="settings-description">
                  Automatically request Google reviews after completed appointments. More reviews = more business!
                </p>
                
                <div className="settings-toggle-group">
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={settings.review_request_enabled}
                      onChange={(e) => handleChange("review_request_enabled", e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                    <span className="toggle-label">Enable Review Requests</span>
                  </label>
                </div>

                {settings.review_request_enabled && (
                  <>
                    <div className="settings-form-group">
                      <label className="settings-label">Google Review Link</label>
                      <input
                        type="url"
                        className="glass-input"
                        value={settings.google_review_url}
                        onChange={(e) => handleChange("google_review_url", e.target.value)}
                        placeholder="https://g.page/r/YOUR-BUSINESS/review"
                      />
                      <span className="settings-hint">
                        Find this in your Google Business Profile under "Get more reviews"
                      </span>
                    </div>

                    <div className="settings-form-group">
                      <label className="settings-label">Review Request Template</label>
                      <textarea
                        className="glass-input glass-textarea"
                        value={settings.review_request_template}
                        onChange={(e) => handleChange("review_request_template", e.target.value)}
                        placeholder="Thanks for choosing us! Leave a review: {review_link}"
                        rows={3}
                      />
                      <span className="settings-hint">
                        Variables: {"{business}"} = Your business name, {"{review_link}"} = Your Google review link
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Notifications */}
              <div className="settings-section glass-panel">
                <h2 className="settings-section-title">Notifications</h2>
                
                <div className="settings-toggle-group">
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

              {/* Save Button */}
              <div className="settings-actions">
                {saveStatus && (
                  <div className={`save-status ${saveStatus.includes("success") ? "success" : "error"}`}>
                    {saveStatus}
                  </div>
                )}
                <button
                  className="button-primary glow-button"
                  onClick={handleSave}
                  disabled={saving}
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
