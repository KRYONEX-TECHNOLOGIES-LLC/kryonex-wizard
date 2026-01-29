import React from "react";
import { useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import BackgroundGrid from "../components/BackgroundGrid.jsx";

/**
 * Public thank-you page used as success_url / cancel_url for admin embedded Stripe flow.
 * Client lands here after paying (or canceling). No auth required.
 */
export default function ThankYouPage() {
  const [searchParams] = useSearchParams();
  const canceled = searchParams.get("checkout") === "canceled";
  const success = searchParams.get("checkout") === "success";

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
          {success && (
            <>
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
              <Link
                to="/login"
                className="inline-block mt-6 px-6 py-3 rounded-xl border border-white/20 hover:border-neon-cyan/50 hover:bg-white/5 text-white/90 transition-colors"
              >
                Go to Sign In
              </Link>
            </>
          )}
          {canceled && (
            <>
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
            </>
          )}
          {!success && !canceled && (
            <>
              <h1 className="text-xl font-semibold text-white tracking-tight">
                Thank you
              </h1>
              <p className="mt-3 text-white/60">
                <Link to="/login" className="text-neon-cyan hover:underline">
                  Sign in
                </Link>{" "}
                to access your account.
              </p>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
