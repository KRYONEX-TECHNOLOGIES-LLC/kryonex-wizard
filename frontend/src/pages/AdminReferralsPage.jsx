import React, { useState, useEffect, useCallback } from "react";
import {
  Gift,
  Users,
  DollarSign,
  Clock,
  Check,
  X,
  AlertTriangle,
  Settings,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Banknote,
  Shield,
  TrendingUp,
  AlertCircle,
  Filter,
  Eye,
} from "lucide-react";
import {
  getAdminReferrals,
  approveReferralPayout,
  rejectReferralPayout,
  getReferralSettings,
  updateReferralSettings,
} from "../lib/api";

export default function AdminReferralsPage() {
  const [referrals, setReferrals] = useState([]);
  const [summary, setSummary] = useState({});
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  const [settings, setSettings] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [message, setMessage] = useState(null);

  const loadReferrals = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getAdminReferrals({ status: statusFilter, page: 1, limit: 50 });
      setReferrals(res.data.referrals || []);
      setSummary(res.data.summary || {});
      setPagination(res.data.pagination || {});
    } catch (err) {
      console.error("Error loading referrals:", err);
      setMessage({ type: "error", text: "Failed to load referrals" });
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const loadSettings = useCallback(async () => {
    try {
      setSettingsLoading(true);
      const res = await getReferralSettings();
      setSettings(res.data);
    } catch (err) {
      console.error("Error loading settings:", err);
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReferrals();
  }, [loadReferrals]);

  useEffect(() => {
    if (showSettings && !settings) {
      loadSettings();
    }
  }, [showSettings, settings, loadSettings]);

  const handleApprove = async (referralId) => {
    try {
      setActionLoading(referralId);
      await approveReferralPayout(referralId);
      setMessage({ type: "success", text: "Commissions approved successfully" });
      loadReferrals();
    } catch (err) {
      setMessage({ type: "error", text: err.response?.data?.error || "Failed to approve" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (referralId) => {
    const reason = window.prompt("Enter rejection reason (optional):");
    if (reason === null) return; // Cancelled
    
    try {
      setActionLoading(referralId);
      await rejectReferralPayout(referralId, reason);
      setMessage({ type: "success", text: "Referral rejected successfully" });
      loadReferrals();
    } catch (err) {
      setMessage({ type: "error", text: err.response?.data?.error || "Failed to reject" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setSettingsLoading(true);
      await updateReferralSettings(settings);
      setMessage({ type: "success", text: "Settings saved successfully" });
    } catch (err) {
      setMessage({ type: "error", text: err.response?.data?.error || "Failed to save settings" });
    } finally {
      setSettingsLoading(false);
    }
  };

  const formatCurrency = (cents) => {
    return `$${((cents || 0) / 100).toFixed(2)}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusClass = (status) => {
    switch (status) {
      case "eligible":
      case "paid":
        return "status-active";
      case "pending":
        return "status-pending";
      case "rejected":
      case "clawed_back":
        return "status-rejected";
      default:
        return "";
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "eligible":
      case "paid":
        return <Check size={14} />;
      case "pending":
        return <Clock size={14} />;
      case "rejected":
      case "clawed_back":
        return <X size={14} />;
      default:
        return null;
    }
  };

  return (
    <div className="admin-referrals-page">
      {/* Header */}
      <div className="admin-referrals-header">
        <div className="header-left">
          <div className="header-icon">
            <Gift size={32} />
          </div>
          <div className="header-text">
            <h1>REFERRAL CONTROL CENTER</h1>
            <p>Manage referrals, commissions, and payouts</p>
          </div>
        </div>
        <div className="header-actions">
          <button 
            className="settings-toggle-btn"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings size={18} />
            Settings
            {showSettings ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button className="refresh-btn" onClick={loadReferrals} disabled={loading}>
            <RefreshCw size={18} className={loading ? "spinning" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`admin-message ${message.type}`}>
          {message.type === "success" ? <Check size={18} /> : <AlertCircle size={18} />}
          {message.text}
          <button onClick={() => setMessage(null)}>×</button>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="admin-settings-panel">
          <h3>Referral Program Settings</h3>
          {settingsLoading && !settings ? (
            <div className="settings-loading">Loading settings...</div>
          ) : settings ? (
            <div className="settings-grid">
              <div className="setting-item">
                <label>Upfront Bonus ($)</label>
                <input
                  type="number"
                  value={(settings.upfront_amount_cents || 0) / 100}
                  onChange={(e) => setSettings({ 
                    ...settings, 
                    upfront_amount_cents: Math.round(parseFloat(e.target.value) * 100) 
                  })}
                />
              </div>
              <div className="setting-item">
                <label>Monthly Commission (%)</label>
                <input
                  type="number"
                  value={settings.monthly_percent || 10}
                  onChange={(e) => setSettings({ 
                    ...settings, 
                    monthly_percent: parseInt(e.target.value) 
                  })}
                />
              </div>
              <div className="setting-item">
                <label>Max Months</label>
                <input
                  type="number"
                  value={settings.max_months || 12}
                  onChange={(e) => setSettings({ 
                    ...settings, 
                    max_months: parseInt(e.target.value) 
                  })}
                />
              </div>
              <div className="setting-item">
                <label>Hold Period (days)</label>
                <input
                  type="number"
                  value={settings.hold_days || 30}
                  onChange={(e) => setSettings({ 
                    ...settings, 
                    hold_days: parseInt(e.target.value) 
                  })}
                />
              </div>
              <div className="setting-item">
                <label>Min Payout ($)</label>
                <input
                  type="number"
                  value={(settings.min_payout_cents || 0) / 100}
                  onChange={(e) => setSettings({ 
                    ...settings, 
                    min_payout_cents: Math.round(parseFloat(e.target.value) * 100) 
                  })}
                />
              </div>
              <div className="setting-item">
                <label>Auto-Approve Under ($)</label>
                <input
                  type="number"
                  value={(settings.auto_approve_under_cents || 0) / 100}
                  onChange={(e) => setSettings({ 
                    ...settings, 
                    auto_approve_under_cents: Math.round(parseFloat(e.target.value) * 100) 
                  })}
                />
              </div>
              <div className="setting-item toggle-item">
                <label>Program Active</label>
                <button
                  className={`toggle-btn ${settings.is_active ? "active" : ""}`}
                  onClick={() => setSettings({ ...settings, is_active: !settings.is_active })}
                >
                  {settings.is_active ? "ON" : "OFF"}
                </button>
              </div>
              <div className="setting-item save-item">
                <button 
                  className="save-settings-btn" 
                  onClick={handleSaveSettings}
                  disabled={settingsLoading}
                >
                  {settingsLoading ? "Saving..." : "Save Settings"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Summary Stats */}
      <div className="admin-referral-stats">
        <div className="stat-card">
          <div className="stat-icon purple">
            <Users size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{summary.total || 0}</span>
            <span className="stat-label">Total Referrals</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon yellow">
            <Clock size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{summary.pending || 0}</span>
            <span className="stat-label">Pending</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon cyan">
            <TrendingUp size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{summary.eligible || 0}</span>
            <span className="stat-label">Eligible</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">
            <DollarSign size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{summary.paid || 0}</span>
            <span className="stat-label">Paid</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red">
            <X size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{(summary.rejected || 0) + (summary.clawed_back || 0)}</span>
            <span className="stat-label">Rejected/Clawed</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="admin-referral-filters">
        <div className="filter-group">
          <Filter size={16} />
          <label>Status:</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="eligible">Eligible</option>
            <option value="paid">Paid</option>
            <option value="rejected">Rejected</option>
            <option value="clawed_back">Clawed Back</option>
          </select>
        </div>
        <div className="pagination-info">
          Showing {referrals.length} of {pagination.total || 0} referrals
        </div>
      </div>

      {/* Referrals Table */}
      <div className="admin-referrals-table-wrapper">
        {loading ? (
          <div className="table-loading">
            <div className="loading-spinner" />
            <p>Loading referrals...</p>
          </div>
        ) : referrals.length === 0 ? (
          <div className="table-empty">
            <Gift size={48} />
            <p>No referrals found</p>
          </div>
        ) : (
          <table className="admin-referrals-table">
            <thead>
              <tr>
                <th>Referrer</th>
                <th>Referred User</th>
                <th>Status</th>
                <th>Signup</th>
                <th>First Payment</th>
                <th>Total Earned</th>
                <th>Months</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {referrals.map((ref) => (
                <React.Fragment key={ref.id}>
                  <tr 
                    className={expandedId === ref.id ? "expanded" : ""}
                    onClick={() => setExpandedId(expandedId === ref.id ? null : ref.id)}
                  >
                    <td className="email-cell">{ref.referrer_email}</td>
                    <td className="email-cell">{ref.referred_email}</td>
                    <td>
                      <span className={`status-badge ${getStatusClass(ref.status)}`}>
                        {getStatusIcon(ref.status)}
                        {ref.status}
                      </span>
                    </td>
                    <td>{formatDate(ref.signup_at)}</td>
                    <td>{formatDate(ref.first_payment_at)}</td>
                    <td className="money-cell">{formatCurrency(ref.total_commission_cents)}</td>
                    <td>{ref.months_paid || 0}/12</td>
                    <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                      {ref.status === "pending" && (
                        <>
                          <button
                            className="action-btn approve"
                            onClick={() => handleApprove(ref.id)}
                            disabled={actionLoading === ref.id}
                            title="Approve"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            className="action-btn reject"
                            onClick={() => handleReject(ref.id)}
                            disabled={actionLoading === ref.id}
                            title="Reject"
                          >
                            <X size={16} />
                          </button>
                        </>
                      )}
                      <button
                        className="action-btn view"
                        onClick={() => setExpandedId(expandedId === ref.id ? null : ref.id)}
                        title="View Details"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                  {expandedId === ref.id && (
                    <tr className="expanded-row">
                      <td colSpan={8}>
                        <div className="referral-details">
                          <div className="detail-section">
                            <h4>Referral Details</h4>
                            <div className="detail-grid">
                              <div className="detail-item">
                                <span className="label">Referral Code:</span>
                                <span className="value">{ref.referral_code}</span>
                              </div>
                              <div className="detail-item">
                                <span className="label">Signup IP:</span>
                                <span className="value">{ref.signup_ip || "Unknown"}</span>
                              </div>
                              <div className="detail-item">
                                <span className="label">Eligible Date:</span>
                                <span className="value">{formatDate(ref.eligible_at)}</span>
                              </div>
                              <div className="detail-item">
                                <span className="label">Upfront Paid:</span>
                                <span className="value">{ref.upfront_paid ? "Yes" : "No"}</span>
                              </div>
                              {ref.rejection_reason && (
                                <div className="detail-item full-width">
                                  <span className="label">Rejection Reason:</span>
                                  <span className="value error">{ref.rejection_reason}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          {ref.fraud_flags && ref.fraud_flags.length > 0 && (
                            <div className="detail-section fraud">
                              <h4><AlertTriangle size={16} /> Fraud Flags</h4>
                              <div className="fraud-flags">
                                {ref.fraud_flags.map((flag, i) => (
                                  <div key={i} className="fraud-flag">
                                    <AlertTriangle size={14} />
                                    <span>{flag.type}: {flag.domain || flag.ip || "N/A"}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
