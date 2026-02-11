import React from "react";

export const AssistantContext = React.createContext({
  open: false,
  setOpen: () => {},
});

export function useAssistant() {
  return React.useContext(AssistantContext);
}

