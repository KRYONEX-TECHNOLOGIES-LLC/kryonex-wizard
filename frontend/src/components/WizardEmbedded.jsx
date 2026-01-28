import React from "react";
import { motion } from "framer-motion";
import { adminCreateAccount } from "../lib/api";
import WizardPage from "../pages/WizardPage.jsx";

const isValidEmail = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

export default function WizardEmbedded({ onClientCreated }) {
  const [client, setClient] = React.useState(null);
  const [email, setEmail] = React.useState("");
  const [tempPassword, setTempPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const handleSignUp = async (event) => {
    event?.preventDefault();
    setError("");
    const cleanEmail = email.trim();
    if (!isValidEmail(cleanEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!tempPassword || tempPassword.length < 8) {
      setError("Temp password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const response = await adminCreateAccount({
        email: cleanEmail,
        password: tempPassword,
      });
      const userId = response.data?.user_id;
      if (userId) {
        const newClient = { userId, email: cleanEmail };
        setClient(newClient);
        onClientCreated?.(newClient);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartOver = () => {
    setClient(null);
    setEmail("");
    setTempPassword("");
    setError("");
  };

  if (client) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-xs uppercase tracking-[0.3em] text-white/50">
            Client: {client.email}
          </span>
          <button
            type="button"
            onClick={handleStartOver}
            className="text-xs uppercase tracking-wider text-neon-cyan/80 hover:text-neon-cyan border border-white/10 hover:border-neon-cyan/40 rounded-lg px-2 py-1 transition-colors"
          >
            Create another
          </button>
        </div>
        <div className="flex-1 min-h-[360px] overflow-auto rounded-2xl border border-white/10 bg-black/30">
          <WizardPage
            embeddedMode={{
              targetUserId: client.userId,
              targetEmail: client.email,
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-2xl border border-white/10 bg-black/30 p-6"
    >
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white">
          Create New Client
        </h3>
        <p className="text-xs text-white/50 mt-1">
          Sign the client up with email and a temporary password. Then complete identity and plan selection below.
        </p>
      </div>
      <form onSubmit={handleSignUp} className="space-y-4">
        <label className="block space-y-2">
          <span className="text-sm text-white/70">Email</span>
          <input
            className="input-field w-full"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="client@domain.com"
            autoComplete="email"
          />
        </label>
        <label className="block space-y-2">
          <span className="text-sm text-white/70">Temp Password</span>
          <input
            className="input-field w-full"
            type="password"
            value={tempPassword}
            onChange={(e) => setTempPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
          />
        </label>
        {error ? (
          <div className="text-neon-pink text-sm" role="alert">
            {error}
          </div>
        ) : null}
        <button
          type="submit"
          className="glow-button w-full"
          disabled={loading}
        >
          {loading ? "CREATING ACCOUNT..." : "Create Account & Continue"}
        </button>
      </form>
    </motion.div>
  );
}
