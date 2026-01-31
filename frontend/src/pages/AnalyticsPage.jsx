import React from "react";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { getAnalytics } from "../lib/api";
import { supabase } from "../lib/supabase";

// Simple bar chart component (no external dependencies)
const SimpleBarChart = ({ data, dataKey, labelKey, color = "#22d3ee", height = 200 }) => {
  if (!data || !data.length) return <div className="chart-empty">No data available</div>;
  
  const maxValue = Math.max(...data.map(d => d[dataKey] || 0), 1);
  
  return (
    <div className="simple-chart bar-chart" style={{ height }}>
      <div className="chart-bars">
        {data.map((item, index) => {
          const value = item[dataKey] || 0;
          const heightPercent = (value / maxValue) * 100;
          const label = labelKey === "hour" 
            ? `${item[labelKey]}:00` 
            : labelKey === "date" 
              ? new Date(item[labelKey]).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : item[labelKey];
          return (
            <div key={index} className="chart-bar-group">
              <div className="chart-bar-container">
                <div 
                  className="chart-bar" 
                  style={{ 
                    height: `${heightPercent}%`,
                    backgroundColor: color
                  }}
                  title={`${label}: ${value}`}
                />
              </div>
              <div className="chart-bar-label">{label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Simple line chart component
const SimpleLineChart = ({ data, dataKey, labelKey, color = "#22d3ee", height = 200 }) => {
  if (!data || !data.length) return <div className="chart-empty">No data available</div>;
  
  const values = data.map(d => d[dataKey] || 0);
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const range = maxValue - minValue || 1;
  
  // Create SVG path
  const width = 100;
  const chartHeight = 80;
  const points = data.map((item, index) => {
    const x = (index / (data.length - 1 || 1)) * width;
    const y = chartHeight - ((item[dataKey] - minValue) / range) * chartHeight;
    return `${x},${y}`;
  }).join(" ");
  
  return (
    <div className="simple-chart line-chart" style={{ height }}>
      <svg viewBox={`0 0 ${width} ${chartHeight + 20}`} preserveAspectRatio="none" className="line-chart-svg">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          points={points}
        />
        {data.map((item, index) => {
          const x = (index / (data.length - 1 || 1)) * width;
          const y = chartHeight - ((item[dataKey] - minValue) / range) * chartHeight;
          return (
            <circle
              key={index}
              cx={x}
              cy={y}
              r="2"
              fill={color}
            />
          );
        })}
      </svg>
      <div className="line-chart-labels">
        {data.filter((_, i) => i % Math.ceil(data.length / 7) === 0 || i === data.length - 1).map((item, index) => (
          <span key={index}>
            {new Date(item[labelKey]).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        ))}
      </div>
    </div>
  );
};

// Simple pie/donut chart component
const SimplePieChart = ({ data, colors = ["#22d3ee", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#6b7280"] }) => {
  if (!data) return <div className="chart-empty">No data available</div>;
  
  const entries = Object.entries(data).filter(([_, value]) => value > 0);
  const total = entries.reduce((sum, [_, value]) => sum + value, 0);
  
  if (total === 0) return <div className="chart-empty">No data available</div>;
  
  let cumulativePercent = 0;
  
  return (
    <div className="simple-chart pie-chart">
      <div className="pie-chart-visual">
        <svg viewBox="0 0 100 100" className="pie-svg">
          {entries.map(([key, value], index) => {
            const percent = (value / total) * 100;
            const startAngle = cumulativePercent * 3.6;
            const endAngle = (cumulativePercent + percent) * 3.6;
            cumulativePercent += percent;
            
            // Calculate arc
            const startRad = (startAngle - 90) * Math.PI / 180;
            const endRad = (endAngle - 90) * Math.PI / 180;
            const largeArc = percent > 50 ? 1 : 0;
            
            const x1 = 50 + 40 * Math.cos(startRad);
            const y1 = 50 + 40 * Math.sin(startRad);
            const x2 = 50 + 40 * Math.cos(endRad);
            const y2 = 50 + 40 * Math.sin(endRad);
            
            return (
              <path
                key={key}
                d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`}
                fill={colors[index % colors.length]}
                stroke="#0a0a0a"
                strokeWidth="1"
              />
            );
          })}
          <circle cx="50" cy="50" r="25" fill="#0a0a0a" />
        </svg>
      </div>
      <div className="pie-legend">
        {entries.map(([key, value], index) => (
          <div key={key} className="pie-legend-item">
            <span className="pie-legend-color" style={{ backgroundColor: colors[index % colors.length] }} />
            <span className="pie-legend-label">{key}</span>
            <span className="pie-legend-value">{value} ({Math.round((value / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = React.useState("7d");
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [isSeller, setIsSeller] = React.useState(false);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [lastUpdated, setLastUpdated] = React.useState(null);

  // Load analytics data
  React.useEffect(() => {
    let mounted = true;
    const loadAnalytics = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getAnalytics(period);
        if (mounted) {
          setData(res.data);
          setLastUpdated(new Date());
        }
      } catch (err) {
        console.error("Failed to load analytics:", err);
        if (mounted) {
          setError("Failed to load analytics data");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadAnalytics();
    return () => { mounted = false; };
  }, [period]);

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

  // Filter peak hours to show only significant ones
  const peakHoursFiltered = React.useMemo(() => {
    if (!data?.peak_hours) return [];
    return data.peak_hours.filter(h => h.count > 0);
  }, [data]);

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
              <div className="war-room-kicker">INTELLIGENCE METRICS</div>
              <div className="war-room-title">Analytics Command</div>
            </div>
            <div className="war-room-actions">
              <button className="button-primary" onClick={() => navigate("/dashboard")}>
                Back to Command Deck
              </button>
            </div>
          </div>

          {/* Period Selector */}
          <div className="glass-panel analytics-period-selector">
            <span className="period-label">Time Period:</span>
            <div className="period-buttons">
              <button 
                className={`period-btn ${period === "7d" ? "active" : ""}`}
                onClick={() => setPeriod("7d")}
              >
                7 Days
              </button>
              <button 
                className={`period-btn ${period === "30d" ? "active" : ""}`}
                onClick={() => setPeriod("30d")}
              >
                30 Days
              </button>
              <button 
                className={`period-btn ${period === "90d" ? "active" : ""}`}
                onClick={() => setPeriod("90d")}
              >
                90 Days
              </button>
            </div>
          </div>

          {loading ? (
            <div className="glass-panel" style={{ padding: "2rem", textAlign: "center" }}>
              Loading analytics data...
            </div>
          ) : error ? (
            <div className="glass-panel" style={{ padding: "2rem", textAlign: "center", color: "#ef4444" }}>
              {error}
            </div>
          ) : (
            <>
              {/* Summary Stats */}
              {data?.summary && (
                <div className="analytics-summary glass-panel">
                  <div className="summary-stat">
                    <div className="stat-value">{data.summary.total_calls || 0}</div>
                    <div className="stat-label">Total Calls</div>
                  </div>
                  <div className="summary-stat">
                    <div className="stat-value">{data.summary.total_booked || 0}</div>
                    <div className="stat-label">Booked</div>
                  </div>
                  <div className="summary-stat">
                    <div className="stat-value">{data.summary.overall_booking_rate || 0}%</div>
                    <div className="stat-label">Booking Rate</div>
                  </div>
                  <div className="summary-stat">
                    <div className="stat-value">
                      {Math.floor((data.summary.avg_duration_seconds || 0) / 60)}:{String((data.summary.avg_duration_seconds || 0) % 60).padStart(2, '0')}
                    </div>
                    <div className="stat-label">Avg Duration</div>
                  </div>
                </div>
              )}

              {/* Charts Grid */}
              <div className="analytics-charts-grid">
                {/* Calls Per Day */}
                <div className="chart-card glass-panel">
                  <h3 className="chart-title">CALLS PER DAY</h3>
                  <SimpleLineChart 
                    data={data?.calls_per_day || []}
                    dataKey="count"
                    labelKey="date"
                    color="#22d3ee"
                    height={180}
                  />
                </div>

                {/* Booking Rate Trend */}
                <div className="chart-card glass-panel">
                  <h3 className="chart-title">BOOKING RATE TREND</h3>
                  <SimpleLineChart 
                    data={data?.booking_rate_trend || []}
                    dataKey="rate"
                    labelKey="date"
                    color="#10b981"
                    height={180}
                  />
                </div>

                {/* Peak Hours */}
                <div className="chart-card glass-panel">
                  <h3 className="chart-title">PEAK HOURS</h3>
                  <SimpleBarChart 
                    data={peakHoursFiltered.length > 0 ? peakHoursFiltered : data?.peak_hours?.slice(6, 22) || []}
                    dataKey="count"
                    labelKey="hour"
                    color="#f59e0b"
                    height={180}
                  />
                </div>

                {/* Call Outcomes */}
                <div className="chart-card glass-panel">
                  <h3 className="chart-title">CALL OUTCOMES</h3>
                  <SimplePieChart 
                    data={data?.outcome_breakdown}
                    colors={["#10b981", "#3b82f6", "#ef4444", "#f59e0b", "#8b5cf6", "#6b7280"]}
                  />
                </div>

                {/* Sentiment Breakdown */}
                <div className="chart-card glass-panel">
                  <h3 className="chart-title">SENTIMENT BREAKDOWN</h3>
                  <SimplePieChart 
                    data={data?.sentiment_breakdown}
                    colors={["#10b981", "#6b7280", "#ef4444"]}
                  />
                </div>

                {/* Avg Duration Trend */}
                {data?.avg_duration_trend?.length > 0 && (
                  <div className="chart-card glass-panel">
                    <h3 className="chart-title">AVG DURATION TREND (Weekly)</h3>
                    <SimpleBarChart 
                      data={data.avg_duration_trend}
                      dataKey="avg_seconds"
                      labelKey="date"
                      color="#8b5cf6"
                      height={180}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
