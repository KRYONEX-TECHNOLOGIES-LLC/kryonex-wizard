import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import LandingGate from "./components/LandingGate.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import WizardPage from "./pages/WizardPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import CalendarPage from "./pages/CalendarPage.jsx";
import BillingPage from "./pages/BillingPage.jsx";
import BillingTiersPage from "./pages/BillingTiersPage.jsx";
import BlackBoxPage from "./pages/BlackBoxPage.jsx";
import LeadsPage from "./pages/LeadsPage.jsx";
import NumbersPage from "./pages/NumbersPage.jsx";
import AdminDashboardPage from "./pages/AdminDashboardPage.jsx";
import AdminCallCenterPage from "./pages/AdminCallCenterPage.jsx";
import AdminClientWizardPage from "./pages/AdminClientWizardPage.jsx";
import SalesConsolePage from "./pages/SalesConsolePage.jsx";
import TrackingSharePage from "./pages/TrackingSharePage.jsx";
import TechTrackingPage from "./pages/TechTrackingPage.jsx";
import AdminUsersPage from "./pages/AdminUsersPage.jsx";
import AdminLogsPage from "./pages/AdminLogsPage.jsx";
import AdminFinalLogsPage from "./pages/AdminFinalLogsPage.jsx";
import AdminFinancialsPage from "./pages/AdminFinancialsPage.jsx";
import AdminSellersPage from "./pages/AdminSellersPage.jsx";
import AdminLeadsPage from "./pages/AdminLeadsPage.jsx";
import AdminBlackBoxPage from "./pages/AdminBlackBoxPage.jsx";
import AdminMessagesPage from "./pages/AdminMessagesPage.jsx";
import AdminCalendarPage from "./pages/AdminCalendarPage.jsx";
import AnalyticsPage from "./pages/AnalyticsPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import ReferralPage from "./pages/ReferralPage.jsx";
import AffiliatePage from "./pages/AffiliatePage.jsx";
import AffiliateSignupPage from "./pages/AffiliateSignupPage.jsx";
import AffiliateDashboardPage from "./pages/AffiliateDashboardPage.jsx";
import CustomersPage from "./pages/CustomersPage.jsx";
import IntegrationsPage from "./pages/IntegrationsPage.jsx";
import ThankYouPage from "./pages/ThankYouPage.jsx";
import AdminStripeSuccessPage from "./pages/AdminStripeSuccessPage.jsx";
import AdminReferralsPage from "./pages/AdminReferralsPage.jsx";
import AdminOpsPage from "./pages/AdminOpsPage.jsx";
import AdminLiveScriptsPage from "./pages/AdminLiveScriptsPage.jsx";
import MessagesPage from "./pages/MessagesPage.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import RequireOnboarding from "./components/RequireOnboarding.jsx";
import { supabaseReady } from "./lib/supabase";
import RequireAdmin from "./components/RequireAdmin.jsx";
import RequireRole from "./components/RequireRole.jsx";
import RequireAccountType from "./components/RequireAccountType.jsx";

