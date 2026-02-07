import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Phone, Calendar, Shield, Clock, Zap, DollarSign } from "lucide-react";
import BackgroundGrid from "../components/BackgroundGrid.jsx";

export default function LandingPage() {
  const navigate = useNavigate();

  const features = [
    { icon: Phone, text: "Answers every call in 0 rings" },
    { icon: Calendar, text: "Books jobs + qualifies leads" },
    { icon: DollarSign, text: "Replaces a $3,000/mo receptionist" },
  ];

  const benefits = [
    { icon: Clock, title: "24/7 Coverage", desc: "Never miss after-hours emergencies" },
    { icon: Zap, title: "Instant Booking", desc: "AI schedules jobs in real-time" },
    { icon: Shield, title: "Fast Setup", desc: "Live in under 10 minutes, not 5 weeks" },
  ];

  return (
    <div style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      <BackgroundGrid />
      
      {/* Hero Section */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.5rem",
          padding: "5rem 1.5rem 3rem",
          textAlign: "center",
          minHeight: "85vh",
        }}
      >
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          style={{ 
            fontSize: "clamp(2rem, 5vw, 3.5rem)", 
            fontWeight: 700,
            maxWidth: "800px",
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
          }}
        >
          Your 24/7 AI Front Desk for HVAC & Plumbing
        </motion.h1>
        
        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.7 }}
          style={{ 
            maxWidth: "600px", 
            color: "#d1d5db", 
            fontSize: "1.2rem",
            lineHeight: 1.6,
          }}
        >
          Never miss a call again. Book jobs instantly. Handle after-hours emergencies automatically.
        </motion.p>

        <motion.ul
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.7 }}
          style={{ 
            listStyle: "none", 
            padding: 0, 
            margin: "1rem 0",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          {features.map((f, i) => (
            <li 
              key={i} 
              style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "0.75rem",
                color: "#e5e7eb",
                fontSize: "1.1rem",
              }}
            >
              <f.icon size={20} style={{ color: "#22d3ee" }} />
              {f.text}
            </li>
          ))}
        </motion.ul>

        <motion.button
          className="glow-button"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.7 }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate("/login")}
          style={{
            padding: "1rem 2.5rem",
            fontSize: "1.1rem",
            fontWeight: 600,
            marginTop: "0.5rem",
          }}
        >
          Get Started — Live in Under 10 Minutes
        </motion.button>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.7 }}
          style={{ color: "#9ca3af", fontSize: "0.95rem", marginTop: "0.5rem" }}
        >
          Already have an account?{" "}
          <span 
            onClick={() => navigate("/login")} 
            style={{ color: "#22d3ee", cursor: "pointer", textDecoration: "underline" }}
          >
            Sign In
          </span>
        </motion.p>
      </div>

      {/* Benefits Section */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 0.7 }}
        style={{
          position: "relative",
          zIndex: 1,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "1.5rem",
          padding: "2rem 1.5rem 4rem",
          maxWidth: "1000px",
          margin: "0 auto",
        }}
      >
        {benefits.map((b, i) => (
          <div
            key={i}
            className="glass"
            style={{
              padding: "1.5rem",
              textAlign: "center",
              borderRadius: "12px",
            }}
          >
            <b.icon size={32} style={{ color: "#22d3ee", marginBottom: "0.75rem" }} />
            <h3 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              {b.title}
            </h3>
            <p style={{ color: "#9ca3af", fontSize: "0.95rem" }}>{b.desc}</p>
          </div>
        ))}
      </motion.div>

      {/* Social Proof */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.7 }}
        style={{
          position: "relative",
          zIndex: 1,
          textAlign: "center",
          padding: "2rem 1.5rem 4rem",
        }}
      >
        <p style={{ color: "#6b7280", fontSize: "0.9rem", letterSpacing: "0.1rem" }}>
          BUILT FOR HVAC & PLUMBING CONTRACTORS
        </p>
      </motion.div>
    </div>
  );
}
