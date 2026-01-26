import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Building2,
  CreditCard,
  Cpu,
  Droplet,
  ShieldCheck,
  Terminal,
  Wrench,
  Clock,
  Zap,
  Calendar,
  Mic,
  DollarSign,
  MapPin,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  acceptConsent,
  createCheckoutSession,
  deployAgent,
  getCalcomStatus,
  getSubscriptionStatus,
  verifyCheckoutSession,
} from "../lib/api";
import { supabase } from "../lib/supabase";
import TopMenu from "../components/TopMenu.jsx";
import TimeSelect from "../components/TimeSelect.jsx";
import { AGENT_TONES, INDUSTRIES } from "../lib/wizardConstants";
import { getSavedState, saveState } from "../lib/persistence.js";
import { normalizePhone } from "../lib/phone.js";

const stepMeta = [
  {
    title: "Identity",
    description: "Define the business signature.",
    icon: Building2,
  },
  {
    title: "Intelligence",
    description: "Choose the AI persona & Tone.",
    icon: Cpu,
  },
  {
    title: "Logistics",
    description: "Time protocols & Service Rates.",
    icon: Clock,
  },
  {
    title: "Activation",
    description: "Authorize the deployment.",
    icon: CreditCard,
  },
  {
    title: "Handshake",
    description: "Sync with Kryonex core.",
    icon: ShieldCheck,
  },
  {
    title: "Success",
    description: "Receptionist is online.",
    icon: Terminal,
  },
];

const stepVariants = {
  initial: { opacity: 0, y: 24, scale: 0.95 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.4, ease: "easeOut" },
  },
  exit: {
    opacity: 0,
    y: -24,
    scale: 0.95,
    transition: { duration: 0.3, ease: "easeIn" },
  },
};

const defaultFormState = {
  nameInput: "",
  areaCodeInput: "",
  industryInput: "",
  toneInput: "Calm & Professional",
  weekdayOpen: "08:00 AM",
  weekdayClose: "05:00 PM",
  weekendEnabled: false,
  saturdayOpen: "09:00 AM",
  saturdayClose: "02:00 PM",
  emergency247: false,
  standardFee: "89",
  emergencyFee: "189",
  transferNumber: "",
    calComLink: "",
  paymentId: "",
  cardName: "",
  cardNumber: "",
  cardExpiry: "",
  cardCvc: "",
  dispatchBaseLocation: "",
  travelLimitValue: "30",
  travelLimitMode: "minutes",
};

const WIZARD_FORM_KEY = "wizard.form";
const WIZARD_STEP_KEY = "wizard.step";

const terminalLines = [
  "Securing uplink...",
  "Injecting personality matrix...",
  "Compiling schedule logic...",
  "Setting price parameters...",
  "Generating omnichannel voiceprint...",
  "Calibrating latency shields...",
  "Provisioning AI Receptionist...",
];


