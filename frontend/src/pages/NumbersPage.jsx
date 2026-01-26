import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { supabase } from "../lib/supabase";

const formatPhone = (value) => value || "--";

export default function NumbersPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isSeller, setIsSeller] = React.useState(false);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [agents, setAgents] = React.useState([]);
  const [toast, setToast] = React.useState("");
  const highlightNew = searchParams.get("new") === "1";

  React.useEffect(() => {
    let mounted = true;
    const loadData = async () => {
      setLoading(true);
      setError("");
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData?.session?.user;
        if (!user) {
          if (mounted) setError("Session expired. Please log in again.");
          return;
        }
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();
        if (mounted && profile) {
          setIsSeller(profile.role === "seller");
          setIsAdmin(profile.role === "admin");
        }
        const { data: agentRows, error: agentError } = await supabase
          .from("agents")
          .select("id, agent_id, phone_number, is_active, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        if (agentError) {
          throw agentError;
        }
        if (mounted) setAgents(agentRows || []);
      } catch (err) {
        if (mounted) setError(err.message || "Unable to load numbers.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadData();
    return () => {
      mounted = false;
    };
  }, []);

  const handleCopy = async (value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setToast("Number copied.");
      setTimeout(() => setToast(""), 1800);
    } catch (err) {
      setToast("Copy failed.");
      setTimeout(() => setToast(""), 1800);
    }
  };

  return (
    <div className="war-room bg-black text-cyan-400 font-mono">
      <TopMenu />
      <div className="dashboard-layout">
        <SideNav
          eligibleNewAgent={false}
          onUpgrade={() => navigate("/billing")}
          onNewAgent={() => navigate("/wizard?new=1")}
          billingStatus="active"
          tier="numbers"
          agentLive
          lastUpdated={new Date()}
          isSeller={isSeller}
          isAdmin={isAdmin}
        />

        <div className="war-room-shell w-full max-w-full px-4 sm:px-6 lg:px-8">
          <div className="calendar-header">
            <div>
              <div className="war-room-kicker">VOICE LINE INVENTORY</div>
              <div className="war-room-title">Assigned Business Numbers</div>
            </div>
            <div className="calendar-actions">
              <button
                type="button"
                className="button-primary"
                onClick={() => navigate("/wizard?new=1")}
              >
                Add New Agent
              </button>
              <button
                type="button"
                className="button-primary"
                onClick={() => navigate("/dashboard")}
              >
                Back to Dashboard
              </button>
            </div>
          </div>

          <div className="glass-panel numbers-panel">
            {highlightNew ? (
              <div className="numbers-banner">
                New number provisioned. Your line is live and ready.
              </div>
            ) : null}
            {loading ? (
              <div className="numbers-status">Loading numbers...</div>
            ) : error ? (
              <div className="numbers-error">{error}</div>
            ) : agents.length ? (
              <div className="numbers-grid">
                {agents.map((agent) => (
                  <div key={agent.id} className="numbers-card">
                    <div className="numbers-card-header">
                      <span className="numbers-card-title">Business Line</span>
                      <span
                        className={`status-pill ${
                          agent.is_active === false ? "status-none" : "status-active"
                        }`}
                      >
                        {agent.is_active === false ? "Paused" : "Active"}
                      </span>
                    </div>
                    <div className="numbers-card-phone">
                      {formatPhone(agent.phone_number)}
                    </div>
                    <div className="numbers-card-meta">
                      <span>Agent ID:</span>
                      <span className="numbers-card-mono">
                        {agent.agent_id || "--"}
                      </span>
                    </div>
                    <div className="numbers-card-meta">
                      <span>Provisioned:</span>
                      <span className="numbers-card-mono">
                        {agent.created_at
                          ? new Date(agent.created_at).toLocaleDateString()
                          : "--"}
                      </span>
                    </div>
                    <div className="numbers-card-actions">
                      <button
                        type="button"
                        className="button-primary muted"
                        onClick={() => handleCopy(agent.phone_number)}
                      >
                        Copy Number
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="numbers-status">
                No numbers yet. Deploy your first agent to receive a line.
              </div>
            )}
            {toast ? <div className="numbers-toast">{toast}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
