import React from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import WizardEmbedded from "../components/WizardEmbedded.jsx";

export default function AdminClientWizardPage() {
  const navigate = useNavigate();

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
            <div className="max-w-5xl mx-auto min-h-[540px] flex flex-col lg:min-h-[calc(100vh-10rem)]">
              <WizardEmbedded />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
