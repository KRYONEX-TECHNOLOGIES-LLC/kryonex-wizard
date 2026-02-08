export const TIERS = [
  {
    id: "core",
    title: "CORE",
    subtitle: "Overflow Shield",
    description: "24/7 AI Receptionist, Live Bookings, and Basic Routing.",
    whoFor: "For 1-2 tech shops missing calls during busy hours.",
    accent: "#f59e0b",
    price: "$149/mo",
    minutes: 150,
    sms: 250,
    highlights: [
      "Instant call answering (0 rings)",
      "Basic call routing",
      "Job booking + scheduling",
      "Spam filtering",
    ],
  },
  {
    id: "pro",
    title: "PRO",
    subtitle: "24/7 Front Desk",
    description: "Emergency Transfers, Call Recordings, and Priority Logic.",
    whoFor: "For 1-3 tech teams that want full after-hours coverage.",
    accent: "#22d3ee",
    price: "$249/mo",
    minutes: 300,
    sms: 1000,
    popular: true,
    highlights: [
      "Everything in Core, plus:",
      "After-hours emergency triage",
      "Call recordings + transcripts",
      "Emergency call transfers",
      "Lead qualification",
    ],
  },
  {
    id: "elite",
    title: "ELITE",
    subtitle: "Full Coverage",
    description: "Multi-Location Support, VIP Onboarding, and SLA Guarantees.",
    whoFor: "For 3-8 tech teams that need complete call automation.",
    accent: "#7c3aed",
    price: "$497/mo",
    minutes: 800,
    sms: 3000,
    highlights: [
      "Everything in Pro, plus:",
      "Multi-location support",
      "VIP onboarding call",
      "Priority support",
      "Custom AI training",
    ],
  },
  {
    id: "scale",
    title: "KRYONEX SCALE",
    subtitle: "Dispatch Automation",
    description: "Enterprise Minutes, Dedicated Admin, and White-Glove Setup.",
    whoFor: "For 5-20+ tech operations drowning in call volume.",
    accent: "#ec4899",
    price: "$997/mo",
    minutes: 3000,
    sms: 5000,
    highlights: [
      "Everything in Elite, plus:",
      "Unlimited locations",
      "Dedicated account manager",
      "White-glove setup",
      "Custom integrations",
    ],
  },
];

export const VALUE_PROPS = {
  anchor: "Replaces a $3,000/mo receptionist — never sleeps, never misses a call.",
  roi: "One saved job pays for the entire month.",
  trust: [
    "Never miss a job again",
    "No call centers, no per-minute fees",
    "Deploys in 5 minutes — no setup calls",
  ],
};

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

/** Single source of truth for top-up pricing. Must match server topupPriceMap / topupCatalog. */
export const TOP_UPS = [
  {
    id: "call_300",
    name: "+300 Minutes",
    description: "Extend your call capacity quickly.",
    priceLabel: "$195",
    call_minutes: 300,
    sms_count: 0,
  },
  {
    id: "call_800",
    name: "+800 Minutes",
    description: "Best value for heavy call volume.",
    priceLabel: "$520",
    call_minutes: 800,
    sms_count: 0,
  },
  {
    id: "sms_500",
    name: "+500 Texts",
    description: "Keep follow-ups flowing.",
    priceLabel: "$50",
    call_minutes: 0,
    sms_count: 500,
  },
  {
    id: "sms_1000",
    name: "+1000 Texts",
    description: "Highest SMS boost.",
    priceLabel: "$100",
    call_minutes: 0,
    sms_count: 1000,
  },
];
