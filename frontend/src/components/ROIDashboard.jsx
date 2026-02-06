import React, { useState, useEffect } from "react";
import { DollarSign, Clock, Calendar, TrendingUp, Zap, Users } from "lucide-react";
import { getDashboardROI } from "../lib/api";

export default function ROIDashboard() {
  const [roi, setRoi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchROI = async () => {
      try {
        setLoading(true);
        const res = await getDashboardROI();
        setRoi(res.data?.roi || null);
      } catch (err) {
        console.error("ROI fetch error:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchROI();
  }, []);

  if (loading) {
    return (
      <div className="roi-dashboard loading">
        <div className="loading-spinner" />
        <span>Calculating your ROI...</span>
      </div>
    );
  }

  if (error || !roi) {
    return null; // Silently fail - ROI is optional
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <div className="roi-dashboard">
      <div className="roi-header">
        <div className="roi-title">
          <TrendingUp size={20} />
          <h3>Your Kryonex ROI</h3>
        </div>
        {roi.roi_percent > 0 && (
          <div className="roi-badge positive">
            +{roi.roi_percent}% ROI
          </div>
        )}
      </div>

      <div className="roi-grid">
        {/* Value Generated */}
        <div className="roi-card highlight">
          <div className="roi-card-icon">
            <DollarSign size={24} />
          </div>
          <div className="roi-card-content">
            <span className="roi-card-value">{formatCurrency(roi.total_value)}</span>
            <span className="roi-card-label">Total Value Generated</span>
          </div>
        </div>

        {/* Revenue from Appointments */}
        <div className="roi-card">
          <div className="roi-card-icon">
            <Calendar size={20} />
          </div>
          <div className="roi-card-content">
            <span className="roi-card-value">{formatCurrency(roi.revenue_generated)}</span>
            <span className="roi-card-label">
              {roi.booked_appointments} appointments @ {formatCurrency(roi.avg_ticket_value)} avg
            </span>
          </div>
        </div>

        {/* Labor Savings */}
        <div className="roi-card">
          <div className="roi-card-icon">
            <Users size={20} />
          </div>
          <div className="roi-card-content">
            <span className="roi-card-value">{formatCurrency(roi.labor_savings)}</span>
            <span className="roi-card-label">Labor Savings (vs receptionist)</span>
          </div>
        </div>

        {/* Time Saved */}
        <div className="roi-card">
          <div className="roi-card-icon">
            <Clock size={20} />
          </div>
          <div className="roi-card-content">
            <span className="roi-card-value">{roi.hours_saved}h</span>
            <span className="roi-card-label">
              {roi.total_calls} calls handled for you
            </span>
          </div>
        </div>

        {/* Monthly Cost */}
        <div className="roi-card subtle">
          <div className="roi-card-icon">
            <Zap size={20} />
          </div>
          <div className="roi-card-content">
            <span className="roi-card-value">{formatCurrency(roi.monthly_cost)}/mo</span>
            <span className="roi-card-label">Your Kryonex Investment</span>
          </div>
        </div>
      </div>

      <div className="roi-footer">
        <p>
          Based on {roi.total_calls} calls, {roi.booked_appointments} appointments, 
          and {formatCurrency(roi.receptionist_monthly_cost)}/mo receptionist comparison.
        </p>
      </div>
    </div>
  );
}
