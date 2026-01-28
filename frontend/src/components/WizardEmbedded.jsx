import React from "react";
import { adminCreateAccount, adminGetUserByEmail } from "../lib/api";
import LoginPage from "../pages/LoginPage.jsx";
import WizardPage from "../pages/WizardPage.jsx";

export default function WizardEmbedded({ onClientCreated }) {
  const [client, setClient] = React.useState(null);

  const handleEmbeddedSubmit = React.useCallback(
    async ({ email, password, mode }) => {
      const cleanEmail = String(email || "").trim().toLowerCase();
      if (mode === "signup") {
        const response = await adminCreateAccount({
          email: cleanEmail,
          password,
        });
        const userId = response.data?.user_id;
        if (!userId) throw new Error("User creation did not return user_id");
        const newClient = { userId, email: cleanEmail };
        setClient(newClient);
        onClientCreated?.(newClient);
      } else {
        const response = await adminGetUserByEmail(cleanEmail);
        const userId = response.data?.user_id;
        const userEmail = response.data?.email ?? cleanEmail;
        if (!userId) throw new Error("User not found");
        const newClient = { userId, email: userEmail };
        setClient(newClient);
        onClientCreated?.(newClient);
      }
    },
    [onClientCreated]
  );

  const handleStartOver = () => {
    setClient(null);
  };

  if (!client) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden max-w-lg">
        <LoginPage
          embeddedMode
          onEmbeddedSubmit={handleEmbeddedSubmit}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-[540px]">
      <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
        <span className="text-xs uppercase tracking-[0.2em] text-white/40">
          Client: {client.email}
        </span>
        <button
          type="button"
          onClick={handleStartOver}
          className="text-xs uppercase tracking-wider text-neon-cyan/70 hover:text-neon-cyan border border-white/10 hover:border-neon-cyan/40 rounded-lg px-2 py-1 transition-colors"
        >
          Create another
        </button>
      </div>
      <div className="flex-1 min-h-[480px] w-full overflow-auto">
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
