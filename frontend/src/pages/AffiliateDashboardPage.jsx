import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
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
  Sparkles,
  Share2,
  Mail,
  MessageSquare,
  HelpCircle,
  LogOut,
  User
} from "lucide-react";
import { supabase } from "../lib/supabase";
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

export default function AffiliateDashboardPage() {
  const navigate = useNavigate();
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
  const [userName, setUserName] = useState("");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Get user info
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("affiliate_name, payout_email")
          .eq("user_id", sessionData.session.user.id)
          .maybeSingle();
        
        setUserName(profile?.affiliate_name || sessionData.session.user.email?.split("@")[0] || "Affiliate");
        if (profile?.payout_email) {
          setPayoutEmail(profile.payout_email);
        }
      }
      
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
      console.error("Error loading affiliate data:", err);
      setError("Failed to load affiliate data");
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

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      window.localStorage.removeItem("kryonex_session_ok");
      window.localStorage.removeItem("kryonex_admin_mode");
      navigate("/login");
    } catch (err) {
      console.error("Sign out error:", err);
    }
  };

  // Social sharing handlers
  const shareLink = codeData?.link || "";
  const shareText = encodeURIComponent(SHARE_MESSAGE);
  const shareUrl = encodeURIComponent(shareLink);
  const fullShareText = encodeURIComponent(`${SHARE_MESSAGE} ${shareLink}`);

  const handleShareTwitter = () => {
    const url = `https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`;
    window.open(url, "_blank", "width=600,height=400");
  };

  const handleShareFacebook = () => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}&quote=${shareText}`;
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
      loadData();
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
      case "completed":
        return "status-active";
      case "pending":
      case "processing":
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
      case "completed":
        return "Paid";
      case "pending":
        return "Pending";
      case "processing":
        return "Processing";
      case "rejected":
        return "Rejected";
      case "clawed_back":
        return "Voided";
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div className="affiliate-dashboard">
        <div className="affiliate-loading">
          <div className="loading-spinner" />
          <p>Loading your affiliate dashboard...</p>
        </div>
        <style>{affiliateDashboardStyles}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="affiliate-dashboard">
        <div className="affiliate-error">
          <AlertCircle size={48} />
          <p>{error}</p>
          <button onClick={loadData}>Try Again</button>
        </div>
        <style>{affiliateDashboardStyles}</style>
      </div>
    );
  }

  return (
    <div className="affiliate-dashboard">
      {/* Header */}
      <header className="affiliate-header">
        <div className="affiliate-header-left">
          <div className="affiliate-logo">
            <Gift size={24} />
            <span>KRYONEX</span>
          </div>
          <span className="affiliate-badge">AFFILIATE</span>
        </div>
        <div className="affiliate-header-right">
          <div className="affiliate-user">
            <User size={18} />
            <span>{userName}</span>
          </div>
          <button className="sign-out-btn" onClick={handleSignOut}>
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      <main className="affiliate-main">
        {/* Welcome Banner */}
        <motion.div 
          className="welcome-banner"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="welcome-content">
            <Sparkles size={24} />
            <div>
              <h1>Welcome to your affiliate dashboard!</h1>
              <p>Share your link below to start earning commissions</p>
            </div>
          </div>
        </motion.div>

        {/* Referral Link Card */}
        <motion.div 
          className="link-card glass"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <div className="link-card-header">
            <ExternalLink size={20} />
            <span>Your Referral Link</span>
            <span className="link-helper">Earn $25 + 10% monthly for 12 months (30-day verification)</span>
          </div>
          <div className="link-card-body">
            <div className="link-input-group">
              <input 
                type="text" 
                value={codeData?.link || ""} 
                readOnly 
                className="link-input"
              />
              <button 
                className={`copy-btn ${copied ? "copied" : ""}`}
                onClick={handleCopy}
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
                {copied ? "Copied!" : "Copy Link"}
              </button>
            </div>
            <div className="link-code">
              <span>Your Code:</span>
              <strong>{codeData?.code || "—"}</strong>
            </div>
          </div>
        </motion.div>

        {/* Quick Share Buttons */}
        <motion.div 
          className="share-section glass"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          <div className="share-header">
            <Share2 size={18} />
            <span>Quick Share</span>
          </div>
          <div className="share-buttons">
            <button className="share-btn twitter" onClick={handleShareTwitter} title="Share on Twitter">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </button>
            <button className="share-btn facebook" onClick={handleShareFacebook} title="Share on Facebook">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </button>
            <button className="share-btn whatsapp" onClick={handleShareWhatsApp} title="Share via WhatsApp">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </button>
            <button className="share-btn email" onClick={handleShareEmail} title="Share via Email">
              <Mail size={18} />
            </button>
            <button className="share-btn sms" onClick={handleShareSMS} title="Share via SMS">
              <MessageSquare size={18} />
            </button>
            {typeof navigator !== 'undefined' && navigator.share && (
              <button className="share-btn more" onClick={handleNativeShare} title="More options">
                <Share2 size={18} />
              </button>
            )}
          </div>
        </motion.div>

        {/* Stats Grid */}
        <motion.div 
          className="stats-grid"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <div className="stat-card highlight glass">
            <div className="stat-icon green">
              <DollarSign size={22} />
            </div>
            <div className="stat-content">
              <span className="stat-value">{formatCurrency(stats?.total_earned_cents || 0)}</span>
              <span className="stat-label">Total Earned</span>
            </div>
          </div>
          
          <div className="stat-card glass">
            <div className="stat-icon yellow">
              <Clock size={22} />
            </div>
            <div className="stat-content">
              <span className="stat-value">{formatCurrency(stats?.pending_earnings_cents || 0)}</span>
              <span className="stat-label">
                Pending
                <span className="tooltip" title="Earnings in 30-day hold period. This protects against fraud.">
                  <HelpCircle size={14} />
                </span>
              </span>
            </div>
          </div>
          
          <div className="stat-card glass">
            <div className="stat-icon cyan">
              <Banknote size={22} />
            </div>
            <div className="stat-content">
              <span className="stat-value">{formatCurrency(stats?.available_payout_cents || 0)}</span>
              <span className="stat-label">
                Available
                <span className="tooltip" title="Ready to withdraw. Request payout once you reach $50.">
                  <HelpCircle size={14} />
                </span>
              </span>
            </div>
          </div>
          
          <div className="stat-card glass">
            <div className="stat-icon purple">
              <Users size={22} />
            </div>
            <div className="stat-content">
              <span className="stat-value">{stats?.active_referrals || 0}</span>
              <span className="stat-label">Active Referrals</span>
            </div>
          </div>
        </motion.div>

        {/* Payout Section */}
        <motion.div 
          className="payout-section glass"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
        >
          <div className="payout-header">
            <div className="payout-title">
              <Banknote size={20} />
              <h3>Request Payout</h3>
            </div>
            <p className="payout-helper">
              Minimum payout: $50. Sent to your PayPal within 3-5 business days.
            </p>
          </div>
          
          <div className="payout-body">
            {stats?.can_request_payout ? (
              showPayoutForm ? (
                <div className="payout-form">
                  <label>
                    <span>PayPal Email</span>
                    <input
                      type="email"
                      placeholder="your@paypal.com"
                      value={payoutEmail}
                      onChange={(e) => setPayoutEmail(e.target.value)}
                    />
                  </label>
                  <div className="payout-form-actions">
                    <button 
                      className="payout-btn primary"
                      onClick={handleRequestPayout}
                      disabled={payoutLoading}
                    >
                      {payoutLoading ? "Processing..." : "Request Payout"}
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
                  className="payout-btn primary"
                  onClick={() => setShowPayoutForm(true)}
                >
                  <Banknote size={18} />
                  Request Payout ({formatCurrency(stats?.available_payout_cents || 0)})
                </button>
              )
            ) : (
              <div className="payout-not-eligible">
                <p>
                  You need {formatCurrency((stats?.min_payout_cents || 5000) - (stats?.available_payout_cents || 0))} more to request a payout.
                </p>
                <p className="payout-tip">Keep sharing your link to reach the $50 minimum!</p>
              </div>
            )}
            
            {payoutMessage && (
              <div className={`payout-message ${payoutMessage.type}`}>
                {payoutMessage.type === "success" ? <Check size={18} /> : <AlertCircle size={18} />}
                {payoutMessage.text}
              </div>
            )}
          </div>
        </motion.div>

        {/* Referral History */}
        <motion.div 
          className="history-section glass"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <div className="history-header">
            <TrendingUp size={20} />
            <h3>Referral History</h3>
          </div>
          
          {history.length === 0 ? (
            <div className="history-empty">
              <Gift size={40} />
              <p>No referrals yet. Share your link to start earning!</p>
            </div>
          ) : (
            <div className="history-table-wrapper">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Earned</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((ref) => (
                    <tr key={ref.id}>
                      <td className="user-cell">{ref.referred_email}</td>
                      <td>
                        <span className={`status-badge ${getStatusClass(ref.status)}`}>
                          {getStatusLabel(ref.status)}
                        </span>
                      </td>
                      <td>{formatDate(ref.signup_date)}</td>
                      <td className="earned-cell">{formatCurrency(ref.total_earned_cents || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>

        {/* Payout History */}
        {payoutHistory.length > 0 && (
          <motion.div 
            className="payout-history-section glass"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.35 }}
          >
            <div className="history-header">
              <Banknote size={20} />
              <h3>Payout History</h3>
            </div>
            <div className="history-table-wrapper">
              <table className="history-table">
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
                      <td className="earned-cell">{formatCurrency(payout.amount_cents || 0)}</td>
                      <td>
                        <span className={`status-badge ${getStatusClass(payout.status)}`}>
                          {getStatusLabel(payout.status)}
                        </span>
                      </td>
                      <td>{payout.payment_method === "paypal" ? "PayPal" : payout.payment_method}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* How It Works */}
        <motion.div 
          className="how-it-works glass"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          <h3>How It Works</h3>
          <div className="steps">
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
                <p>When they sign up and pay, you earn $25 (after 30-day hold)</p>
              </div>
            </div>
            <div className="step">
              <div className="step-number">3</div>
              <div className="step-content">
                <h4>30-Day Hold</h4>
                <p>Commission enters verification period for security</p>
              </div>
            </div>
            <div className="step">
              <div className="step-number">4</div>
              <div className="step-content">
                <h4>Get Paid Monthly</h4>
                <p>Earn 10% of their payments for 12 months</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Terms Footer */}
        <div className="terms-footer">
          <p>
            <strong>Terms:</strong> Commissions have a 30-day verification period. 
            Referrals resulting in refunds or cancellations will be voided. 
            Self-referrals and fraudulent activity are prohibited.
          </p>
        </div>
      </main>

      <style>{affiliateDashboardStyles}</style>
    </div>
  );
}

const affiliateDashboardStyles = `
  .affiliate-dashboard {
    min-height: 100vh;
    background: #05070d;
    color: #e5e7eb;
  }

  .affiliate-loading,
  .affiliate-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    gap: 1rem;
  }

  .affiliate-error button {
    padding: 0.75rem 1.5rem;
    background: linear-gradient(135deg, #8b5cf6, #10b981);
    border: none;
    border-radius: 999px;
    color: #fff;
    font-weight: 600;
    cursor: pointer;
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(139, 92, 246, 0.2);
    border-top-color: #8b5cf6;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Header */
  .affiliate-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 2rem;
    background: rgba(5, 7, 13, 0.9);
    border-bottom: 1px solid rgba(139, 92, 246, 0.2);
    position: sticky;
    top: 0;
    z-index: 100;
    backdrop-filter: blur(10px);
  }

  .affiliate-header-left {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .affiliate-logo {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #a78bfa;
    font-weight: 700;
    font-size: 1.1rem;
    letter-spacing: 0.1rem;
  }

  .affiliate-badge {
    padding: 0.25rem 0.75rem;
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: 999px;
    color: #10b981;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.1rem;
  }

  .affiliate-header-right {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .affiliate-user {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #9ca3af;
    font-size: 0.9rem;
  }

  .sign-out-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: transparent;
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 8px;
    color: #f87171;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .sign-out-btn:hover {
    background: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.5);
  }

  /* Main Content */
  .affiliate-main {
    max-width: 900px;
    margin: 0 auto;
    padding: 2rem 1.5rem;
  }

  /* Glass Card */
  .glass {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    backdrop-filter: blur(10px);
  }

  /* Welcome Banner */
  .welcome-banner {
    padding: 1.25rem 1.5rem;
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(16, 185, 129, 0.1));
    border: 1px solid rgba(139, 92, 246, 0.25);
    border-radius: 12px;
    margin-bottom: 1.5rem;
  }

  .welcome-content {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .welcome-content svg {
    color: #a78bfa;
    flex-shrink: 0;
  }

  .welcome-content h1 {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0 0 0.25rem;
  }

  .welcome-content p {
    font-size: 0.9rem;
    color: #9ca3af;
    margin: 0;
  }

  /* Link Card */
  .link-card {
    padding: 1.5rem;
    margin-bottom: 1rem;
  }

  .link-card-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }

  .link-card-header svg {
    color: #22d3ee;
  }

  .link-card-header span:first-of-type {
    font-weight: 600;
  }

  .link-helper {
    margin-left: auto;
    font-size: 0.8rem;
    color: #6b7280;
  }

  .link-input-group {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .link-input {
    flex: 1;
    padding: 0.75rem 1rem;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    color: #e5e7eb;
    font-size: 0.9rem;
  }

  .copy-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    background: linear-gradient(135deg, #8b5cf6, #6366f1);
    border: none;
    border-radius: 10px;
    color: #fff;
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .copy-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3);
  }

  .copy-btn.copied {
    background: linear-gradient(135deg, #10b981, #059669);
  }

  .link-code {
    font-size: 0.85rem;
    color: #9ca3af;
  }

  .link-code strong {
    color: #a78bfa;
    margin-left: 0.5rem;
    letter-spacing: 0.1rem;
  }

  /* Share Section */
  .share-section {
    padding: 1rem 1.5rem;
    margin-bottom: 1.5rem;
  }

  .share-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    color: #9ca3af;
    font-size: 0.9rem;
  }

  .share-buttons {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .share-btn {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
  }

  .share-btn.twitter {
    background: rgba(29, 161, 242, 0.15);
    color: #1da1f2;
    border: 1px solid rgba(29, 161, 242, 0.3);
  }

  .share-btn.facebook {
    background: rgba(66, 103, 178, 0.15);
    color: #4267b2;
    border: 1px solid rgba(66, 103, 178, 0.3);
  }

  .share-btn.whatsapp {
    background: rgba(37, 211, 102, 0.15);
    color: #25d366;
    border: 1px solid rgba(37, 211, 102, 0.3);
  }

  .share-btn.email {
    background: rgba(234, 88, 12, 0.15);
    color: #ea580c;
    border: 1px solid rgba(234, 88, 12, 0.3);
  }

  .share-btn.sms {
    background: rgba(34, 211, 238, 0.15);
    color: #22d3ee;
    border: 1px solid rgba(34, 211, 238, 0.3);
  }

  .share-btn.more {
    background: rgba(139, 92, 246, 0.15);
    color: #a78bfa;
    border: 1px solid rgba(139, 92, 246, 0.3);
  }

  .share-btn:hover {
    transform: translateY(-2px);
  }

  /* Stats Grid */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .stat-card {
    padding: 1.25rem;
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .stat-card.highlight {
    border-color: rgba(16, 185, 129, 0.3);
    background: rgba(16, 185, 129, 0.05);
  }

  .stat-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .stat-icon.green {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
  }

  .stat-icon.yellow {
    background: rgba(234, 179, 8, 0.15);
    color: #eab308;
  }

  .stat-icon.cyan {
    background: rgba(34, 211, 238, 0.15);
    color: #22d3ee;
  }

  .stat-icon.purple {
    background: rgba(139, 92, 246, 0.15);
    color: #a78bfa;
  }

  .stat-content {
    display: flex;
    flex-direction: column;
  }

  .stat-value {
    font-size: 1.4rem;
    font-weight: 700;
    color: #fff;
  }

  .stat-label {
    font-size: 0.8rem;
    color: #9ca3af;
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .tooltip {
    cursor: help;
    color: #6b7280;
  }

  .tooltip:hover {
    color: #9ca3af;
  }

  /* Payout Section */
  .payout-section {
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .payout-header {
    margin-bottom: 1rem;
  }

  .payout-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.25rem;
  }

  .payout-title svg {
    color: #10b981;
  }

  .payout-title h3 {
    font-size: 1rem;
    font-weight: 600;
    margin: 0;
  }

  .payout-helper {
    font-size: 0.85rem;
    color: #6b7280;
    margin: 0;
  }

  .payout-body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .payout-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .payout-form label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .payout-form label span {
    font-size: 0.85rem;
    color: #9ca3af;
  }

  .payout-form input {
    padding: 0.75rem 1rem;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #e5e7eb;
    font-size: 0.9rem;
  }

  .payout-form-actions {
    display: flex;
    gap: 0.75rem;
  }

  .payout-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    border-radius: 10px;
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .payout-btn.primary {
    background: linear-gradient(135deg, #10b981, #059669);
    border: none;
    color: #fff;
  }

  .payout-btn.primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
  }

  .payout-btn.primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .payout-btn.secondary {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #9ca3af;
  }

  .payout-btn.secondary:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.3);
    color: #e5e7eb;
  }

  .payout-not-eligible {
    padding: 1rem;
    background: rgba(234, 179, 8, 0.1);
    border: 1px solid rgba(234, 179, 8, 0.2);
    border-radius: 10px;
  }

  .payout-not-eligible p {
    margin: 0;
    font-size: 0.9rem;
    color: #eab308;
  }

  .payout-tip {
    margin-top: 0.5rem !important;
    color: #9ca3af !important;
    font-size: 0.85rem !important;
  }

  .payout-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    font-size: 0.9rem;
  }

  .payout-message.success {
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.2);
    color: #10b981;
  }

  .payout-message.error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
    color: #f87171;
  }

  /* History Section */
  .history-section,
  .payout-history-section {
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .history-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .history-header svg {
    color: #22d3ee;
  }

  .history-header h3 {
    font-size: 1rem;
    font-weight: 600;
    margin: 0;
  }

  .history-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 1rem;
    color: #6b7280;
    text-align: center;
  }

  .history-empty svg {
    margin-bottom: 1rem;
    opacity: 0.5;
  }

  .history-table-wrapper {
    overflow-x: auto;
  }

  .history-table {
    width: 100%;
    border-collapse: collapse;
  }

  .history-table th,
  .history-table td {
    padding: 0.75rem 1rem;
    text-align: left;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .history-table th {
    font-size: 0.75rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05rem;
  }

  .history-table td {
    font-size: 0.9rem;
  }

  .user-cell {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .earned-cell {
    color: #10b981;
    font-weight: 600;
  }

  .status-badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .status-badge.status-active {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
  }

  .status-badge.status-pending {
    background: rgba(234, 179, 8, 0.15);
    color: #eab308;
  }

  .status-badge.status-rejected {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
  }

  /* How It Works */
  .how-it-works {
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .how-it-works h3 {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 1.25rem;
  }

  .steps {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1rem;
  }

  .step {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
  }

  .step-number {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: linear-gradient(135deg, #8b5cf6, #6366f1);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 0.85rem;
    flex-shrink: 0;
  }

  .step-content h4 {
    font-size: 0.9rem;
    font-weight: 600;
    margin: 0 0 0.25rem;
  }

  .step-content p {
    font-size: 0.8rem;
    color: #6b7280;
    margin: 0;
    line-height: 1.4;
  }

  /* Terms Footer */
  .terms-footer {
    padding: 1rem;
    text-align: center;
  }

  .terms-footer p {
    font-size: 0.8rem;
    color: #6b7280;
    margin: 0;
    line-height: 1.5;
  }

  /* Mobile Responsive */
  @media (max-width: 640px) {
    .affiliate-header {
      flex-direction: column;
      gap: 1rem;
      padding: 1rem;
    }

    .affiliate-header-left,
    .affiliate-header-right {
      width: 100%;
      justify-content: space-between;
    }

    .link-input-group {
      flex-direction: column;
    }

    .copy-btn {
      width: 100%;
      justify-content: center;
    }

    .link-helper {
      margin-left: 0;
      margin-top: 0.25rem;
      width: 100%;
    }

    .stats-grid {
      grid-template-columns: 1fr 1fr;
    }

    .steps {
      grid-template-columns: 1fr;
    }
  }
`;
