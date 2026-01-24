export const TIERS = [
  {
    id: "pro",
    title: "PRO",
    description: "AI receptionist + recordings + advanced routing.",
    accent: "#22d3ee",
    price: "$197/mo",
  },
  {
    id: "elite",
    title: "ELITE",
    description: "Multi-location + VIP onboarding + SLA support.",
    accent: "#7c3aed",
    price: "$397/mo",
  },
  {
    id: "core",
    title: "CORE",
    description: "Private launch tier with limited access.",
    accent: "#f59e0b",
    price: "$99/mo",
  },
  {
    id: "scale",
    title: "KRYONEX SCALE",
    description: "Scale tier with premium onboarding and dedicated support.",
    accent: "#ec4899",
    price: "$997/mo",
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
