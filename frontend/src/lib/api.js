import axios from "axios";
import { supabase } from "./supabase";
import { getImpersonation } from "./impersonation";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000",
});

api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (typeof window !== "undefined") {
    const adminMode = window.localStorage.getItem("kryonex_admin_mode");
    if (adminMode) {
      config.headers["X-Admin-Mode"] = adminMode;
    }
    const { active, userId } = getImpersonation();
    if (active && userId) {
      config.headers["X-Impersonation-Mode"] = "true";
      config.headers["X-Impersonated-User-ID"] = userId;
    }
  }
  return config;
});

// Response interceptor for consistent error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Transform error for consistent handling across the app
    const enhancedError = {
      ...error,
      userMessage: getUserFriendlyMessage(error),
      statusCode: error.response?.status || 0,
      isNetworkError: !error.response,
      isAuthError: error.response?.status === 401,
      isServerError: error.response?.status >= 500,
    };
    
    // Log errors for debugging (only in development)
    if (import.meta.env.DEV) {
      console.error("[API Error]", {
        url: error.config?.url,
        status: error.response?.status,
        message: error.response?.data?.error || error.message,
      });
    }
    
    // Auto-redirect on auth errors (401)
    if (error.response?.status === 401 && typeof window !== "undefined") {
      const currentPath = window.location.pathname;
      // Don't redirect if already on login page or public pages
      if (!["/login", "/", "/affiliate", "/thank-you"].includes(currentPath)) {
        console.warn("[API] Session expired, redirecting to login");
        window.location.href = "/login?session=expired";
      }
    }
    
    return Promise.reject(enhancedError);
  }
);

// Helper to get user-friendly error messages
function getUserFriendlyMessage(error) {
  const status = error.response?.status;
  const serverMessage = error.response?.data?.error;
  
  // Use server message if it's user-friendly
  if (serverMessage && !serverMessage.includes("Error:") && serverMessage.length < 200) {
    return serverMessage;
  }
  
  // Network errors
  if (!error.response) {
    return "Unable to connect. Please check your internet connection.";
  }
  
  // Status-based messages
  switch (status) {
    case 400:
      return serverMessage || "Invalid request. Please check your input.";
    case 401:
      return "Your session has expired. Please log in again.";
    case 403:
      return "You don't have permission to perform this action.";
    case 404:
      return "The requested resource was not found.";
    case 409:
      return serverMessage || "This action conflicts with existing data.";
    case 422:
      return serverMessage || "Please check your input and try again.";
    case 429:
      return "Too many requests. Please wait a moment and try again.";
    case 500:
    case 502:
    case 503:
      return "Server error. Our team has been notified. Please try again later.";
    default:
      return serverMessage || "Something went wrong. Please try again.";
  }
}

export const deployAgent = (data) => api.post("/deploy-agent", data);
export const getStats = () => api.get("/api/dashboard/stats");
export const getEnhancedStats = () => api.get("/api/dashboard/stats-enhanced");
export const getDashboardROI = () => api.get("/api/dashboard/roi");
export const getHealthScore = () => api.get("/api/health-score");
export const getAnalytics = (period = "7d") => api.get("/api/analytics", { params: { period } });

// Admin Health & Ops
export const getAdminHealthScores = (params) => api.get("/admin/health-scores", { params });
export const recalculateHealthScore = (userId) => api.post(`/admin/health-scores/${userId}/recalculate`);
export const getAdminChurnAlerts = (params) => api.get("/admin/churn-alerts", { params });
export const resolveChurnAlert = (alertId, notes) => api.post(`/admin/churn-alerts/${alertId}/resolve`, { notes });
export const getAdminOpsAlerts = (params) => api.get("/admin/ops-alerts", { params });
export const acknowledgeOpsAlert = (alertId) => api.post(`/admin/ops-alerts/${alertId}/acknowledge`);
export const getAdminErrorLogs = (params) => api.get("/admin/error-logs", { params });
export const resolveErrorLog = (errorId, notes) => api.post(`/admin/error-logs/${errorId}/resolve`, { notes });
export const getSettings = () => api.get("/api/settings");
export const updateSettings = (data) => api.put("/api/settings", data);
export const getLeads = (filters = {}) => api.get("/leads", { params: filters });
export const getFilteredLeads = (filters) => api.get("/leads", { params: filters });
export const getAdminLeads = () => api.get("/admin/leads");
export const getAdminAppointments = () => api.get("/admin/appointments");
export const getAdminUsageStats = () => api.get("/admin/usage-stats");
export const updateLeadStatus = (leadId, status) =>
  api.post("/leads/update-status", { leadId, status });
