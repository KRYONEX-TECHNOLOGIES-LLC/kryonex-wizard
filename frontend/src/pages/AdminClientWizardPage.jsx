import React from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { adminQuickOnboard, createClientDeployment, getAdminLeads } from "../lib/api";
import { FEATURES, TIER_FEATURE_DEFAULTS, getTierOptions } from "../lib/billingConstants";
import { AGENT_TONES, INDUSTRIES } from "../lib/wizardConstants";
import TimeSelect from "../components/TimeSelect.jsx";
import { normalizePhone } from "../lib/phone.js";

const buildFeatureMap = (list, defaults = []) => {
  const map = {};
  list.forEach((feature) => {
    map[feature.id] = defaults.includes(feature.id);
  });
  return map;
};

const formatCurrency = (value) => {
  if (!value) return "";
  const number = Number(value);
  if (Number.isNaN(number)) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(number);
};

const cleanNumeric = (raw) => raw.replace(/[^0-9.]/g, "");

const formatPhone = (value) => {
  const digits = value.replace(/\D/g, "");
  const cleaned = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  const part1 = cleaned.slice(0, 3);
  const part2 = cleaned.slice(3, 6);
  const part3 = cleaned.slice(6, 10);
  if (!part2) return part1;
  if (!part3) return `(${part1}) ${part2}`;
  return `(${part1}) ${part2}-${part3}`;
};

const steps = [
  { id: "tier", label: "Tier Selection", subtitle: "Choose subscription tier" },
  { id: "features", label: "System Activation", subtitle: "Arm / disarm capabilities" },
  { id: "details", label: "Client Configuration", subtitle: "Contact & routing" },
];

