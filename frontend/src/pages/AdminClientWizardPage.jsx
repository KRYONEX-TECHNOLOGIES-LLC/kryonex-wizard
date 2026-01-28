import React from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import WizardEmbedded from "../components/WizardEmbedded.jsx";
import { adminGenerateStripeLink } from "../lib/api";

const isValidEmail = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

export default function AdminClientWizardPage() {
  const navigate = useNavigate();
  const [stripeClientEmail, setStripeClientEmail] = React.useState("");
  const [stripeTier, setStripeTier] = React.useState("pro");
  const [stripeLoading, setStripeLoading] = React.useState(false);
  const [stripeError, setStripeError] = React.useState("");
  const [stripeLink, setStripeLink] = React.useState("");
  const [stripeSuccess, setStripeSuccess] = React.useState(false);
  const [copyNotice, setCopyNotice] = React.useState("");

  const handleClientCreated = React.useCallback((client) => {
    if (client?.email) {
      setStripeClientEmail(client.email);
    }
  }, []);

  const handleStripeLink = async () => {
    setStripeError("");
    setStripeLink("");
    setStripeSuccess(false);
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
      setStripeSuccess(true);
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
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-h-[540px] flex flex-col lg:min-h-[calc(100vh-10rem)]">
                <WizardEmbedded onClientCreated={handleClientCreated} />
              </div>

              <div className="glass-panel rounded-3xl border border-white/10 p-6 space-y-4 shrink-0">
                <div>
                  <div className="text-sm font-semibold text-white">
                    Tier Picker + Stripe Link
                  </div>
                  <div className="text-xs text-white/50">
                    Generate a Stripe checkout link for the client you just created (or any user by email).
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
                {stripeSuccess && stripeLink ? (
                  <div className="rounded-2xl border border-neon-green/30 bg-neon-green/5 p-3 space-y-2">
                    <div className="text-xs uppercase tracking-[0.3em] text-neon-green">
                      Stripe link generated successfully.
                    </div>
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
                ) : stripeLink ? (
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
