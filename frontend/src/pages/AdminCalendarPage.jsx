import React from "react";
import { motion } from "framer-motion";
import { Play, ArrowLeft, ArrowRight, X, Send, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { getSavedState, saveState } from "../lib/persistence.js";
import { getAdminAppointments } from "../lib/api.js";

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CALENDAR_MONTH_KEY = "calendar.currentMonth";
const CALENDAR_SELECTED_KEY = "calendar.selectedDate";

const formatDateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${
    String(date.getDate()).padStart(2, "0")
  }`;

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const formatTime = (dateStr) => {
  if (!dateStr) return "--";
  const date = new Date(dateStr);
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
};

const buildMonthGrid = (month) => {
  const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const startDay = startOfMonth.getDay();
  const gridStart = new Date(startOfMonth);
  gridStart.setDate(gridStart.getDate() - startDay);

  return Array.from({ length: 42 }).map((_, index) => {
    const cell = new Date(gridStart);
    cell.setDate(gridStart.getDate() + index);
    return {
      date: cell,
      isCurrentMonth: cell.getMonth() === month.getMonth(),
      key: formatDateKey(cell),
    };
  });
};

export default function AdminCalendarPage() {
  const navigate = useNavigate();
  const today = React.useMemo(() => new Date(), []);
  const storedMonth = getSavedState(CALENDAR_MONTH_KEY);
  const [currentMonth, setCurrentMonth] = React.useState(() =>
    storedMonth
      ? new Date(storedMonth)
      : new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const normalizeDate = (date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const storedSelected = getSavedState(CALENDAR_SELECTED_KEY);
  const [selectedDate, setSelectedDate] = React.useState(() =>
    storedSelected ? new Date(storedSelected) : null
  );
  const monthGrid = React.useMemo(() => buildMonthGrid(currentMonth), [currentMonth]);

  // Real appointments data
  const [appointments, setAppointments] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  // Fetch real appointments
  const fetchAppointments = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getAdminAppointments();
      setAppointments(response.data?.appointments || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to load appointments");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchAppointments();
    const interval = setInterval(fetchAppointments, 30000);
    return () => clearInterval(interval);
  }, [fetchAppointments]);

  // Group appointments by date
  const appointmentsByDate = React.useMemo(() => {
    const grouped = {};
    appointments.forEach((apt) => {
      const dateKey = formatDateKey(new Date(apt.start_time));
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(apt);
    });
    return grouped;
  }, [appointments]);

  const selectedKey = selectedDate ? formatDateKey(selectedDate) : null;
  const selectedAppointments = selectedKey ? appointmentsByDate[selectedKey] || [] : [];
  const selectedDateObj = selectedDate;

  const updateCurrentMonth = (updater) => {
    setCurrentMonth((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveState(CALENDAR_MONTH_KEY, next.toISOString());
      return next;
    });
  };

  const persistSelectedDate = (value) => {
    setSelectedDate(value);
    saveState(CALENDAR_SELECTED_KEY, value ? value.toISOString() : null);
  };

  const monthLabel = currentMonth.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  const goToPrevMonth = () =>
    updateCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  const goToNextMonth = () =>
    updateCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));

  return (
    <div className="min-h-screen bg-void-black text-white relative overflow-hidden">
      <TopMenu />
      <div className="absolute inset-0 bg-grid-lines opacity-30" />
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
            className="glass-panel rounded-3xl border border-white/10 p-6"
          >
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <button
                  aria-label="Previous month"
                  onClick={goToPrevMonth}
                  className="nav-dot"
                >
                  <ArrowLeft size={16} />
                </button>
                <div>
                  <p className="text-xs uppercase tracking-[0.4em] text-white/50">
                    Satellite Grid
                  </p>
                  <h1 className="mt-1 text-3xl font-semibold">{monthLabel}</h1>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm text-white/60">
                  All appointments across all users.
                </p>
                <button 
                  className="button-secondary flex items-center gap-2"
                  onClick={fetchAppointments}
                  disabled={loading}
                >
                  <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                  Refresh
                </button>
                <button aria-label="Next month" onClick={goToNextMonth} className="nav-dot">
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel rounded-3xl border border-white/10 p-6"
          >
            <div className="calendar-grid">
              {weekDays.map((day) => (
                <div key={day} className="calendar-weekday">
                  {day}
                </div>
              ))}
              {monthGrid.map((cell) => {
                const dayAppointments = appointmentsByDate[cell.key] || [];
                const appointmentCount = dayAppointments.length;
                const isToday = cell.key === formatDateKey(today);
                const isSelected = selectedKey ? cell.key === selectedKey : false;
                const hasAppointments = appointmentCount > 0;
                return (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => persistSelectedDate(normalizeDate(cell.date))}
                    className={`calendar-cell ${
                      cell.isCurrentMonth ? "" : "calendar-cell-inactive"
                    } ${isToday ? "calendar-cell-today" : ""} ${
                      isSelected ? "calendar-cell-selected" : ""
                    } ${hasAppointments ? "calendar-cell-has-events" : ""}`}
                    disabled={!cell.isCurrentMonth}
                  >
                    {cell.isCurrentMonth ? (
                      <>
                        <div className="calendar-date">{cell.date.getDate()}</div>
                        {hasAppointments ? (
                          <>
                            <div className="calendar-revenue text-neon-cyan">
                              {appointmentCount} Appt{appointmentCount !== 1 ? "s" : ""}
                            </div>
                            <div className="calendar-staff">
                              {dayAppointments.slice(0, 2).map((apt) => apt.business_name || "Client").join(", ")}
                              {appointmentCount > 2 ? ` +${appointmentCount - 2}` : ""}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="calendar-revenue text-white/30">—</div>
                            <div className="calendar-staff text-white/20">No appointments</div>
                          </>
                        )}
                      </>
                    ) : (
                      <div className="calendar-placeholder" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>

      {selectedDate && (
        <>
          <motion.div
            className="slide-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            onClick={() => persistSelectedDate(null)}
          />
          <motion.div
            className="slide-panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween" }}
          >
            <div className="slide-panel-header">
              <div>
                <p className="text-xs text-white/50">Appointments Overview</p>
                <h2 className="text-2xl font-semibold">
                  {selectedDateObj.toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </h2>
              </div>
              <button
                aria-label="Close panel"
                className="nav-dot"
                onClick={() => persistSelectedDate(null)}
              >
                <X size={16} />
              </button>
            </div>

            <section className="slide-section">
              <p className="section-label">Scheduled Appointments</p>
              <div className="slide-list slide-list-gap">
                {selectedAppointments.length === 0 ? (
                  <div className="slide-empty">No appointments scheduled for this day.</div>
                ) : (
                  selectedAppointments.map((apt) => (
                    <div key={apt.id} className="event-card">
                      <div className="event-meta">
                        <span className="text-xs text-white/50">{formatTime(apt.start_time)}</span>
                        <span className={`badge badge-outline ${apt.status === "completed" ? "text-neon-green" : apt.status === "cancelled" ? "text-neon-pink" : ""}`}>
                          {(apt.status || "scheduled").toUpperCase()}
                        </span>
                      </div>
                      <div className="text-sm font-semibold">{apt.customer_name || "Customer"}</div>
                      <div className="text-xs text-white/60">
                        Business: {apt.business_name || "Unknown"}
                      </div>
                      {apt.service_address && (
                        <div className="text-xs text-white/40 mt-1">
                          📍 {apt.service_address}
                        </div>
                      )}
                      {apt.notes && (
                        <div className="text-xs text-white/40 mt-1">
                          📝 {apt.notes}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="slide-section">
              <p className="section-label">Day Summary</p>
              <div className="stat-row">
                <div className="stat-pill">{selectedAppointments.length} Appointments</div>
                <div className="stat-pill">
                  {selectedAppointments.filter(a => a.status === "completed").length} Completed
                </div>
              </div>
              <div className="stat-row mt-2">
                <div className="stat-pill stat-pill-highlight">
                  {[...new Set(selectedAppointments.map(a => a.business_name))].length} Businesses
                </div>
              </div>
            </section>
          </motion.div>
        </>
      )}
    </div>
  );
}
