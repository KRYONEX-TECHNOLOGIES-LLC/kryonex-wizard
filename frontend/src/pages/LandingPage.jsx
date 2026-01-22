import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import BackgroundGrid from "../components/BackgroundGrid.jsx";
import TerminalTyping from "../components/TerminalTyping.jsx";

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      <BackgroundGrid />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "2rem",
          padding: "6rem 2rem",
          textAlign: "center",
        }}
      >
        <TerminalTyping text="AI INFRASTRUCTURE FOR TRADES." />
        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          style={{ maxWidth: "640px", color: "#9ca3af" }}
        >
          Kryonex orchestrates AI agents, lead intake, and customer messaging for
          modern HVAC and Plumbing teams.
        </motion.p>
        <motion.button
          className="button-primary"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate("/login")}
        >
          INITIALIZE SYSTEM
        </motion.button>
      </div>
    </div>
  );
}
