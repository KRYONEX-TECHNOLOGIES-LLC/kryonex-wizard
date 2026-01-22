import React from "react";
import { useParams } from "react-router-dom";
import { getTrackingSession, getTrackingPoints } from "../lib/api";
import TrackingMap from "../components/TrackingMap.jsx";
import BackgroundGrid from "../components/BackgroundGrid.jsx";

export default function TrackingSharePage() {
  const { token } = useParams();
  const [session, setSession] = React.useState(null);
  const [points, setPoints] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const fetchTracking = React.useCallback(async () => {
    if (!token) return;
    try {
      const [sessionRes, pointsRes] = await Promise.all([
        getTrackingSession(token),
        getTrackingPoints(token),
      ]);
      setSession(sessionRes.data?.session || null);
      setPoints(pointsRes.data?.points || []);
      setError("");
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    fetchTracking();
    const interval = setInterval(fetchTracking, 5000);
    return () => clearInterval(interval);
  }, [fetchTracking]);

  const last = points?.[points.length - 1];

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      <BackgroundGrid />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: "980px",
          margin: "0 auto",
          padding: "4rem 1.5rem",
        }}
      >
        <div className="glass" style={{ padding: "2rem" }}>
          <div style={{ letterSpacing: "0.2rem", color: "#22d3ee" }}>
            LIVE TRACKING
          </div>
          <h2 style={{ marginTop: "0.6rem", fontSize: "2rem" }}>
            Your Technician Is En Route
          </h2>
          {error ? (
            <div style={{ color: "#f87171", marginTop: "1rem" }}>{error}</div>
          ) : null}
          {loading ? (
            <div style={{ color: "#9ca3af", marginTop: "1rem" }}>
              Loading live location...
            </div>
          ) : (
            <div style={{ color: "#9ca3af", marginTop: "0.6rem" }}>
              Status: {session?.status || "active"} • ETA{" "}
              {session?.eta_minutes || "—"} minutes
            </div>
          )}
        </div>

        <div className="glass" style={{ padding: "1.5rem", marginTop: "1.5rem" }}>
          <TrackingMap
            points={points}
            center={
              last ? [last.lng, last.lat] : session?.last_lng && session?.last_lat
                ? [session.last_lng, session.last_lat]
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
