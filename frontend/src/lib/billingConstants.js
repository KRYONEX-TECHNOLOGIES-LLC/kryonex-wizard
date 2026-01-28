export const TIERS = [
  {
    id: "core",
    title: "CORE",
    description: "24/7 AI Receptionist, Live Bookings, and Basic Routing.",
    accent: "#f59e0b",
    price: "$149/mo",
    minutes: 150,
  },
  {
    id: "pro",
    title: "PRO",
    description: "Emergency Transfers, Call Recordings, and Priority Logic.",
    accent: "#22d3ee",
    price: "$249/mo",
    minutes: 500,
  },
  {
    id: "elite",
    title: "ELITE",
    description: "Multi-Location Support, VIP Onboarding, and SLA Guarantees.",
    accent: "#7c3aed",
    price: "$399/mo",
    minutes: 1200,
  },
  {
    id: "scale",
    title: "KRYONEX SCALE",
    description: "Enterprise Minutes, Dedicated Admin, and White-Glove Setup.",
    accent: "#ec4899",
    price: "$799/mo",
    minutes: 3000,
  },
];

export const FEATURES = [
  {
    id: "call_recordings",
    label: "Call Recordings",
    description: "Store and review call recordings.",
  },
  {
    id: "auto_sms_followup",
    label: "Auto SMS Follow-Up",
    description: "Send automatic text follow-ups after calls.",
  },
  {
    id: "sms_reminders",
    label: "SMS Appointment Reminders",
    description: "Auto-send appointment reminders.",
  },
  {
    id: "eta_texts",
    label: "ETA Texts",
    description: "Send ETA update texts to customers.",
  },
  {
    id: "live_tracking_text",
    label: "Live Tracking Link",
    description: "Send a tracking link with live vehicle trail.",
  },
  {
    id: "transfer_routing",
    label: "Call Transfer Routing",
    description: "Route callers to a live number when needed.",
  },
  {
    id: "emergency_afterhours",
    label: "After-Hours Emergency Mode",
    description: "Enable 24/7 emergency handling outside business hours.",
  },
];

export const TIER_FEATURE_DEFAULTS = {
  pro: ["call_recordings", "auto_sms_followup", "sms_reminders", "transfer_routing"],
  elite: [
    "call_recordings",
    "auto_sms_followup",
    "sms_reminders",
    "eta_texts",
    "live_tracking_text",
    "transfer_routing",
    "emergency_afterhours",
  ],
  core: ["call_recordings", "auto_sms_followup"],
  scale: [
    "call_recordings",
    "auto_sms_followup",
    "sms_reminders",
    "eta_texts",
    "live_tracking_text",
    "transfer_routing",
    "emergency_afterhours",
  ],
};

export const getTierOptions = (coreOffer) =>
  coreOffer ? TIERS : TIERS.filter((tier) => tier.id !== "core");
