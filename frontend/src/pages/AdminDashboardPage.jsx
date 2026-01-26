import React from "react";
import { motion } from "framer-motion";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Activity,
  AlertTriangle,
  Gauge,
  Globe,
  Power,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { syncRetellTemplates } from "../lib/api";

const TICKER_EVENTS = [
  "Coaching Flag: John Doe - Off Script",
  "Script Check: Sarah - Missed Objection",
  "Flagged for Review: Team Alpha",
  "Call Logged: Tier 1 Prospect",
  "Lead Assigned: Team Bravo",
  "Demo Set: Cedar HVAC",
];

const widgetSeed = [
  { id: "coaching", label: "Coaching Opportunities", value: "18", tone: "text-neon-green" },
  { id: "adherence", label: "Script Adherence", value: "94%", tone: "text-neon-cyan" },
  { id: "callVolume", label: "Human Call Volume", value: "1,276", tone: "text-neon-purple" },
  { id: "flags", label: "Training Flags", value: "4", tone: "text-neon-pink" },
  { id: "leads", label: "Lead Flow", value: "248", tone: "text-neon-cyan" },
  { id: "shift", label: "Coaching Shift", value: "On Duty", tone: "text-neon-green" },
];

const statusRing = [
  { label: "Script Adherence", status: "good" },
  { label: "Coaching Queue", status: "good" },
  { label: "Voice Lines", status: "warn" },
];

const activeClients = [
  { id: "c1", lng: -118.2437, lat: 34.0522 },
  { id: "c2", lng: -87.6298, lat: 41.8781 },
  { id: "c3", lng: -74.006, lat: 40.7128 },
  { id: "c4", lng: -95.3698, lat: 29.7604 },
  { id: "c5", lng: -122.3321, lat: 47.6062 },
];

