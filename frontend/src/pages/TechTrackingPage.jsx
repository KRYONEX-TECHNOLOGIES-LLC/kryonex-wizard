import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import BackgroundGrid from "../components/BackgroundGrid.jsx";
import TrackingMap from "../components/TrackingMap.jsx";
import { postTrackingUpdate, getTrackingPoints, getTrackingSession } from "../lib/api";

export default function TechTrackingPage() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const key = searchParams.get("key");
  const [status, setStatus] = React.useState("idle");
  const [error, setError] = React.useState("");
  const [points, setPoints] = React.useState([]);
  const [session, setSession] = React.useState(null);
  const watchRef = React.useRef(null);

  const refresh = React.useCallback(async () => {
    if (!token) return;
    try {
      const [sessionRes, pointsRes] = await Promise.all([
        getTrackingSession(token),
        getTrackingPoints(token),
      ]);
      setSession(sessionRes.data?.session || null);
      setPoints(pointsRes.data?.points || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }, [token]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const sendUpdate = async (position) => {
    if (!token || !key) return;
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    try {
      await postTrackingUpdate({ token, key, lat, lng });
      setStatus("live");
      refresh();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const startTracking = () => {
    setError("");
    if (!navigator.geolocation) {
      setError("Geolocation not supported on this device.");
      return;
    }
    setStatus("starting");
    watchRef.current = navigator.geolocation.watchPosition(
      sendUpdate,
      (err) => setError(err.message),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
  };

  const stopTracking = () => {
    if (watchRef.current) {
      navigator.geolocation.clearWatch(watchRef.current);
    }
    setStatus("stopped");
  };

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
            TECH TRACKING
          </div>
          <h2 style={{ marginTop: "0.6rem", fontSize: "2rem" }}>
            Live Location Uplink
          </h2>
          <div style={{ color: "#9ca3af", marginTop: "0.6rem" }}>
            Status: {status} {session?.eta_minutes ? `• ETA ${session.eta_minutes}m` : ""}
          </div>
          {error ? (
            <div style={{ color: "#f87171", marginTop: "1rem" }}>{error}</div>
          ) : null}
          <div style={{ display: "flex", gap: "0.8rem", marginTop: "1rem" }}>
            <button className="button-primary" onClick={startTracking}>
              Start Tracking
            </button>
            <button className="button-primary" onClick={stopTracking}>
              Stop
            </button>
          </div>
        </div>

        <div className="glass" style={{ padding: "1.5rem", marginTop: "1.5rem" }}>
          <TrackingMap
            points={points}
            center={
              points.length
                ? [points[points.length - 1].lng, points[points.length - 1].lat]
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
