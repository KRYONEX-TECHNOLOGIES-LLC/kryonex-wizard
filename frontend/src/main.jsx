import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { MobileNavProvider } from "./components/SideNav.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <MobileNavProvider>
        <App />
      </MobileNavProvider>
    </BrowserRouter>
  </React.StrictMode>
);
