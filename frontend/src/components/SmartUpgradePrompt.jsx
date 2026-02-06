import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, TrendingUp, Calendar, Link, X } from "lucide-react";

// Upgrade triggers based on usage patterns and value
const UPGRADE_TRIGGERS = [
  {
    id: "usage_high",
    condition: (usage, stats) => usage?.percent >= 75,
    icon: Zap,
    type: "usage-high",
    getMessage: (usage, stats) => 
      `You're crushing it! You've used ${usage?.percent?.toFixed(0)}% of your minutes this month. Upgrade to Pro for more capacity.`,
    cta: "View Plans",
    priority: 1,
  },
  {
    id: "high_performer",
    condition: (usage, stats) => stats?.bookingRate > 35 && stats?.totalCalls > 20,
    icon: TrendingUp,
    type: "high-performer",
    getMessage: (usage, stats) => 
      `Your ${stats?.bookingRate?.toFixed(0)}% booking rate is exceptional! Pro users get priority support to keep growing.`,
    cta: "Upgrade Now",
    priority: 2,
  },
  {
    id: "calendar_unlock",
    condition: (usage, stats) => !stats?.calendarConnected && stats?.appointments > 5,
    icon: Calendar,
    type: "feature-unlock",
    getMessage: (usage, stats) => 
      `You've booked ${stats?.appointments} appointments. Connect your calendar to auto-sync them.`,
    cta: "Connect Calendar",
    link: "/settings",
    priority: 3,
  },
  {
    id: "integrations_prompt",
    condition: (usage, stats) => stats?.totalCalls > 50 && !stats?.integrationsEnabled,
    icon: Link,
    type: "integration-prompt",
    getMessage: (usage, stats) => 
      `Send your ${stats?.totalCalls} leads to your CRM automatically with Integrations.`,
    cta: "Add Integrations",
    link: "/integrations",
    priority: 4,
  },
];

// Session storage key to track dismissed prompts
const DISMISSED_KEY = "kryonex_dismissed_prompts";

export default function SmartUpgradePrompt({ usage, stats }) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState([]);
  const [activePrompt, setActivePrompt] = useState(null);

  useEffect(() => {
    // Load dismissed prompts from session storage
    const stored = sessionStorage.getItem(DISMISSED_KEY);
    if (stored) {
      setDismissed(JSON.parse(stored));
    }
  }, []);

  useEffect(() => {
    if (!usage || !stats) return;

    // Find first matching trigger that hasn't been dismissed
    const matchingTrigger = UPGRADE_TRIGGERS
      .filter(t => !dismissed.includes(t.id))
      .sort((a, b) => a.priority - b.priority)
      .find(t => t.condition(usage, stats));

    setActivePrompt(matchingTrigger || null);
  }, [usage, stats, dismissed]);

  const handleDismiss = () => {
    if (!activePrompt) return;
    
    const newDismissed = [...dismissed, activePrompt.id];
    setDismissed(newDismissed);
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(newDismissed));
    setActivePrompt(null);
  };

  const handleAction = () => {
    if (!activePrompt) return;
    
    if (activePrompt.link) {
      navigate(activePrompt.link);
    } else {
      navigate("/billing");
    }
  };

  if (!activePrompt) return null;

  const Icon = activePrompt.icon;

  return (
    <div className={`smart-upgrade-prompt ${activePrompt.type}`}>
      <div className="upgrade-prompt-icon">
        <Icon size={22} />
      </div>
      <div className="upgrade-prompt-content">
        <p>{activePrompt.getMessage(usage, stats)}</p>
      </div>
      <div className="upgrade-prompt-actions">
        <button className="upgrade-prompt-btn primary" onClick={handleAction}>
          {activePrompt.cta}
        </button>
        <button className="upgrade-prompt-dismiss" onClick={handleDismiss}>
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
