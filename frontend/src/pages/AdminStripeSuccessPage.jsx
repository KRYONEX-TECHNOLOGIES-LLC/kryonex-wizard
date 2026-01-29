import React from "react";
import { useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import BackgroundGrid from "../components/BackgroundGrid.jsx";

/**
 * Public page used as success_url for admin embedded Stripe flow.
 * Client lands here after paying. No auth required.
 * Sets localStorage flag for admin embedded wizard (admin polls API instead; this is for edge cases).
 */
export default function AdminStripeSuccessPage() {
  const [searchParams] = useSearchParams();
  const userId = searchParams.get("user_id") || "";
  const canceled = searchParams.get("checkout") === "canceled";

  React.useEffect(() => {
    if (userId && !canceled && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          `kryonex_admin_stripe_paid_${userId}`,
          "true"
        );
      } catch {
        /* ignore */
      }
    }
  }, [userId, canceled]);

  if (canceled) {
    return (
      <div style={{ minHeight: "100vh", position: "relative" }}>
        <BackgroundGrid />
        <div
          style={{
            position: "relative",
            zIndex: 1,
            maxWidth: "480px",
            margin: "0 auto",
            padding: "4rem 1.5rem",
            textAlign: "center",
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="glass-panel rounded-3xl p-8 border border-white/10"
          >
            <div className="text-4xl mb-4 text-white/40">Cancelled</div>
            <h1 className="text-xl font-semibold text-white tracking-tight">
              Payment canceled
            </h1>
            <p className="mt-3 text-white/60">
              No charges were made. You can try again when you're ready.
            </p>
            <Link
              to="/login"
              className="inline-block mt-6 px-6 py-3 rounded-xl border border-white/20 hover:border-neon-cyan/50 hover:bg-white/5 text-white/90 transition-colors"
            >
              Go to Sign In
            </Link>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      <BackgroundGrid />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: "480px",
          margin: "0 auto",
          padding: "4rem 1.5rem",
          textAlign: "center",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="glass-panel rounded-3xl p-8 border border-white/10"
        >
          <div
            className="text-5xl mb-4"
            style={{ color: "var(--color-neon-green, #22c55e)" }}
          >
            ✓
          </div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">
            Payment successful
          </h1>
          <p className="mt-3 text-white/60">
            You're all set. Log in when you're ready to use your account.
          </p>
          <p className="mt-4 text-sm text-white/50">
            If you're an admin, you can now complete deployment in the Admin
            Client Wizard.
          </p>
          <Link
            to="/login"
            className="inline-block mt-6 px-6 py-3 rounded-xl border border-white/20 hover:border-neon-cyan/50 hover:bg-white/5 text-white/90 transition-colors"
          >
            Go to Sign In
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
