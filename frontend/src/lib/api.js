import axios from "axios";
import { supabase } from "./supabase";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000",
});

api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const deployAgent = (data) => api.post("/deploy-agent", data);
export const getStats = () => api.get("/api/dashboard/stats");
export const getLeads = () => api.get("/leads");
export const getAdminLeads = () => api.get("/admin/leads");
export const updateLeadStatus = (leadId, status) =>
  api.post("/leads/update-status", { leadId, status });
export const getMessages = () => api.get("/messages");
export const createCheckoutSession = (data) =>
  api.post("/create-checkout-session", data);
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
export const getAdminHealth = () => api.get("/admin/health");
export const getAdminUsers = () => api.get("/admin/users");
export const getAdminUserProfile = (userId) =>
  api.get(`/admin/users/${userId}`);
export const syncStripe = () => api.post("/admin/sync-stripe");
export const getAdminTimeseries = (days = 14) =>
  api.get("/admin/timeseries", { params: { days } });
export const createClientDeployment = (data) =>
  api.post("/admin/create-client", data);
export const acceptConsent = () => api.post("/consent");
export const getUsageStatus = () => api.get("/usage/status");
export const getCalcomStatus = () => api.get("/api/calcom/status");
export const sendSms = (data) => api.post("/send-sms", data);
export const createTrackingSession = (data) => api.post("/tracking/create", data);
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

export default api;