const CommandMap = () => {
  const mapRef = React.useRef(null);
  const mapInstance = React.useRef(null);

  React.useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = new maplibregl.Map({
      container: mapRef.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [-98.5795, 39.8283],
      zoom: 3,
      interactive: false,
    });
    mapInstance.current = map;
    map.on("load", () => {
      map.addSource("clients", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: activeClients.map((client) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [client.lng, client.lat] },
            properties: {},
          })),
        },
      });
      map.addLayer({
        id: "client-glow",
        type: "circle",
        source: "clients",
        paint: {
          "circle-radius": 10,
          "circle-color": "#22d3ee",
          "circle-opacity": 0.25,
        },
      });
      map.addLayer({
        id: "client-dot",
        type: "circle",
        source: "clients",
        paint: {
          "circle-radius": 4,
          "circle-color": "#34d399",
          "circle-opacity": 0.9,
        },
      });
    });
    return () => map.remove();
  }, []);

  return <div ref={mapRef} className="command-map" />;
};

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [tiles, setTiles] = React.useState(widgetSeed);
  const [dragId, setDragId] = React.useState(null);
  const [panic, setPanic] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [syncNote, setSyncNote] = React.useState("");

  const moveTile = (targetId) => {
    if (!dragId || dragId === targetId) return;
    const currentIdx = tiles.findIndex((item) => item.id === dragId);
    const targetIdx = tiles.findIndex((item) => item.id === targetId);
    if (currentIdx < 0 || targetIdx < 0) return;
    const updated = [...tiles];
    const [moved] = updated.splice(currentIdx, 1);
    updated.splice(targetIdx, 0, moved);
    setTiles(updated);
  };

  const handleSyncTemplates = async (industry) => {
    try {
      setSyncing(true);
      setSyncNote("");
      const { data } = await syncRetellTemplates({ industry });
      setSyncNote(
        `Synced ${industry} templates: ${data?.success ?? 0} ok, ${
          data?.failed ?? 0
        } failed.`
      );
    } catch (err) {
      const message =
        err?.response?.data?.error || err?.message || "Sync failed.";
      setSyncNote(message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-void-black text-white relative overflow-hidden">
      <TopMenu />
      <div className="absolute inset-0 bg-grid-lines opacity-40" />
      <div className="absolute -top-20 right-0 h-72 w-72 rounded-full bg-neon-purple/20 blur-[140px]" />
      <div className="absolute bottom-0 left-0 h-96 w-96 rounded-full bg-neon-cyan/10 blur-[160px]" />

      <div className="ticker-bar">
        <div className="ticker-track">
          {TICKER_EVENTS.concat(TICKER_EVENTS).map((event, idx) => (
            <span key={`${event}-${idx}`} className="ticker-item">
              {event}
            </span>
          ))}
        </div>
      </div>

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
            className="glass-panel rounded-3xl p-6 border border-white/10"
          >
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-white/50">
                  Sales Floor HQ
                </p>
                <h1 className="mt-2 text-3xl font-semibold">Command Deck</h1>
                <p className="mt-2 text-white/60">
                  Coaching telemetry and live seller controls.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="status-ring">
                  {statusRing.map((item) => (
                    <div key={item.label} className="status-ring-item">
                      <span className={`ring-dot ${item.status}`} />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      className="px-3 py-2 text-xs uppercase tracking-[0.2em] border border-white/20 rounded-full hover:border-white/40 transition"
                      onClick={() => handleSyncTemplates("plumbing")}
                      disabled={syncing}
                    >
                      {syncing ? "Syncing..." : "Sync Plumbing"}
                    </button>
                    <button
                      className="px-3 py-2 text-xs uppercase tracking-[0.2em] border border-white/20 rounded-full hover:border-white/40 transition"
                      onClick={() => handleSyncTemplates("hvac")}
                      disabled={syncing}
                    >
                      {syncing ? "Syncing..." : "Sync HVAC"}
                    </button>
                    <button
                      className={`panic-button ${panic ? "active" : ""}`}
                      onClick={() => setPanic((prev) => !prev)}
                    >
                      <Power size={14} /> PAUSE OUTBOUND SCRIPTS
                    </button>
                  </div>
                  {syncNote ? (
                    <div className="text-xs text-white/60">{syncNote}</div>
                  ) : null}
                </div>
              </div>
            </div>
          </motion.div>

          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="glass-panel rounded-3xl border border-white/10 p-6">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-[0.4em] text-white/50">
                  Live Command Grid
                </div>
                <div className="status-live">
                  <Sparkles size={12} /> Drag to reorder
                </div>
              </div>
              <div className="command-grid">
                {tiles.map((tile) => (
                  <div
                    key={tile.id}
                    className="command-tile"
                    draggable
                    onDragStart={() => setDragId(tile.id)}
                    onDragEnter={() => moveTile(tile.id)}
                    onDragEnd={() => setDragId(null)}
                  >
                    <div className="text-xs text-white/50 uppercase tracking-widest">
                      {tile.label}
                    </div>
                    <div className={`mt-2 text-2xl font-mono ${tile.tone}`}>
                      {tile.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-6">
            <div className="glass-panel rounded-3xl border border-white/10 p-6">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-[0.4em] text-white/50">
                  Coaching Pulse
                </div>
                <div className="text-neon-green text-xs">LIVE</div>
              </div>
              <div className="defcon-ring">
                <Gauge size={32} className="text-neon-green" />
                <div>
                  <div className="text-lg font-semibold">Scripts Engaged</div>
                  <div className="text-xs text-white/50">
                    Humans leading the call floor
                  </div>
                </div>
              </div>
              <div className="grid gap-2 mt-4">
                {[
                  { label: "Script Adherence", value: "94%" },
                  { label: "Coaching Hours", value: "2h 14m" },
                  { label: "Human Pipeline", value: "48 active" },
                ].map((item) => (
                  <div key={item.label} className="defcon-row">
                    <span>{item.label}</span>
                    <span>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

              <div className="glass-panel rounded-3xl border border-white/10 p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs uppercase tracking-[0.4em] text-white/50">
                    Active Client Map
                  </div>
                  <div className="text-xs text-white/50 flex items-center gap-2">
                    <Globe size={12} /> 5 Live dots
                  </div>
                </div>
                <div className="map-shell">
                  <CommandMap />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_1fr_1fr]">
            {[
              { label: "API Queue", value: "Stable", icon: Activity },
              { label: "Threat Monitor", value: "Clear", icon: AlertTriangle },
              { label: "Client Expansion", value: "+12%", icon: Sparkles },
            ].map((item) => (
              <div key={item.label} className="glass-panel rounded-3xl border border-white/10 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-white/40">
                      {item.label}
                    </div>
                    <div className="mt-2 text-xl font-mono text-neon-cyan">
                      {item.value}
                    </div>
                  </div>
                  <item.icon size={20} className="text-neon-cyan" />
                </div>
                <div className="mt-4 skeleton-line" />
                <div className="mt-2 skeleton-line short" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {panic ? (
        <div className="toast danger">
          <AlertTriangle size={14} /> Sales scripts paused.
        </div>
      ) : null}
    </div>
  );
}
