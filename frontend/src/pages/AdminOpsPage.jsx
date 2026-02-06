import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Activity,
  Zap,
  Server,
  Users,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Eye,
  Check,
  Filter,
} from "lucide-react";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import {
  getAdminErrorLogs,
  resolveErrorLog,
  getAdminOpsAlerts,
  acknowledgeOpsAlert,
  getAdminHealthScores,
  getAdminChurnAlerts,
  resolveChurnAlert,
} from "../lib/api";
import { supabase } from "../lib/supabase";

export default function AdminOpsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Data states
  const [errors, setErrors] = useState([]);
  const [opsAlerts, setOpsAlerts] = useState([]);
  const [healthStats, setHealthStats] = useState(null);
  const [churnAlerts, setChurnAlerts] = useState([]);
  
  // UI states
  const [activeTab, setActiveTab] = useState("errors");
  const [errorFilter, setErrorFilter] = useState("unresolved");
  const [alertFilter, setAlertFilter] = useState("unacked");
  const [resolving, setResolving] = useState({});
  const [acknowledging, setAcknowledging] = useState({});

  // Check admin access
  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate("/login");
        return;
      }
      
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle();
      
      if (profile?.role !== "admin") {
        navigate("/dashboard");
        return;
      }
      
      setIsAdmin(true);
      loadAllData();
    };
    checkAdmin();
  }, [navigate]);

  const loadAllData = useCallback(async () => {
    try {
      setLoading(true);
      
      const [errorsRes, alertsRes, healthRes, churnRes] = await Promise.all([
        getAdminErrorLogs({ resolved: "false", limit: 50 }),
        getAdminOpsAlerts({ acknowledged: "false", limit: 50 }),
        getAdminHealthScores({ limit: 1 }), // Just need stats
        getAdminChurnAlerts({ resolved: "false", limit: 50 }),
      ]);
      
      setErrors(errorsRes.data?.errors || []);
      setOpsAlerts(alertsRes.data?.alerts || []);
      setHealthStats(healthRes.data?.stats || null);
      setChurnAlerts(churnRes.data?.alerts || []);
    } catch (err) {
      console.error("Load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleResolveError = async (errorId) => {
    try {
      setResolving(prev => ({ ...prev, [errorId]: true }));
      await resolveErrorLog(errorId);
      setErrors(prev => prev.filter(e => e.id !== errorId));
    } catch (err) {
      console.error("Resolve error:", err);
    } finally {
      setResolving(prev => ({ ...prev, [errorId]: false }));
    }
  };

  const handleAcknowledgeAlert = async (alertId) => {
    try {
      setAcknowledging(prev => ({ ...prev, [alertId]: true }));
      await acknowledgeOpsAlert(alertId);
      setOpsAlerts(prev => prev.filter(a => a.id !== alertId));
    } catch (err) {
      console.error("Acknowledge error:", err);
    } finally {
      setAcknowledging(prev => ({ ...prev, [alertId]: false }));
    }
  };

  const handleResolveChurn = async (alertId) => {
    try {
      setResolving(prev => ({ ...prev, [alertId]: true }));
      await resolveChurnAlert(alertId);
      setChurnAlerts(prev => prev.filter(a => a.id !== alertId));
    } catch (err) {
      console.error("Resolve churn error:", err);
    } finally {
      setResolving(prev => ({ ...prev, [alertId]: false }));
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "Never";
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case "critical": return "#ef4444";
      case "high": return "#f97316";
      case "warning": return "#f59e0b";
      case "medium": return "#22d3ee";
      default: return "#94a3b8";
    }
  };

  if (!isAdmin) {
    return (
      <div className="war-room bg-black text-cyan-400 font-mono min-h-screen flex items-center justify-center">
        <RefreshCw size={24} className="spinning" />
      </div>
    );
  }

  const unresolvedErrors = errors.length;
  const unackedAlerts = opsAlerts.length;
  const criticalChurn = churnAlerts.filter(a => a.severity === "critical").length;
  const healthCritical = healthStats?.by_risk?.critical || 0;

  return (
    <div className="war-room bg-black text-cyan-400 font-mono">
      <TopMenu />
      <SideNav isSeller={false} isAdmin={true} />
      
      <div className="war-room-shell w-full max-w-full px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="ops-header">
          <div className="ops-title">
            <Activity size={24} />
            <h1>Operations Dashboard</h1>
          </div>
          <button 
            className="refresh-btn"
            onClick={loadAllData}
            disabled={loading}
          >
            <RefreshCw size={18} className={loading ? "spinning" : ""} />
            Refresh
          </button>
        </div>

        {/* Stats Grid */}
        <div className="ops-stats-grid">
          <div className={`ops-stat-card ${unresolvedErrors > 0 ? "critical" : ""}`}>
            <h4>Unresolved Errors</h4>
            <div className="stat-value">{unresolvedErrors}</div>
          </div>
          <div className={`ops-stat-card ${unackedAlerts > 0 ? "warning" : ""}`}>
            <h4>Active Alerts</h4>
            <div className="stat-value">{unackedAlerts}</div>
          </div>
          <div className={`ops-stat-card ${criticalChurn > 0 ? "warning" : ""}`}>
            <h4>Churn Alerts</h4>
            <div className="stat-value">{churnAlerts.length}</div>
          </div>
          <div className={`ops-stat-card ${healthCritical > 0 ? "critical" : ""}`}>
            <h4>Critical Health Users</h4>
            <div className="stat-value">{healthCritical}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="ops-tabs">
          <button 
            className={`ops-tab ${activeTab === "errors" ? "active" : ""}`}
            onClick={() => setActiveTab("errors")}
          >
            <XCircle size={18} />
            Errors
            {unresolvedErrors > 0 && <span className="badge">{unresolvedErrors}</span>}
          </button>
          <button 
            className={`ops-tab ${activeTab === "alerts" ? "active" : ""}`}
            onClick={() => setActiveTab("alerts")}
          >
            <AlertTriangle size={18} />
            Ops Alerts
            {unackedAlerts > 0 && <span className="badge">{unackedAlerts}</span>}
          </button>
          <button 
            className={`ops-tab ${activeTab === "churn" ? "active" : ""}`}
            onClick={() => setActiveTab("churn")}
          >
            <Users size={18} />
            Churn Risk
            {churnAlerts.length > 0 && <span className="badge">{churnAlerts.length}</span>}
          </button>
          <button 
            className={`ops-tab ${activeTab === "health" ? "active" : ""}`}
            onClick={() => setActiveTab("health")}
          >
            <TrendingUp size={18} />
            Health Overview
          </button>
        </div>

        {/* Content */}
        <div className="ops-content">
          {loading ? (
            <div className="loading-state">
              <RefreshCw size={24} className="spinning" />
              <span>Loading operations data...</span>
            </div>
          ) : (
            <>
              {/* Errors Tab */}
              {activeTab === "errors" && (
                <div className="ops-section">
                  <div className="ops-section-header">
                    <div className="ops-section-title">
                      <XCircle size={20} />
                      Error Log
                    </div>
                  </div>
                  
                  {errors.length === 0 ? (
                    <div className="empty-state">
                      <CheckCircle size={32} />
                      <p>No unresolved errors</p>
                    </div>
                  ) : (
                    <table className="ops-table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Severity</th>
                          <th>Type</th>
                          <th>Message</th>
                          <th>Endpoint</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {errors.map(error => (
                          <tr key={error.id}>
                            <td>{formatDate(error.created_at)}</td>
                            <td>
                              <span 
                                className={`severity-badge ${error.severity}`}
                                style={{ borderColor: getSeverityColor(error.severity) }}
                              >
                                {error.severity}
                              </span>
                            </td>
                            <td>{error.error_type}</td>
                            <td className="message-cell">{error.error_message?.substring(0, 80)}...</td>
                            <td className="endpoint-cell">{error.endpoint || "-"}</td>
                            <td>
                              <button
                                className="action-btn resolve"
                                onClick={() => handleResolveError(error.id)}
                                disabled={resolving[error.id]}
                              >
                                {resolving[error.id] ? (
                                  <RefreshCw size={14} className="spinning" />
                                ) : (
                                  <Check size={14} />
                                )}
                                Resolve
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Ops Alerts Tab */}
              {activeTab === "alerts" && (
                <div className="ops-section">
                  <div className="ops-section-header">
                    <div className="ops-section-title">
                      <AlertTriangle size={20} />
                      Operational Alerts
                    </div>
                  </div>
                  
                  {opsAlerts.length === 0 ? (
                    <div className="empty-state">
                      <CheckCircle size={32} />
                      <p>No active alerts</p>
                    </div>
                  ) : (
                    <div className="alerts-list">
                      {opsAlerts.map(alert => (
                        <div key={alert.id} className={`alert-item ${alert.severity}`}>
                          <div className="alert-header">
                            <span 
                              className="severity-indicator"
                              style={{ background: getSeverityColor(alert.severity) }}
                            />
                            <div className="alert-info">
                              <h4>{alert.title}</h4>
                              <p>{alert.message}</p>
                            </div>
                            <div className="alert-meta">
                              <span className="alert-type">{alert.alert_type}</span>
                              <span className="alert-time">{formatDate(alert.created_at)}</span>
                            </div>
                          </div>
                          <div className="alert-actions">
                            <button
                              className="action-btn acknowledge"
                              onClick={() => handleAcknowledgeAlert(alert.id)}
                              disabled={acknowledging[alert.id]}
                            >
                              {acknowledging[alert.id] ? (
                                <RefreshCw size={14} className="spinning" />
                              ) : (
                                <Check size={14} />
                              )}
                              Acknowledge
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Churn Risk Tab */}
              {activeTab === "churn" && (
                <div className="ops-section">
                  <div className="ops-section-header">
                    <div className="ops-section-title">
                      <Users size={20} />
                      Churn Risk Alerts
                    </div>
                  </div>
                  
                  {churnAlerts.length === 0 ? (
                    <div className="empty-state">
                      <CheckCircle size={32} />
                      <p>No active churn alerts</p>
                    </div>
                  ) : (
                    <table className="ops-table">
                      <thead>
                        <tr>
                          <th>Customer</th>
                          <th>Type</th>
                          <th>Severity</th>
                          <th>Details</th>
                          <th>Time</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {churnAlerts.map(alert => (
                          <tr key={alert.id}>
                            <td>{alert.profiles?.business_name || alert.profiles?.email || "Unknown"}</td>
                            <td>{alert.alert_type}</td>
                            <td>
                              <span className={`severity-badge ${alert.severity}`}>
                                {alert.severity}
                              </span>
                            </td>
                            <td className="message-cell">{alert.message?.substring(0, 60)}...</td>
                            <td>{formatDate(alert.created_at)}</td>
                            <td>
                              <button
                                className="action-btn resolve"
                                onClick={() => handleResolveChurn(alert.id)}
                                disabled={resolving[alert.id]}
                              >
                                {resolving[alert.id] ? (
                                  <RefreshCw size={14} className="spinning" />
                                ) : (
                                  <Check size={14} />
                                )}
                                Resolve
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Health Overview Tab */}
              {activeTab === "health" && healthStats && (
                <div className="ops-section">
                  <div className="ops-section-header">
                    <div className="ops-section-title">
                      <TrendingUp size={20} />
                      Customer Health Overview
                    </div>
                  </div>
                  
                  <div className="health-overview-grid">
                    <div className="health-stat-card">
                      <h4>Total Customers</h4>
                      <div className="stat-value">{healthStats.total || 0}</div>
                    </div>
                    
                    <div className="health-distribution">
                      <h4>Health Distribution</h4>
                      <div className="distribution-bars">
                        <div className="dist-item">
                          <span className="dist-label">Grade A</span>
                          <div className="dist-bar">
                            <div 
                              className="dist-fill grade-a" 
                              style={{ width: `${((healthStats.by_grade?.A || 0) / (healthStats.total || 1)) * 100}%` }}
                            />
                          </div>
                          <span className="dist-count">{healthStats.by_grade?.A || 0}</span>
                        </div>
                        <div className="dist-item">
                          <span className="dist-label">Grade B</span>
                          <div className="dist-bar">
                            <div 
                              className="dist-fill grade-b" 
                              style={{ width: `${((healthStats.by_grade?.B || 0) / (healthStats.total || 1)) * 100}%` }}
                            />
                          </div>
                          <span className="dist-count">{healthStats.by_grade?.B || 0}</span>
                        </div>
                        <div className="dist-item">
                          <span className="dist-label">Grade C</span>
                          <div className="dist-bar">
                            <div 
                              className="dist-fill grade-c" 
                              style={{ width: `${((healthStats.by_grade?.C || 0) / (healthStats.total || 1)) * 100}%` }}
                            />
                          </div>
                          <span className="dist-count">{healthStats.by_grade?.C || 0}</span>
                        </div>
                        <div className="dist-item">
                          <span className="dist-label">Grade D</span>
                          <div className="dist-bar">
                            <div 
                              className="dist-fill grade-d" 
                              style={{ width: `${((healthStats.by_grade?.D || 0) / (healthStats.total || 1)) * 100}%` }}
                            />
                          </div>
                          <span className="dist-count">{healthStats.by_grade?.D || 0}</span>
                        </div>
                        <div className="dist-item">
                          <span className="dist-label">Grade F</span>
                          <div className="dist-bar">
                            <div 
                              className="dist-fill grade-f" 
                              style={{ width: `${((healthStats.by_grade?.F || 0) / (healthStats.total || 1)) * 100}%` }}
                            />
                          </div>
                          <span className="dist-count">{healthStats.by_grade?.F || 0}</span>
                        </div>
                      </div>
                    </div>

                    <div className="churn-risk-overview">
                      <h4>Churn Risk Distribution</h4>
                      <div className="risk-stats">
                        <div className="risk-item critical">
                          <span className="risk-count">{healthStats.by_risk?.critical || 0}</span>
                          <span className="risk-label">Critical</span>
                        </div>
                        <div className="risk-item high">
                          <span className="risk-count">{healthStats.by_risk?.high || 0}</span>
                          <span className="risk-label">High</span>
                        </div>
                        <div className="risk-item medium">
                          <span className="risk-count">{healthStats.by_risk?.medium || 0}</span>
                          <span className="risk-label">Medium</span>
                        </div>
                        <div className="risk-item low">
                          <span className="risk-count">{healthStats.by_risk?.low || 0}</span>
                          <span className="risk-label">Low</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
