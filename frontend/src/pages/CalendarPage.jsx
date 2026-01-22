import React from "react";
import { useNavigate } from "react-router-dom";
import SideNav from "../components/SideNav.jsx";
import TopMenu from "../components/TopMenu.jsx";
import { createTrackingSession, sendSms } from "../lib/api";
import { supabase } from "../lib/supabase";

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const endOfMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);

const pad = (value) => String(value).padStart(2, "0");

export default function CalendarPage() {
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = React.useState(new Date());
  const [selectedDate, setSelectedDate] = React.useState(new Date());
  const [appointments, setAppointments] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [form, setForm] = React.useState({
    customer_name: "",
    customer_phone: "",
    start_date: "",
    start_time: "",
    duration_minutes: "60",
    location: "",
    notes: "",
    reminder_minutes: "15",
    reminder_enabled: true,
    eta_enabled: false,
    eta_minutes: "10",
    eta_link: "",
  });
  const [messageStatus, setMessageStatus] = React.useState("");
  const [customMessage, setCustomMessage] = React.useState("");
  const [etaLink, setEtaLink] = React.useState("");
  const [etaMinutes, setEtaMinutes] = React.useState("20");
  const [trackingUrl, setTrackingUrl] = React.useState("");
  const [trackingStatus, setTrackingStatus] = React.useState("");

  const loadAppointments = async (date) => {
    setLoading(true);
    const start = startOfMonth(date);
    const end = endOfMonth(date);
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) return;

    const { data } = await supabase
      .from("appointments")
      .select("*")
      .eq("user_id", user.id)
      .gte("start_time", start.toISOString())
      .lte("start_time", end.toISOString())
      .order("start_time", { ascending: true });

    setAppointments(data || []);
    setLoading(false);
  };

  React.useEffect(() => {
    loadAppointments(currentMonth);
  }, [currentMonth]);

  const handleCreate = async () => {
    setMessageStatus("");
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) return;
    if (!form.customer_name || !form.start_date || !form.start_time) {
      setMessageStatus("Please fill customer name, date, and time.");
      return;
    }
    const [year, month, day] = form.start_date.split("-").map(Number);
    const [hour, minute] = form.start_time.split(":").map(Number);
    const startTime = new Date(year, month - 1, day, hour, minute);
    const durationMinutes = parseInt(form.duration_minutes || "60", 10);
    const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

    const { error } = await supabase.from("appointments").insert({
      user_id: user.id,
      customer_name: form.customer_name,
      customer_phone: form.customer_phone || null,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      location: form.location || null,
      notes: form.notes || null,
        reminder_minutes: parseInt(form.reminder_minutes || "0", 10),
        reminder_enabled: Boolean(form.reminder_enabled),
        eta_enabled: Boolean(form.eta_enabled),
        eta_minutes: parseInt(form.eta_minutes || "10", 10),
        eta_link: form.eta_link || null,
      status: "booked",
    });

    if (error) {
      setMessageStatus(error.message);
      return;
    }
    setForm({
      customer_name: "",
      customer_phone: "",
      start_date: "",
      start_time: "",
      duration_minutes: "60",
      location: "",
      notes: "",
      reminder_minutes: "15",
        reminder_enabled: true,
        eta_enabled: false,
        eta_minutes: "10",
        eta_link: "",
    });
    await loadAppointments(currentMonth);
    setMessageStatus("Appointment locked.");
  };

  const dayKey = (date) => date.toISOString().slice(0, 10);
  const dayAppointments = appointments.filter(
    (appt) => appt.start_time?.slice(0, 10) === dayKey(selectedDate)
  );

  const daysInView = () => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = [];
    for (let d = 1; d <= end.getDate(); d += 1) {
      days.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d));
    }
    return days;
  };

  const countForDay = (date) =>
    appointments.filter((appt) => appt.start_time?.slice(0, 10) === dayKey(date))
      .length;

  const handleSendSms = async (to, body) => {
    if (!to) {
      setMessageStatus("Customer phone required to send SMS.");
      return;
    }
    try {
      await sendSms({ to, body });
      setMessageStatus("Message sent.");
    } catch (err) {
      setMessageStatus(err.response?.data?.error || "SMS failed.");
    }
  };

  const buildEtaMessage = () => {
    const minutes = String(etaMinutes || form.eta_minutes || "20").trim();
    return `Kryonex update: Your tech is en route. ETA ${minutes} minutes.`;
  };

  const buildTrackingMessage = () => {
    const link = String(etaLink || form.eta_link || "").trim();
    if (!link) return "Kryonex update: Live tracking link pending.";
    return `Kryonex update: Track your tech live here: ${link}`;
  };

  const handleCreateTracking = async () => {
    setTrackingStatus("");
    if (!form.customer_phone) {
      setTrackingStatus("Customer phone required to generate tracking.");
      return;
    }
    try {
      const response = await createTrackingSession({
        customerPhone: form.customer_phone,
        etaMinutes: etaMinutes,
      });
      const url = response.data?.tracking_url;
      setTrackingUrl(url || "");
      if (url) {
        setEtaLink(url);
      }
      setTrackingStatus("Tracking link generated.");
    } catch (err) {
      setTrackingStatus(err.response?.data?.error || "Tracking link failed.");
    }
  };

  const toggleAppointment = async (id, updates) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) return;
    await supabase.from("appointments").update(updates).eq("id", id);
    await loadAppointments(currentMonth);
  };

  const monthLabel = currentMonth.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="war-room">
      <TopMenu />
      <div className="dashboard-layout">
        <SideNav
          eligibleNewAgent={false}
          onUpgrade={() => navigate("/billing")}
          onNewAgent={() => navigate("/wizard?new=1")}
          billingStatus="active"
          tier="calendar"
          agentLive
          lastUpdated={new Date()}
          isSeller
        />

        <div className="war-room-shell">
          <div className="calendar-header">
            <div>
              <div className="war-room-kicker">SCHEDULING CORE</div>
              <div className="war-room-title">Operations Calendar</div>
            </div>
            <div className="calendar-actions">
              <button className="button-primary" onClick={() => navigate("/dashboard")}>
                Back to Dashboard
              </button>
            </div>
          </div>

          <div className="calendar-panel glass-panel">
            <div className="calendar-top">
              <button
                className="button-primary"
                onClick={() =>
                  setCurrentMonth(
                    new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
                  )
                }
              >
                ◀
              </button>
              <div className="calendar-month">{monthLabel}</div>
              <button
                className="button-primary"
                onClick={() =>
                  setCurrentMonth(
                    new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
                  )
                }
              >
                ▶
              </button>
            </div>
              <div className="calendar-grid">
              {daysInView().map((day) => {
                const count = countForDay(day);
                const selected = dayKey(day) === dayKey(selectedDate);
                const intensity =
                  count >= 4 ? "high" : count >= 2 ? "mid" : count > 0 ? "low" : "none";
                return (
                  <button
                    key={day.toISOString()}
                    className={`calendar-day ${intensity} ${selected ? "active" : ""}`}
                    onClick={() => setSelectedDate(day)}
                  >
                    <div>{pad(day.getDate())}</div>
                    <span>{count} jobs</span>
                  </button>
                );
              })}
            </div>
          </div>

            <div className="glass-panel" style={{ marginTop: "1.5rem", padding: "1.5rem" }}>
              <div className="war-room-kicker">Customer Messaging</div>
              <div style={{ color: "#9ca3af", marginTop: "0.4rem" }}>
                Send ETA or live tracking updates (optional).
              </div>
              <div style={{ marginTop: "1rem", display: "grid", gap: "0.8rem" }}>
                <label style={{ display: "grid", gap: "0.4rem" }}>
                  <span style={{ color: "#9ca3af" }}>ETA Minutes</span>
                  <input
                    className="input-field"
                    value={etaMinutes}
                    onChange={(event) => setEtaMinutes(event.target.value)}
                    placeholder="20"
                  />
                </label>
                <label style={{ display: "grid", gap: "0.4rem" }}>
                  <span style={{ color: "#9ca3af" }}>Live Tracking Link</span>
                  <input
                    className="input-field"
                    value={etaLink}
                    onChange={(event) => setEtaLink(event.target.value)}
                    placeholder="https://tracking.yourdomain.com/..."
                  />
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
                  <button className="button-primary" onClick={handleCreateTracking}>
                    Generate Tracking Link
                  </button>
                  {trackingUrl ? (
                    <button
                      className="button-primary"
                      onClick={() => window.open(trackingUrl, "_blank")}
                    >
                      Open Tracking Page
                    </button>
                  ) : null}
                </div>
                {trackingStatus ? (
                  <div style={{ color: "#9ca3af" }}>{trackingStatus}</div>
                ) : null}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
                  <button
                    className="button-primary"
                    onClick={() =>
                      handleSendSms(form.customer_phone, buildEtaMessage())
                    }
                  >
                    Send ETA Text
                  </button>
                  <button
                    className="button-primary"
                    onClick={() =>
                      handleSendSms(form.customer_phone, buildTrackingMessage())
                    }
                  >
                    Send Live Tracking Text
                  </button>
                </div>
              </div>
            </div>
          <div className="command-grid" id="calendar">
            <div className="deck-card glass-panel">
              <div className="deck-title">New Appointment</div>
              <label className="deck-label">Customer</label>
              <input
                className="glass-input"
                value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                placeholder="Jane Smith"
              />
              <label className="deck-label">Phone</label>
              <input
                className="glass-input mono"
                value={form.customer_phone}
                onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                placeholder="+1 555 220 1399"
              />
              <label className="deck-label">Date</label>
              <input
                className="glass-input"
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
              <label className="deck-label">Time</label>
              <input
                className="glass-input"
                type="time"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              />
              <label className="deck-label">Duration</label>
              <select
                className="glass-input"
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
              >
                <option value="30">30 minutes</option>
                <option value="60">60 minutes</option>
                <option value="90">90 minutes</option>
                <option value="120">120 minutes</option>
              </select>
              <label className="deck-label">Location</label>
              <input
                className="glass-input"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="123 Main St"
              />
              <label className="deck-label">Reminder</label>
              <select
                className="glass-input"
                value={form.reminder_minutes}
                onChange={(e) => setForm({ ...form, reminder_minutes: e.target.value })}
              >
                <option value="0">No reminder</option>
                <option value="15">15 minutes before</option>
                <option value="30">30 minutes before</option>
                <option value="60">60 minutes before</option>
              </select>
              <label className="deck-label">Auto Reminder</label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={form.reminder_enabled}
                  onChange={(e) =>
                    setForm({ ...form, reminder_enabled: e.target.checked })
                  }
                />
                <span className="toggle-slider" />
                <span className="toggle-label">
                  {form.reminder_enabled ? "Enabled" : "Disabled"}
                </span>
              </label>
              <label className="deck-label">ETA Tracking</label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={form.eta_enabled}
                  onChange={(e) =>
                    setForm({ ...form, eta_enabled: e.target.checked })
                  }
                />
                <span className="toggle-slider" />
                <span className="toggle-label">
                  {form.eta_enabled ? "Enabled" : "Disabled"}
                </span>
              </label>
              <label className="deck-label">ETA Minutes</label>
              <select
                className="glass-input"
                value={form.eta_minutes}
                onChange={(e) => setForm({ ...form, eta_minutes: e.target.value })}
              >
                <option value="5">5 minutes</option>
                <option value="10">10 minutes</option>
                <option value="15">15 minutes</option>
              </select>
              <label className="deck-label">ETA Link</label>
              <input
                className="glass-input"
                value={form.eta_link}
                onChange={(e) => setForm({ ...form, eta_link: e.target.value })}
                placeholder="https://maps.google.com/?q=..."
              />
              <label className="deck-label">Notes</label>
              <textarea
                className="glass-input"
                rows="3"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Special instructions..."
              />
              <button className="glow-button deck-action" onClick={handleCreate}>
                Lock Appointment
              </button>
              {messageStatus ? (
                <div className="deck-status">{messageStatus}</div>
              ) : null}
            </div>

            <div className="deck-card glass-panel">
              <div className="deck-title">
                Schedule · {selectedDate.toDateString()}
              </div>
              {loading ? (
                <div className="blackbox-empty">Loading schedule...</div>
              ) : dayAppointments.length ? (
                dayAppointments.map((appt) => (
                  <div key={appt.id} className="blackbox-item">
                    <div className="blackbox-head">
                      <div>{appt.customer_name}</div>
                      <span className="mono text-neon-cyan">
                        {new Date(appt.start_time).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="blackbox-body">{appt.location || "No location"}</div>
                    <div className="blackbox-meta">
                      Reminder: {appt.reminder_minutes || 0} min
                    </div>
                    <div className="calendar-cta">
                      <button
                        className="button-primary"
                        onClick={() =>
                          handleSendSms(
                            appt.customer_phone,
                            `Reminder: ${appt.customer_name}, your appointment is scheduled for ${new Date(
                              appt.start_time
                            ).toLocaleString()}.`
                          )
                        }
                      >
                        Send Reminder Now
                      </button>
                      <button
                        className="button-primary"
                        onClick={() =>
                          handleSendSms(
                            appt.customer_phone,
                            `We are running about 10 minutes late for your appointment.`
                          )
                        }
                      >
                        Running Late
                      </button>
                      <button
                        className="button-primary"
                        onClick={() =>
                          handleSendSms(
                            appt.customer_phone,
                            `We need to reschedule your appointment. Reply with a time that works for you.`
                          )
                        }
                      >
                        Reschedule
                      </button>
                      <button
                        className="button-primary"
                        onClick={() =>
                          toggleAppointment(appt.id, {
                            reminder_enabled: !appt.reminder_enabled,
                          })
                        }
                      >
                        Reminder {appt.reminder_enabled ? "ON" : "OFF"}
                      </button>
                      <button
                        className="button-primary"
                        onClick={() =>
                          toggleAppointment(appt.id, {
                            eta_enabled: !appt.eta_enabled,
                          })
                        }
                      >
                        ETA {appt.eta_enabled ? "ON" : "OFF"}
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="blackbox-empty">No appointments for this day.</div>
              )}
            </div>

            <div className="deck-card glass-panel">
              <div className="deck-title">Customer Updates</div>
              <label className="deck-label">Custom SMS</label>
              <textarea
                className="glass-input"
                rows="4"
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Write a custom update to all booked customers..."
              />
              <label className="deck-label">GPS / ETA Link</label>
              <input
                className="glass-input"
                value={etaLink}
                onChange={(e) => setEtaLink(e.target.value)}
                placeholder="https://maps.google.com/?q=..."
              />
              <div className="calendar-cta">
                <button
                  className="glow-button"
                  onClick={() => {
                    const target = dayAppointments[0]?.customer_phone;
                    handleSendSms(target, customMessage || "We are on the way.");
                  }}
                >
                  Send Custom Update
                </button>
                <button
                  className="button-primary"
                  onClick={() => {
                    const target = dayAppointments[0]?.customer_phone;
                    handleSendSms(
                      target,
                      `Your technician is 10 minutes away. Track here: ${etaLink}`
                    );
                  }}
                >
                  Send ETA
                </button>
              </div>
              <div className="blackbox-meta">
                GPS messages use the first appointment of the day. Add phone numbers
                to enable SMS.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
