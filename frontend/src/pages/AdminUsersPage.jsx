import React from "react";
import { motion } from "framer-motion";
import { Settings, UserCheck, CreditCard } from "lucide-react";
import { useNavigate } from "react-router-dom";
import TopMenu from "../components/TopMenu.jsx";
import SideNav from "../components/SideNav.jsx";
import { getSavedState, saveState } from "../lib/persistence.js";

const defaultUsers = [
  {
    id: "usr_001",
    business: "Apex Heating",
    email: "apex@heating.com",
    plan: "ELITE",
    status: "active",
    usage: 78,
  },
  {
    id: "usr_002",
    business: "Flow Plumbing Co",
    email: "info@flowplumbing.com",
    plan: "PRO",
    status: "active",
    usage: 62,
  },
  {
    id: "usr_003",
    business: "Northstar HVAC",
    email: "support@northstarhvac.com",
    plan: "CORE",
    status: "past_due",
    usage: 44,
  },
];

const statusDot = {
  active: "bg-neon-green",
  past_due: "bg-neon-pink",
};

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const storedUsers = getSavedState("fleet.users");
  const [fleetUsers, setFleetUsers] = React.useState(() => storedUsers || defaultUsers);
  const persistUsers = (next) => {
    setFleetUsers(next);
    saveState("fleet.users", next);
  };

  const handleAddUser = () => {
    const business = window.prompt("Enter new business name (HVAC/Plumbing only)");
    const email = window.prompt("Enter contact email");
    if (!business || !email) return;
    const next = [
      ...fleetUsers,
      {
        id: `usr_${Date.now()}`,
        business,
        email,
        plan: "CORE",
        status: "active",
        usage: 0,
      },
    ];
    persistUsers(next);
  };

  return (
    <div className="min-h-screen w-full bg-void-black text-white relative overflow-hidden font-sans">
      <TopMenu />
      <div className="absolute inset-0 bg-grid-lines opacity-40" />
      <div className="relative z-10 flex w-full h-screen">
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
        <div className="flex-1 px-6 py-8 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="glass-panel rounded-3xl border border-white/10 p-6"
          >
            <p className="text-xs uppercase tracking-[0.4em] text-neon-cyan/70">
              Fleet Registry
            </p>
            <h1 className="mt-2 text-4xl font-semibold">System Users</h1>
            <p className="mt-1 text-white/60">
              Live roster of every deployment across the Kryonex fleet.
            </p>
            <button
              className="glow-button mt-4 w-max"
              onClick={handleAddUser}
              type="button"
            >
              Add User
            </button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="glass-panel rounded-3xl border border-white/10 p-6 overflow-hidden"
          >
            <div className="grid grid-cols-[1fr_1fr_1fr_0.7fr_0.8fr_0.8fr] gap-4 text-[0.65rem] uppercase tracking-widest text-white/40 border-b border-white/10 pb-3">
              <div>Client</div>
              <div>Email</div>
              <div>Plan</div>
              <div>Status</div>
              <div>Usage</div>
              <div>Actions</div>
            </div>
            <div className="mt-3 space-y-2">
              {fleetUsers.map((user) => (
                <div
                  key={user.id}
                  className="grid grid-cols-[1fr_1fr_1fr_0.7fr_0.8fr_0.8fr] gap-4 items-center rounded-2xl border border-white/5 bg-black/40 px-4 py-3 hover:border-neon-cyan/40 transition"
                >
                  <div>
                    <div className="text-sm font-semibold">{user.business}</div>
                    <div className="text-xs text-white/40">{user.id}</div>
                  </div>
                  <div className="text-xs text-slate-400">{user.email}</div>
                  <div>
                    <span className="px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-widest border border-white/20 rounded-full bg-white/5">
                      {user.plan}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${statusDot[user.status] || "bg-white/20"}`}
                    />
                    <span className="text-xs uppercase tracking-[0.3em]">
                      {user.status.replace("_", " ")}
                    </span>
                  </div>
                  <div>
                    <div className="h-2 w-full rounded-full bg-white/10">
                      <div
                        className="h-2 rounded-full bg-neon-cyan"
                        style={{ width: `${user.usage}%` }}
                      />
                    </div>
                    <div className="text-[0.6rem] text-white/40 mt-1">
                      {user.usage}% usage
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button className="p-2 rounded-full border border-white/10 hover:border-neon-cyan/60 transition">
                      <UserCheck size={16} />
                    </button>
                    <button className="p-2 rounded-full border border-white/10 hover:border-neon-cyan/60 transition">
                      <CreditCard size={16} />
                    </button>
                    <button className="p-2 rounded-full border border-white/10 hover:border-neon-cyan/60 transition">
                      <Settings size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