export default function AdminClientWizardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const leadId = searchParams.get("leadId");
  const coreOffer =
    new URLSearchParams(window.location.search).get("core") === "1" ||
    window.localStorage.getItem("kryonex_core_offer") === "1";
  const tierOptions = getTierOptions(coreOffer);
  const [tierId, setTierId] = React.useState(tierOptions[0]?.id || "pro");
  const [featureToggles, setFeatureToggles] = React.useState(() =>
    buildFeatureMap(FEATURES, TIER_FEATURE_DEFAULTS[tierOptions[0]?.id || "pro"])
  );
  const [form, setForm] = React.useState({
    clientName: "",
    businessName: "",
    industry: "",
    areaCode: "",
    tone: AGENT_TONES[0] || "Calm & Professional",
    email: "",
    phone: "",
    weekdayOpen: "08:00 AM",
    weekdayClose: "05:00 PM",
    weekendEnabled: false,
    saturdayOpen: "09:00 AM",
    saturdayClose: "02:00 PM",
    alwaysOpen: false,
    emergencyDispatch: false,
    emergencyPhone: "",
    afterHoursLogic: "",
    standardFee: "",
    emergencyFee: "",
    transferNumber: "",
    notes: "",
  });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [deploymentResult, setDeploymentResult] = React.useState(null);
  const [referrerId, setReferrerId] = React.useState("");
  const [quickForm, setQuickForm] = React.useState({
    businessName: "",
    areaCode: "",
    email: "",
  });
  const [quickLoading, setQuickLoading] = React.useState(false);
  const [quickError, setQuickError] = React.useState("");
  const [quickSuccess, setQuickSuccess] = React.useState(null);

  React.useEffect(() => {
    if (!leadId) return;
    let mounted = true;
    getAdminLeads()
      .then((response) => {
        if (!mounted) return;
        const target = response.data?.leads?.find(
          (lead) => String(lead.id) === String(leadId)
        );
        if (target) {
          setForm((prev) => ({
            ...prev,
            clientName: target.name || "",
            businessName: target.business_name || "",
            industry: target.industry || "",
            phone: target.phone || "",
          }));
          setReferrerId(target.owner_id || "");
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [leadId]);

  React.useEffect(() => {
    const defaults = TIER_FEATURE_DEFAULTS[tierId] || [];
    setFeatureToggles(buildFeatureMap(FEATURES, defaults));
  }, [tierId]);

  const handleFeatureToggle = (featureId) => {
    setFeatureToggles((prev) => ({
      ...prev,
      [featureId]: !prev[featureId],
    }));
  };

  const handleCurrencyChange = (field) => (event) => {
    const cleaned = cleanNumeric(event.target.value);
    setForm((prev) => ({ ...prev, [field]: cleaned }));
  };

  const handlePhoneChange = (field) => (event) => {
    const digits = event.target.value.replace(/\D/g, "");
    setForm((prev) => ({ ...prev, [field]: digits }));
  };

  const handlePhoneBlur = (field) => (event) => {
    const normalized = normalizePhone(event.target.value);
    if (normalized) {
      setForm((prev) => ({ ...prev, [field]: normalized }));
    }
  };

  const handleAreaCodeBlur = (event) => {
    const digits = String(event.target.value || "").replace(/\D/g, "");
    if (!digits) return;
    setForm((prev) => ({ ...prev, areaCode: digits.slice(0, 3) }));
  };

  const handleChange = (field) => (event) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleQuickChange = (field) => (event) => {
    const value = event.target.value;
    setQuickForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleQuickAreaCode = (event) => {
    const digits = String(event.target.value || "").replace(/\D/g, "").slice(0, 3);
    setQuickForm((prev) => ({ ...prev, areaCode: digits }));
  };

  const handleQuickSubmit = async (event) => {
    event?.preventDefault();
    setQuickError("");
    setQuickSuccess(null);
    const cleanName = quickForm.businessName.trim();
    const cleanEmail = quickForm.email.trim();
    if (!cleanName) {
      setQuickError("Business name is required.");
      return;
    }
    if (!/^\d{3}$/.test(quickForm.areaCode)) {
      setQuickError("Area code must be 3 digits.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setQuickError("Enter a valid email address.");
      return;
    }
    setQuickLoading(true);
    try {
      const response = await adminQuickOnboard({
        businessName: cleanName,
        areaCode: quickForm.areaCode,
        email: cleanEmail,
      });
      setQuickSuccess(response.data || { ok: true });
    } catch (err) {
      setQuickError(err.response?.data?.error || err.message);
    } finally {
      setQuickLoading(false);
    }
  };

  const generateScheduleSummary = () => {
    if (form.alwaysOpen) {
      return "Operations are always open (24/7).";
    }
    let summary = `Operating Monday–Friday, ${form.weekdayOpen} to ${form.weekdayClose}.`;
    if (form.weekendEnabled) {
      summary += ` Weekends from ${form.saturdayOpen} to ${form.saturdayClose}.`;
    } else {
      summary += " Weekends are offline.";
    }
    if (form.emergencyDispatch) {
      summary += " Emergency dispatch ready.";
    }
    return summary;
  };

  const selectedFeatures = FEATURES.filter((feature) =>
    TIER_FEATURE_DEFAULTS[tierId]?.includes(feature.id)
  );

  const handleSubmit = async (event) => {
    event?.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await createClientDeployment({
        email: form.email,
        fullName: form.clientName,
        businessName: form.businessName,
        industry: form.industry,
        phone: form.phone,
        tierId,
        features: selectedFeatures.map((feature) => feature.id),
        leadId,
        referrerId: referrerId || undefined,
      });
      setDeploymentResult(response.data || null);
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const progressStates = steps.map((step, index) => {
    const stepNumber = index + 1;
    const isComplete =
      (step.id === "tier" && Boolean(tierId)) ||
      (step.id === "features" && selectedFeatures.length > 0) ||
      (step.id === "details" && Boolean(form.businessName));
    const isActive =
      step.id === "tier" ||
      (step.id === "features" && Boolean(featureToggles)) ||
      (step.id === "details" && Boolean(form.businessName));
    return { ...step, stepNumber, isActive, isComplete };
  });

  return (
    <div className="min-h-screen w-full bg-void-black text-white">
      <TopMenu />
      <div className="relative z-10 flex h-screen">
        <SideNav
          eligibleNewAgent
          onUpgrade={() => navigate("/billing")}
          onNewAgent={() => navigate("/wizard?new=1")}
          billingStatus="admin"
          tier="admin"
          agentLive
          lastUpdated={new Date()}
          isAdmin
        />
        <div className="flex-1 flex flex-col">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="px-6 py-4 border-b border-white/10 bg-black/60 backdrop-blur-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-neon-cyan/70">
                  Command Console
                </p>
                <h1 className="mt-1 text-2xl font-semibold">Admin Client Wizard</h1>
              </div>
              <button className="button-primary" onClick={() => navigate("/admin/call-center")}>
                Back to Call Center
              </button>
            </div>
            <div className="mt-4 flex items-center gap-8">
              {progressStates.map((state) => (
                <div key={state.id} className="flex items-center gap-3 flex-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                      state.isComplete
                        ? "border-neon-green bg-neon-green/20 text-neon-green"
                        : state.isActive
                        ? "border-neon-cyan bg-neon-cyan/20 text-neon-cyan"
                        : "border-white/30 bg-white/5 text-white/50"
                    }`}
                  >
                    {state.isComplete ? "✓" : state.stepNumber}
                  </div>
                  <div className="flex-1">
                    <div
                      className={`text-sm font-semibold ${
                        state.isActive ? "text-neon-cyan" : state.isComplete ? "text-neon-green" : "text-white/60"
                      }`}
                    >
                      {state.label}
                    </div>
                    <div className="text-xs text-white/40">{state.subtitle}</div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
          <div className="flex flex-1 overflow-hidden">
            <div className="w-[65%] overflow-y-auto px-6 py-6 space-y-8">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5 }}
              >
                <div className="glass-panel rounded-3xl border border-white/10 p-6 space-y-4">
                  <div>
                    <div className="text-sm font-semibold text-white">
                      Admin Quick Onboarding
                    </div>
                    <div className="text-xs text-white/50">
                      Create a client instantly without Stripe or tier selection.
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <label className="space-y-2">
                      <span className="text-sm text-white/70">Business Name</span>
                      <input
                        className="input-field w-full"
                        value={quickForm.businessName}
                        onChange={handleQuickChange("businessName")}
                        placeholder="Client business"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm text-white/70">Area Code</span>
                      <input
                        className="input-field w-full"
                        value={quickForm.areaCode}
                        onChange={handleQuickAreaCode}
                        placeholder="123"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm text-white/70">Email</span>
                      <input
                        className="input-field w-full"
                        type="email"
                        value={quickForm.email}
                        onChange={handleQuickChange("email")}
                        placeholder="client@domain.com"
                      />
                    </label>
                  </div>
                  {quickError ? (
                    <div className="text-neon-pink text-sm">{quickError}</div>
                  ) : null}
                  {quickSuccess ? (
                    <div className="text-neon-green text-sm space-y-1">
                      <div>Agent deployed for admin onboarding.</div>
                      {quickSuccess.phone_number ? (
                        <div className="font-mono">
                          Agent: {quickSuccess.phone_number}
                        </div>
                      ) : null}
                      {quickSuccess.user_id ? (
                        <div className="text-xs text-white/60">
                          User ID: {quickSuccess.user_id}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <button
                    className="glow-button w-full"
                    type="button"
                    disabled={quickLoading}
                    onClick={handleQuickSubmit}
                  >
                    {quickLoading ? "DEPLOYING..." : "Deploy Agent"}
                  </button>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                <div className="glass-panel rounded-3xl border border-white/10 p-6 space-y-4">
                  <div className="text-sm font-semibold text-white">Tier Selection</div>
                  <select
                    className="input-field w-full text-lg p-4"
                    value={tierId}
                    onChange={(event) => setTierId(event.target.value)}
                  >
                    {tierOptions.map((tier) => (
                      <option key={tier.id} value={tier.id}>
                        {tier.title} — {tier.price}
                      </option>
                    ))}
                  </select>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <div className="glass-panel rounded-3xl border border-white/10 p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">System Activation</div>
                      <div className="text-xs text-white/50">Manage deployment state</div>
                    </div>
                    <span className="text-xs font-mono text-white/50">{selectedFeatures.length} systems</span>
                  </div>
                  <div className="grid gap-3">
                    {FEATURES.filter((feature) => TIER_FEATURE_DEFAULTS[tierId]?.includes(feature.id)).map(
                      (feature) => {
                        const isActive = Boolean(featureToggles[feature.id]);
                        return (
                          <div
                            key={feature.id}
                            className={`rounded-2xl border p-4 flex items-center justify-between ${
                              isActive ? "border-neon-green bg-neon-green/5" : "border-neon-pink bg-neon-pink/5"
                            }`}
                          >
                            <div>
                              <div className="text-sm font-semibold">{feature.label}</div>
                              {feature.description && (
                                <div className="text-xs text-white/60">{feature.description}</div>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <span
                                className={`text-[0.6rem] uppercase tracking-[0.3em] font-mono ${
                                  isActive ? "text-neon-green" : "text-neon-pink"
                                }`}
                              >
                                {isActive ? "ARMED" : "DISARMED"}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleFeatureToggle(feature.id)}
                                className={`w-12 h-6 rounded-full border-2 relative ${
                                  isActive
                                    ? "bg-neon-green/30 border-neon-green/50"
                                    : "bg-neon-pink/30 border-neon-pink/50"
                                }`}
                              >
                                <div
                                  className={`w-4 h-4 rounded-full absolute top-0.5 transition ${
                                    isActive ? "left-6 bg-neon-green" : "left-0.5 bg-neon-pink"
                                  }`}
                                />
                              </button>
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <div className="glass-panel rounded-3xl border border-white/10 p-6 space-y-5">
                  <div className="text-sm font-semibold text-white">Client Details</div>
                  <div className="grid grid-cols-2 gap-4">
                    <label className="space-y-2">
                      <span className="text-sm text-white/70">Business Name</span>
                      <input
                        className="input-field w-full"
                        value={form.businessName}
                        onChange={handleChange("businessName")}
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm text-white/70">Client Name</span>
                      <input
                        className="input-field w-full"
                        value={form.clientName}
                        onChange={handleChange("clientName")}
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <label className="space-y-2">
                      <span className="text-sm text-white/70">Industry</span>
                      <select
                        className="input-field w-full"
                        value={form.industry}
                        onChange={handleChange("industry")}
                      >
                        <option value="">Select industry</option>
                        {INDUSTRIES.map((industry) => (
                          <option key={industry.id} value={industry.id}>
                            {industry.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm text-white/70">Area Code</span>
                      <input
                        className="input-field w-full"
                        value={form.areaCode}
                        onChange={handleChange("areaCode")}
                        onBlur={handleAreaCodeBlur}
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <label className="space-y-2">
                      <span className="text-sm text-white/70">Email</span>
                      <input
                        className="input-field w-full"
                        type="email"
                        value={form.email}
                        onChange={handleChange("email")}
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm text-white/70">Phone</span>
                      <input
                        className="input-field w-full"
                        value={formatPhone(form.phone)}
                        onChange={handlePhoneChange("phone")}
                        onBlur={handlePhoneBlur("phone")}
                      />
                    </label>
                  </div>
                  <label className="space-y-2">
                    <span className="text-sm text-white/70">Agent Tone</span>
                    <select className="input-field w-full" value={form.tone} onChange={handleChange("tone")}>
                      {AGENT_TONES.map((tone) => (
                        <option key={tone} value={tone}>
                          {tone}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
              >
                <div className="glass-panel rounded-3xl border border-white/10 p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">Schedule & Routing</div>
                      <div className="text-xs text-white/50">Configure hours and routing</div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          alwaysOpen: !prev.alwaysOpen,
                          weekendEnabled: !prev.alwaysOpen ? false : prev.weekendEnabled,
                        }))
                      }
                      className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                        form.alwaysOpen
                          ? "bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/40"
                          : "bg-white/10 text-white/70 border border-white/20 hover:bg-white/20"
                      }`}
                    >
                      {form.alwaysOpen ? "24/7 OPS ACTIVE" : "Enable 24/7 Ops"}
                    </button>
                  </div>
                  {!form.alwaysOpen && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <label className="space-y-2">
                          <span className="text-xs text-white/50 uppercase tracking-[0.3em]">
                            Weekday Open
                          </span>
                          <TimeSelect value={form.weekdayOpen} onChange={handleChange("weekdayOpen")} />
                        </label>
                        <label className="space-y-2">
                          <span className="text-xs text-white/50 uppercase tracking-[0.3em]">
                            Weekday Close
                          </span>
                          <TimeSelect value={form.weekdayClose} onChange={handleChange("weekdayClose")} />
                        </label>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white/50 uppercase tracking-[0.3em]">Weekend</span>
                        <button
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, weekendEnabled: !prev.weekendEnabled }))}
                          className={`px-3 py-1 rounded text-xs font-semibold ${
                            form.weekendEnabled ? "bg-neon-green/20 text-neon-green" : "bg-white/10 text-white/70"
                          }`}
                        >
                          {form.weekendEnabled ? "ENABLED" : "DISABLED"}
                        </button>
                      </div>
                      {form.weekendEnabled && (
                        <div className="grid grid-cols-2 gap-4">
                          <TimeSelect value={form.saturdayOpen} onChange={handleChange("saturdayOpen")} />
                          <TimeSelect value={form.saturdayClose} onChange={handleChange("saturdayClose")} />
                        </div>
                      )}
                    </>
                  )}
                  {form.alwaysOpen && (
                    <div className="text-xs text-neon-green">
                      Schedule locked to 24/7. Time pickers disabled.
                    </div>
                  )}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.5 }}
              >
                <div className="glass-panel rounded-3xl border border-white/10 p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">Emergency Protocols</div>
                      <div className="text-xs text-white/50">Activate dispatch controls</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, emergencyDispatch: !prev.emergencyDispatch }))}
                      className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                        form.emergencyDispatch
                          ? "bg-neon-pink/20 text-neon-pink border border-neon-pink/40"
                          : "bg-white/10 text-white/70 border border-white/20 hover:bg-white/20"
                      }`}
                    >
                      {form.emergencyDispatch ? "Dispatch Active" : "Activate Emergency Dispatch"}
                    </button>
                  </div>
                  {form.emergencyDispatch && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <label className="space-y-2">
                          <span className="text-xs text-white/60">Emergency Phone</span>
                          <input
                            className="input-field w-full"
                            value={formatPhone(form.emergencyPhone)}
                            onChange={handlePhoneChange("emergencyPhone")}
                            onBlur={handlePhoneBlur("emergencyPhone")}
                          />
                        </label>
                        <label className="space-y-2">
                          <span className="text-xs text-white/60">Transfer Number</span>
                          <input
                            className="input-field w-full"
                            value={formatPhone(form.transferNumber)}
                            onChange={handlePhoneChange("transferNumber")}
                            onBlur={handlePhoneBlur("transferNumber")}
                          />
                        </label>
                      </div>
                      <div className="grid grid-cols-1 gap-4">
                        <label className="space-y-2">
                          <span className="text-xs text-white/60">After-Hours Logic</span>
                          <select
                            className="input-field w-full"
                            value={form.afterHoursLogic}
                            onChange={handleChange("afterHoursLogic")}
                          >
                            <option value="">Select response</option>
                            <option value="take_message">Take Message</option>
                            <option value="forward_dispatch">Forward to Dispatch</option>
                            <option value="play_warning">Play 911 Warning</option>
                            <option value="custom">Custom Instruction</option>
                          </select>
                        </label>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <label className="space-y-2">
                          <span className="text-xs text-white/60">Standard Fee</span>
                          <input
                            className="input-field w-full"
                            value={formatCurrency(form.standardFee)}
                            onChange={handleCurrencyChange("standardFee")}
                          />
                        </label>
                        <label className="space-y-2">
                          <span className="text-xs text-white/60">Emergency Fee</span>
                          <input
                            className="input-field w-full"
                            value={formatCurrency(form.emergencyFee)}
                            onChange={handleCurrencyChange("emergencyFee")}
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.6 }}
              >
                <div className="glass-panel rounded-3xl border border-white/10 p-6 space-y-4">
                  <div className="text-sm font-semibold text-white">Deployment Notes</div>
                  <textarea
                    className="input-field w-full"
                    rows={3}
                    value={form.notes}
                    onChange={handleChange("notes")}
                    placeholder="Special instructions or requirements..."
                  />
                  {error && <div className="text-neon-pink text-sm">{error}</div>}
                  {submitted && (
                    <div className="text-neon-green space-y-2 text-sm">
                      <div>Client deployment initiated.</div>
                      {deploymentResult?.checkout_url ? (
                        <button
                          type="button"
                          className="button-primary"
                          onClick={() => window.open(deploymentResult.checkout_url, "_blank")}
                        >
                          Open Stripe Checkout
                        </button>
                      ) : (
                        <div>Checkout: Processing...</div>
                      )}
                    </div>
                  )}
                  <button className="glow-button w-full" type="submit" disabled={loading} onClick={handleSubmit}>
                    {loading ? "DEPLOYING..." : "Launch Deployment"}
                  </button>
                </div>
              </motion.div>
            </div>

            <div className="w-[35%] px-6 py-6">
              <div className="sticky top-6">
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: [0.92, 1, 0.92], y: [0, -4, 0] }}
                  transition={{ duration: 6, repeat: Infinity, repeatType: "reverse", delay: 0.5 }}
                  className="glass-panel rounded-3xl border border-white/10 p-6 space-y-6 max-h-[calc(100vh-120px)] overflow-y-auto"
                  whileHover={{ boxShadow: "0 20px 45px rgba(34, 211, 238, 0.35)", scale: 1.01 }}
                >
                  <div className="text-center text-white">
                    <div className="text-lg font-semibold">Live Preview</div>
                    <div className="text-xs text-white/60">JSON payload building in real-time</div>
                  </div>
                  <motion.div
                    initial={{ opacity: 0.8 }}
                    animate={{ opacity: [0.8, 1, 0.8] }}
                    transition={{ duration: 4, repeat: Infinity }}
                    className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-2"
                  >
                    <div className="text-sm text-white/60">Client</div>
                    <div className="text-lg font-semibold">{form.businessName || "New Client"}</div>
                    <div className="text-xs text-white/50">
                      {form.industry || "Industry"} • {form.areaCode || "Area"}
                    </div>
                  </motion.div>
                  <div className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-2">
                    <div className="text-sm text-white/60">Tier</div>
                    <div className="text-lg font-semibold">{tierOptions.find((tier) => tier.id === tierId)?.title?.toUpperCase()}</div>
                    <div className="text-xs text-white/50">
                      {tierOptions.find((tier) => tier.id === tierId)?.description}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-2">
                    <div className="text-sm text-white/60">Schedule</div>
                    <div className="text-xs text-white/70">{generateScheduleSummary()}</div>
                  </div>
                  <motion.div
                    initial={{ x: 0 }}
                    animate={{ x: [0, 2, 0] }}
                    transition={{ duration: 5, repeat: Infinity, repeatType: "reverse" }}
                    className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-2"
                  >
                    <div className="text-sm text-white/60">Telemetry</div>
                    <div className="text-xs text-white/50">Charging {selectedFeatures.length} systems</div>
                    <div className="text-xs text-white/50">
                      Emergency Dispatch:{" "}
                      <span className={form.emergencyDispatch ? "text-neon-pink" : "text-white/60"}>
                        {form.emergencyDispatch ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </div>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0.8 }}
                    animate={{ opacity: [0.8, 1, 0.8] }}
                    transition={{ duration: 5, repeat: Infinity }}
                    className="rounded-2xl border border-white/10 bg-black/40 p-4"
                  >
                    <pre className="text-[10px] font-mono text-white/60">
{JSON.stringify(
  {
    businessName: form.businessName,
    industry: form.industry,
    areaCode: form.areaCode,
    tone: form.tone,
    alwaysOpen: form.alwaysOpen,
    emergencyDispatch: form.emergencyDispatch,
    transferNumber: form.transferNumber,
    features: selectedFeatures.map((feature) => ({
      id: feature.id,
      armed: featureToggles[feature.id],
    })),
  },
  null,
  2
)}
                    </pre>
                  </motion.div>
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