export const flagLead = (leadId, flagged) =>
  api.post(`/leads/${leadId}/flag`, { flagged });
export const getMessages = () => api.get("/messages");
export const createCheckoutSession = (data) =>
  api.post("/create-checkout-session", data);
export const saveOnboardingIdentity = (data) =>
  api.post("/onboarding/identity", data);
export const manageBilling = () => api.post("/create-portal-session");
export const createTopupSession = (data) =>
  api.post("/create-topup-session", data);
export const getSubscriptionStatus = () => api.get("/subscription-status");
export const verifyCheckoutSession = (sessionId) =>
  api.post("/verify-checkout-session", { sessionId });
export const verifyAdminCode = (code) => api.post("/admin/verify-code", { code });
export const getAuditLogs = () => api.get("/admin/audit-logs");
export const autoGrantAdmin = (code) =>
  api.post("/admin/auto-grant", { code });
export const getAdminMetrics = () => api.get("/admin/metrics");
export const getAdminMetricsEnhanced = () => api.get("/admin/metrics-enhanced");
export const getAdminHealth = () => api.get("/admin/health");
export const getAdminUsers = () => api.get("/admin/users");
export const getAdminUserProfile = (userId) =>
  api.get(`/admin/users/${userId}`);
export const syncStripe = () => api.post("/admin/sync-stripe");
export const syncRetellTemplates = (data) =>
  api.post("/admin/retell/sync-templates", data);
export const getAdminTimeseries = (days = 14) =>
  api.get("/admin/timeseries", { params: { days } });
export const createClientDeployment = (data) =>
  api.post("/admin/create-client", data);
export const adminQuickOnboard = (data) =>
  api.post("/admin/quick-onboard", data);
export const adminCreateAccount = (data) =>
  api.post("/admin/create-account", data);
export const adminSaveOnboardingIdentity = (data) =>
  api.post("/admin/onboarding/identity", data);
export const adminAcceptConsent = (data) =>
  api.post("/admin/consent", data);
export const adminGetUserByEmail = (email) =>
  api.get("/admin/user-by-email", { params: { email } });
export const adminGetSubscriptionStatus = (userId) =>
  api.get("/admin/subscription-status", { params: { user_id: userId } });
export const adminGetDeployStatus = (userId) =>
  api.get("/admin/deploy-status", { params: { user_id: userId } });
export const adminDeployAgent = (data) =>
  api.post("/admin/deploy-agent", data);
export const adminGenerateStripeLink = (data) =>
  api.post("/admin/stripe-link", data);
export const getDeployStatus = () => api.get("/deploy-status");
export const deployAgentSelf = (data) =>
  api.post("/deploy-agent-self", data || {});
export const logImpersonationStart = (userId) =>
  api.post("/admin/impersonation/start", { user_id: userId });
export const logImpersonationEnd = (userId) =>
  api.post("/admin/impersonation/end", { user_id: userId });
export const acceptConsent = () => api.post("/consent");
export const getUsageStatus = () => api.get("/usage/status");
export const getCalcomStatus = () => api.get("/api/calcom/status");
export const getCalcomAuthorizeUrl = () => api.get("/api/calcom/authorize-url");
export const disconnectCalcom = () => api.post("/api/calcom/disconnect");
export const sendSms = (data) => api.post("/send-sms", data);
export const createTrackingSession = (data) => api.post("/tracking/create", data);
export const getAppointments = (startTime, endTime) =>
  api.get("/appointments", {
    params: { start_time: startTime, end_time: endTime },
  });
export const createAppointment = (data) => api.post("/appointments", data);
export const updateAppointment = (appointmentId, data) =>
  api.put(`/appointments/${appointmentId}`, data);
export const deleteAppointment = (appointmentId) =>
  api.delete(`/appointments/${appointmentId}`);
export const getTrackingSession = (token) =>
  api.get(`/tracking/session/${token}`);
export const getTrackingPoints = (token) =>
  api.get(`/tracking/points/${token}`);
export const postTrackingUpdate = (data) => api.post("/tracking/update", data);

