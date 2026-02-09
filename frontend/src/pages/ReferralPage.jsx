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
  Sparkles,
  Share2,
  Mail,
  MessageSquare
} from "lucide-react";
import { 
  getReferralCode, 
  getReferralStats, 
  getReferralHistory, 
  requestReferralPayout,
  getPayoutHistory 
} from "../lib/api";

// Social sharing configuration
const SHARE_MESSAGE = "Check out Kryonex - AI-powered call handling for service businesses. Use my link to get started:";
const SHARE_TITLE = "Kryonex AI Call Agent - Transform Your Business";

export default function ReferralPage() {
  const [codeData, setCodeData] = useState(null);
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [payoutHistory, setPayoutHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutMessage, setPayoutMessage] = useState(null);
  const [error, setError] = useState(null);
  const [payoutEmail, setPayoutEmail] = useState("");
  const [showPayoutForm, setShowPayoutForm] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [codeRes, statsRes, historyRes, payoutHistoryRes] = await Promise.all([
        getReferralCode(),
        getReferralStats(),
        getReferralHistory(),
        getPayoutHistory().catch(() => ({ data: { payout_requests: [] } })),
      ]);
      
      setCodeData(codeRes.data);
      setStats(statsRes.data);
      setHistory(historyRes.data?.referrals || []);
      setPayoutHistory(payoutHistoryRes.data?.payout_requests || []);
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

  // Social sharing handlers
  const shareLink = codeData?.link || "";
  const shareText = encodeURIComponent(SHARE_MESSAGE);
  const shareUrl = encodeURIComponent(shareLink);
  const shareTitle = encodeURIComponent(SHARE_TITLE);
  const fullShareText = encodeURIComponent(`${SHARE_MESSAGE} ${shareLink}`);

  const handleShareTwitter = () => {
    const url = `https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`;
    window.open(url, "_blank", "width=600,height=400");
  };

  const handleShareFacebook = () => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}&quote=${shareText}`;
    window.open(url, "_blank", "width=600,height=400");
  };

  const handleShareLinkedIn = () => {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`;
    window.open(url, "_blank", "width=600,height=400");
  };

  const handleShareWhatsApp = () => {
    const url = `https://wa.me/?text=${fullShareText}`;
    window.open(url, "_blank", "width=600,height=400");
  };

  const handleShareEmail = () => {
    const subject = encodeURIComponent("Check out Kryonex AI");
    const body = encodeURIComponent(`${SHARE_MESSAGE}\n\n${shareLink}\n\nThis AI call agent handles calls 24/7 and books appointments automatically. Thought you might be interested!`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const handleShareSMS = () => {
    const body = encodeURIComponent(`${SHARE_MESSAGE} ${shareLink}`);
    // Use different format for iOS vs Android
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const smsUrl = isIOS ? `sms:&body=${body}` : `sms:?body=${body}`;
    window.location.href = smsUrl;
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: SHARE_TITLE,
          text: SHARE_MESSAGE,
          url: shareLink,
        });
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Share failed:", err);
        }
      }
    }
  };

  const handleRequestPayout = async () => {
    try {
      setPayoutLoading(true);
      setPayoutMessage(null);
      const res = await requestReferralPayout({
        payment_email: payoutEmail || undefined,
        payment_method: "paypal",
      });
      setPayoutMessage({ type: "success", text: res.data.message });
      setShowPayoutForm(false);
      setPayoutEmail("");
      loadData(); // Refresh data
    } catch (err) {
      const errMsg = err.response?.data?.error || "Failed to request payout";
      setPayoutMessage({ type: "error", text: errMsg });
    } finally {
      setPayoutLoading(false);
    }
  };

  const getPayoutStatusClass = (status) => {
    switch (status) {
      case "completed":
        return "status-active";
      case "processing":
        return "status-pending";
      case "pending":
        return "status-pending";
      case "rejected":
        return "status-rejected";
      default:
        return "";
    }
  };

  const getPayoutStatusLabel = (status) => {
    switch (status) {
      case "completed":
        return "Paid";
      case "processing":
        return "Processing";
      case "pending":
        return "Pending";
      case "rejected":
        return "Rejected";
      default:
        return status;
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
          <span>$25 + 10% for 12 months (30-day hold)</span>
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

      {/* Social Sharing Section */}
      <div className="referral-share-section">
        <div className="share-header">
          <Share2 size={20} />
          <span>Share Your Link</span>
        </div>
        <div className="share-buttons-grid">
          {/* Twitter/X */}
          <button 
            className="share-btn share-twitter" 
            onClick={handleShareTwitter}
            title="Share on Twitter/X"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            <span>Twitter</span>
          </button>

          {/* Facebook */}
          <button 
            className="share-btn share-facebook" 
            onClick={handleShareFacebook}
            title="Share on Facebook"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            <span>Facebook</span>
          </button>

          {/* LinkedIn */}
          <button 
            className="share-btn share-linkedin" 
            onClick={handleShareLinkedIn}
            title="Share on LinkedIn"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
            <span>LinkedIn</span>
          </button>

          {/* WhatsApp */}
          <button 
            className="share-btn share-whatsapp" 
            onClick={handleShareWhatsApp}
            title="Share via WhatsApp"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            <span>WhatsApp</span>
          </button>

          {/* Email */}
          <button 
            className="share-btn share-email" 
            onClick={handleShareEmail}
            title="Share via Email"
          >
            <Mail size={20} />
            <span>Email</span>
          </button>

          {/* SMS */}
          <button 
            className="share-btn share-sms" 
            onClick={handleShareSMS}
            title="Share via SMS"
          >
            <MessageSquare size={20} />
            <span>SMS</span>
          </button>
        </div>
        
        {/* Native Share Button (mobile) */}
        {typeof navigator !== 'undefined' && navigator.share && (
          <button 
            className="share-btn share-native"
            onClick={handleNativeShare}
          >
            <Share2 size={18} />
            <span>More Sharing Options</span>
          </button>
        )}
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
        
        {showPayoutForm ? (
          <div className="payout-form">
            <div className="payout-form-field">
              <label>PayPal Email (for receiving payment)</label>
              <input
                type="email"
                placeholder="your@paypal.com"
                value={payoutEmail}
                onChange={(e) => setPayoutEmail(e.target.value)}
                className="payout-email-input"
              />
            </div>
            <div className="payout-form-actions">
              <button 
                className="payout-btn"
                onClick={handleRequestPayout}
                disabled={payoutLoading}
              >
                {payoutLoading ? (
                  <>
                    <div className="btn-spinner" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Banknote size={18} />
                    Submit Request
                  </>
                )}
              </button>
              <button 
                className="payout-btn secondary"
                onClick={() => setShowPayoutForm(false)}
                disabled={payoutLoading}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button 
            className={`payout-btn ${!stats?.can_request_payout ? "disabled" : ""}`}
            onClick={() => setShowPayoutForm(true)}
            disabled={!stats?.can_request_payout}
          >
            <Banknote size={18} />
            Request Payout
          </button>
        )}
        
        {payoutMessage && (
          <div className={`payout-message ${payoutMessage.type}`}>
            {payoutMessage.text}
          </div>
        )}
      </div>

      {/* Payout History */}
      {payoutHistory.length > 0 && (
        <div className="payout-history-section">
          <h3>Payout History</h3>
          <div className="payout-history-table-wrapper">
            <table className="payout-history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Method</th>
                </tr>
              </thead>
              <tbody>
                {payoutHistory.map((payout) => (
                  <tr key={payout.id}>
                    <td>{formatDate(payout.created_at)}</td>
                    <td className="amount-cell">{formatCurrency(payout.amount_cents || 0)}</td>
                    <td>
                      <span className={`status-badge ${getPayoutStatusClass(payout.status)}`}>
                        {getPayoutStatusLabel(payout.status)}
                      </span>
                    </td>
                    <td className="method-cell">
                      {payout.payment_method === "paypal" ? "PayPal" : payout.payment_method}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
