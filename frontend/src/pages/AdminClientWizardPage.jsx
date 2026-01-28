import React from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import {
  adminCreateAccount,
  adminGenerateStripeLink,
  adminQuickOnboard,
} from "../lib/api";

const sanitizeAreaCode = (value) =>
  String(value || "").replace(/\D/g, "").slice(0, 3);

const isValidEmail = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

export default function AdminClientWizardPage() {
  const navigate = useNavigate();
  const [quickForm, setQuickForm] = React.useState({
    businessName: "",
    areaCode: "",
    email: "",
  });
  const [quickLoading, setQuickLoading] = React.useState(false);
  const [quickError, setQuickError] = React.useState("");
  const [quickSuccess, setQuickSuccess] = React.useState(null);

  const [signupForm, setSignupForm] = React.useState({
    email: "",
    tempPassword: "",
  });
  const [signupLoading, setSignupLoading] = React.useState(false);
  const [signupError, setSignupError] = React.useState("");
  const [signupSuccess, setSignupSuccess] = React.useState(null);

  const [stripeClientEmail, setStripeClientEmail] = React.useState("");
  const [stripeTier, setStripeTier] = React.useState("pro");
  const [stripeLoading, setStripeLoading] = React.useState(false);
  const [stripeError, setStripeError] = React.useState("");
  const [stripeLink, setStripeLink] = React.useState("");
  const [copyNotice, setCopyNotice] = React.useState("");

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
    if (!isValidEmail(cleanEmail)) {
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

  const handleSignupSubmit = async (event) => {
    event?.preventDefault();
    setSignupError("");
    setSignupSuccess(null);
    if (!isValidEmail(signupForm.email)) {
      setSignupError("Enter a valid email address.");
      return;
    }
    if (!signupForm.tempPassword || signupForm.tempPassword.length < 8) {
      setSignupError("Temp password must be at least 8 characters.");
      return;
    }
    setSignupLoading(true);
    try {
      const response = await adminCreateAccount({
        email: signupForm.email.trim(),
        password: signupForm.tempPassword,
      });
      setSignupSuccess(response.data || { ok: true });
    } catch (err) {
      setSignupError(err.response?.data?.error || err.message);
    } finally {
      setSignupLoading(false);
    }
  };

  const handleStripeLink = async () => {
    setStripeError("");
    setStripeLink("");
    const email = stripeClientEmail.trim();
    if (!email) {
      setStripeError("Client email is required.");
      return;
    }
    if (!isValidEmail(email)) {
      setStripeError("Enter a valid email address.");
      return;
    }
    setStripeLoading(true);
    try {
      const response = await adminGenerateStripeLink({
        email,
        planTier: stripeTier,
      });
      const url = response.data?.url ?? "";
      setStripeLink(url);
    } catch (err) {
      const status = err.response?.status;
      const body = err.response?.data ?? {};
      const msg =
        body.message ?? body.error ?? err.message ?? "Request failed.";
      if (status === 404 && body.error === "USER_NOT_FOUND") {
        setStripeError(body.message ?? "No user found for that email.");
      } else {
        setStripeError(msg);
      }
    } finally {
      setStripeLoading(false);
    }
  };

  const handleCopy = async (value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopyNotice("Link copied");
      setTimeout(() => setCopyNotice(""), 1500);
    } catch {
      setCopyNotice("Copy failed");
      setTimeout(() => setCopyNotice(""), 1500);
    }
  };

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
                <h1 className="mt-1 text-2xl font-semibold">
                  Admin Client Wizard
                </h1>
                <p className="mt-2 text-sm text-white/50">
                  Fast manual onboarding for real users. No clutter.
                </p>
              </div>
              <button
                className="button-primary"
                onClick={() => navigate("/admin/call-center")}
              >
                Back to Call Center
              </button>
            </div>
          </motion.div>

          <div className="flex-1 overflow-y-auto px-6 py-8">
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="glass-panel rounded-3xl border border-white/10 p-6 space-y-4">
                <div>
                  <div className="text-sm font-semibold text-white">
                    Mini Onboarding Wizard
                  </div>
                  <div className="text-xs text-white/50">
                    Deploy a real client fast (Core tier by default).
                  </div>
                </div>
                <label className="space-y-2">
                  <span className="text-sm text-white/70">Business Name</span>
                  <input
                    className="input-field w-full"
                    value={quickForm.businessName}
                    onChange={(event) =>
                      setQuickForm((prev) => ({
                        ...prev,
                        businessName: event.target.value,
                      }))
                    }
                    placeholder="Client business"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-white/70">Area Code</span>
                  <input
                    className="input-field w-full"
                    value={quickForm.areaCode}
                    onChange={(event) =>
                      setQuickForm((prev) => ({
                        ...prev,
                        areaCode: sanitizeAreaCode(event.target.value),
                      }))
                    }
                    placeholder="123"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-white/70">Email</span>
                  <input
                    className="input-field w-full"
                    type="email"
                    value={quickForm.email}
                    onChange={(event) =>
                      setQuickForm((prev) => ({
                        ...prev,
                        email: event.target.value,
                      }))
                    }
                    placeholder="client@domain.com"
                  />
                </label>
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

              <div className="glass-panel rounded-3xl border border-white/10 p-6 space-y-4">
                <div>
                  <div className="text-sm font-semibold text-white">
                    Mini Sign-Up Box
                  </div>
                  <div className="text-xs text-white/50">
                    Create real users with a temporary password.
                  </div>
                </div>
                <label className="space-y-2">
                  <span className="text-sm text-white/70">Email</span>
                  <input
                    className="input-field w-full"
                    type="email"
                    value={signupForm.email}
                    onChange={(event) =>
                      setSignupForm((prev) => ({
                        ...prev,
                        email: event.target.value,
                      }))
                    }
                    placeholder="client@domain.com"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-white/70">Temp Password</span>
                  <input
                    className="input-field w-full"
                    type="password"
                    value={signupForm.tempPassword}
                    onChange={(event) =>
                      setSignupForm((prev) => ({
                        ...prev,
                        tempPassword: event.target.value,
                      }))
                    }
                    placeholder="Temporary password"
                  />
                </label>
                {signupError ? (
                  <div className="text-neon-pink text-sm">{signupError}</div>
                ) : null}
                {signupSuccess ? (
                  <div className="text-neon-green text-sm space-y-1">
                    <div>Account created successfully.</div>
                    {signupSuccess.user_id ? (
                      <div className="text-xs text-white/60">
                        User ID: {signupSuccess.user_id}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <button
                  className="glow-button w-full"
                  type="button"
                  disabled={signupLoading}
                  onClick={handleSignupSubmit}
                >
                  {signupLoading ? "CREATING..." : "Create Account"}
                </button>
              </div>

              <div className="glass-panel rounded-3xl border border-white/10 p-6 space-y-4">
                <div>
                  <div className="text-sm font-semibold text-white">
                    Tier Picker + Stripe Link
                  </div>
                  <div className="text-xs text-white/50">
                    Generate a Stripe checkout link for a client by email and tier.
                  </div>
                </div>
                <label className="space-y-2">
                  <span className="text-sm text-white/70">
                    Client Email <span className="text-neon-pink">*</span>
                  </span>
                  <input
                    className="input-field w-full"
                    type="email"
                    value={stripeClientEmail}
                    onChange={(e) => setStripeClientEmail(e.target.value)}
                    placeholder="client@domain.com"
                    required
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-white/70">
                    Tier <span className="text-neon-pink">*</span>
                  </span>
                  <select
                    className="input-field w-full"
                    value={stripeTier}
                    onChange={(event) => setStripeTier(event.target.value)}
                  >
                    <option value="pro">Pro</option>
                    <option value="elite">Elite</option>
                    <option value="scale">Scale</option>
                  </select>
                </label>
                {stripeError ? (
                  <div className="text-neon-pink text-sm" role="alert">
                    {stripeError}
                  </div>
                ) : null}
                {stripeLink ? (
                  <div className="rounded-2xl border border-white/10 bg-black/40 p-3 space-y-2">
                    <span className="text-xs uppercase tracking-[0.3em] text-white/40">
                      Checkout URL
                    </span>
                    <div className="flex gap-2">
                      <input
                        readOnly
                        type="url"
                        value={stripeLink}
                        className="input-field flex-1 text-sm font-mono truncate"
                        aria-label="Stripe checkout URL"
                      />
                      <button
                        className="button-primary shrink-0"
                        type="button"
                        onClick={() => handleCopy(stripeLink)}
                      >
                        Copy
                      </button>
                    </div>
                    {copyNotice ? (
                      <div className="text-xs text-neon-green">{copyNotice}</div>
                    ) : null}
                  </div>
                ) : null}
                <button
                  className="glow-button w-full"
                  type="button"
                  disabled={stripeLoading}
                  onClick={handleStripeLink}
                >
                  {stripeLoading ? "GENERATING..." : "Generate Stripe Link"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