export default function App() {
  if (!supabaseReady) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#050505",
          color: "#10b981",
          padding: "2rem",
          textAlign: "center",
          letterSpacing: "0.12rem",
        }}
      >
        <div>
          <div style={{ fontSize: "1.4rem", marginBottom: "0.6rem" }}>
            SUPABASE KEYS REQUIRED
          </div>
          <div style={{ color: "#9ca3af", maxWidth: "520px" }}>
            Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to
            <span className="mono"> frontend/.env</span>, then restart Vite.
          </div>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<LandingGate />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/thank-you" element={<ThankYouPage />} />
      <Route path="/affiliate" element={<AffiliatePage />} />
      <Route path="/affiliate/signup" element={<AffiliateSignupPage />} />
      <Route
        path="/affiliate/dashboard"
        element={
          <ProtectedRoute>
            <RequireAccountType types={["affiliate", "both"]}>
              <AffiliateDashboardPage />
            </RequireAccountType>
          </ProtectedRoute>
        }
      />
      <Route path="/admin/stripe-success" element={<AdminStripeSuccessPage />} />
      <Route
        path="/wizard"
        element={
          <ProtectedRoute>
            <WizardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <RequireOnboarding>
              <DashboardPage />
            </RequireOnboarding>
          </ProtectedRoute>
        }
      />
      <Route
        path="/billing"
        element={
          <ProtectedRoute>
            <RequireOnboarding>
              <BillingPage />
            </RequireOnboarding>
          </ProtectedRoute>
        }
      />
      <Route
        path="/billing/tiers"
        element={
          <ProtectedRoute>
            <RequireOnboarding>
              <BillingTiersPage />
            </RequireOnboarding>
          </ProtectedRoute>
        }
      />
      <Route
        path="/calendar"
        element={
          <ProtectedRoute>
            <RequireOnboarding>
              <CalendarPage />
            </RequireOnboarding>
          </ProtectedRoute>
        }
      />
      <Route
        path="/numbers"
        element={
          <ProtectedRoute>
            <RequireOnboarding>
              <NumbersPage />
            </RequireOnboarding>
          </ProtectedRoute>
        }
      />
      <Route
        path="/black-box"
        element={
          <ProtectedRoute>
            <RequireOnboarding>
              <BlackBoxPage />
            </RequireOnboarding>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leads"
        element={
          <ProtectedRoute>
            <RequireOnboarding>
              <LeadsPage />
            </RequireOnboarding>
          </ProtectedRoute>
        }
      />
      <Route
        path="/messages"
        element={
          <ProtectedRoute>
            <MessagesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/analytics"
        element={
          <ProtectedRoute>
            <RequireOnboarding>
              <AnalyticsPage />
            </RequireOnboarding>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <RequireOnboarding>
              <SettingsPage />
            </RequireOnboarding>
          </ProtectedRoute>
        }
      />
      <Route
        path="/referrals"
        element={
          <ProtectedRoute>
            <RequireOnboarding>
              <ReferralPage />
            </RequireOnboarding>
          </ProtectedRoute>
        }
      />
      <Route
        path="/customers"
        element={
          <ProtectedRoute>
            <RequireOnboarding>
              <CustomersPage />
            </RequireOnboarding>
          </ProtectedRoute>
        }
      />
      <Route
        path="/integrations"
        element={
          <ProtectedRoute>
            <RequireOnboarding>
              <IntegrationsPage />
            </RequireOnboarding>
          </ProtectedRoute>
        }
      />
      <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute>
            <RequireAdmin>
              <AdminDashboardPage />
            </RequireAdmin>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/call-center"
        element={
          <ProtectedRoute>
            <RequireAdmin>
              <AdminCallCenterPage />
            </RequireAdmin>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/live-scripts"
        element={
          <ProtectedRoute>
            <RequireAdmin>
              <AdminLiveScriptsPage />
            </RequireAdmin>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/wizard/create"
        element={
          <ProtectedRoute>
            <RequireAdmin>
              <AdminClientWizardPage />
            </RequireAdmin>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/wizard"
        element={<Navigate to="/admin/wizard/create" replace />}
      />
      <Route
        path="/admin/users"
        element={
          <ProtectedRoute>
            <RequireAdmin>
              <AdminUsersPage />
            </RequireAdmin>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/logs"
        element={
          <ProtectedRoute>
            <RequireAdmin>
              <AdminLogsPage />
            </RequireAdmin>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/final-logs"
        element={
          <ProtectedRoute>
            <RequireAdmin>
              <AdminFinalLogsPage />
            </RequireAdmin>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/financials"
        element={
          <ProtectedRoute>
            <RequireAdmin>
              <AdminFinancialsPage />
            </RequireAdmin>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/referrals"
        element={
          <ProtectedRoute>
            <RequireAdmin>
              <AdminReferralsPage />
            </RequireAdmin>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/ops"
        element={
          <ProtectedRoute>
            <RequireAdmin>
              <AdminOpsPage />
            </RequireAdmin>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/sellers"
        element={
          <ProtectedRoute>
            <RequireAdmin>
              <AdminSellersPage />
            </RequireAdmin>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/leads"
        element={
          <ProtectedRoute>
            <RequireAdmin>
              <AdminLeadsPage />
            </RequireAdmin>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/black-box"
        element={
          <ProtectedRoute>
            <RequireAdmin>
              <AdminBlackBoxPage />
            </RequireAdmin>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/messages"
        element={
          <ProtectedRoute>
            <RequireAdmin>
              <AdminMessagesPage />
            </RequireAdmin>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/calendar"
        element={
          <ProtectedRoute>
            <RequireAdmin>
              <AdminCalendarPage />
            </RequireAdmin>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/client-wizard"
        element={<Navigate to="/admin/wizard/create" replace />}
      />
      <Route
        path="/console/dialer"
        element={
          <ProtectedRoute>
            <RequireRole roles={["seller", "admin"]} fallback="/dashboard">
              <SalesConsolePage />
            </RequireRole>
          </ProtectedRoute>
        }
      />
      <Route path="/track/:token" element={<TrackingSharePage />} />
      <Route path="/tech/track/:token" element={<TechTrackingPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
