import React from "react";
import { motion } from "framer-motion";
import { Play, ArrowLeft, ArrowRight, X, Send } from "lucide-react";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { getSavedState, saveState } from "../lib/persistence.js";

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CALENDAR_MONTH_KEY = "calendar.currentMonth";
const CALENDAR_SELECTED_KEY = "calendar.selectedDate";
const CALENDAR_ROSTER_KEY = "calendar.activeRoster";

const dayInsights = {
  "2026-01-05": { revenue: 12500, staff: 4 },
  "2026-01-12": { revenue: 9800, staff: 3 },
  "2026-01-14": { revenue: 15450, staff: 5 },
  "2026-01-24": { revenue: 16800, staff: 6 },
};

const dayBriefs = {
  "2026-01-05": {
    roster: [
      { name: "John Doe", shift: "09:00 - 17:00" },
      { name: "Sarah Lee", shift: "12:00 - 20:00" },
      { name: "Maya Patel", shift: "08:00 - 16:00" },
    ],
    schedule: [
      { title: "Apex Plumbing Demo", time: "09:30", value: 4200, closer: "John Doe", type: "demo" },
      { title: "Northwind HVAC Closing", time: "13:15", value: 6100, closer: "Sarah Lee", type: "closing" },
      { title: "Sterling HVAC Inbound", time: "16:30", value: 2100, closer: "Maya Patel", type: "call" },
    ],
    stats: { demos: 3, target: "Atlanta Suburbs" },
  },
  "2026-01-12": {
    roster: [
      { name: "Ari Chen", shift: "07:00 - 15:00" },
      { name: "Ryder Cole", shift: "10:00 - 18:00" },
    ],
    schedule: [
      { title: "Metro HVAC Demo", time: "10:00", value: 3800, closer: "Ari Chen", type: "demo" },
      { title: "Ridgeway Plumbing Follow Up", time: "14:00", value: 2700, closer: "Ryder Cole", type: "closing" },
    ],
    stats: { demos: 2, target: "Toledo Metro" },
  },
  "2026-01-24": {
    roster: [
      { name: "Kai Mendoza", shift: "08:00 - 14:00" },
      { name: "Jordan Park", shift: "11:00 - 19:00" },
      { name: "Taylor Brooks", shift: "09:00 - 17:00" },
    ],
    schedule: [
      { title: "North City Demo", time: "09:00", value: 4500, closer: "Kai Mendoza", type: "demo" },
      { title: "Steel River Closing", time: "12:30", value: 7200, closer: "Jordan Park", type: "closing" },
      { title: "Apex Plumbing Demo", time: "15:00", value: 4200, closer: "Taylor Brooks", type: "demo" },
    ],
    stats: { demos: 3, target: "Cleveland Corridor" },
  },
};

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

const DAILY_GOAL = 20000;