export const logOutboundCallAttempt = (data) =>
  api.post("/activity/outbound-call", data);

export const fetchCallRecordings = (params) =>
  api.get("/admin/call-recordings", { params });
export const createCallRecording = (data) => api.post("/call-recordings", data);
export const updateCallFeedback = (recordingId, payload) =>
  api.post(`/admin/call-recordings/${recordingId}/feedback`, payload);
export const fetchUserCallRecordings = () => api.get("/call-recordings");

export const fetchSellerRoster = () => api.get("/admin/sellers");
export const fetchSellerDossier = (sellerId) =>
  api.get(`/admin/sellers/${sellerId}/dossier`);
export const fetchSellerAudit = (sellerId, limit = 40) =>
  api.get(`/admin/sellers/${sellerId}/audit`, { params: { limit } });
export const approveCommissionPayout = (commissionId, payload) =>
  api.post(`/admin/commissions/${commissionId}/approve`, payload);

export const getDialerQueue = () => api.get("/admin/dialer-queue");
export const transferLeadsToDialer = (leadIds) =>
  api.post("/admin/dialer-queue", { leadIds });

export const triggerDemoCall = (data) => api.post("/retell/demo-call", data);
export const logBlackBoxEvent = (action_type, meta_data) =>
  api.post("/black-box/event", { action_type, meta_data });

// Referral System
export const getReferralCode = () => api.get("/referral/my-code");
export const getReferralStats = () => api.get("/referral/stats");
export const getReferralHistory = () => api.get("/referral/history");
export const requestReferralPayout = (paymentDetails) => 
  api.post("/referral/request-payout", paymentDetails || {});
export const getPayoutHistory = () => api.get("/referral/payout-history");
export const recordReferralSignup = (referralCode) => 
  api.post("/referral/record-signup", { referral_code: referralCode });

// Admin Referral Management
export const getAdminReferrals = (params) => api.get("/admin/referrals", { params });
export const approveReferralPayout = (referralId) => 
  api.post(`/admin/referrals/${referralId}/approve`);
export const rejectReferralPayout = (referralId, reason) => 
  api.post(`/admin/referrals/${referralId}/reject`, { reason });
export const getReferralSettings = () => api.get("/admin/referral-settings");
export const updateReferralSettings = (settings) => 
  api.put("/admin/referral-settings", settings);

// Admin Payout Request Management
export const getAdminPayoutRequests = () => api.get("/admin/referral-payout-requests");
export const approvePayoutRequest = (payoutId, data) => 
  api.post(`/admin/referral-payout-requests/${payoutId}/approve`, data || {});
export const rejectPayoutRequest = (payoutId, reason, notes) => 
  api.post(`/admin/referral-payout-requests/${payoutId}/reject`, { reason, admin_notes: notes });
export const markPayoutPaid = (payoutId, paymentReference, notes) => 
  api.post(`/admin/referral-payout-requests/${payoutId}/mark-paid`, { 
    payment_reference: paymentReference, 
    admin_notes: notes 
  });

// Review Requests
export const requestAppointmentReview = (appointmentId) =>
  api.post(`/appointments/${appointmentId}/request-review`);

// Customers CRM
export const getCustomers = (params) => api.get("/api/customers", { params });
export const getCustomerHistory = (phone) => api.get(`/api/customers/${encodeURIComponent(phone)}/history`);

// Webhooks (Zapier Integration)
export const getWebhooks = () => api.get("/api/webhooks");
export const createWebhook = (data) => api.post("/api/webhooks", data);
export const updateWebhook = (id, data) => api.put(`/api/webhooks/${id}`, data);
export const deleteWebhook = (id) => api.delete(`/api/webhooks/${id}`);
export const testWebhook = (id) => api.post(`/api/webhooks/${id}/test`);
export const getWebhookDeliveries = (id, params) => api.get(`/api/webhooks/${id}/deliveries`, { params });
export const retryWebhookDelivery = (webhookId, deliveryId) => api.post(`/api/webhooks/${webhookId}/deliveries/${deliveryId}/retry`);

// Session Management
export const getSessions = () => api.get("/api/sessions");
export const revokeSession = (sessionId) => api.delete(`/api/sessions/${sessionId}`);
export const revokeAllSessions = () => api.delete("/api/sessions");
export const changePassword = (newPassword) => api.post("/api/change-password", { new_password: newPassword });

export default api;
