export const TIERS = [
  {
    id: "core",
    title: "CORE",
    subtitle: "Overflow Shield",
    description: "24/7 AI Receptionist, Live Bookings, and Basic Routing.",
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
    note: "Entry-level coverage for light call volume.",
  },
  {
    id: "pro",
    title: "PRO",
    subtitle: "Launch & Capture",
    description: "For new operations and solo players getting their first consistent lead flow. Stops the bleeding of missed calls.",
    accent: "#22d3ee",
    price: "$249/mo",
    minutes: 300,
    sms: 1000,
    popular: true,
    highlights: [
      "300 Minutes / 1,000 Texts",
      "Full AI Command Access (Standard)",
      "Automated Lead Triage",
      "Smart Call Routing",
    ],
    note: "Best for businesses just starting to run ads.",
  },
  {
    id: "elite",
    title: "ELITE",
    subtitle: "Momentum & Growth",
    description: "For active businesses that are scaling up and can't afford a single second of downtime or a missed booking.",
    accent: "#7c3aed",
    price: "$497/mo",
    minutes: 800,
    sms: 3000,
    highlights: [
      "800 Minutes / 3,000 Texts",
      "Full AI Command Access (Standard)",
      "Priority Processing Pipeline",
      "High-Volume Lead Management",
    ],
    note: "Cheaper than buying PRO + Top-ups if you're scaling.",
  },
  {
    id: "scale",
    title: "KRYONEX SCALE",
    subtitle: "Dominance & Empire",
    description: "For the heavy hitters. Unrestricted volume for businesses that never want to worry about 'limits' again.",
    accent: "#ec4899",
    price: "$997/mo",
    minutes: 3000,
    sms: 5000,
    highlights: [
      "3,000 Minutes / 5,000 Texts",
      "Full AI Command Access (Standard)",
      "Enterprise-Level Data Handling",
      "Unlimited Location Support",
    ],
    note: "The absolute lowest cost-per-minute for high-volume users.",
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
