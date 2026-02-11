import React from "react";
import { useLocation } from "react-router-dom";
import { AssistantContext } from "./AssistantContext.jsx";
import AssistantRoot from "./AssistantRoot.jsx";
import { supabase } from "../../lib/supabase";

const isEnabled = () => {
  const flag = String(import.meta.env.VITE_ASSISTANT_ENABLED || "").toLowerCase();
  if (flag === "false") return false;
  return true;
};

export default function AssistantProvider({ children }) {
  const location = useLocation();
  const [open, setOpen] = React.useState(false);
  const [authed, setAuthed] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setAuthed(Boolean(data?.session));
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setAuthed(Boolean(session));
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  // Close on route change to prevent weird scroll/focus states.
  React.useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const hide =
    !isEnabled() ||
    !authed ||
    location.pathname === "/login" ||
    location.pathname === "/" ||
    location.pathname.startsWith("/affiliate");

  return (
    <AssistantContext.Provider value={{ open, setOpen }}>
      {children}
      {!hide ? <AssistantRoot /> : null}
    </AssistantContext.Provider>
  );
}

