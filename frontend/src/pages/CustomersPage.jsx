import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users,
  Phone,
  Calendar,
  MessageSquare,
  Clock,
  Search,
  ChevronDown,
  ChevronRight,
  Play,
  Star,
  TrendingUp,
  PhoneCall,
  MapPin,
} from "lucide-react";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { getCustomers, getCustomerHistory } from "../lib/api";
import { supabase } from "../lib/supabase";

const formatDuration = (seconds) => {
  if (!seconds || seconds <= 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatRelativeTime = (dateStr) => {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateStr);
};

export default function CustomersPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("last_call");
  const [expandedPhone, setExpandedPhone] = useState(null);
  const [customerHistory, setCustomerHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isSeller, setIsSeller] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getCustomers({ search, sort: sortBy, limit: 100 });
      setCustomers(res.data?.customers || []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Error loading customers:", err);
    } finally {
      setLoading(false);
    }
  }, [search, sortBy]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    let mounted = true;
    const loadRole = async () => {
      const { data } = await supabase.auth.getSession();
      const user = data?.session?.user;
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
    return () => { mounted = false; };
  }, []);

  const handleExpand = async (phone) => {
    if (expandedPhone === phone) {
      setExpandedPhone(null);
      setCustomerHistory(null);
      return;
    }
    
    setExpandedPhone(phone);
    setHistoryLoading(true);
    
    try {
      const res = await getCustomerHistory(phone);
      setCustomerHistory(res.data);
    } catch (err) {
      console.error("Error loading customer history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const getSentimentClass = (sentiment) => {
    if (!sentiment) return "";
    const s = sentiment.toLowerCase();
    if (s.includes("positive") || s.includes("happy")) return "positive";
    if (s.includes("negative") || s.includes("angry") || s.includes("frustrated")) return "negative";
    return "neutral";
  };

  const totalCalls = customers.reduce((sum, c) => sum + c.total_calls, 0);
  const totalAppointments = customers.reduce((sum, c) => sum + c.appointments_booked, 0);

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
              <div className="war-room-kicker">CUSTOMER INTELLIGENCE</div>
              <div className="war-room-title">Customer CRM</div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="customers-stats-grid">
            <div className="customer-stat-card">
              <Users size={24} />
              <div className="stat-content">
                <span className="stat-value">{customers.length}</span>
                <span className="stat-label">Total Customers</span>
              </div>
            </div>
            <div className="customer-stat-card">
              <PhoneCall size={24} />
              <div className="stat-content">
                <span className="stat-value">{totalCalls}</span>
                <span className="stat-label">Total Calls</span>
              </div>
            </div>
            <div className="customer-stat-card">
              <Calendar size={24} />
              <div className="stat-content">
                <span className="stat-value">{totalAppointments}</span>
                <span className="stat-label">Appointments Booked</span>
              </div>
            </div>
            <div className="customer-stat-card">
              <TrendingUp size={24} />
              <div className="stat-content">
                <span className="stat-value">
                  {totalCalls > 0 ? Math.round((totalAppointments / totalCalls) * 100) : 0}%
                </span>
                <span className="stat-label">Booking Rate</span>
              </div>
            </div>
          </div>

          {/* Search and Sort */}
          <div className="customers-filters">
            <div className="search-box">
              <Search size={18} />
              <input
                type="text"
                placeholder="Search by name or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="sort-box">
              <span>Sort by:</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="last_call">Last Contact</option>
                <option value="total_calls">Most Calls</option>
                <option value="name">Name</option>
              </select>
            </div>
          </div>

          {/* Customer List */}
          <div className="customers-list">
            {loading ? (
              <div className="customers-loading">
                <div className="loading-spinner" />
                <p>Loading customers...</p>
              </div>
            ) : customers.length === 0 ? (
              <div className="customers-empty">
                <Users size={48} />
                <p>No customers found</p>
                <span>Customers will appear here after your first calls</span>
              </div>
            ) : (
              customers.map((customer) => (
                <div key={customer.phone} className="customer-card">
                  <div 
                    className="customer-card-header"
                    onClick={() => handleExpand(customer.phone)}
                  >
                    <div className="customer-main-info">
                      <div className="customer-avatar">
                        {customer.name?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                      <div className="customer-details">
                        <h3 className="customer-name">{customer.name || "Unknown"}</h3>
                        <p className="customer-phone">
                          <Phone size={14} />
                          {customer.phone}
                        </p>
                      </div>
                    </div>
                    
                    <div className="customer-stats">
                      <div className="customer-stat">
                        <PhoneCall size={16} />
                        <span>{customer.total_calls} calls</span>
                      </div>
                      <div className="customer-stat">
                        <Calendar size={16} />
                        <span>{customer.appointments_booked} booked</span>
                      </div>
                      <div className="customer-stat">
                        <Clock size={16} />
                        <span>{formatRelativeTime(customer.last_call_at)}</span>
                      </div>
                    </div>
                    
                    <div className="expand-icon">
                      {expandedPhone === customer.phone ? 
                        <ChevronDown size={20} /> : 
                        <ChevronRight size={20} />
                      }
                    </div>
                  </div>
                  
                  {expandedPhone === customer.phone && (
                    <div className="customer-expanded">
                      {historyLoading ? (
                        <div className="history-loading">Loading history...</div>
                      ) : customerHistory ? (
                        <div className="customer-timeline">
                          <h4>Activity Timeline</h4>
                          <div className="timeline-list">
                            {customerHistory.timeline?.slice(0, 10).map((item, idx) => (
                              <div key={`${item.type}-${item.id}-${idx}`} className={`timeline-item ${item.type}`}>
                                <div className="timeline-icon">
                                  {item.type === "call" && <PhoneCall size={16} />}
                                  {item.type === "appointment" && <Calendar size={16} />}
                                  {item.type === "message" && <MessageSquare size={16} />}
                                </div>
                                <div className="timeline-content">
                                  <div className="timeline-header">
                                    <span className="timeline-type">
                                      {item.type === "call" && "Call"}
                                      {item.type === "appointment" && "Appointment"}
                                      {item.type === "message" && `SMS ${item.data?.direction}`}
                                    </span>
                                    <span className="timeline-date">{formatDate(item.date)}</span>
                                  </div>
                                  <div className="timeline-details">
                                    {item.type === "call" && (
                                      <>
                                        <span className={`sentiment-badge ${getSentimentClass(item.data?.sentiment)}`}>
                                          {item.data?.sentiment || "Unknown"}
                                        </span>
                                        <span className="duration">{formatDuration(item.data?.duration)}</span>
                                        {item.data?.outcome && (
                                          <span className="outcome">{item.data.outcome}</span>
                                        )}
                                      </>
                                    )}
                                    {item.type === "appointment" && (
                                      <>
                                        <span className={`status-badge ${item.data?.status}`}>
                                          {item.data?.status}
                                        </span>
                                        {item.data?.location && (
                                          <span className="location">
                                            <MapPin size={12} />
                                            {item.data.location}
                                          </span>
                                        )}
                                      </>
                                    )}
                                    {item.type === "message" && (
                                      <p className="message-preview">
                                        {item.data?.body?.substring(0, 100)}
                                        {item.data?.body?.length > 100 ? "..." : ""}
                                      </p>
                                    )}
                                  </div>
                                  {item.type === "call" && item.data?.summary && (
                                    <p className="call-summary">{item.data.summary}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          
                          {customerHistory.timeline?.length > 10 && (
                            <div className="timeline-more">
                              +{customerHistory.timeline.length - 10} more interactions
                            </div>
                          )}
                          
                          <div className="customer-actions">
                            <button 
                              className="action-btn call"
                              onClick={() => window.location.href = `tel:${customer.phone}`}
                            >
                              <Phone size={16} />
                              Call
                            </button>
                            <button 
                              className="action-btn sms"
                              onClick={() => navigate(`/messages?to=${customer.phone}`)}
                            >
                              <MessageSquare size={16} />
                              SMS
                            </button>
                            <button 
                              className="action-btn leads"
                              onClick={() => navigate(`/leads?search=${customer.phone}`)}
                            >
                              <Users size={16} />
                              View Leads
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