export default function WizardPage() {
  const getInitialStep = () => {
    const stored = Number(getSavedState(WIZARD_STEP_KEY));
    if (Number.isFinite(stored) && stored >= 1 && stored <= 6) return stored;
    const fallback = Number(window.localStorage.getItem("kryonex_wizard_step"));
    if (Number.isFinite(fallback) && fallback >= 1 && fallback <= 6) return fallback;
    return 1;
  };
  const [step, setStep] = useState(getInitialStep);
  const navigate = useNavigate();
  const [form, setForm] = useState(() => getSavedState(WIZARD_FORM_KEY) || defaultFormState);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployError, setDeployError] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [consentError, setConsentError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [planTier, setPlanTier] = useState("pro");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [wizardLocked, setWizardLocked] = useState(false);
  const [wizardLockReason, setWizardLockReason] = useState("");
  const [searchParams] = useSearchParams();
  const [calConnected, setCalConnected] = useState(false);
  const [calStatusLoading, setCalStatusLoading] = useState(true);
  const [calStatusError, setCalStatusError] = useState("");
  const coreOffer =
    searchParams.get("core") === "1" ||
    window.localStorage.getItem("kryonex_core_offer") === "1";
  const audioRef = useRef({ ctx: null, lastToneAt: 0 });

  useEffect(() => {
    let active = true;
    const status = searchParams.get("cal_status");
    if (status === "success") {
      setCalConnected(true);
    }
    if (status === "error") {
      setCalStatusError("Calendar connection failed. Please try again.");
    }
    const loadStatus = async () => {
      try {
        const res = await getCalcomStatus();
        if (!active) return;
        setCalConnected(Boolean(res.data?.connected));
      } catch (err) {
        if (!active) return;
        setCalStatusError("Calendar connection status unavailable.");
        setCalConnected(false);
      } finally {
        if (active) setCalStatusLoading(false);
      }
    };
    loadStatus();
    return () => {
      active = false;
    };
  }, [searchParams]);

  const handleCalcomConnect = async () => {
    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data?.session?.access_token;
      if (!accessToken) {
        setCalStatusError("Please sign in again before connecting Cal.com.");
        return;
      }
      window.location.href = `${baseUrl}/api/calcom/authorize?access_token=${encodeURIComponent(
        accessToken
      )}`;
    } catch (err) {
      setCalStatusError("Unable to start calendar connection. Please try again.");
    }
  };

  const persistStep = (value) => {
    setStep(value);
    window.localStorage.setItem("kryonex_wizard_step", value);
    saveState(WIZARD_STEP_KEY, value);
  };

  const updateStep = (updater) => {
    setStep((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      window.localStorage.setItem("kryonex_wizard_step", next);
      saveState(WIZARD_STEP_KEY, next);
      return next;
    });
  };

  const persistForm = (next) => {
    setForm(next);
    saveState(WIZARD_FORM_KEY, next);
  };

  const currentStep = stepMeta[step - 1];
  const StepIcon = currentStep.icon;

  const areaCodeValid = form.areaCodeInput.length === 3;
  const canContinueIdentity =
    form.nameInput.trim().length > 0 && areaCodeValid && consentAccepted;
  const canContinueIndustry = form.industryInput.length > 0;
  const canContinueLogistics =
    form.standardFee.length > 0 && form.emergencyFee.length > 0;
  const canContinuePayment = paymentVerified;

  const updateField = (field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      saveState(WIZARD_FORM_KEY, next);
      return next;
    });
  };

  const playKeyTone = () => {
    const now = Date.now();
    if (now - audioRef.current.lastToneAt < 45) return;
    audioRef.current.lastToneAt = now;
    if (!audioRef.current.ctx) {
      audioRef.current.ctx =
        new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioRef.current.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 520;
    gain.gain.value = 0.015;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  };

  const handleAreaCode = (event) => {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 3);
    updateField("areaCodeInput", digits);
    playKeyTone();
  };

  const handleConsent = async (checked) => {
    setConsentError("");
    if (!checked) {
      setConsentAccepted(false);
      return;
    }
    try {
      const res = await acceptConsent();
      if (res.data?.ok) {
        setConsentAccepted(true);
      }
    } catch (err) {
      setConsentError(err.response?.data?.error || "Consent failed");
      setConsentAccepted(false);
    }
  };

  const saveProfile = async (updates) => {
    setSaveError("");
    setSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) {
      setSaving(false);
      setSaveError("Session expired. Please log in again.");
      return false;
    }

    const { error } = await supabase.from("profiles").upsert({
      user_id: user.id,
      ...updates,
    });

    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return false;
    }
    return true;
  };

  const handlePayment = () => {
    const random = Math.floor(100000 + Math.random() * 900000);
    updateField("paymentId", `test_${random}`);
  };

  useEffect(() => {
    const success = searchParams.get("success");
    const canceled = searchParams.get("canceled");
    const sessionId = searchParams.get("session_id");
    if (canceled) {
      setCheckoutError("Checkout canceled. Please retry.");
      localStorage.removeItem("kryonex_pending_checkout_session");
    }
    if (success && sessionId) {
      verifyCheckoutSession(sessionId)
        .then((res) => {
          updateField("paymentId", sessionId);
          setPaymentVerified(true);
          if (step < 5) persistStep(5);
          setCheckoutError("");
          localStorage.removeItem("kryonex_pending_checkout_session");
        })
        .catch((error) => {
          setCheckoutError(
            error.response?.data?.error || "Payment verification failed."
          );
          setPaymentVerified(false);
        });
    } else if (!success && !sessionId) {
      const pendingSession = localStorage.getItem(
        "kryonex_pending_checkout_session"
      );
      if (pendingSession) {
        verifyCheckoutSession(pendingSession)
          .then(() => {
            updateField("paymentId", pendingSession);
            setPaymentVerified(true);
            if (step < 5) persistStep(5);
            setCheckoutError("");
            localStorage.removeItem("kryonex_pending_checkout_session");
          })
          .catch(() => {
            // keep pending id for another retry on next load
          });
      }
    }
  }, [searchParams, step, navigate]);

  useEffect(() => {
    window.localStorage.setItem("kryonex_wizard_step", String(step));
  }, [step]);

  useEffect(() => {
    let mounted = true;
    const hydrateSubscription = async () => {
      try {
        const response = await getSubscriptionStatus();
        const status = response?.data?.status;
        const periodEnd = response?.data?.current_period_end;
        const isActive = ["active", "trialing"].includes(
          String(status || "").toLowerCase()
        );
        const periodOk = periodEnd ? new Date(periodEnd).getTime() > Date.now() : true;
        if (mounted && isActive && periodOk) {
          setPaymentVerified(true);
          setCheckoutError("");
          const isNewAgent = searchParams.get("new") === "1";
          if (isNewAgent) {
            updateStep((prev) => (prev < 4 ? 4 : prev));
          } else {
            const savedForm = getSavedState(WIZARD_FORM_KEY) || {};
            const hasWizardProgress = Boolean(
              savedForm.nameInput ||
                savedForm.areaCodeInput ||
                savedForm.industryInput ||
                Number(getSavedState(WIZARD_STEP_KEY) || 1) > 1
            );
            if (!hasWizardProgress) {
              navigate("/dashboard", { replace: true });
            }
          }
        }
      } catch (err) {
        // Silent: user may not have a subscription yet.
      }
    };
    hydrateSubscription();
    return () => {
      mounted = false;
    };
  }, [navigate, searchParams]);

  useEffect(() => {
    let mounted = true;
    const loadConsent = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("consent_accepted_at, consent_version, role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (mounted && profile?.consent_accepted_at) {
        setConsentAccepted(true);
      }
      if (mounted && profile?.role === "admin") {
        setIsAdmin(true);
      }
    };
    loadConsent();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const checkWizardAccess = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("business_name, industry, role")
        .eq("user_id", user.id)
        .maybeSingle();
      const isOnboarded =
        Boolean(profile?.business_name) && Boolean(profile?.industry);
      if (!isOnboarded) {
        if (mounted) {
          setWizardLocked(false);
          setWizardLockReason("");
          const savedForm = getSavedState(WIZARD_FORM_KEY) || {};
          const hasWizardProgress = Boolean(
            savedForm.nameInput || savedForm.areaCodeInput || savedForm.industryInput
          );
          if (!hasWizardProgress) {
            persistStep(1);
            persistForm(defaultFormState);
          }
        }
        return;
      }
      if (profile?.role === "admin") {
        if (mounted) {
          setWizardLocked(false);
          setWizardLockReason("");
        }
        return;
      }
      const { data: existingAgents } = await supabase
        .from("agents")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);
      const hasAgent = Boolean(existingAgents && existingAgents.length);
      const subRes = await getSubscriptionStatus();
      const tier = String(subRes?.data?.plan_type || "").toLowerCase();
      const eligible =
        tier.includes("elite") || tier.includes("scale") || !hasAgent;
      if (mounted) {
        setWizardLocked(!eligible);
        setWizardLockReason(
          eligible
            ? ""
            : "Additional agents are available on Elite/Scale plans."
        );
      }
    };
    checkWizardAccess();
    return () => {
      mounted = false;
    };
  }, []);

  const generateScheduleSummary = () => {
    let summary = `Standard operating hours are Monday through Friday, ${form.weekdayOpen} to ${form.weekdayClose}.`;
    if (form.weekendEnabled) {
      summary += ` We are also open Weekends from ${form.saturdayOpen} to ${form.saturdayClose}.`;
    } else {
      summary += ` We are closed on weekends.`;
    }
    if (form.emergency247) {
      summary +=
        " CRITICAL: We offer 24/7 Emergency Dispatch for urgent issues outside these hours.";
    } else {
      summary +=
        " We do NOT offer after-hours service. If they call late, ask them to call back in the morning.";
    }
    return summary;
  };

  const baseInputValue = form.dispatchBaseLocation.trim();
  const isZipBase = /^\d{5}$/.test(baseInputValue);
  const baseDescriptor = baseInputValue
    ? isZipBase
      ? `Zip Code ${baseInputValue}`
      : baseInputValue
    : null;
  const travelLimitValue = Math.max(0, Number(form.travelLimitValue) || 0);
  const travelLimitMode = form.travelLimitMode || "minutes";
  const travelInstruction =
    baseInputValue && travelLimitValue > 0
      ? `Your Dispatch Base is ${isZipBase ? `the center of Zip Code ${baseInputValue}` : baseInputValue}. The client's strict travel limit is ${travelLimitValue} ${travelLimitMode}. Estimate the travel effort from that ${
          isZipBase ? "Zip Code center" : "location"
        }. If the customer is too far, decline.`
      : "";
  const dispatchHint = baseInputValue
    ? isZipBase
      ? `Using Zip Code ${baseInputValue} as the dispatch anchor.`
      : `Using exact address: ${baseInputValue}.`
    : "Type a 5-digit Zip or full address to anchor your dispatch radius.";

  const payloadPreview = useMemo(
    () => ({
      business_name: form.nameInput,
      industry: form.industryInput,
      area_code: form.areaCodeInput,
      payment_id: form.paymentId,
      plan_tier: planTier,
      agent_tone: form.toneInput,
      schedule_summary: generateScheduleSummary(),
      standard_fee: form.standardFee,
      emergency_fee: form.emergencyFee,
      transfer_number: form.transferNumber,
      dispatch_base_location: baseInputValue || null,
      dispatch_base_zip: isZipBase ? baseInputValue : null,
      travel_limit_value: travelLimitValue,
      travel_limit_mode: travelLimitMode,
    }),
    [form, planTier, baseInputValue, isZipBase, travelLimitValue, travelLimitMode]
  );

  const handleDeploy = async () => {
    setDeployError("");
    setIsDeploying(true);
    if (!baseInputValue) {
      setDeployError("Enter a Dispatch Base Location before deploying.");
      setIsDeploying(false);
      return;
    }
    if (travelLimitValue <= 0) {
      setDeployError("Set a travel limit value greater than zero.");
      setIsDeploying(false);
      return;
    }
    try {
      const response = await deployAgent({
        businessName: form.nameInput,
        industry: form.industryInput,
        areaCode: form.areaCodeInput,
        tone: form.toneInput,
        scheduleSummary: generateScheduleSummary(),
        standardFee: form.standardFee,
        emergencyFee: form.emergencyFee,
        paymentId: form.paymentId,
        transferNumber: form.transferNumber,
        calComLink: form.calComLink,
        planTier,
        dispatchBaseLocation: baseInputValue,
        travelLimitValue,
        travelLimitMode,
      });
      setPhoneNumber(response?.data?.phone_number || "");
      persistStep(6);
      navigate("/numbers?new=1");
    } catch (error) {
      setDeployError("Deployment failed. Neural uplink refused.");
    } finally {
      setIsDeploying(false);
    }
  };

  const handleStripeCheckout = async () => {
    setCheckoutError("");
    setCheckoutLoading(true);
    try {
      const planTierPayload = planTier === "scale" ? "scale" : planTier || "pro";
      const successUrl = `${window.location.origin}/wizard?success=true&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${window.location.origin}/wizard?canceled=true`;
      const response = await createCheckoutSession({
        planTier: planTierPayload,
        successUrl,
        cancelUrl,
      });
      if (response.data?.sessionId) {
        localStorage.setItem(
          "kryonex_pending_checkout_session",
          response.data.sessionId
        );
      }
      if (response.data?.url) {
        window.location.href = response.data.url;
      }
    } catch (error) {
      setCheckoutError(error.response?.data?.error || error.message);
    } finally {
      setCheckoutLoading(false);
    }
  };

  if (wizardLocked) {
    return (
      <div className="min-h-screen bg-void-black text-white relative overflow-hidden font-sans selection:bg-neon-cyan/30">
        <TopMenu />
        <div className="absolute inset-0 bg-grid-lines opacity-40" />
        <div className="relative z-10 mx-auto flex min-h-screen max-w-4xl flex-col px-6 py-16">
          <div className="glass-panel rounded-3xl p-8 border border-white/10">
            <div className="text-xs uppercase tracking-[0.4em] text-neon-cyan/70">
              Access Locked
            </div>
            <h1 className="mt-4 text-3xl font-semibold">Wizard Restricted</h1>
            <p className="mt-3 text-white/60">
              {wizardLockReason ||
                "This wizard is reserved for Elite/White-Glove accounts."}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button className="glow-button" onClick={() => navigate("/billing")}>
                Upgrade Plan
              </button>
              <a
                className="button-primary"
                href="mailto:support@kryonextech.com?subject=New%20Agent%20Request"
              >
                Contact Support
              </a>
              <button className="button-primary" onClick={() => navigate("/dashboard")}>
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-void-black text-white relative overflow-hidden font-sans selection:bg-neon-cyan/30">
      <TopMenu />
      <div
        className="absolute inset-0 bg-grid-lines opacity-40"
        style={{ backgroundSize: "48px 48px" }}
      />
      <div className="absolute -top-28 -right-28 h-72 w-72 rounded-full bg-neon-purple/20 blur-[120px]" />
      <div className="absolute bottom-0 left-0 h-96 w-96 rounded-full bg-neon-cyan/10 blur-[140px]" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-sm uppercase tracking-[0.4em] text-neon-cyan/70">
              Kryonex Deployment Wizard v3.0
            </p>
            <h1 className="mt-2 text-4xl font-semibold sm:text-5xl tracking-tight">
              Launch Intelligence.
            </h1>
            <p className="mt-3 max-w-xl text-base text-white/60">
              Orchestrate identity, intelligence, and logistics with cinematic
              precision.
            </p>
          </div>
          <div className="glass-panel rounded-2xl px-5 py-4 border border-white/5 bg-white/5 backdrop-blur-md">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-neon-cyan/20 to-transparent text-neon-cyan shadow-glow ring-1 ring-white/10">
                <StepIcon size={24} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-white/50">
                  Phase {step} of 6
                </p>
                <p className="text-lg font-semibold tracking-wide">
                  {currentStep.title}
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="glass-panel relative flex-1 rounded-[28px] p-8 sm:p-10 border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl">
          <div className="mb-10 flex flex-wrap items-center gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {stepMeta.map((meta, index) => {
              const isActive = step === index + 1;
              const isPast = step > index + 1;
              const MetaIcon = meta.icon;
              return (
                <div
                  key={meta.title}
                  className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium transition-all duration-300 ${
                    isActive
                      ? "border-neon-cyan/50 bg-neon-cyan/10 text-neon-cyan shadow-glow scale-105"
                      : isPast
                      ? "border-neon-green/30 text-neon-green/70"
                      : "border-white/5 text-white/40"
                  }`}
                >
                  <MetaIcon size={14} />
                  <span>{meta.title}</span>
                </div>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step-1"
                variants={stepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="grid gap-12 lg:grid-cols-[1fr_1fr]"
              >
                <div className="space-y-8">
                  <div>
                    <h2 className="text-3xl font-semibold">Identity Signal</h2>
                    <p className="mt-2 text-white/60">
                      Define the business presence that powers the AI voice.
                    </p>
                  </div>
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-wider text-white/50">
                        Business Name
                      </label>
                      <input
                        className="glass-input w-full text-lg"
                        placeholder="e.g. Apex Comfort Co."
                        value={form.nameInput}
                        onChange={(e) => {
                          updateField("nameInput", e.target.value);
                          playKeyTone();
                        }}
                        autoFocus
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-wider text-white/50">
                        Area Code
                      </label>
                      <input
                        className="glass-input w-full text-lg tracking-[0.5em] font-mono"
                        placeholder="___"
                        value={form.areaCodeInput}
                        onChange={handleAreaCode}
                        maxLength={3}
                      />
                      <p
                        className={`text-xs ${
                          areaCodeValid ? "text-neon-green" : "text-neon-pink"
                        }`}
                      >
                        {areaCodeValid ? "✓ Routing Valid" : "Must be 3 digits"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-wider text-white/50">
                        Consent Protocol
                      </div>
                      <label className="mt-3 flex items-start gap-3 text-sm text-white/70">
                        <input
                          type="checkbox"
                          checked={consentAccepted}
                          onChange={(event) => handleConsent(event.target.checked)}
                        />
                        <span>
                          I confirm I have obtained all required customer consent
                          for calls, SMS, and recordings, and accept the Terms &
                          Privacy Policy.
                        </span>
                      </label>
                      {consentError ? (
                        <div className="mt-2 text-neon-pink text-xs">
                          {consentError}
                        </div>
                      ) : null}
                    </div>
                    {saveError ? (
                      <div className="text-neon-pink text-sm">{saveError}</div>
                    ) : null}
                  </div>
                </div>
                <div className="glass-panel preview-glow flex flex-col justify-between rounded-3xl p-8 bg-gradient-to-b from-white/5 to-transparent border border-white/5">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                      Preview Output
                    </p>
                    <h3 className="mt-4 text-3xl font-bold text-white preview-text">
                      {form.nameInput || "UNINITIALIZED"}
                    </h3>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-neon-green animate-pulse" />
                      <span className="text-white/85 font-mono text-sm">
                        Targeting: ({form.areaCodeInput || "___"}) Region
                      </span>
                    </div>
                  </div>
                  <div className="space-y-3 mt-10">
                    <div className="flex items-center gap-3 text-sm text-white/60">
                      <ShieldCheck className="text-neon-green" size={16} />
                      Signal encryption:{" "}
                      <span className="text-neon-green">LOCKED</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-white/60">
                      <Terminal className="text-neon-cyan" size={16} />
                      Smart routing:{" "}
                      <span className="text-neon-cyan">ARMED</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step-2"
                variants={stepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="space-y-8"
              >
                <div>
                  <h2 className="text-3xl font-semibold">Intelligence Core</h2>
                  <p className="mt-2 text-white/60">
                    Select the neural model and personality.
                  </p>
                </div>

                <div className="mb-8 p-6 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <Mic size={80} />
                  </div>
                  <div className="flex items-center gap-3 mb-6 relative z-10">
                    <div className="p-2 bg-neon-cyan/20 rounded-lg text-neon-cyan">
                      <Mic size={20} />
                    </div>
                    <h3 className="text-xl font-semibold text-white">
                      Voice Personality
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10">
                    {AGENT_TONES.map((tone) => (
                      <button
                        key={tone}
                        type="button"
                        onClick={() => updateField("toneInput", tone)}
                        className={`py-4 px-4 rounded-xl border text-sm font-medium transition-all duration-300 ${
                          form.toneInput === tone
                            ? "border-neon-cyan bg-neon-cyan/10 text-neon-cyan shadow-[0_0_15px_rgba(34,211,238,0.3)]"
                            : "border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        {tone}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  {INDUSTRIES.map((industry) => {
                    const isSelected = form.industryInput === industry.id;
                    const accentClasses =
                      industry.accent === "purple"
                        ? {
                            border: "border-neon-purple",
                            bg: "bg-neon-purple/5",
                            hover: "hover:border-neon-purple/50",
                            text: "text-neon-purple",
                            icon: "bg-neon-purple/10",
                          }
                        : {
                            border: "border-neon-cyan",
                            bg: "bg-neon-cyan/5",
                            hover: "hover:border-neon-cyan/50",
                            text: "text-neon-cyan",
                            icon: "bg-neon-cyan/10",
                          };
                    const Icon = industry.id === "plumbing" ? Droplet : Wrench;
                    return (
                      <button
                        key={industry.id}
                        onClick={async () => {
                          updateField("industryInput", industry.id);
                          await saveProfile({ industry: industry.label });
                        }}
                        className={`group relative overflow-hidden rounded-2xl border p-8 text-left transition-all duration-300 ${accentClasses.hover} ${
                          isSelected
                            ? `${accentClasses.border} ${accentClasses.bg}`
                            : "border-white/10 bg-black/20"
                        }`}
                      >
                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                          <Icon size={100} />
                        </div>
                        <div className="relative z-10">
                          <div className="flex items-center gap-3 mb-4">
                            <span
                              className={`flex h-10 w-10 items-center justify-center rounded-lg ${accentClasses.icon} ${accentClasses.text}`}
                            >
                              <Icon size={20} />
                            </span>
                            <span
                              className={`text-xs font-bold uppercase tracking-widest ${accentClasses.text}`}
                            >
                              {industry.protocol}
                            </span>
                          </div>
                          <h3 className="text-xl font-bold text-white">
                            {industry.title}
                          </h3>
                          <p className="mt-2 text-sm text-white/60">
                            {industry.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step-3"
                variants={stepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr]"
              >
                <div className="space-y-8">
                  <div>
                    <h2 className="text-3xl font-semibold">
                      Temporal & Financial
                    </h2>
                    <p className="mt-2 text-white/60">
                      Configure the AI's internal clock and availability logic.
                    </p>
                  </div>

                  <div className="space-y-6">
                    <div className="p-5 rounded-2xl border border-white/10 bg-white/5">
                      <div className="flex items-center gap-3 mb-4">
                        <Calendar size={18} className="text-neon-cyan" />
                        <h3 className="font-semibold text-white">
                          Standard Weekdays (Mon-Fri)
                        </h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-4">
                        <TimeSelect
                          value={form.weekdayOpen}
                          onChange={(e) =>
                            updateField("weekdayOpen", e.target.value)
                          }
                        />
                        <span className="text-white/40 text-xs uppercase tracking-widest">
                          TO
                        </span>
                        <TimeSelect
                          value={form.weekdayClose}
                          onChange={(e) =>
                            updateField("weekdayClose", e.target.value)
                          }
                        />
                      </div>
                    </div>

                    <div
                      className={`p-5 rounded-2xl border transition-colors duration-300 ${
                        form.weekendEnabled
                          ? "border-neon-green/30 bg-neon-green/5"
                          : "border-white/10 bg-white/5"
                      }`}
                    >
                      <div
                        className="flex items-center justify-between mb-4 cursor-pointer"
                        onClick={() =>
                          updateField("weekendEnabled", !form.weekendEnabled)
                        }
                      >
                        <div className="flex items-center gap-3">
                          <Clock
                            size={18}
                            className={
                              form.weekendEnabled
                                ? "text-neon-green"
                                : "text-white/40"
                            }
                          />
                          <h3
                            className={`font-semibold ${
                              form.weekendEnabled
                                ? "text-white"
                                : "text-white/60"
                            }`}
                          >
                            Weekend Operations
                          </h3>
                        </div>
                        <div
                          className={`w-12 h-6 rounded-full p-1 transition-colors ${
                            form.weekendEnabled
                              ? "bg-neon-green"
                              : "bg-white/10"
                          }`}
                        >
                          <div
                            className={`bg-white h-4 w-4 rounded-full shadow-md transform transition-transform ${
                              form.weekendEnabled
                                ? "translate-x-6"
                                : "translate-x-0"
                            }`}
                          />
                        </div>
                      </div>

                      {form.weekendEnabled && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="flex flex-wrap items-center gap-4 pt-2 border-t border-white/10"
                        >
                          <TimeSelect
                            value={form.saturdayOpen}
                            onChange={(e) =>
                              updateField("saturdayOpen", e.target.value)
                            }
                          />
                          <span className="text-white/40 text-xs uppercase tracking-widest">
                            TO
                          </span>
                          <TimeSelect
                            value={form.saturdayClose}
                            onChange={(e) =>
                              updateField("saturdayClose", e.target.value)
                            }
                          />
                        </motion.div>
                      )}
                    </div>

                    <div
                      className={`p-5 rounded-2xl border transition-all duration-300 cursor-pointer ${
                        form.emergency247
                          ? "border-neon-pink bg-neon-pink/10 shadow-[0_0_20px_rgba(255,50,90,0.2)]"
                          : "border-white/10 bg-white/5"
                      }`}
                      onClick={() =>
                        updateField("emergency247", !form.emergency247)
                      }
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Zap
                            size={18}
                            className={
                              form.emergency247
                                ? "text-neon-pink fill-neon-pink animate-pulse"
                                : "text-white/40"
                            }
                          />
                          <div>
                            <h3
                              className={`font-semibold ${
                                form.emergency247
                                  ? "text-neon-pink"
                                  : "text-white/60"
                              }`}
                            >
                              Emergency Override Protocol
                            </h3>
                            <p className="text-xs text-white/40 mt-1">
                              Enable 24/7 Red-List dispatching.
                            </p>
                          </div>
                        </div>
                        <div
                          className={`w-6 h-6 rounded border flex items-center justify-center transition-colors ${
                            form.emergency247
                              ? "border-neon-pink bg-neon-pink text-black"
                              : "border-white/20"
                          }`}
                        >
                          {form.emergency247 && <Wrench size={12} />}
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 p-6 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-sm">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-neon-green/20 rounded-lg text-neon-green">
                          <DollarSign size={20} />
                        </div>
                        <div>
                          <h3 className="text-xl font-semibold text-white">
                            Service Economics
                          </h3>
                          <p className="text-xs text-white/50">
                            Define the financial thresholds for the AI.
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2 mb-6">
                        <label className="text-xs uppercase tracking-wider text-white/50">
                          Transfer Number (Human Escalation)
                        </label>
                        <input
                          className="glass-input w-full font-mono text-neon-cyan"
                          value={form.transferNumber}
                          onChange={(e) =>
                            updateField("transferNumber", e.target.value)
                          }
                          onBlur={(e) => {
                            const normalized = normalizePhone(e.target.value);
                            if (normalized) {
                              updateField("transferNumber", normalized);
                            }
                          }}
                          placeholder="+1 800 555 0123"
                        />
                      </div>
                      <div className="space-y-2 mb-6">
                        <label className="text-xs uppercase tracking-wider text-white/50">
                          Cal.com Scheduling Link
                        </label>
                        <input
                          className="glass-input w-full font-mono text-neon-cyan"
                          value={form.calComLink}
                          onChange={(e) =>
                            updateField("calComLink", e.target.value)
                          }
                          placeholder="https://cal.com/your-team/book"
                        />
                      </div>
                      <div className="space-y-2 mb-6">
                        <label className="text-xs uppercase tracking-wider text-white/50">
                          Calendar Connection
                        </label>
                        {calConnected ? (
                          <div className="inline-flex items-center gap-2 rounded-full border border-neon-green/40 bg-neon-green/10 px-4 py-2 text-sm text-neon-green">
                            ✓ Calendar Connected
                          </div>
                        ) : (
                          <button
                            className="button-primary w-full"
                            type="button"
                            onClick={handleCalcomConnect}
                            disabled={calStatusLoading}
                          >
                            {calStatusLoading
                              ? "Checking Calendar..."
                              : "Connect Cal.com Account"}
                          </button>
                        )}
                        {calStatusError ? (
                          <div className="text-xs text-neon-pink/80">
                            {calStatusError}
                          </div>
                        ) : null}
                        {!calConnected ? (
                          <div className="text-xs text-white/50 leading-relaxed">
                            <strong className="text-white/70">IMPORTANT:</strong>{" "}
                            If you do not connect a calendar, the AI{" "}
                            <em>cannot</em> book appointments automatically.
                            You will only receive Deep Link email alerts for
                            manual booking.
                          </div>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-xs uppercase tracking-wider text-white/50">
                            Standard Dispatch
                          </label>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40">
                              $
                            </span>
                            <input
                              className="glass-input w-full pl-8 font-mono text-neon-cyan text-lg"
                              value={form.standardFee}
                              onChange={(e) =>
                                updateField("standardFee", e.target.value)
                              }
                              placeholder="89"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs uppercase tracking-wider text-white/50">
                            Emergency / After-Hours
                          </label>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40">
                              $
                            </span>
                            <input
                              className="glass-input w-full pl-8 font-mono text-neon-pink text-lg"
                              value={form.emergencyFee}
                              onChange={(e) =>
                                updateField("emergencyFee", e.target.value)
                              }
                              placeholder="189"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              <div className="space-y-6">
                <div className="glass-panel p-6 rounded-3xl border border-white/10 bg-black/40 space-y-4">
                  <div className="flex items-center gap-3">
                    <MapPin size={20} className="text-neon-cyan" />
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                        Smart Service Radius
                      </p>
                      <p className="text-lg font-semibold text-white">
                        Dispatch Base Location
                      </p>
                    </div>
                  </div>
                  <div className="relative">
                    <MapPin
                      size={18}
                      className="text-white/30 absolute left-3 top-1/2 -translate-y-1/2"
                    />
                    <input
                      className="glass-input w-full pl-12 search-location-input text-sm text-white"
                      placeholder="Enter Start Zip Code (Recommended) or Full Address"
                      value={form.dispatchBaseLocation}
                      onChange={(event) =>
                        updateField("dispatchBaseLocation", event.target.value)
                      }
                    />
                  </div>
                  <p className="text-xs text-white/50">{dispatchHint}</p>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      {["miles", "minutes"].map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => updateField("travelLimitMode", mode)}
                          className={`flex-1 text-xs uppercase tracking-[0.4em] rounded-2xl border py-2 transition-all ${
                            travelLimitMode === mode
                              ? "border-neon-cyan bg-neon-cyan/20 text-neon-cyan"
                              : "border-white/20 text-white/60 hover:border-neon-cyan/50 hover:text-white"
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        className="glass-input w-full font-mono text-lg text-white"
                        value={String(form.travelLimitValue || "")}
                        onChange={(event) =>
                          updateField("travelLimitValue", event.target.value)
                        }
                        placeholder="30"
                      />
                      <span className="text-xs uppercase tracking-[0.4em] text-white/40">
                        Range
                      </span>
                    </div>
                  </div>
                </div>

                <div className="glass-panel p-6 rounded-3xl bg-black/40 border border-white/10 flex flex-col gap-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                    Logic Preview
                  </p>
                  <div className="p-4 rounded-xl bg-black/60 border border-white/5 font-mono text-xs text-neon-cyan leading-relaxed">
                    {`> CHECKING_SCHEDULE...\n`}
                    {`> MON-FRI: ${form.weekdayOpen} - ${form.weekdayClose}\n`}
                    {`> WEEKEND: ${form.weekendEnabled ? "ACTIVE" : "OFFLINE"}\n`}
                    {`> EMERGENCY_MODE: ${
                      form.emergency247 ? "ENABLED" : "DISABLED"
                    }\n`}
                    {`> TRANSFER_NUMBER: ${
                      form.transferNumber ? form.transferNumber : "NONE"
                    }\n`}
                    {`> STANDARD_FEE: $${form.standardFee}\n`}
                    {`> EMERGENCY_FEE: $${form.emergencyFee}\n`}
                    {baseDescriptor ? `> DISPATCH_BASE: ${baseDescriptor}\n` : ""}
                    {travelLimitValue > 0
                      ? `> TRAVEL_LIMIT: ${travelLimitValue} ${travelLimitMode}\n`
                      : ""}
                  </div>
                  <p className="text-xs text-white/50 italic">
                    The AI will use this logic to accept or reject appointment
                    requests.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

            {step === 4 && (
              <motion.div
                key="step-4"
                variants={stepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr]"
              >
                <div className="space-y-6">
                  <div>
                    <h2 className="text-3xl font-semibold">Activation</h2>
                    <p className="mt-2 text-white/60">
                      Secure the deployment uplink with Stripe checkout.
                    </p>
                  </div>
                  {isAdmin ? (
                    <div className="glass-panel rounded-2xl p-4 border border-white/10">
                      <div className="text-xs uppercase tracking-widest text-white/40">
                        Admin Override
                      </div>
                      <div className="mt-2 text-sm text-white/60">
                        Billing is optional for admin accounts. You can bypass
                        checkout to test the full flow.
                      </div>
                      <button
                        className="glow-button mt-3"
                        onClick={() => {
                          setPaymentVerified(true);
                          updateField("paymentId", "admin_override");
                        }}
                      >
                        BYPASS BILLING
                      </button>
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    <div className="text-xs uppercase tracking-wider text-white/50">
                      Choose Tier
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {[
                        { id: "pro", label: "PRO — $197/mo", desc: "Most popular" },
                        { id: "elite", label: "ELITE — $397/mo", desc: "Multi‑location + VIP" },
                        { id: "scale", label: "SCALE — $997/mo", desc: "Enterprise scale tier" },
                        ...(coreOffer || planTier === "core"
                          ? [
                              {
                                id: "core",
                                label: "CORE — $99/mo",
                                desc: "Private access tier",
                              },
                            ]
                          : []),
                      ].map((tier) => (
                        <button
                          key={tier.id}
                          type="button"
                          onClick={() => setPlanTier(tier.id)}
                          className={`rounded-2xl border px-4 py-3 text-left transition-all ${
                            planTier === tier.id
                              ? "border-neon-cyan bg-neon-cyan/10 text-neon-cyan"
                              : "border-white/10 text-white/60 hover:bg-white/5"
                          }`}
                        >
                          <div className="text-sm font-semibold">{tier.label}</div>
                          <div className="text-xs text-white/50">{tier.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-xs uppercase tracking-wider text-white/50">
                      Plan Selected
                    </label>
                    <div className="glass-input w-full flex items-center justify-between">
                      <span className="uppercase tracking-widest text-white/70">
                        {planTier.toUpperCase()}
                      </span>
                      <span className="font-mono text-neon-cyan">
                        {planTier === "elite"
                          ? "$397/mo"
                          : planTier === "scale"
                          ? "$997/mo"
                          : planTier === "core"
                          ? "$99/mo"
                          : "$197/mo"}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm text-white/60">
                    Checkout is handled by Stripe in a secure window. Your card
                    never touches our servers.
                  </div>
                  {checkoutError ? (
                    <div className="text-neon-pink text-sm">{checkoutError}</div>
                  ) : null}
                </div>

                <div className="glass-panel rounded-3xl p-8 border border-white/5 bg-gradient-to-br from-white/5 to-transparent">
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-xs uppercase tracking-[0.3em] text-white/40">
                      Secure Chamber
                    </span>
                    <CreditCard className="text-neon-cyan" size={20} />
                  </div>
                  <div className="aspect-[1.58/1] rounded-2xl bg-gradient-to-br from-gray-900 to-black border border-white/10 p-6 relative overflow-hidden shadow-2xl">
                    <div className="absolute top-0 right-0 p-4 opacity-20">
                      <CreditCard size={100} className="text-white" />
                    </div>
                    <div className="relative z-10 flex flex-col justify-between h-full">
                      <div className="text-xl font-bold italic tracking-widest text-white/20">
                        VISA
                      </div>
                      <div className="font-mono text-xl tracking-[0.2em] text-white/90">
                        •••• •••• •••• ••••
                      </div>
                      <div className="flex justify-between text-xs text-white/50">
                        <span>CARDHOLDER</span>
                        <span>VALID THRU</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleStripeCheckout}
                    disabled={checkoutLoading}
                    className="glow-button mt-8 w-full group disabled:opacity-60"
                  >
                    <span className="group-hover:tracking-widest transition-all duration-300">
                      {checkoutLoading ? "OPENING CHECKOUT..." : "OPEN STRIPE CHECKOUT"}
                    </span>
                  </button>
                  {form.paymentId && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 p-3 rounded-lg bg-neon-cyan/10 border border-neon-cyan/30 text-center text-neon-cyan text-sm font-mono"
                    >
                      STRIPE VERIFIED: {form.paymentId}
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}

            {step === 5 && (
              <motion.div
                key="step-5"
                variants={stepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr]"
              >
                <div className="space-y-6">
                  <div>
                    <h2 className="text-3xl font-semibold">
                      Handshake Protocol
                    </h2>
                    <p className="mt-2 text-white/60">
                      Final review before neural injection.
                    </p>
                  </div>
                  <div className="glass-panel p-6 rounded-3xl border border-white/10 bg-black/40 space-y-4">
                    <div className="flex items-center gap-3">
                      <MapPin size={20} className="text-neon-cyan" />
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                          Dispatch Base
                        </p>
                        <p className="text-lg font-semibold text-white">
                          Service Radius Rules
                        </p>
                      </div>
                    </div>
                    <div className="relative">
                      <MapPin
                        size={18}
                        className="text-white/30 absolute left-3 top-1/2 -translate-y-1/2"
                      />
                      <input
                        className="glass-input w-full pl-12 search-location-input text-sm text-white"
                        placeholder="Enter Start Zip Code (Recommended) or Full Address"
                        value={form.dispatchBaseLocation}
                        onChange={(event) =>
                          updateField("dispatchBaseLocation", event.target.value)
                        }
                      />
                    </div>
                    <p className="text-xs text-white/50">{dispatchHint}</p>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        {["miles", "minutes"].map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => updateField("travelLimitMode", mode)}
                            className={`flex-1 text-xs uppercase tracking-[0.4em] rounded-2xl border py-2 transition-all ${
                              travelLimitMode === mode
                                ? "border-neon-cyan bg-neon-cyan/20 text-neon-cyan"
                                : "border-white/20 text-white/60 hover:border-neon-cyan/50 hover:text-white"
                            }`}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          className="glass-input w-full font-mono text-lg text-white"
                          value={String(form.travelLimitValue || "")}
                          onChange={(event) =>
                            updateField("travelLimitValue", event.target.value)
                          }
                          placeholder="30"
                        />
                        <span className="text-xs uppercase tracking-[0.4em] text-white/40">
                          Range
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/40 p-6 space-y-4">
                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                      <span className="text-white/50 text-sm">
                        Target Identity
                      </span>
                      <span className="text-white font-medium">
                        {form.nameInput}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                      <span className="text-white/50 text-sm">
                        Industry Model
                      </span>
                      <span className="text-neon-cyan font-mono uppercase">
                        {form.industryInput}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                      <span className="text-white/50 text-sm">
                        Voice Personality
                      </span>
                      <span className="text-white font-mono">
                        {form.toneInput}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                      <span className="text-white/50 text-sm">
                        Service Rates
                      </span>
                      <span className="text-white font-mono">
                        ${form.standardFee} / ${form.emergencyFee}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                      <span className="text-white/50 text-sm">
                        Region Routing
                      </span>
                      <span className="text-white font-mono">
                        ({form.areaCodeInput})
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-white/50 text-sm">
                        Payment Token
                      </span>
                      <span className="text-neon-green font-mono">
                        {form.paymentId}
                      </span>
                    </div>
                  </div>
                  {deployError && (
                    <div className="p-4 rounded-xl bg-neon-pink/10 border border-neon-pink/50 text-neon-pink text-sm flex items-center gap-2">
                      <Zap size={16} /> {deployError}
                    </div>
                  )}
                </div>

                <div className="glass-panel rounded-3xl p-8 border border-white/5">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-xs uppercase tracking-[0.3em] text-white/40">
                      JSON Payload
                    </span>
                    <Terminal size={16} className="text-neon-cyan" />
                  </div>
                  <div className="bg-black/60 rounded-xl p-4 border border-white/10 overflow-hidden">
                    <pre className="text-[10px] sm:text-xs text-neon-green/80 font-mono whitespace-pre-wrap leading-relaxed">
                      {JSON.stringify(payloadPreview, null, 2)}
                    </pre>
                  </div>

                  <button
                        onClick={() => setConfirmOpen(true)}
                    disabled={isDeploying}
                    className="glow-button mt-6 w-full py-4 text-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                        {isDeploying ? "ESTABLISHING UPLINK..." : "DEPLOY RECEPTIONIST"}
                  </button>

                  {isDeploying && (
                    <div className="mt-6 space-y-1 font-mono text-xs text-neon-cyan/70">
                      {terminalLines.map((line, i) => (
                        <motion.div
                          key={line}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.5 }}
                        >
                          {`> ${line}`}
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {step === 6 && (
              <motion.div
                key="step-6"
                variants={stepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex min-h-[500px] flex-col items-center justify-center text-center"
              >
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 200 }}
                  className="mb-8 p-6 rounded-full bg-neon-green/10 border border-neon-green/50 shadow-[0_0_50px_rgba(34,243,164,0.3)]"
                >
                  <Terminal size={64} className="text-neon-green" />
                </motion.div>
                <p className="text-sm uppercase tracking-[0.6em] text-neon-green">
                  System Online
                </p>
                <h2 className="mt-4 text-6xl font-bold text-white drop-shadow-[0_0_25px_rgba(255,255,255,0.5)]">
                  DEPLOYED
                </h2>
                <p className="mt-6 text-xl text-white/60 max-w-lg mx-auto">
                  Neural handshake complete. Your AI Receptionist is listening
                  on the network.
                </p>

                <div className="mt-12 group relative">
                  <div className="absolute -inset-1 bg-gradient-to-r from-neon-green to-neon-cyan rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200" />
                  <div className="relative px-12 py-6 bg-black rounded-xl leading-none flex items-center">
                    <span className="text-4xl font-mono text-neon-green font-bold tracking-widest">
                      {phoneNumber || "+1 (800) 555-0199"}
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {step < 6 && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <button
              onClick={() => updateStep((prev) => Math.max(1, prev - 1))}
              disabled={step === 1 || isDeploying}
              className="px-6 py-3 rounded-xl border border-white/10 hover:bg-white/5 hover:border-white/30 text-white/60 disabled:opacity-30 transition-all text-sm font-medium tracking-wide uppercase"
            >
              Back
            </button>

            <div className="flex items-center gap-3 text-xs text-white/40 uppercase tracking-widest">
              <span className="h-1.5 w-1.5 rounded-full bg-neon-cyan animate-pulse" />
              Kryonex Secure Environment
            </div>

            {step === 1 && (
              <button
                onClick={async () => {
                  const ok = await saveProfile({
                    business_name: form.nameInput,
                  });
                  if (ok) persistStep(2);
                }}
                disabled={!canContinueIdentity || saving}
                className="glow-button"
              >
                {saving ? "SAVING..." : "Confirm Identity"}
              </button>
            )}
            {step === 2 && (
              <button
                onClick={() => persistStep(3)}
                disabled={!canContinueIndustry || saving}
                className="glow-button"
              >
                Initialize Logic
              </button>
            )}
            {step === 3 && (
              <button
                onClick={async () => {
                  const ok = await saveProfile({
                    transfer_number: form.transferNumber || null,
                  });
                  if (ok) persistStep(4);
                }}
                disabled={!canContinueLogistics}
                className="glow-button"
              >
                Proceed to Pay
              </button>
            )}
            {step === 4 && (
              <button
                onClick={() => persistStep(5)}
                disabled={!canContinuePayment}
                className="glow-button"
              >
                Review Payload
              </button>
            )}
          </div>
        )}
      </div>

      {confirmOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "grid",
            placeItems: "center",
            zIndex: 50,
          }}
        >
          <div className="glass-panel rounded-3xl p-6 border border-white/10" style={{ maxWidth: "520px", width: "90%" }}>
            <div className="text-lg font-semibold">Final Confirmation</div>
            <div className="text-sm text-white/60 mt-2">
              Review and confirm deployment details.
            </div>
            <div className="mt-4 text-sm text-white/70">
              <div>Business: {form.nameInput}</div>
              <div>Industry: {form.industryInput}</div>
              <div>Tier: {planTier.toUpperCase()}</div>
              <div>Area Code: {form.areaCodeInput}</div>
              <div>Voice: {form.toneInput}</div>
            </div>
            <div className="mt-4 flex gap-3 justify-end">
              <button
                className="button-primary"
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                className="glow-button"
                onClick={() => {
                  setConfirmOpen(false);
                  handleDeploy();
                }}
              >
                Confirm Deploy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
