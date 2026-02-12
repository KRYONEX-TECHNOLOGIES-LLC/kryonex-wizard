import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  Phone, Calendar, Shield, Clock, Zap, DollarSign, 
  Check, Star, Users, TrendingUp, Gift, ChevronDown,
  PlayCircle, ArrowRight, Headphones, MessageSquare
} from "lucide-react";
import BackgroundGrid from "../components/BackgroundGrid.jsx";

const PLAN_TIERS = [
  {
    id: "pro",
    title: "PRO",
    subtitle: "Launch & Capture",
    price: "$249",
    period: "/mo",
    minutes: 300,
    texts: 1000,
    features: [
      "300 AI Minutes",
      "1,000 Text Messages",
      "24/7 Call Answering",
      "Instant Job Booking",
      "Lead Qualification",
      "Email Notifications",
    ],
    cta: "Start with PRO",
    popular: false,
    accent: "cyan",
  },
  {
    id: "elite",
    title: "ELITE",
    subtitle: "Momentum & Growth",
    price: "$497",
    period: "/mo",
    minutes: 800,
    texts: 3000,
    features: [
      "800 AI Minutes",
      "3,000 Text Messages",
      "Everything in PRO",
      "Priority Processing",
      "Advanced Analytics",
      "Multi-Tech Routing",
    ],
    cta: "Go ELITE",
    popular: true,
    accent: "purple",
  },
  {
    id: "scale",
    title: "SCALE",
    subtitle: "Dominance & Empire",
    price: "$997",
    period: "/mo",
    minutes: 3000,
    texts: 5000,
    features: [
      "3,000 AI Minutes",
      "5,000 Text Messages",
      "Everything in ELITE",
      "Unlimited Locations",
      "Enterprise Support",
      "Custom Integrations",
    ],
    cta: "Scale Up",
    popular: false,
    accent: "green",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Sign Up in 2 Minutes",
    desc: "Enter your business info and choose your plan.",
    icon: Zap,
  },
  {
    step: "02", 
    title: "Get Your AI Number",
    desc: "We provision a local number that forwards to your AI receptionist.",
    icon: Phone,
  },
  {
    step: "03",
    title: "Never Miss a Call Again",
    desc: "AI answers 24/7, books jobs, and texts you every lead.",
    icon: Calendar,
  },
];

const TESTIMONIALS = [
  {
    name: "Marcus T.",
    location: "Houston, TX",
    business: "HVAC",
    quote: "I was losing 3-4 calls a week to voicemail. First month with Kryonex, my after-hours bookings went up 40%. The AI even handled a 2am emergency call and booked the job. That one call paid for 6 months of service.",
    rating: 5,
  },
  {
    name: "Jennifer R.",
    location: "Phoenix, AZ",
    business: "Plumbing",
    quote: "My receptionist quit with no notice. I was panicking. Set up Kryonex in literally 8 minutes and didn't miss a single call. It's been 4 months and I haven't bothered hiring a replacement. Why would I?",
    rating: 5,
  },
  {
    name: "David K.",
    location: "Atlanta, GA",
    business: "HVAC",
    quote: "Skeptical at first — thought AI would sound robotic and turn customers off. Ran it for a week as a test. Not one complaint. Actually got a review saying we have 'great customer service.' The AI did that.",
    rating: 5,
  },
  {
    name: "Mike S.",
    location: "Tampa, FL",
    business: "Plumbing",
    quote: "Running 3 trucks now. Before Kryonex, I was the answering service. Phone ringing while I'm on a job, customers getting frustrated. Now I just get a text with the details. Game changer for scaling.",
    rating: 5,
  },
];

