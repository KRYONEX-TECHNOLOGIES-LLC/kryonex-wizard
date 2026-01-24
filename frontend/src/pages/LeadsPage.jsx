import React from "react";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { getLeads } from "../lib/api";
import { supabase } from "../lib/supabase";

export default function LeadsPage() {
  const navigate = useNavigate();
  const [leads, setLeads] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [lastUpdated, setLastUpdated] = React.useState(null);
  const [isSeller, setIsSeller] = React.useState(false);
  const [isAdmin, setIsAdmin] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    const load = async (isInitial = false) => {
      try {
        const leadsRes = await getLeads();
        if (mounted) {
          setLeads(leadsRes.data.leads || []);
          setLastUpdated(new Date());
        }
      } finally {
        if (mounted && isInitial) setLoading(false);
      }
    };
    load(true);
    const interval = setInterval(() => load(false), 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

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

  const filtered = leads.filter((lead) => {
    const haystack = [
      lead.name,
      lead.status,
      lead.sentiment,
      lead.phone,
      lead.summary,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
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
          tier="core"
          agentLive
          lastUpdated={lastUpdated}
          isSeller={isSeller}
          isAdmin={isAdmin}
        />

        <div className="war-room-shell w-full max-w-full px-4 sm:px-6 lg:px-8">
          <div className="war-room-header">
            <div>
              <div className="war-room-kicker">INTEL LAYER</div>
              <div className="war-room-title">Lead Grid Command</div>
            </div>
            <div className="war-room-actions">
              <button className="button-primary" onClick={() => navigate("/dashboard")}>
                Back to Command Deck
              </button>
            </div>
          </div>

          <div className="glass-panel bg-gray-900/50 border border-cyan-500/30 backdrop-blur-md" style={{ padding: "1.5rem" }}>
            <div className="deck-title">Search & Filters</div>
            <input
              className="glass-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, status, sentiment, phone..."
              style={{ marginTop: "0.8rem" }}
            />
            <div className="deck-status" style={{ marginTop: "0.6rem" }}>
              Results {filtered.length}
            </div>
          </div>

          <div
            className="glass-panel bg-gray-900/50 border border-cyan-500/30 backdrop-blur-md"
            style={{ marginTop: "1.5rem", padding: "1.5rem" }}
          >
            <div className="deck-title">All Leads</div>
            <div style={{ overflowX: "auto", marginTop: "1rem" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ textAlign: "left", color: "#9ca3af" }}>
                  <tr>
                    <th style={{ paddingBottom: "0.8rem" }}>Status</th>
                    <th style={{ paddingBottom: "0.8rem" }}>Name</th>
                    <th style={{ paddingBottom: "0.8rem" }}>Sentiment</th>
                    <th style={{ paddingBottom: "0.8rem" }}>Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="4" style={{ padding: "1rem" }}>
                        Loading...
                      </td>
                    </tr>
                  ) : filtered.length ? (
                    filtered.map((lead) => (
                      <tr key={lead.id || `${lead.name}-${lead.phone}`} className="scanline-row">
                        <td style={{ padding: "0.8rem 0" }}>
                          <span
                            className={`badge ${
                              lead.status?.toLowerCase() === "booked"
                                ? "badge-booked"
                                : "badge-missed"
                            }`}
                          >
                            {lead.status || "NEW"}
                          </span>
                        </td>
                        <td style={{ padding: "0.8rem 0" }}>
                          {lead.name || "Unknown"}
                        </td>
                        <td style={{ padding: "0.8rem 0" }}>
                          {lead.sentiment || "Neutral"}
                        </td>
                        <td style={{ padding: "0.8rem 0", color: "#9ca3af" }}>
                          {lead.phone || "--"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" style={{ padding: "1rem" }}>
                        No leads captured yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
