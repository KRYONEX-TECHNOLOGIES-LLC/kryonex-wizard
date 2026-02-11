import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Shield, Phone, MessageSquare, Lock, Eye, Trash2, Mail } from "lucide-react";

export default function PrivacyPolicyPage() {
  const lastUpdated = "February 9, 2026";
  
  return (
    <div className="min-h-screen bg-void-black text-white relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-grid-lines opacity-30" />
      <div className="absolute -top-40 right-0 h-96 w-96 rounded-full bg-neon-cyan/10 blur-[180px]" />
      <div className="absolute bottom-0 left-0 h-96 w-96 rounded-full bg-neon-purple/10 blur-[180px]" />
      
      <div className="relative z-10 max-w-4xl mx-auto px-6 py-12">
        {/* Back link */}
        <Link 
          to="/" 
          className="inline-flex items-center gap-2 text-white/60 hover:text-neon-cyan transition mb-8"
        >
          <ArrowLeft size={18} />
          <span>Back to Home</span>
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel rounded-3xl border border-white/10 p-8 md:p-12"
        >
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <div className="w-14 h-14 rounded-2xl bg-neon-cyan/20 flex items-center justify-center">
              <Shield className="text-neon-cyan" size={28} />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold">Privacy Policy</h1>
              <p className="text-white/50 text-sm mt-1">Last updated: {lastUpdated}</p>
            </div>
          </div>

          <div className="prose prose-invert max-w-none space-y-8">
            {/* Introduction */}
            <section>
              <p className="text-white/80 text-lg leading-relaxed">
                Kryonex Technologies LLC ("Kryonex," "we," "us," or "our") is committed to protecting 
                your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard 
                your information when you use our AI-powered phone answering and appointment booking 
                services (the "Service").
              </p>
            </section>

            {/* Information We Collect */}
            <section>
              <h2 className="text-xl font-semibold text-white flex items-center gap-3 mb-4">
                <Eye className="text-neon-cyan" size={22} />
                Information We Collect
              </h2>
              <div className="space-y-4 text-white/70">
                <div>
                  <h3 className="text-white font-medium mb-2">Personal Information</h3>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Name and business name</li>
                    <li>Email address</li>
                    <li>Phone numbers (business and personal)</li>
                    <li>Billing address and payment information</li>
                    <li>Service area and business details</li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-white font-medium mb-2">Call and Message Data</h3>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Phone call recordings and transcripts</li>
                    <li>SMS/text message content and delivery status</li>
                    <li>Caller information (phone number, location when available)</li>
                    <li>Appointment and booking details</li>
                    <li>Call sentiment and outcome data</li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-white font-medium mb-2">Usage Data</h3>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Log data and device information</li>
                    <li>IP addresses and browser type</li>
                    <li>Pages visited and features used</li>
                    <li>Date and time of access</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* SMS/Text Messaging Section - CRITICAL FOR A2P 10DLC */}
            <section className="bg-neon-cyan/5 border border-neon-cyan/20 rounded-2xl p-6">
              <h2 className="text-xl font-semibold text-white flex items-center gap-3 mb-4">
                <MessageSquare className="text-neon-cyan" size={22} />
                SMS/Text Messaging Policy
              </h2>
              <div className="space-y-4 text-white/70">
                <p>
                  <strong className="text-white">Consent to Receive Messages:</strong> By providing your 
                  phone number and using our Service, you expressly consent to receive SMS/text messages 
                  from Kryonex Technologies LLC. These messages may include:
                </p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Appointment confirmations and reminders</li>
                  <li>Service notifications and updates</li>
                  <li>Call summaries and transcripts</li>
                  <li>Lead alerts and follow-up reminders</li>
                  <li>Account and billing notifications</li>
                </ul>
                
                <p>
                  <strong className="text-white">Message Frequency:</strong> Message frequency varies 
                  based on your account activity and preferences. You may receive multiple messages per 
                  day during active periods.
                </p>
                
                <p>
                  <strong className="text-white">Message and Data Rates:</strong> Standard message and 
                  data rates may apply. Please contact your wireless carrier for details about your 
                  text messaging plan.
                </p>
                
                <div className="mt-4 p-4 bg-white/5 rounded-xl border border-white/10">
                  <p className="text-white font-semibold mb-2">How to Opt-Out of SMS:</p>
                  <p>
                    You may opt out of receiving SMS messages at any time by:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                    <li>Replying <strong className="text-neon-cyan">STOP</strong> to any message</li>
                    <li>Contacting us at <a href="mailto:support@kryonextech.com" className="text-neon-cyan hover:underline">support@kryonextech.com</a></li>
                    <li>Updating your notification preferences in your account settings</li>
                  </ul>
                  <p className="mt-3 text-white/60 text-sm">
                    After opting out, you will receive a confirmation message. Note that opting out 
                    of SMS may affect your ability to receive important service notifications.
                  </p>
                </div>
                
                <p>
                  <strong className="text-white">SMS Data Protection:</strong> We do not sell, rent, 
                  or share your phone number or SMS data with third parties for marketing purposes. 
                  Your phone number is used solely for delivering our Service.
                </p>
              </div>
            </section>

            {/* Phone Calls Section */}
            <section className="bg-neon-purple/5 border border-neon-purple/20 rounded-2xl p-6">
              <h2 className="text-xl font-semibold text-white flex items-center gap-3 mb-4">
                <Phone className="text-neon-purple" size={22} />
                Phone Call Recording Policy
              </h2>
              <div className="space-y-4 text-white/70">
                <p>
                  <strong className="text-white">Call Recording:</strong> Our AI-powered phone service 
                  records all incoming calls for quality assurance, training, and to provide you with 
                  accurate call transcripts and summaries.
                </p>
                <p>
                  <strong className="text-white">Caller Notification:</strong> Callers are informed at 
                  the beginning of each call that the call may be recorded. By continuing the call, 
                  callers consent to the recording.
                </p>
                <p>
                  <strong className="text-white">Recording Access:</strong> You have access to all 
                  recordings of calls made to your business line through your Kryonex dashboard. 
                  Recordings are retained for 90 days unless you request deletion.
                </p>
              </div>
            </section>

            {/* How We Use Information */}
            <section>
              <h2 className="text-xl font-semibold text-white flex items-center gap-3 mb-4">
                <Lock className="text-neon-cyan" size={22} />
                How We Use Your Information
              </h2>
              <div className="text-white/70 space-y-3">
                <p>We use the information we collect to:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Provide, maintain, and improve our Service</li>
                  <li>Process and complete transactions</li>
                  <li>Send administrative communications</li>
                  <li>Respond to customer support requests</li>
                  <li>Send promotional communications (with your consent)</li>
                  <li>Monitor and analyze usage patterns</li>
                  <li>Detect, prevent, and address technical issues</li>
                  <li>Comply with legal obligations</li>
                </ul>
              </div>
            </section>

            {/* Data Sharing */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-4">Information Sharing</h2>
              <div className="text-white/70 space-y-3">
                <p>We may share your information with:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong className="text-white">Service Providers:</strong> Third parties that perform services on our behalf (payment processing, cloud hosting, AI services)</li>
                  <li><strong className="text-white">Business Partners:</strong> Calendar integrations (Google, Outlook, Cal.com) that you authorize</li>
                  <li><strong className="text-white">Legal Requirements:</strong> When required by law or to protect our rights</li>
                </ul>
                <p className="mt-4 font-medium text-white">
                  We do NOT sell your personal information to third parties.
                </p>
              </div>
            </section>

            {/* Data Security */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-4">Data Security</h2>
              <p className="text-white/70">
                We implement appropriate technical and organizational security measures to protect your 
                personal information, including encryption in transit and at rest, secure data centers, 
                and access controls. However, no method of transmission over the Internet is 100% secure.
              </p>
            </section>

            {/* Your Rights */}
            <section>
              <h2 className="text-xl font-semibold text-white flex items-center gap-3 mb-4">
                <Trash2 className="text-neon-pink" size={22} />
                Your Rights
              </h2>
              <div className="text-white/70 space-y-3">
                <p>You have the right to:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Access the personal information we hold about you</li>
                  <li>Request correction of inaccurate information</li>
                  <li>Request deletion of your information</li>
                  <li>Opt out of marketing communications</li>
                  <li>Opt out of SMS messages (reply STOP)</li>
                  <li>Request a copy of your data</li>
                </ul>
                <p className="mt-3">
                  To exercise these rights, contact us at{" "}
                  <a href="mailto:privacy@kryonextech.com" className="text-neon-cyan hover:underline">
                    privacy@kryonextech.com
                  </a>
                </p>
              </div>
            </section>

            {/* Children's Privacy */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-4">Children's Privacy</h2>
              <p className="text-white/70">
                Our Service is not intended for individuals under 18 years of age. We do not knowingly 
                collect personal information from children under 18.
              </p>
            </section>

            {/* Changes to Policy */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-4">Changes to This Policy</h2>
              <p className="text-white/70">
                We may update this Privacy Policy from time to time. We will notify you of any changes 
                by posting the new Privacy Policy on this page and updating the "Last updated" date.
              </p>
            </section>

            {/* Contact */}
            <section className="bg-white/5 rounded-2xl p-6 border border-white/10">
              <h2 className="text-xl font-semibold text-white flex items-center gap-3 mb-4">
                <Mail className="text-neon-cyan" size={22} />
                Contact Us
              </h2>
              <div className="text-white/70 space-y-2">
                <p>If you have questions about this Privacy Policy, contact us at:</p>
                <div className="mt-4">
                  <p className="text-white font-medium">Kryonex Technologies LLC</p>
                  <p>Email: <a href="mailto:privacy@kryonextech.com" className="text-neon-cyan hover:underline">privacy@kryonextech.com</a></p>
                  <p>Website: <a href="https://kryonextech.com" className="text-neon-cyan hover:underline">kryonextech.com</a></p>
                </div>
              </div>
            </section>
          </div>

          {/* Footer links */}
          <div className="mt-10 pt-6 border-t border-white/10 flex flex-wrap gap-6 text-sm text-white/50">
            <Link to="/terms" className="hover:text-neon-cyan transition">Terms of Service</Link>
            <Link to="/" className="hover:text-neon-cyan transition">Home</Link>
            <Link to="/login" className="hover:text-neon-cyan transition">Login</Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