const FAQS = [
  {
    q: "How fast can I get started?",
    a: "Most businesses are live in under 10 minutes. Complete the wizard, connect your calendar, and your AI is answering calls immediately.",
  },
  {
    q: "What happens if I run out of minutes?",
    a: "You can top-up anytime or upgrade your plan. We'll notify you at 80% usage so you're never caught off guard.",
  },
  {
    q: "Can I keep my existing phone number?",
    a: "Yes! You can forward your current number to your new AI line, or use the AI number directly on your ads and website.",
  },
  {
    q: "What if the AI can't handle a call?",
    a: "For complex situations, the AI collects info and texts you immediately. You can call back when ready — no lead lost.",
  },
  {
    q: "Is there a contract or commitment?",
    a: "No contracts. Cancel anytime. We believe in earning your business every month.",
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = React.useState(null);
  
  // Demo call state
  const [demoPhone, setDemoPhone] = React.useState("");
  const [demoName, setDemoName] = React.useState("");
  const [demoHoneypot, setDemoHoneypot] = React.useState(""); // Bot trap
  const [demoLoading, setDemoLoading] = React.useState(false);
  const [demoStatus, setDemoStatus] = React.useState(null); // 'success' | 'error' | null
  const [demoMessage, setDemoMessage] = React.useState("");

  const formatPhoneInput = (value) => {
    // Strip everything except digits
    let digits = value.replace(/\D/g, "");
    // If they typed +1 or 1 at the start, remove it (we'll add it back)
    if (digits.startsWith("1") && digits.length > 10) {
      digits = digits.slice(1);
    }
    if (digits.length === 0) return "+1 ";
    if (digits.length <= 3) return `+1 (${digits}`;
    if (digits.length <= 6) return `+1 (${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  const handleDemoCall = async () => {
    if (demoLoading) return;
    
    const digits = demoPhone.replace(/\D/g, "");
    // Account for the "1" country code if present
    const cleanDigits = digits.startsWith("1") && digits.length === 11 ? digits.slice(1) : digits;
    if (cleanDigits.length < 10) {
      setDemoStatus("error");
      setDemoMessage("Please enter a valid 10-digit phone number");
      return;
    }
    
    setDemoLoading(true);
    setDemoStatus(null);
    setDemoMessage("");
    
    try {
      const apiBase = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const response = await fetch(`${apiBase}/public/demo-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: demoPhone,
          name: demoName || undefined,
          website: demoHoneypot, // Honeypot - should be empty
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to initiate call");
      }
      
      setDemoStatus("success");
      setDemoMessage("Call incoming! Answer your phone in the next 30 seconds.");
      setDemoPhone("");
      setDemoName("");
    } catch (err) {
      setDemoStatus("error");
      setDemoMessage(err.message || "Something went wrong. Please try again.");
    } finally {
      setDemoLoading(false);
    }
  };

  const scrollToPricing = () => {
    document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div style={{ minHeight: "100vh", position: "relative", overflow: "hidden", background: "#030712" }}>
      <BackgroundGrid />
      
      {/* Floating Nav */}
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          padding: "1rem 1.5rem",
          background: "rgba(3, 7, 18, 0.8)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{ 
            width: "32px", 
            height: "32px", 
            borderRadius: "8px", 
            background: "linear-gradient(135deg, #22d3ee, #8b5cf6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <Headphones size={18} color="#fff" />
          </div>
          <span style={{ fontWeight: 700, fontSize: "1.1rem", letterSpacing: "-0.02em" }}>KRYONEX</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <button
            onClick={scrollToPricing}
            style={{
              background: "transparent",
              border: "none",
              color: "#9ca3af",
              cursor: "pointer",
              fontSize: "0.9rem",
              padding: "0.5rem 0.75rem",
            }}
          >
            Pricing
          </button>
          <button
            onClick={() => navigate("/affiliate/signup")}
            style={{
              background: "transparent",
              border: "1px solid rgba(34, 211, 238, 0.3)",
              color: "#22d3ee",
              cursor: "pointer",
              fontSize: "0.85rem",
              padding: "0.5rem 1rem",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <Gift size={14} />
            Become a Partner
          </button>
          <button
            onClick={() => navigate("/login")}
            style={{
              background: "rgba(34, 211, 238, 0.15)",
              border: "1px solid rgba(34, 211, 238, 0.4)",
              color: "#22d3ee",
              cursor: "pointer",
              fontSize: "0.9rem",
              padding: "0.5rem 1.25rem",
              borderRadius: "8px",
              fontWeight: 500,
            }}
          >
            Sign In
          </button>
        </div>
      </nav>

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
          padding: "8rem 1.5rem 4rem",
          textAlign: "center",
          minHeight: "90vh",
        }}
      >
        {/* Trust Badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            background: "rgba(34, 211, 238, 0.1)",
            border: "1px solid rgba(34, 211, 238, 0.2)",
            borderRadius: "999px",
            padding: "0.4rem 1rem",
            fontSize: "0.85rem",
            color: "#22d3ee",
          }}
        >
          <Star size={14} fill="#22d3ee" />
          Trusted by 100+ HVAC & Plumbing Contractors
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          style={{ 
            fontSize: "clamp(2.2rem, 6vw, 4rem)", 
            fontWeight: 800,
            maxWidth: "900px",
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
            background: "linear-gradient(135deg, #fff 0%, #d1d5db 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Your 24/7 AI Front Desk for HVAC & Plumbing
        </motion.h1>
        
        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.7 }}
          style={{ 
            maxWidth: "600px", 
            color: "#9ca3af", 
            fontSize: "1.25rem",
            lineHeight: 1.6,
          }}
        >
          Never miss a call again. Book jobs instantly. Handle after-hours emergencies automatically.
        </motion.p>

        {/* Value Props */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.7 }}
          style={{ 
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "1.5rem",
            margin: "1rem 0",
          }}
        >
          {[
            { icon: Phone, text: "Answers in 0 rings" },
            { icon: Calendar, text: "Books jobs 24/7" },
            { icon: DollarSign, text: "Replaces $3K/mo receptionist" },
          ].map((f, i) => (
            <div
              key={i}
              style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "0.6rem",
                color: "#e5e7eb",
                fontSize: "1rem",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "12px",
                padding: "0.75rem 1.25rem",
              }}
            >
              <f.icon size={18} style={{ color: "#22d3ee" }} />
              {f.text}
            </div>
          ))}
        </motion.div>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.7 }}
          style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center", marginTop: "0.5rem" }}
        >
          <button
            className="glow-button"
            onClick={() => navigate("/login")}
            style={{
              padding: "1rem 2.5rem",
              fontSize: "1.1rem",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            Get Started — Live in Under 10 Minutes
            <ArrowRight size={18} />
          </button>
          <button
            onClick={scrollToPricing}
            style={{
              padding: "1rem 2rem",
              fontSize: "1rem",
              fontWeight: 500,
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: "14px",
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            View Pricing
            <ChevronDown size={16} />
          </button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.7 }}
          style={{ color: "#6b7280", fontSize: "0.9rem", marginTop: "0.5rem" }}
        >
          Setup takes under 10 minutes • Cancel anytime
        </motion.p>
      </div>

      {/* Benefits Strip */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        style={{
          position: "relative",
          zIndex: 1,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "1.5rem",
          padding: "3rem 1.5rem",
          maxWidth: "1100px",
          margin: "0 auto",
        }}
      >
        {[
          { icon: Clock, title: "24/7 Coverage", desc: "Never miss after-hours emergencies or weekend calls" },
          { icon: Zap, title: "Instant Booking", desc: "AI schedules jobs directly into your calendar" },
          { icon: Shield, title: "10-Min Setup", desc: "Live in minutes, not weeks. No tech skills needed" },
        ].map((b, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.08)",
              padding: "2rem",
              textAlign: "center",
              borderRadius: "16px",
            }}
          >
            <div style={{ 
              width: "56px", 
              height: "56px", 
              borderRadius: "14px",
              background: "rgba(34, 211, 238, 0.1)",
              border: "1px solid rgba(34, 211, 238, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1rem",
            }}>
              <b.icon size={26} style={{ color: "#22d3ee" }} />
            </div>
            <h3 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              {b.title}
            </h3>
            <p style={{ color: "#9ca3af", fontSize: "0.95rem", lineHeight: 1.5 }}>{b.desc}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* How It Works */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          padding: "4rem 1.5rem",
          maxWidth: "1000px",
          margin: "0 auto",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          style={{ textAlign: "center", marginBottom: "3rem" }}
        >
          <h2 style={{ fontSize: "2.2rem", fontWeight: 700, marginBottom: "0.75rem" }}>
            Live in 3 Simple Steps
          </h2>
          <p style={{ color: "#9ca3af", fontSize: "1.1rem" }}>
            No technical skills required. No long onboarding calls.
          </p>
        </motion.div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "2rem" }}>
          {HOW_IT_WORKS.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
              style={{
                position: "relative",
                padding: "2rem",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "16px",
              }}
            >
              <div style={{
                position: "absolute",
                top: "-12px",
                left: "20px",
                background: "#22d3ee",
                color: "#000",
                fontWeight: 700,
                fontSize: "0.75rem",
                padding: "0.25rem 0.75rem",
                borderRadius: "6px",
              }}>
                STEP {step.step}
              </div>
              <step.icon size={32} style={{ color: "#22d3ee", marginBottom: "1rem", marginTop: "0.5rem" }} />
              <h3 style={{ fontSize: "1.15rem", fontWeight: 600, marginBottom: "0.5rem" }}>{step.title}</h3>
              <p style={{ color: "#9ca3af", fontSize: "0.95rem", lineHeight: 1.5 }}>{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* See It In Action Section */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          padding: "4rem 1.5rem",
          background: "linear-gradient(180deg, transparent 0%, rgba(139, 92, 246, 0.03) 50%, transparent 100%)",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          style={{ textAlign: "center", marginBottom: "3rem" }}
        >
          <h2 style={{ fontSize: "2.2rem", fontWeight: 700, marginBottom: "0.75rem" }}>
            See How It Works
          </h2>
          <p style={{ color: "#9ca3af", fontSize: "1.1rem" }}>
            Your AI receptionist handles everything while you're on the job
          </p>
        </motion.div>

        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          {/* Call Flow Visualization */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "1rem",
              marginBottom: "2rem",
            }}
          >
            {[
              { 
                icon: Phone, 
                label: "Customer Calls", 
                detail: "Your AI line rings",
                color: "#22d3ee"
              },
              { 
                icon: Headphones, 
                label: "AI Answers Instantly", 
                detail: "0 rings, 24/7",
                color: "#8b5cf6"
              },
              { 
                icon: MessageSquare, 
                label: "Collects Info", 
                detail: "Name, issue, address",
                color: "#22d3ee"
              },
              { 
                icon: Calendar, 
                label: "Books the Job", 
                detail: "Syncs to your calendar",
                color: "#8b5cf6"
              },
              { 
                icon: Zap, 
                label: "Texts You", 
                detail: "Instant lead alert",
                color: "#22c55e"
              },
            ].map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "12px",
                  padding: "1.5rem 1rem",
                  textAlign: "center",
                  position: "relative",
                }}
              >
                {i < 4 && (
                  <div style={{
                    position: "absolute",
                    right: "-8px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#4b5563",
                    fontSize: "1.2rem",
                    display: window.innerWidth < 600 ? "none" : "block",
                  }}>
                    →
                  </div>
                )}
                <div style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "12px",
                  background: `${step.color}15`,
                  border: `1px solid ${step.color}30`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 0.75rem",
                }}>
                  <step.icon size={22} style={{ color: step.color }} />
                </div>
                <div style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.25rem" }}>
                  {step.label}
                </div>
                <div style={{ color: "#6b7280", fontSize: "0.8rem" }}>
                  {step.detail}
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Sample Text Notification */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            style={{
              maxWidth: "400px",
              margin: "2rem auto 0",
              background: "rgba(34, 211, 238, 0.05)",
              border: "1px solid rgba(34, 211, 238, 0.2)",
              borderRadius: "16px",
              padding: "1.5rem",
            }}
          >
            <div style={{ 
              fontSize: "0.7rem", 
              color: "#6b7280", 
              textTransform: "uppercase", 
              letterSpacing: "0.1em",
              marginBottom: "0.75rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}>
              <MessageSquare size={12} />
              Sample Text You'd Receive
            </div>
            <div style={{
              background: "#1a1a2e",
              borderRadius: "12px",
              padding: "1rem",
              fontFamily: "monospace",
              fontSize: "0.85rem",
              lineHeight: 1.6,
              color: "#e5e7eb",
            }}>
              <div style={{ color: "#22d3ee", fontWeight: 600, marginBottom: "0.5rem" }}>🔔 New Lead</div>
              <div><strong>Name:</strong> Sarah Mitchell</div>
              <div><strong>Phone:</strong> (555) 123-4567</div>
              <div><strong>Issue:</strong> AC not cooling, needs service today</div>
              <div><strong>Address:</strong> 1423 Oak Street</div>
              <div style={{ marginTop: "0.5rem", color: "#22c55e" }}>✓ Appointment booked for 2:00 PM</div>
            </div>
          </motion.div>

          {/* TRY IT NOW - Demo Call Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            style={{
              maxWidth: "500px",
              margin: "3rem auto 0",
              background: "linear-gradient(135deg, rgba(34, 211, 238, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%)",
              border: "1px solid rgba(34, 211, 238, 0.25)",
              borderRadius: "20px",
              padding: "2rem",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Glow effect */}
            <div style={{
              position: "absolute",
              top: "-50%",
              left: "-50%",
              width: "200%",
              height: "200%",
              background: "radial-gradient(circle, rgba(34, 211, 238, 0.1) 0%, transparent 70%)",
              pointerEvents: "none",
            }} />
            
            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
                <div style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #22d3ee 0%, #8b5cf6 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  animation: "pulse 2s infinite",
                  margin: "0 auto 1rem",
                }}>
                  <Phone size={26} color="#fff" />
                </div>
                <h3 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 0.5rem 0" }}>
                  🎧 Hear Your AI Receptionist Live
                </h3>
                <p style={{ color: "#22d3ee", fontSize: "1rem", margin: "0 0 0.5rem 0", fontWeight: 500 }}>
                  Experience exactly what your customers will hear
                </p>
                <p style={{ color: "#9ca3af", fontSize: "0.9rem", margin: 0, lineHeight: 1.5 }}>
                  Enter your number and our AI will call you in 30 seconds. 
                  <br />Try booking a fake appointment — see how smooth it handles everything.
                </p>
              </div>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {/* Name field (optional) */}
                <input
                  type="text"
                  placeholder="Your name (optional)"
                  value={demoName}
                  onChange={(e) => setDemoName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.9rem 1rem",
                    borderRadius: "12px",
                    border: "1px solid rgba(255,255,255,0.15)",
                    background: "rgba(0,0,0,0.4)",
                    color: "#fff",
                    fontSize: "1rem",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                
                {/* Phone field (required) */}
                <input
                  type="tel"
                  placeholder="+1 (555) 123-4567"
                  value={demoPhone || "+1 "}
                  onChange={(e) => setDemoPhone(formatPhoneInput(e.target.value))}
                  onFocus={(e) => { if (!demoPhone) setDemoPhone("+1 "); }}
                  style={{
                    width: "100%",
                    padding: "0.9rem 1rem",
                    borderRadius: "12px",
                    border: "1px solid rgba(34, 211, 238, 0.4)",
                    background: "rgba(0,0,0,0.4)",
                    color: "#fff",
                    fontSize: "1.1rem",
                    fontWeight: 500,
                    outline: "none",
                    boxSizing: "border-box",
                    letterSpacing: "0.02em",
                  }}
                />
                
                {/* Honeypot field - hidden from users, catches bots */}
                <input
                  type="text"
                  name="website"
                  value={demoHoneypot}
                  onChange={(e) => setDemoHoneypot(e.target.value)}
                  style={{ 
                    position: "absolute", 
                    left: "-9999px", 
                    opacity: 0, 
                    pointerEvents: "none" 
                  }}
                  tabIndex={-1}
                  autoComplete="off"
                />
                
                {/* Submit button */}
                <button
                  onClick={handleDemoCall}
                  disabled={demoLoading || demoStatus === "success"}
                  style={{
                    width: "100%",
                    padding: "1rem",
                    borderRadius: "12px",
                    border: "none",
                    background: demoStatus === "success" 
                      ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                      : "linear-gradient(135deg, #22d3ee 0%, #8b5cf6 100%)",
                    color: "#fff",
                    fontSize: "1.1rem",
                    fontWeight: 600,
                    cursor: demoLoading || demoStatus === "success" ? "default" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                    opacity: demoLoading ? 0.7 : 1,
                    transition: "all 0.2s ease",
                  }}
                >
                  {demoLoading ? (
                    <>
                      <div style={{
                        width: "20px",
                        height: "20px",
                        border: "2px solid rgba(255,255,255,0.3)",
                        borderTopColor: "#fff",
                        borderRadius: "50%",
                        animation: "spin 1s linear infinite",
                      }} />
                      Calling...
                    </>
                  ) : demoStatus === "success" ? (
                    <>
                      <Check size={20} />
                      Check Your Phone!
                    </>
                  ) : (
                    <>
                      <Phone size={20} />
                      Ring My Phone 📞
                    </>
                  )}
                </button>
                
                {/* Status message */}
                {demoMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      padding: "0.75rem 1rem",
                      borderRadius: "10px",
                      background: demoStatus === "success" 
                        ? "rgba(16, 185, 129, 0.15)"
                        : "rgba(239, 68, 68, 0.15)",
                      border: `1px solid ${demoStatus === "success" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                      color: demoStatus === "success" ? "#10b981" : "#ef4444",
                      fontSize: "0.9rem",
                      textAlign: "center",
                    }}
                  >
                    {demoMessage}
                  </motion.div>
                )}
              </div>
              
              <p style={{ 
                color: "#6b7280", 
                fontSize: "0.8rem", 
                textAlign: "center", 
                marginTop: "1rem",
                lineHeight: 1.5,
              }}>
                💡 <span style={{ color: "#9ca3af" }}>Pro tip:</span> Pretend you're a customer with an emergency 
                <br />or try to book a service call.
              </p>
            </div>
          </motion.div>

          {/* Keyframe animations */}
          <style>{`
            @keyframes pulse {
              0%, 100% { box-shadow: 0 0 0 0 rgba(34, 211, 238, 0.4); }
              50% { box-shadow: 0 0 0 12px rgba(34, 211, 238, 0); }
            }
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>

      {/* Testimonials Section */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          padding: "4rem 1.5rem",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          style={{ textAlign: "center", marginBottom: "3rem" }}
        >
          <h2 style={{ fontSize: "2.2rem", fontWeight: 700, marginBottom: "0.75rem" }}>
            What Contractors Are Saying
          </h2>
          <p style={{ color: "#9ca3af", fontSize: "1.1rem" }}>
            Real results from real HVAC and plumbing businesses
          </p>
        </motion.div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "1.5rem",
            maxWidth: "1100px",
            margin: "0 auto",
          }}
        >
          {TESTIMONIALS.map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "16px",
                padding: "1.5rem",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Stars */}
              <div style={{ display: "flex", gap: "0.25rem", marginBottom: "1rem" }}>
                {[...Array(t.rating)].map((_, si) => (
                  <Star key={si} size={16} fill="#fbbf24" color="#fbbf24" />
                ))}
              </div>
              
              {/* Quote */}
              <p style={{ 
                color: "#d1d5db", 
                fontSize: "0.95rem", 
                lineHeight: 1.6,
                flex: 1,
                marginBottom: "1.5rem",
              }}>
                "{t.quote}"
              </p>
              
              {/* Author */}
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "0.75rem",
                borderTop: "1px solid rgba(255,255,255,0.05)",
                paddingTop: "1rem",
              }}>
                <div style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: t.business === "HVAC" 
                    ? "linear-gradient(135deg, #22d3ee 0%, #0891b2 100%)"
                    : "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                }}>
                  {t.name.charAt(0)}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{t.name}</div>
                  <div style={{ color: "#6b7280", fontSize: "0.8rem" }}>
                    {t.business} • {t.location}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Pricing Section */}
      <div
        id="pricing"
        style={{
          position: "relative",
          zIndex: 1,
          padding: "5rem 1.5rem",
          background: "linear-gradient(180deg, transparent 0%, rgba(34, 211, 238, 0.02) 50%, transparent 100%)",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          style={{ textAlign: "center", marginBottom: "3rem" }}
        >
          <h2 style={{ fontSize: "2.5rem", fontWeight: 700, marginBottom: "0.75rem" }}>
            Simple, Transparent Pricing
          </h2>
          <p style={{ color: "#9ca3af", fontSize: "1.1rem", maxWidth: "600px", margin: "0 auto" }}>
            No hidden fees. No contracts. Cancel anytime. Choose the plan that fits your call volume.
          </p>
        </motion.div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "1.5rem",
            maxWidth: "1100px",
            margin: "0 auto",
          }}
        >
          {PLAN_TIERS.map((tier, i) => {
            const accentColor = tier.accent === "purple" ? "#8b5cf6" : tier.accent === "green" ? "#22c55e" : "#22d3ee";
            return (
              <motion.div
                key={tier.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                style={{
                  position: "relative",
                  background: tier.popular 
                    ? "linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(34, 211, 238, 0.05) 100%)"
                    : "rgba(255,255,255,0.02)",
                  border: `1px solid ${tier.popular ? "rgba(139, 92, 246, 0.4)" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: "20px",
                  padding: "2rem",
                  display: "flex",
                  flexDirection: "column",
                  transform: tier.popular ? "scale(1.02)" : "none",
                }}
              >
                {tier.popular && (
                  <div style={{
                    position: "absolute",
                    top: "-14px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "linear-gradient(135deg, #8b5cf6 0%, #22d3ee 100%)",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: "0.7rem",
                    padding: "0.4rem 1rem",
                    borderRadius: "999px",
                    letterSpacing: "0.1em",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                  }}>
                    <Star size={12} fill="#fff" />
                    MOST POPULAR
                  </div>
                )}

                <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
                  <h3 style={{ 
                    fontSize: "1.5rem", 
                    fontWeight: 700, 
                    color: accentColor,
                    letterSpacing: "0.05em",
                  }}>
                    {tier.title}
                  </h3>
                  <p style={{ color: "#9ca3af", fontSize: "0.9rem", marginTop: "0.25rem" }}>
                    {tier.subtitle}
                  </p>
                </div>

                <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
                  <span style={{ fontSize: "3rem", fontWeight: 800, color: "#fff" }}>{tier.price}</span>
                  <span style={{ color: "#6b7280", fontSize: "1.1rem" }}>{tier.period}</span>
                </div>

                <div style={{ 
                  display: "flex", 
                  justifyContent: "center", 
                  gap: "1rem", 
                  marginBottom: "1.5rem",
                  padding: "0.75rem",
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: "10px",
                }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#fff" }}>{tier.minutes.toLocaleString()}</div>
                    <div style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase" }}>Minutes</div>
                  </div>
                  <div style={{ width: "1px", background: "rgba(255,255,255,0.1)" }} />
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#fff" }}>{tier.texts.toLocaleString()}</div>
                    <div style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase" }}>Texts</div>
                  </div>
                </div>

                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.5rem", flex: 1 }}>
                  {tier.features.map((feature, fi) => (
                    <li 
                      key={fi}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        padding: "0.6rem 0",
                        borderBottom: fi < tier.features.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                        color: "#d1d5db",
                        fontSize: "0.95rem",
                      }}
                    >
                      <Check size={16} style={{ color: accentColor, flexShrink: 0 }} />
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => navigate("/login")}
                  style={{
                    width: "100%",
                    padding: "1rem",
                    fontSize: "1rem",
                    fontWeight: 600,
                    borderRadius: "12px",
                    cursor: "pointer",
                    border: tier.popular ? "none" : `1px solid ${accentColor}40`,
                    background: tier.popular 
                      ? `linear-gradient(135deg, ${accentColor} 0%, #22d3ee 100%)`
                      : "transparent",
                    color: tier.popular ? "#000" : accentColor,
                    transition: "all 0.2s ease",
                  }}
                  onMouseOver={(e) => {
                    if (!tier.popular) {
                      e.target.style.background = `${accentColor}20`;
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!tier.popular) {
                      e.target.style.background = "transparent";
                    }
                  }}
                >
                  {tier.cta}
                </button>
              </motion.div>
            );
          })}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          style={{ textAlign: "center", color: "#6b7280", fontSize: "0.9rem", marginTop: "2rem" }}
        >
          All plans include: No contracts • Cancel anytime • 24/7 support • Free setup
        </motion.p>
      </div>

      {/* FAQ Section */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          padding: "4rem 1.5rem",
          maxWidth: "800px",
          margin: "0 auto",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          style={{ textAlign: "center", marginBottom: "3rem" }}
        >
          <h2 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "0.75rem" }}>
            Frequently Asked Questions
          </h2>
        </motion.div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {FAQS.map((faq, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "12px",
                overflow: "hidden",
              }}
            >
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{
                  width: "100%",
                  padding: "1.25rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "transparent",
                  border: "none",
                  color: "#fff",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                {faq.q}
                <ChevronDown 
                  size={18} 
                  style={{ 
                    color: "#6b7280",
                    transform: openFaq === i ? "rotate(180deg)" : "rotate(0)",
                    transition: "transform 0.2s ease",
                  }} 
                />
              </button>
              {openFaq === i && (
                <div style={{ padding: "0 1.25rem 1.25rem", color: "#9ca3af", lineHeight: 1.6 }}>
                  {faq.a}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Customer Referral Section */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          padding: "4rem 1.5rem 2rem",
          maxWidth: "1000px",
          margin: "0 auto",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          style={{
            background: "linear-gradient(135deg, rgba(34, 211, 238, 0.08) 0%, rgba(34, 197, 94, 0.08) 100%)",
            border: "1px solid rgba(34, 211, 238, 0.25)",
            borderRadius: "24px",
            padding: "3rem 2rem",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              background: "rgba(34, 197, 94, 0.15)",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              borderRadius: "999px",
              padding: "0.4rem 1rem",
              fontSize: "0.8rem",
              color: "#22c55e",
              fontWeight: 600,
              marginBottom: "1rem",
            }}>
              <DollarSign size={14} />
              REFERRAL BONUS
            </div>
            <h2 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "0.75rem" }}>
              Refer a Contractor, Get Paid
            </h2>
            <p style={{ color: "#9ca3af", fontSize: "1.1rem", maxWidth: "600px", margin: "0 auto" }}>
              Know another HVAC or plumbing business owner? Send them our way.
            </p>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: "1.5rem",
            marginBottom: "2rem",
          }}>
            {/* You Get */}
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "16px",
              padding: "1.5rem",
              textAlign: "center",
            }}>
              <div style={{
                width: "56px",
                height: "56px",
                borderRadius: "14px",
                background: "rgba(34, 197, 94, 0.15)",
                border: "1px solid rgba(34, 197, 94, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1rem",
              }}>
                <DollarSign size={28} style={{ color: "#22c55e" }} />
              </div>
              <div style={{ fontSize: "0.8rem", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.5rem" }}>
                You Get
              </div>
              <div style={{ fontSize: "2.5rem", fontWeight: 800, color: "#22c55e", marginBottom: "0.5rem" }}>
                $25
              </div>
              <div style={{ color: "#d1d5db", fontSize: "0.95rem" }}>
                Cash bonus per referral
              </div>
            </div>

            {/* They Get */}
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "16px",
              padding: "1.5rem",
              textAlign: "center",
            }}>
              <div style={{
                width: "56px",
                height: "56px",
                borderRadius: "14px",
                background: "rgba(34, 211, 238, 0.15)",
                border: "1px solid rgba(34, 211, 238, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1rem",
              }}>
                <TrendingUp size={28} style={{ color: "#22d3ee" }} />
              </div>
              <div style={{ fontSize: "0.8rem", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.5rem" }}>
                They Get
              </div>
              <div style={{ fontSize: "2.5rem", fontWeight: 800, color: "#22d3ee", marginBottom: "0.5rem" }}>
                10% Off
              </div>
              <div style={{ color: "#d1d5db", fontSize: "0.95rem" }}>
                Their first month
              </div>
            </div>
          </div>

          {/* Terms */}
          <div style={{
            background: "rgba(0,0,0,0.2)",
            borderRadius: "12px",
            padding: "1rem 1.5rem",
            marginBottom: "1.5rem",
          }}>
            <div style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.75rem" }}>
              How It Works
            </div>
            <ul style={{ 
              listStyle: "none", 
              padding: 0, 
              margin: 0,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "0.5rem",
            }}>
              {[
                "Share your unique referral link",
                "They sign up and pay for their first month",
                "After 30 days, you get $25 cash",
                "No limit — refer as many as you want",
              ].map((term, i) => (
                <li key={i} style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "0.5rem",
                  color: "#9ca3af",
                  fontSize: "0.85rem",
                }}>
                  <Check size={14} style={{ color: "#22c55e", flexShrink: 0 }} />
                  {term}
                </li>
              ))}
            </ul>
          </div>

          <div style={{ textAlign: "center" }}>
            <button
              onClick={() => navigate("/login")}
              style={{
                padding: "1rem 2.5rem",
                fontSize: "1rem",
                fontWeight: 600,
                background: "linear-gradient(135deg, #22c55e 0%, #22d3ee 100%)",
                border: "none",
                borderRadius: "12px",
                color: "#000",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <Gift size={18} />
              Get Your Referral Link
            </button>
            <p style={{ color: "#6b7280", fontSize: "0.8rem", marginTop: "1rem" }}>
              * Bonus paid after referred customer completes 30 days. Refunds/chargebacks void the bonus.
            </p>
          </div>
        </motion.div>
      </div>

      {/* Partner/Affiliate CTA */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          padding: "2rem 1.5rem 4rem",
          maxWidth: "900px",
          margin: "0 auto",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          style={{
            background: "linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(34, 211, 238, 0.1) 100%)",
            border: "1px solid rgba(139, 92, 246, 0.3)",
            borderRadius: "24px",
            padding: "2.5rem 2rem",
            textAlign: "center",
          }}
        >
          <h3 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem", color: "#d1d5db" }}>
            Want to Earn Even More?
          </h3>
          <p style={{ color: "#9ca3af", fontSize: "1rem", marginBottom: "1.25rem", maxWidth: "500px", margin: "0 auto 1.25rem" }}>
            Become a Partner and earn <span style={{ color: "#8b5cf6", fontWeight: 600 }}>$25 bonus + 10% monthly</span> from every referral's subscription — forever.
          </p>
          <button
            onClick={() => navigate("/affiliate/signup")}
            style={{
              padding: "0.85rem 2rem",
              fontSize: "0.95rem",
              fontWeight: 600,
              background: "transparent",
              border: "1px solid rgba(139, 92, 246, 0.5)",
              borderRadius: "12px",
              color: "#8b5cf6",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <Users size={16} />
            Become a Partner
          </button>
        </motion.div>
      </div>

      {/* Final CTA */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          padding: "4rem 1.5rem 6rem",
          textAlign: "center",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "1rem" }}>
            Ready to Stop Missing Calls?
          </h2>
          <p style={{ color: "#9ca3af", fontSize: "1.1rem", marginBottom: "2rem" }}>
            Join 100+ contractors who never miss a lead.
          </p>
          <button
            className="glow-button"
            onClick={() => navigate("/login")}
            style={{
              padding: "1.25rem 3rem",
              fontSize: "1.15rem",
              fontWeight: 600,
            }}
          >
            Get Started Now
          </button>
        </motion.div>
      </div>

      {/* Footer */}
      <footer
        style={{
          position: "relative",
          zIndex: 1,
          borderTop: "1px solid rgba(255,255,255,0.08)",
          padding: "3rem 1.5rem 2rem",
        }}
      >
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "2rem",
            marginBottom: "2rem",
          }}>
            {/* Brand */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
                <div style={{ 
                  width: "28px", 
                  height: "28px", 
                  borderRadius: "6px", 
                  background: "linear-gradient(135deg, #22d3ee, #8b5cf6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <Headphones size={14} color="#fff" />
                </div>
                <span style={{ fontWeight: 700, fontSize: "1rem" }}>KRYONEX</span>
              </div>
              <p style={{ color: "#6b7280", fontSize: "0.85rem", lineHeight: 1.6 }}>
                AI-powered answering for HVAC & plumbing contractors.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 style={{ fontSize: "0.8rem", color: "#9ca3af", letterSpacing: "0.1em", marginBottom: "1rem" }}>PRODUCT</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <span onClick={scrollToPricing} style={{ color: "#6b7280", fontSize: "0.9rem", cursor: "pointer" }}>Pricing</span>
                <span onClick={() => navigate("/login")} style={{ color: "#6b7280", fontSize: "0.9rem", cursor: "pointer" }}>Get Started</span>
              </div>
            </div>

            {/* Partners */}
            <div>
              <h4 style={{ fontSize: "0.8rem", color: "#9ca3af", letterSpacing: "0.1em", marginBottom: "1rem" }}>PARTNERS</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <span onClick={() => navigate("/affiliate/signup")} style={{ color: "#6b7280", fontSize: "0.9rem", cursor: "pointer" }}>Become a Partner</span>
                <span onClick={() => navigate("/login")} style={{ color: "#6b7280", fontSize: "0.9rem", cursor: "pointer" }}>Partner Login</span>
              </div>
            </div>

            {/* Legal */}
            <div>
              <h4 style={{ fontSize: "0.8rem", color: "#9ca3af", letterSpacing: "0.1em", marginBottom: "1rem" }}>LEGAL</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <span onClick={() => navigate("/privacy")} style={{ color: "#6b7280", fontSize: "0.9rem", cursor: "pointer" }}>Privacy Policy</span>
                <span onClick={() => navigate("/terms")} style={{ color: "#6b7280", fontSize: "0.9rem", cursor: "pointer" }}>Terms of Service</span>
                <a href="mailto:support@kryonextech.com" style={{ color: "#6b7280", fontSize: "0.9rem", textDecoration: "none" }}>Contact</a>
              </div>
            </div>
          </div>

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "1.5rem", textAlign: "center" }}>
            <p style={{ color: "#4b5563", fontSize: "0.85rem" }}>
              © {new Date().getFullYear()} Kryonex Technologies LLC. All rights reserved.
            </p>
            <p style={{ color: "#4b5563", fontSize: "0.75rem", marginTop: "0.5rem" }}>
              By using our service, you agree to receive SMS messages. Reply STOP to opt out. Msg & data rates may apply.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
