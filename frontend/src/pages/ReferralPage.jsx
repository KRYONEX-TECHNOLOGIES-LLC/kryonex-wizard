import React, { useState, useEffect, useCallback } from "react";
import { 
  Gift, 
  Copy, 
  Check, 
  DollarSign, 
  Users, 
  Clock, 
  TrendingUp, 
  AlertCircle,
  ExternalLink,
  Banknote,
  Shield,
  Sparkles
} from "lucide-react";
import { 
  getReferralCode, 
  getReferralStats, 
  getReferralHistory, 
  requestReferralPayout 
} from "../lib/api";

export default function ReferralPage() {
  const [codeData, setCodeData] = useState(null);
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutMessage, setPayoutMessage] = useState(null);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [codeRes, statsRes, historyRes] = await Promise.all([
        getReferralCode(),
        getReferralStats(),
        getReferralHistory(),
      ]);
      
      setCodeData(codeRes.data);
      setStats(statsRes.data);
      setHistory(historyRes.data?.referrals || []);
      setError(null);
    } catch (err) {
      console.error("Error loading referral data:", err);
      setError("Failed to load referral data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCopy = async () => {
    if (!codeData?.link) return;
    
    try {
      await navigator.clipboard.writeText(codeData.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleRequestPayout = async () => {
    try {
      setPayoutLoading(true);
      setPayoutMessage(null);
      const res = await requestReferralPayout();
      setPayoutMessage({ type: "success", text: res.data.message });
      loadData(); // Refresh data
    } catch (err) {
      const errMsg = err.response?.data?.error || "Failed to request payout";
      setPayoutMessage({ type: "error", text: errMsg });
    } finally {
      setPayoutLoading(false);
    }
  };

  const formatCurrency = (cents) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
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

  const getStatusLabel = (status) => {
    switch (status) {
      case "eligible":
        return "Active";
      case "paid":
        return "Paid";
      case "pending":
        return "Pending (30-day hold)";
      case "rejected":
        return "Rejected";
      case "clawed_back":
        return "Clawed Back";
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div className="referral-page">
        <div className="referral-loading">
          <div className="loading-spinner" />
          <p>Loading referral program...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="referral-page">
        <div className="referral-error">
          <AlertCircle size={48} />
          <p>{error}</p>
          <button onClick={loadData}>Try Again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="referral-page">
      {/* Header */}
      <div className="referral-header">
        <div className="referral-header-icon">
          <Gift size={32} />
        </div>
        <div className="referral-header-text">
          <h1>REFERRAL PROGRAM</h1>
          <p>Earn commissions by referring new customers</p>
        </div>
        <div className="referral-header-badge">
          <Sparkles size={16} />
          <span>$25 + 10% for 12 months</span>
        </div>
      </div>

      {/* Referral Link Section */}
      <div className="referral-link-card">
        <div className="referral-link-header">
          <ExternalLink size={20} />
          <span>Your Referral Link</span>
        </div>
        <div className="referral-link-content">
          <div className="referral-link-input">
            <input 
              type="text" 
              value={codeData?.link || ""} 
              readOnly 
            />
            <button 
              className={`copy-btn ${copied ? "copied" : ""}`}
              onClick={handleCopy}
            >
              {copied ? <Check size={18} /> : <Copy size={18} />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="referral-code-display">
            <span>Your Code:</span>
            <strong>{codeData?.code || "—"}</strong>
          </div>
        </div>
        <div className="referral-link-footer">
          <Shield size={14} />
          <span>Share this link with potential customers. You'll earn when they subscribe!</span>
        </div>
      </div>

      {/* Earnings Summary */}
      <div className="referral-stats-grid">
        <div className="referral-stat-card highlight">
          <div className="stat-icon green">
            <DollarSign size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{formatCurrency(stats?.total_earned_cents || 0)}</span>
            <span className="stat-label">Total Earned</span>
          </div>
        </div>
        
        <div className="referral-stat-card">
          <div className="stat-icon yellow">
            <Clock size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{formatCurrency(stats?.pending_earnings_cents || 0)}</span>
            <span className="stat-label">Pending (30-day hold)</span>
          </div>
        </div>
        
        <div className="referral-stat-card">
          <div className="stat-icon cyan">
            <Banknote size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{formatCurrency(stats?.available_payout_cents || 0)}</span>
            <span className="stat-label">Available for Payout</span>
          </div>
        </div>
        
        <div className="referral-stat-card">
          <div className="stat-icon purple">
            <Users size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats?.active_referrals || 0}</span>
            <span className="stat-label">Active Referrals</span>
          </div>
        </div>
        
        <div className="referral-stat-card">
          <div className="stat-icon orange">
            <TrendingUp size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats?.total_referrals || 0}</span>
            <span className="stat-label">Total Referrals</span>
          </div>
        </div>
        
        <div className="referral-stat-card">
          <div className="stat-icon red">
            <AlertCircle size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats?.pending_referrals || 0}</span>
            <span className="stat-label">Pending Review</span>
          </div>
        </div>
      </div>

      {/* Payout Section */}
      <div className="referral-payout-section">
        <div className="payout-info">
          <h3>Request Payout</h3>
          <p>
            Minimum payout: {formatCurrency(stats?.min_payout_cents || 5000)}. 
            {stats?.can_request_payout 
              ? " You're eligible to request a payout!" 
              : ` You need ${formatCurrency((stats?.min_payout_cents || 5000) - (stats?.available_payout_cents || 0))} more to request.`
            }
          </p>
        </div>
        <button 
          className={`payout-btn ${!stats?.can_request_payout ? "disabled" : ""}`}
          onClick={handleRequestPayout}
          disabled={!stats?.can_request_payout || payoutLoading}
        >
          {payoutLoading ? (
            <>
              <div className="btn-spinner" />
              Processing...
            </>
          ) : (
            <>
              <Banknote size={18} />
              Request Payout
            </>
          )}
        </button>
        {payoutMessage && (
          <div className={`payout-message ${payoutMessage.type}`}>
            {payoutMessage.text}
          </div>
        )}
      </div>

      {/* How It Works */}
      <div className="referral-how-it-works">
        <h3>How It Works</h3>
        <div className="how-it-works-steps">
          <div className="step">
            <div className="step-number">1</div>
            <div className="step-content">
              <h4>Share Your Link</h4>
              <p>Send your unique referral link to potential customers</p>
            </div>
          </div>
          <div className="step">
            <div className="step-number">2</div>
            <div className="step-content">
              <h4>They Subscribe</h4>
              <p>When they sign up and pay, your referral is recorded</p>
            </div>
          </div>
          <div className="step">
            <div className="step-number">3</div>
            <div className="step-content">
              <h4>30-Day Hold</h4>
              <p>Referral enters 30-day verification period</p>
            </div>
          </div>
          <div className="step">
            <div className="step-number">4</div>
            <div className="step-content">
              <h4>Earn Commission</h4>
              <p>$25 upfront + 10% monthly for 12 months</p>
            </div>
          </div>
        </div>
      </div>

      {/* Referral History Table */}
      <div className="referral-history-section">
        <h3>Referral History</h3>
        {history.length === 0 ? (
          <div className="referral-empty-state">
            <Gift size={48} />
            <p>No referrals yet. Share your link to get started!</p>
          </div>
        ) : (
          <div className="referral-history-table-wrapper">
            <table className="referral-history-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Status</th>
                  <th>Signup Date</th>
                  <th>Months Paid</th>
                  <th>Earned</th>
                </tr>
              </thead>
              <tbody>
                {history.map((ref) => (
                  <tr key={ref.id}>
                    <td className="user-cell">
                      <span className="user-email">{ref.referred_email}</span>
                      {ref.has_fraud_flags && (
                        <span className="fraud-flag" title="Flagged for review">
                          <AlertCircle size={14} />
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`status-badge ${getStatusClass(ref.status)}`}>
                        {getStatusLabel(ref.status)}
                      </span>
                    </td>
                    <td>{formatDate(ref.signup_date)}</td>
                    <td>
                      {ref.status === "pending" ? (
                        <span className="months-pending">Pending</span>
                      ) : (
                        <span className="months-count">{ref.months_paid}/12</span>
                      )}
                    </td>
                    <td className="earned-cell">
                      {formatCurrency(ref.total_earned_cents || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Terms Footer */}
      <div className="referral-terms">
        <p>
          <strong>Terms:</strong> Commissions are subject to a 30-day verification period. 
          Referrals that result in refunds or chargebacks will be clawed back. 
          Self-referrals and fraudulent activity are prohibited and will result in account suspension.
        </p>
      </div>
    </div>
  );
}
