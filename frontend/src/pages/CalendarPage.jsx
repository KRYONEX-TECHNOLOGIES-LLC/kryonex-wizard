import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import SideNav from "../components/SideNav.jsx";
import TopMenu from "../components/TopMenu.jsx";
import {
  createAppointment,
  createTrackingSession,
  deleteAppointment,
  updateAppointment,
  getCalcomStatus,
  disconnectCalcom,
} from "../lib/api";
import { supabase } from "../lib/supabase";
import { getSavedState, saveState } from "../lib/persistence.js";
import { normalizePhone } from "../lib/phone.js";

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const endOfMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);

const pad = (value) => String(value).padStart(2, "0");
const defaultCalendarFormState = {
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
  send_confirmation: false,
};
const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const formatLocalDateKey = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const formatLocalTime = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
const PUBLIC_CAL_MONTH_KEY = "publicCalendar.currentMonth";
const PUBLIC_CAL_SELECTED_KEY = "publicCalendar.selectedDate";
const PUBLIC_CAL_FORM_KEY = "publicCalendar.form";

export default function CalendarPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [currentMonth, setCurrentMonth] = React.useState(() => {
    const stored = getSavedState(PUBLIC_CAL_MONTH_KEY);
    return stored ? new Date(stored) : new Date();
  });
  const [selectedDate, setSelectedDate] = React.useState(() => {
    const stored = getSavedState(PUBLIC_CAL_SELECTED_KEY);
    if (stored) {
      const [year, month, day] = String(stored).split("-").map(Number);
      if (year && month && day) {
        return new Date(year, month - 1, day);
      }
      return new Date(stored);
    }
    return new Date();
  });
  const [appointments, setAppointments] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [form, setForm] = React.useState(
    () => getSavedState(PUBLIC_CAL_FORM_KEY) || defaultCalendarFormState
  );
  const [messageStatus, setMessageStatus] = React.useState("");
  const [trackingStatus, setTrackingStatus] = React.useState("");
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [viewAppointmentId, setViewAppointmentId] = React.useState(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [editForm, setEditForm] = React.useState(defaultCalendarFormState);
  const [editStatus, setEditStatus] = React.useState("");
  const [editAppointmentId, setEditAppointmentId] = React.useState(null);
  const [deleteStatus, setDeleteStatus] = React.useState("");
  const [manifestIndex, setManifestIndex] = React.useState(0);
  const [isSeller, setIsSeller] = React.useState(false);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [calConnected, setCalConnected] = React.useState(false);
  const [calStatusLoading, setCalStatusLoading] = React.useState(true);
  const [calStatusError, setCalStatusError] = React.useState("");

  const updateCurrentMonth = (updater) => {
    setCurrentMonth((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveState(PUBLIC_CAL_MONTH_KEY, next.toISOString());
      return next;
    });
  };

  const persistSelectedDate = (value) => {
    setSelectedDate(value);
    saveState(PUBLIC_CAL_SELECTED_KEY, formatLocalDateKey(value));
  };

  const persistForm = (value) => {
    setForm(value);
    saveState(PUBLIC_CAL_FORM_KEY, value);
  };

  const mergeForm = (partial) => {
    setForm((prev) => {
      const next = { ...prev, ...partial };
      saveState(PUBLIC_CAL_FORM_KEY, next);
      return next;
    });
  };

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

  React.useEffect(() => {
    const dateParam = searchParams.get("date");
    const appointmentId = searchParams.get("appointmentId");
    if (dateParam) {
      const [year, month, day] = dateParam.split("-").map(Number);
      if (year && month && day) {
        const nextDate = new Date(year, month - 1, day);
        updateCurrentMonth(nextDate);
        persistSelectedDate(nextDate);
      }
    }
    if (appointmentId) {
      setViewAppointmentId(appointmentId);
      setDrawerOpen(true);
    }
  }, [searchParams]);

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
    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    let active = true;
    const loadStatus = async () => {
      try {
        const res = await getCalcomStatus();
        if (!active) return;
        setCalConnected(Boolean(res.data?.connected));
      } catch (err) {
        if (!active) return;
        setCalStatusError("Calendar connection status unavailable.");
        setCalConnected(false);
      } finally {
        if (active) setCalStatusLoading(false);
      }
    };
    loadStatus();
    return () => {
      active = false;
    };
  }, []);

  const handleCreate = async () => {
    setMessageStatus("");
    if (!form.customer_name || !form.start_date || !form.start_time) {
      setMessageStatus("Please fill customer name, date, and time.");
      return;
    }
    try {
      const response = await createAppointment({
        customer_name: form.customer_name,
        customer_phone: form.customer_phone || null,
        start_date: form.start_date,
        start_time: form.start_time,
        duration_minutes: form.duration_minutes,
        location: form.location || null,
        notes: form.notes || null,
        reminder_minutes: form.reminder_minutes,
        reminder_enabled: Boolean(form.reminder_enabled),
        eta_enabled: Boolean(form.eta_enabled),
        eta_minutes: form.eta_minutes,
        eta_link: form.eta_link || null,
      });
      if (response?.data?.appointment?.id) {
        setViewAppointmentId(response.data.appointment.id);
      }
    } catch (err) {
      setMessageStatus(err.response?.data?.error || "Failed to create appointment.");
      return;
    }
    persistForm(defaultCalendarFormState);
    await loadAppointments(currentMonth);
    setMessageStatus("Appointment locked.");
    setCreateOpen(false);
    setViewAppointmentId(null);
  };

  const handleCalcomConnect = async () => {
    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";
    setCalStatusError("");
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data?.session?.access_token;
      if (!accessToken) {
        setCalStatusError("Please sign in again before connecting Cal.com.");
        return;
      }
      window.location.href = `${baseUrl}/api/calcom/authorize?access_token=${encodeURIComponent(
        accessToken
      )}`;
    } catch (err) {
      setCalStatusError("Unable to start calendar connection. Please try again.");
    }
  };

  const handleCalcomDisconnect = async () => {
    setCalStatusError("");
    try {
      await disconnectCalcom();
      setCalConnected(false);
    } catch (err) {
      setCalStatusError("Unable to disconnect calendar.");
    }
  };

  const canConfirm =
    Boolean(form.customer_name && form.start_date && form.start_time);

  const dayKey = (date) => formatLocalDateKey(date);
  const appointmentDateKey = (appt) =>
    appt?.start_time ? formatLocalDateKey(new Date(appt.start_time)) : null;
  const dayAppointments = React.useMemo(() => {
    const key = dayKey(selectedDate);
    return appointments.filter((appt) => appointmentDateKey(appt) === key);
  }, [appointments, selectedDate]);

  React.useEffect(() => {
    if (!dayAppointments.length) {
      setViewAppointmentId(null);
      setManifestIndex(0);
      return;
    }
    if (viewAppointmentId) {
      const index = dayAppointments.findIndex(
        (appt) => String(appt.id) === String(viewAppointmentId)
      );
      if (index >= 0) {
        setManifestIndex(index);
        return;
      }
    }
    setViewAppointmentId(dayAppointments[0].id);
    setManifestIndex(0);
  }, [dayAppointments, viewAppointmentId]);

  React.useEffect(() => {
    if (!dayAppointments.length) return;
    const active = dayAppointments[manifestIndex];
    if (active?.id && String(active.id) !== String(viewAppointmentId)) {
      setViewAppointmentId(active.id);
    }
  }, [manifestIndex, dayAppointments, viewAppointmentId]);

  React.useEffect(() => {
    if (!drawerOpen || !viewAppointmentId) return;
    const handle = window.requestAnimationFrame(() => {
      const target = document.getElementById(`manifest-${viewAppointmentId}`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
    return () => window.cancelAnimationFrame(handle);
  }, [drawerOpen, viewAppointmentId, dayAppointments]);

  const daysInView = () => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const cells = [];
    const prefix = start.getDay();
    for (let i = 0; i < prefix; i += 1) {
      cells.push({ placeholder: true, key: `prefix-${i}` });
    }
    for (let day = 1; day <= end.getDate(); day += 1) {
      const date = new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth(),
        day
      );
      cells.push({ date, key: date.toISOString(), placeholder: false });
    }
    const remainder = cells.length % 7;
    const offset = remainder === 0 ? 0 : 7 - remainder;
    for (let i = 0; i < offset; i += 1) {
      cells.push({ placeholder: true, key: `suffix-${i}` });
    }
    return cells;
  };

  const countForDay = (date) =>
    appointments.filter((appt) => appointmentDateKey(appt) === dayKey(date)).length;

  const handleCreateTracking = async () => {
    setTrackingStatus("");
    if (!form.customer_phone) {
      setTrackingStatus("Customer phone required to generate tracking.");
      return;
    }
    try {
      const response = await createTrackingSession({
        customerPhone: form.customer_phone,
        etaMinutes: form.eta_minutes,
      });
      const url = response.data?.tracking_url;
      if (url) {
        mergeForm({ eta_link: url });
      }
      setTrackingStatus("Tracking link generated.");
    } catch (err) {
      setTrackingStatus(err.response?.data?.error || "Tracking link failed.");
    }
  };

  const openDrawerForDate = (date) => {
    if (date) {
      persistSelectedDate(date);
      mergeForm({ start_date: dayKey(date) });
    }
    setDrawerOpen(true);
  };

  const openCreateModal = (date) => {
    if (date) {
      persistSelectedDate(date);
      mergeForm({ start_date: dayKey(date) });
    }
    setMessageStatus("");
    setTrackingStatus("");
    setCreateOpen(true);
  };

  const openEditModal = (appt) => {
    if (!appt) return;
    const start = appt.start_time ? new Date(appt.start_time) : null;
    setEditAppointmentId(appt.id);
    setEditForm({
      customer_name: appt.customer_name || "",
      customer_phone: appt.customer_phone || "",
      start_date: start ? formatLocalDateKey(start) : form.start_date,
      start_time: start ? formatLocalTime(start) : form.start_time,
      duration_minutes: String(appt.duration_minutes || form.duration_minutes || "60"),
      location: appt.location || "",
      notes: appt.notes || "",
      reminder_minutes: String(appt.reminder_minutes ?? form.reminder_minutes ?? "15"),
      reminder_enabled: Boolean(appt.reminder_enabled),
      eta_enabled: Boolean(appt.eta_enabled),
      eta_minutes: String(appt.eta_minutes ?? form.eta_minutes ?? "10"),
      eta_link: appt.eta_link || "",
      send_confirmation: Boolean(appt.send_confirmation),
    });
    setEditStatus("");
    setDeleteStatus("");
    setEditOpen(true);
  };

  const closeEditModal = () => {
    setEditOpen(false);
    setEditAppointmentId(null);
    setEditStatus("");
    setDeleteStatus("");
  };

  const handleEditSave = async () => {
    if (!editAppointmentId) return;
    setEditStatus("");
    if (!editForm.customer_name || !editForm.start_date || !editForm.start_time) {
      setEditStatus("Customer name, date, and time are required.");
      return;
    }
    try {
      await updateAppointment(editAppointmentId, {
        customer_name: editForm.customer_name,
        customer_phone: editForm.customer_phone || null,
        start_date: editForm.start_date,
        start_time: editForm.start_time,
        duration_minutes: editForm.duration_minutes,
        location: editForm.location || null,
        notes: editForm.notes || null,
        reminder_minutes: editForm.reminder_minutes,
        reminder_enabled: Boolean(editForm.reminder_enabled),
        eta_enabled: Boolean(editForm.eta_enabled),
        eta_minutes: editForm.eta_minutes,
        eta_link: editForm.eta_link || null,
      });
      let reloadMonth = currentMonth;
      const [year, month, day] = editForm.start_date.split("-").map(Number);
      if (year && month && day) {
        const nextDate = new Date(year, month - 1, day);
        persistSelectedDate(nextDate);
        updateCurrentMonth(nextDate);
        reloadMonth = nextDate;
      }
      await loadAppointments(reloadMonth);
      closeEditModal();
      setEditStatus("Appointment updated.");
    } catch (err) {
      setEditStatus(err.response?.data?.error || "Failed to update appointment.");
    }
  };

  const handleDeleteAppointment = async (apptId) => {
    if (!apptId) return;
    const confirmed = window.confirm("Delete this appointment? This cannot be undone.");
    if (!confirmed) return;
    setDeleteStatus("");
    try {
      await deleteAppointment(apptId);
      await loadAppointments(currentMonth);
      setDeleteStatus("Appointment deleted.");
      closeEditModal();
    } catch (err) {
      setDeleteStatus(err.response?.data?.error || "Failed to delete appointment.");
    }
  };

  const handleManifestStep = (direction) => {
    if (!dayAppointments.length) return;
    setManifestIndex((prev) => {
      const next = prev + direction;
      if (next < 0) return 0;
      if (next >= dayAppointments.length) return dayAppointments.length - 1;
      return next;
    });
  };

  const monthLabel = currentMonth.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="war-room bg-black text-cyan-400 font-mono">
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
          isSeller={isSeller}
          isAdmin={isAdmin}
        />

        <div className="war-room-shell w-full max-w-full px-4 sm:px-6 lg:px-8">
          <div className="calendar-header">
            <div>
              <div className="war-room-kicker">SCHEDULING CORE</div>
              <div className="war-room-title">Operations Calendar</div>
            </div>
            <div className="calendar-actions">
              <button className="button-primary" onClick={() => openCreateModal(selectedDate)}>
                New Appointment
              </button>
              <button className="button-primary" onClick={() => navigate("/dashboard")}>
                Back to Dashboard
              </button>
            </div>
          </div>

          <div className="calendar-connection-panel glass-panel">
            <div className="calendar-connection-header">
              <div className="calendar-connection-title">Calendar Connection</div>
              {calStatusLoading ? (
                <span className="status-pill status-unknown">Checking</span>
              ) : calConnected ? (
                <span className="status-pill status-active">Connected</span>
              ) : (
                <span className="status-pill status-none">Not Connected</span>
              )}
            </div>
            <div className="calendar-connection-body">
              {calConnected ? (
                <span className="calendar-connection-note">
                  Cal.com is linked. Automated bookings are enabled.
                </span>
              ) : (
                <span className="calendar-connection-note">
                  Connect Cal.com so the AI can book appointments automatically.
                </span>
              )}
              <div className="calendar-connection-actions">
                {calConnected ? (
                  <button
                    type="button"
                    className="button-primary danger"
                    onClick={handleCalcomDisconnect}
                  >
                    Disconnect Calendar
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button-primary"
                    onClick={handleCalcomConnect}
                  >
                    Connect Cal.com Account
                  </button>
                )}
              </div>
              {calStatusError ? (
                <div className="calendar-connection-error">{calStatusError}</div>
              ) : null}
            </div>
          </div>

          <div className="calendar-panel glass-panel bg-gray-900/50 border border-cyan-500/30 backdrop-blur-md">
            <div className="calendar-top">
              <button
                className="button-primary"
                onClick={() =>
                  updateCurrentMonth(
                    (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
                  )
                }
              >
                ◀
              </button>
              <div className="calendar-month">{monthLabel}</div>
              <button
                className="button-primary"
                onClick={() =>
                  updateCurrentMonth(
                    (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
                  )
                }
              >
                ▶
              </button>
            </div>
            <div className="calendar-grid">
              {weekDays.map((weekDay) => (
                <div key={`header-${weekDay}`} className="calendar-weekday-header">
                  {weekDay}
                </div>
              ))}
              {daysInView().map((cell) => {
                if (cell.placeholder) {
                  return (
                    <div
                      key={cell.key}
                      className="calendar-day placeholder"
                      aria-hidden="true"
                    />
                  );
                }
                const dayDate = cell.date;
                const count = countForDay(dayDate);
                const selected = dayKey(dayDate) === dayKey(selectedDate);
                const intensity =
                  count >= 4 ? "high" : count >= 2 ? "mid" : count > 0 ? "low" : "none";
                return (
                  <button
                    key={dayDate.toISOString()}
                    className={`calendar-day ${intensity} ${
                      selected ? "active" : ""
                    }`}
                    onClick={() => openDrawerForDate(dayDate)}
                  >
                    <div className="calendar-day-number">{pad(dayDate.getDate())}</div>
                    <span>{count} jobs</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {drawerOpen ? (
        <div
          role="presentation"
          onClick={() => setDrawerOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(3, 7, 18, 0.7)",
            backdropFilter: "blur(6px)",
            zIndex: 40,
          }}
        />
      ) : null}
      <div
        className="calendar-drawer"
        style={{
          transform: drawerOpen ? "translateX(0)" : "translateX(105%)",
        }}
      >
        <div className="calendar-manifest-header">
          <div>
            <div className="war-room-kicker">Manifest</div>
            <div className="war-room-title" style={{ fontSize: "1.4rem" }}>
              {selectedDate.toLocaleDateString(undefined, {
                weekday: "long",
                month: "short",
                day: "2-digit",
                year: "numeric",
              })}
            </div>
            <div className="calendar-manifest-badge">
              {dayAppointments.length} Jobs Scheduled
            </div>
          </div>
          <button className="button-primary" onClick={() => setDrawerOpen(false)}>
            Close
          </button>
        </div>

        <div className="calendar-manifest-scroll">
          {dayAppointments.length ? (
            <>
              <div className="calendar-manifest-nav">
                <button
                  className="manifest-nav-button"
                  onClick={() => handleManifestStep(-1)}
                  disabled={manifestIndex === 0}
                >
                  ◀
                </button>
                <div className="manifest-nav-meta">
                  <div className="manifest-nav-label">Manifest Index</div>
                  <div className="manifest-nav-count">
                    {manifestIndex + 1} / {dayAppointments.length}
                  </div>
                </div>
                <button
                  className="manifest-nav-button"
                  onClick={() => handleManifestStep(1)}
                  disabled={manifestIndex >= dayAppointments.length - 1}
                >
                  ▶
                </button>
              </div>
              {dayAppointments[manifestIndex] ? (() => {
                const appt = dayAppointments[manifestIndex];
                const timeLabel = appt.start_time
                  ? new Date(appt.start_time).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "--";
                return (
                  <div
                    key={appt.id}
                    id={`manifest-${appt.id}`}
                    className="calendar-manifest-card manifest-focus-card"
                  >
                    <div className="calendar-manifest-meta">
                      <span className="badge">
                        {(appt.status || "booked").toString().toUpperCase()}
                      </span>
                      <span className="calendar-manifest-time">{timeLabel}</span>
                    </div>
                    <h3>
                      {appt.customer_name || "Unknown"}{" "}
                      {appt.notes ? `(${appt.notes})` : ""}
                    </h3>
                    <p>{appt.location || "Location TBD"}</p>
                    <div className="calendar-manifest-actions">
                      {appt.customer_phone ? (
                        <a
                          className="action-button"
                          href={`tel:${appt.customer_phone}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          📞 Call
                        </a>
                      ) : (
                        <span className="action-button muted">📞 Call</span>
                      )}
                      <button
                        className="action-button"
                        type="button"
                        onClick={() => openEditModal(appt)}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        className="action-button danger"
                        type="button"
                        onClick={() => handleDeleteAppointment(appt.id)}
                      >
                        🗑 Delete
                      </button>
                    </div>
                  </div>
                );
              })() : null}
            </>
          ) : (
            <div className="calendar-manifest-empty">
              No jobs scheduled for this day yet.
            </div>
          )}
        </div>

        <div className="calendar-manifest-footer">
          <button
            className="glow-button deck-action"
            onClick={() => openCreateModal(selectedDate)}
          >
            + Add New Job to {selectedDate.toLocaleDateString(undefined, { month: "short", day: "2-digit" })}
          </button>
        </div>
      </div>

      {createOpen ? (
        <div className="glass-modal" onClick={() => setCreateOpen(false)}>
          <div
            className="glass-modal-card calendar-modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="calendar-modal-header">
              <div>
                <div className="war-room-kicker">Configure New Deployment</div>
                <div className="war-room-title" style={{ fontSize: "1.6rem" }}>
                  New Appointment
                </div>
              </div>
              <button className="button-primary" onClick={() => setCreateOpen(false)}>
                Close
              </button>
            </div>

            <div className="calendar-modal-grid">
              <div className="calendar-modal-section">
                <div className="deck-title">Customer Intel</div>
                <label className="deck-label">Name</label>
                <input
                  className="glass-input"
                  value={form.customer_name}
                  onChange={(e) => mergeForm({ customer_name: e.target.value })}
                  placeholder="Jane Smith"
                />
                <label className="deck-label">Phone</label>
                <input
                  className="glass-input mono"
                  value={form.customer_phone}
                  onChange={(e) => mergeForm({ customer_phone: e.target.value })}
                  onBlur={(e) => {
                    const normalized = normalizePhone(e.target.value);
                    if (normalized) {
                      mergeForm({ customer_phone: normalized });
                    }
                  }}
                  placeholder="+1 555 220 1399"
                />
                <label className="deck-label">Address</label>
                <input
                  className="glass-input"
                  value={form.location}
                  onChange={(e) => mergeForm({ location: e.target.value })}
                  placeholder="123 Service Rd"
                />
                <label className="deck-label">Date</label>
                <input
                  className="glass-input"
                  type="date"
                  value={form.start_date}
                  onChange={(e) => mergeForm({ start_date: e.target.value })}
                />
                <label className="deck-label">Time Window</label>
                <input
                  className="glass-input"
                  type="time"
                  value={form.start_time}
                  onChange={(e) => mergeForm({ start_time: e.target.value })}
                />
                <label className="deck-label">Duration</label>
                <select
                  className="glass-input"
                  value={form.duration_minutes}
                  onChange={(e) => mergeForm({ duration_minutes: e.target.value })}
                >
                  <option value="30">30 minutes</option>
                  <option value="60">60 minutes</option>
                  <option value="90">90 minutes</option>
                  <option value="120">120 minutes</option>
                </select>
                <label className="deck-label">Notes</label>
                <textarea
                  className="glass-input"
                  rows="3"
                  value={form.notes}
                  onChange={(e) => mergeForm({ notes: e.target.value })}
                  placeholder="Special instructions..."
                />
              </div>

              <div className="calendar-modal-section">
                <div className="deck-title">Mission Control</div>
                <div className="calendar-modal-tabs">
                  <div className="calendar-tab">
                    <div className="deck-title">Automation</div>
                    <label className="toggle" style={{ display: "flex", alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={form.send_confirmation}
                        onChange={(e) => mergeForm({ send_confirmation: e.target.checked })}
                      />
                      <span className="toggle-slider" />
                      <span className="toggle-label">
                        Send Immediate Booking Confirmation
                      </span>
                    </label>
                    <label className="deck-label">Pre-Arrival Reminder</label>
                    <select
                      className="glass-input"
                      value={form.reminder_minutes}
                      onChange={(e) => mergeForm({ reminder_minutes: e.target.value })}
                    >
                      <option value="0">No reminder</option>
                      <option value="15">15 minutes before</option>
                      <option value="60">1 hour before</option>
                    </select>
                    <div className="deck-status">
                      System will text customer automatically.
                    </div>
                  </div>
                  <div className="calendar-tab">
                    <div className="deck-title">Tracking (Elite)</div>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={form.eta_enabled}
                        onChange={(e) => mergeForm({ eta_enabled: e.target.checked })}
                      />
                      <span className="toggle-slider" />
                      <span className="toggle-label">Enable Live GPS Link</span>
                    </label>
                    <label className="deck-label">ETA Minutes</label>
                    <select
                      className="glass-input"
                      value={form.eta_minutes}
                      onChange={(e) => mergeForm({ eta_minutes: e.target.value })}
                    >
                      <option value="5">5 minutes</option>
                      <option value="10">10 minutes</option>
                      <option value="15">15 minutes</option>
                    </select>
                    <label className="deck-label">Tracking URL</label>
                    <input
                      className="glass-input"
                      value={form.eta_link}
                      onChange={(e) => mergeForm({ eta_link: e.target.value })}
                      placeholder="https://maps.google.com/?q=..."
                    />
                    <button className="button-primary" onClick={handleCreateTracking}>
                      Generate Tracking URL
                    </button>
                    {trackingStatus ? (
                      <div className="deck-status">{trackingStatus}</div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {messageStatus ? <div className="deck-status">{messageStatus}</div> : null}
            {!canConfirm && !messageStatus ? (
              <div className="deck-status">
                Complete customer name, date, and time to confirm.
              </div>
            ) : null}
            <div className="calendar-modal-footer">
              <button className="button-primary muted" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button
                className="glow-button deck-action"
                onClick={handleCreate}
                disabled={!canConfirm}
              >
                Confirm & Book
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editOpen ? (
        <div className="glass-modal" onClick={closeEditModal}>
          <div
            className="glass-modal-card calendar-modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="calendar-modal-header">
              <div>
                <div className="war-room-kicker">Update Manifest</div>
                <div className="war-room-title" style={{ fontSize: "1.6rem" }}>
                  Edit Appointment
                </div>
              </div>
              <button className="button-primary" onClick={closeEditModal}>
                Close
              </button>
            </div>

            <div className="calendar-modal-grid">
              <div className="calendar-modal-section">
                <div className="deck-title">Customer Intel</div>
                <label className="deck-label">Name</label>
                <input
                  className="glass-input"
                  value={editForm.customer_name}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, customer_name: e.target.value }))
                  }
                  placeholder="Jane Smith"
                />
                <label className="deck-label">Phone</label>
                <input
                  className="glass-input mono"
                  value={editForm.customer_phone}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, customer_phone: e.target.value }))
                  }
                  onBlur={(e) => {
                    const normalized = normalizePhone(e.target.value);
                    if (normalized) {
                      setEditForm((prev) => ({ ...prev, customer_phone: normalized }));
                    }
                  }}
                  placeholder="+1 555 220 1399"
                />
                <label className="deck-label">Address</label>
                <input
                  className="glass-input"
                  value={editForm.location}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, location: e.target.value }))
                  }
                  placeholder="123 Service Rd"
                />
                <label className="deck-label">Date</label>
                <input
                  className="glass-input"
                  type="date"
                  value={editForm.start_date}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, start_date: e.target.value }))
                  }
                />
                <label className="deck-label">Time Window</label>
                <input
                  className="glass-input"
                  type="time"
                  value={editForm.start_time}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, start_time: e.target.value }))
                  }
                />
                <label className="deck-label">Duration</label>
                <select
                  className="glass-input"
                  value={editForm.duration_minutes}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      duration_minutes: e.target.value,
                    }))
                  }
                >
                  <option value="30">30 minutes</option>
                  <option value="60">60 minutes</option>
                  <option value="90">90 minutes</option>
                  <option value="120">120 minutes</option>
                </select>
                <label className="deck-label">Notes</label>
                <textarea
                  className="glass-input"
                  rows="3"
                  value={editForm.notes}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder="Special instructions..."
                />
              </div>

              <div className="calendar-modal-section">
                <div className="deck-title">Mission Control</div>
                <div className="calendar-modal-tabs">
                  <div className="calendar-tab">
                    <div className="deck-title">Automation</div>
                    <label className="toggle" style={{ display: "flex", alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={editForm.reminder_enabled}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            reminder_enabled: e.target.checked,
                          }))
                        }
                      />
                      <span className="toggle-slider" />
                      <span className="toggle-label">Send Reminder</span>
                    </label>
                    <label className="deck-label">Pre-Arrival Reminder</label>
                    <select
                      className="glass-input"
                      value={editForm.reminder_minutes}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          reminder_minutes: e.target.value,
                        }))
                      }
                    >
                      <option value="0">No reminder</option>
                      <option value="15">15 minutes before</option>
                      <option value="60">1 hour before</option>
                    </select>
                    <div className="deck-status">
                      Adjust reminder timing or disable if needed.
                    </div>
                  </div>
                  <div className="calendar-tab">
                    <div className="deck-title">Tracking (Elite)</div>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={editForm.eta_enabled}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            eta_enabled: e.target.checked,
                          }))
                        }
                      />
                      <span className="toggle-slider" />
                      <span className="toggle-label">Enable Live GPS Link</span>
                    </label>
                    <label className="deck-label">ETA Minutes</label>
                    <select
                      className="glass-input"
                      value={editForm.eta_minutes}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, eta_minutes: e.target.value }))
                      }
                    >
                      <option value="5">5 minutes</option>
                      <option value="10">10 minutes</option>
                      <option value="15">15 minutes</option>
                    </select>
                    <label className="deck-label">Tracking URL</label>
                    <input
                      className="glass-input"
                      value={editForm.eta_link}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, eta_link: e.target.value }))
                      }
                      placeholder="https://maps.google.com/?q=..."
                    />
                  </div>
                </div>
              </div>
            </div>

            {editStatus ? <div className="deck-status">{editStatus}</div> : null}
            {deleteStatus ? <div className="deck-status">{deleteStatus}</div> : null}
            <div className="calendar-modal-footer">
              <button className="button-primary muted" onClick={closeEditModal}>
                Cancel
              </button>
              <button className="button-primary danger" onClick={() => handleDeleteAppointment(editAppointmentId)}>
                Delete
              </button>
              <button className="glow-button deck-action" onClick={handleEditSave}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