const fallbackDetails = {
  roster: [
    { name: "Field Team Standby", shift: "On Call" },
    { name: "Support Pool", shift: "Remote" },
  ],
  schedule: [],
  stats: { demos: 0, target: "HVAC + Plumbing" },
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

  const selectedKey = selectedDate ? formatDateKey(selectedDate) : null;
  const selectedDetails = selectedKey ? dayBriefs[selectedKey] || fallbackDetails : null;
  const highlightRevenue = selectedKey ? dayInsights[selectedKey] : null;
  const selectedDateObj = selectedDate;
  const storedRoster = getSavedState(CALENDAR_ROSTER_KEY);
  const defaultRoster = dayBriefs[formatDateKey(today)]?.roster?.[0]?.name || null;
  const [activeRoster, setActiveRoster] = React.useState(
    () => storedRoster || defaultRoster
  );

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

  const persistActiveRoster = (value) => {
    setActiveRoster(value);
    saveState(CALENDAR_ROSTER_KEY, value);
  };

  const monthLabel = currentMonth.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  const goToPrevMonth = () =>
    updateCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  const goToNextMonth = () =>
    updateCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  const bookedValue = selectedDetails
    ? selectedDetails.schedule.reduce((sum, event) => sum + (event.value || 0), 0)
    : 0;
  const progressPercent = Math.min((bookedValue / DAILY_GOAL) * 100, 100);

  React.useEffect(() => {
    if (!selectedDetails) {
      persistActiveRoster(null);
      return;
    }
    const firstName = selectedDetails.roster[0]?.name || null;
    persistActiveRoster(firstName);
  }, [selectedDetails, selectedKey]);

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
                  A familiar month view spotlighting revenue potential and staffing.
                </p>
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
                const revenueCell = dayInsights[cell.key]?.revenue;
                const staffCell = dayInsights[cell.key]?.staff;
                const isToday = cell.key === formatDateKey(today);
                const isSelected = selectedKey ? cell.key === selectedKey : false;
                return (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => persistSelectedDate(normalizeDate(cell.date))}
                    className={`calendar-cell ${
                      cell.isCurrentMonth ? "" : "calendar-cell-inactive"
                    } ${isToday ? "calendar-cell-today" : ""} ${
                      isSelected ? "calendar-cell-selected" : ""
                    }`}
                    disabled={!cell.isCurrentMonth}
                  >
                    {cell.isCurrentMonth ? (
                      <>
                        <div className="calendar-date">{cell.date.getDate()}</div>
                        <div className="calendar-revenue">
                          {revenueCell ? formatCurrency(revenueCell) : "—"}
                        </div>
                        <div className="calendar-staff">
                          {staffCell ? `${staffCell} Agents` : "Staff data"}
                        </div>
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

      {selectedDate && selectedDetails && (
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
                <p className="text-xs text-white/50">Operations Briefing</p>
                <h2 className="text-2xl font-semibold">
                  {selectedDateObj.toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </h2>
              </div>
              <button
                aria-label="Close briefing"
                className="nav-dot"
                onClick={() => persistSelectedDate(null)}
              >
                <X size={16} />
              </button>
            </div>

            <section className="slide-section">
              <p className="section-label">Section A · The Roster</p>
              <div className="slide-list">
                {selectedDetails.roster.map((person) => {
                  const isActive = activeRoster === person.name;
                  return (
                    <div
                      key={person.name}
                      className={`slide-row roster-card ${isActive ? "roster-card-active" : ""}`}
                      onClick={() => setActiveRoster(person.name)}
                    >
                      <div>
                        <div className="font-semibold">{person.name}</div>
                        <div className="text-xs text-white/50">{person.shift}</div>
                      </div>
                      <div className="roster-actions">
                        <span
                          className={`status-dot ${
                            isActive ? "status-dot-active" : "status-dot-inactive"
                          }`}
                        />
                        <button
                          type="button"
                          className="roster-message"
                          onClick={(event) => {
                            event.stopPropagation();
                            console.log(`Open chat with ${person.name}`);
                          }}
                        >
                          <Send size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="slide-section">
              <p className="section-label">Section B · The Schedule</p>
              <div className="slide-list slide-list-gap">
                {selectedDetails.schedule.length === 0 ? (
                  <div className="slide-empty">No demos booked. Keep dialing.</div>
                ) : (
                  selectedDetails.schedule.map((event) => (
                    <div key={event.title} className="event-card">
                      <div className="event-meta">
                        <span className="text-xs text-white/50">{event.time}</span>
                        <span className="badge badge-outline">{event.type.toUpperCase()}</span>
                      </div>
                      <div className="text-sm font-semibold">{event.title}</div>
                      <div className="text-xs text-white/60">
                        Closer: {event.closer} · {formatCurrency(event.value)}
                      </div>
                      <button className="zoom-button event-zoom">
                        <Play size={12} /> Join Zoom
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="slide-section">
              <p className="section-label">Section C · Stats</p>
              <div className="stat-row">
                <div className="stat-pill">{selectedDetails.stats.demos} Demos Booked</div>
                <div className="stat-pill stat-pill-highlight">
                  Target: {selectedDetails.stats.target}
                </div>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
              </div>
              <div className="progress-label">
                <span>Booked {formatCurrency(bookedValue)}</span>
                <span>Goal {formatCurrency(DAILY_GOAL)}</span>
              </div>
              {highlightRevenue && (
                <div className="stat-footnote">
                  Revenue potential: {formatCurrency(highlightRevenue)}
                </div>
              )}
            </section>
          </motion.div>
        </>
      )}
    </div>
  );
}
