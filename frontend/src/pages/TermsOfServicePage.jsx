import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, FileText, AlertTriangle, CreditCard, Scale, MessageSquare, Phone } from "lucide-react";

export default function TermsOfServicePage() {
  const lastUpdated = "February 9, 2026";
  
  return (
    <div className="min-h-screen bg-void-black text-white relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-grid-lines opacity-30" />
      <div className="absolute -top-40 right-0 h-96 w-96 rounded-full bg-neon-purple/10 blur-[180px]" />
      <div className="absolute bottom-0 left-0 h-96 w-96 rounded-full bg-neon-cyan/10 blur-[180px]" />
      
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
            <div className="w-14 h-14 rounded-2xl bg-neon-purple/20 flex items-center justify-center">
              <FileText className="text-neon-purple" size={28} />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold">Terms of Service</h1>
              <p className="text-white/50 text-sm mt-1">Last updated: {lastUpdated}</p>
            </div>
          </div>

          <div className="prose prose-invert max-w-none space-y-8">
            {/* Introduction */}
            <section>
              <p className="text-white/80 text-lg leading-relaxed">
                Welcome to Kryonex. These Terms of Service ("Terms") govern your access to and use of 
                the Kryonex AI phone answering and appointment booking platform (the "Service") 
                operated by Kryonex Technologies LLC ("Kryonex," "we," "us," or "our").
              </p>
              <p className="text-white/70 mt-4">
                By accessing or using our Service, you agree to be bound by these Terms. If you 
                disagree with any part of the Terms, you may not access the Service.
              </p>
            </section>

            {/* Service Description */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-4">1. Service Description</h2>
              <div className="text-white/70 space-y-3">
                <p>Kryonex provides:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>AI-powered phone answering service for businesses</li>
                  <li>Automated appointment booking and scheduling</li>
                  <li>Call recording, transcription, and analysis</li>
                  <li>SMS/text message notifications and alerts</li>
                  <li>Lead management and customer relationship tools</li>
                  <li>Integration with third-party calendar services</li>
                </ul>
              </div>
            </section>

            {/* Eligibility */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-4">2. Eligibility</h2>
              <p className="text-white/70">
                You must be at least 18 years old and have the legal authority to enter into these 
                Terms. By using the Service, you represent that you meet these requirements and have 
                the authority to bind your business to these Terms.
              </p>
            </section>

            {/* Account Registration */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-4">3. Account Registration</h2>
              <div className="text-white/70 space-y-3">
                <p>To use our Service, you must:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Provide accurate, current, and complete information</li>
                  <li>Maintain the security of your account credentials</li>
                  <li>Promptly update any information that changes</li>
                  <li>Accept responsibility for all activities under your account</li>
                </ul>
                <p className="mt-3">
                  You are responsible for maintaining the confidentiality of your account and password.
                </p>
              </div>
            </section>

            {/* SMS/Communications Consent - CRITICAL FOR A2P 10DLC */}
            <section className="bg-neon-cyan/5 border border-neon-cyan/20 rounded-2xl p-6">
              <h2 className="text-xl font-semibold text-white flex items-center gap-3 mb-4">
                <MessageSquare className="text-neon-cyan" size={22} />
                4. SMS/Text Message Communications
              </h2>
              <div className="text-white/70 space-y-4">
                <p>
                  <strong className="text-white">Consent to SMS:</strong> By providing your phone number 
                  and creating an account, you expressly consent to receive SMS/text messages from 
                  Kryonex Technologies LLC related to your account and our Service.
                </p>
                
                <p>
                  <strong className="text-white">Types of Messages:</strong> You may receive:
                </p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Account verification and security codes</li>
                  <li>Appointment confirmations and reminders</li>
                  <li>Lead alerts and call notifications</li>
                  <li>Service updates and important notices</li>
                  <li>Billing and payment reminders</li>
                </ul>
                
                <p>
                  <strong className="text-white">Message Frequency:</strong> Message frequency varies. 
                  You may receive multiple messages per day based on your account activity.
                </p>
                
                <p>
                  <strong className="text-white">Carrier Fees:</strong> Message and data rates may apply. 
                  You are responsible for any fees charged by your mobile carrier.
                </p>
                
                <div className="mt-4 p-4 bg-white/5 rounded-xl border border-white/10">
                  <p className="text-white font-semibold mb-2">Opt-Out Instructions:</p>
                  <p>
                    To stop receiving SMS messages, reply <strong className="text-neon-cyan">STOP</strong> to 
                    any message. You will receive a one-time confirmation of your opt-out. You may 
                    also opt out by emailing{" "}
                    <a href="mailto:support@kryonextech.com" className="text-neon-cyan hover:underline">
                      support@kryonextech.com
                    </a>.
                  </p>
                  <p className="mt-2">
                    To receive help, reply <strong className="text-neon-cyan">HELP</strong> to any message 
                    or contact support.
                  </p>
                </div>
              </div>
            </section>

            {/* Call Recording */}
            <section className="bg-neon-purple/5 border border-neon-purple/20 rounded-2xl p-6">
              <h2 className="text-xl font-semibold text-white flex items-center gap-3 mb-4">
                <Phone className="text-neon-purple" size={22} />
                5. Call Recording and AI Services
              </h2>
              <div className="text-white/70 space-y-4">
                <p>
                  <strong className="text-white">Call Recording:</strong> You acknowledge and agree that 
                  all calls handled by our AI service will be recorded. You are responsible for ensuring 
                  compliance with all applicable laws regarding call recording in your jurisdiction.
                </p>
                <p>
                  <strong className="text-white">Caller Disclosure:</strong> Our AI will inform callers 
                  that the call may be recorded. By using our Service, you authorize this disclosure.
                </p>
                <p>
                  <strong className="text-white">AI Limitations:</strong> While our AI strives for accuracy, 
                  it may occasionally misunderstand or mishandle calls. You agree that Kryonex is not 
                  liable for any errors or omissions made by the AI during call handling.
                </p>
                <p>
                  <strong className="text-white">Customer Consent:</strong> You represent that you have 
                  obtained all necessary consents from your customers for the use of AI services, call 
                  recording, and SMS communications as required by applicable law.
                </p>
              </div>
            </section>

            {/* Payment Terms */}
            <section>
              <h2 className="text-xl font-semibold text-white flex items-center gap-3 mb-4">
                <CreditCard className="text-neon-cyan" size={22} />
                6. Payment Terms
              </h2>
              <div className="text-white/70 space-y-3">
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li>Subscription fees are billed monthly in advance</li>
                  <li>All fees are non-refundable unless otherwise stated</li>
                  <li>Usage overages will be billed at the rates specified in your plan</li>
                  <li>We reserve the right to change pricing with 30 days' notice</li>
                  <li>Failed payments may result in service suspension</li>
                </ul>
              </div>
            </section>

            {/* Acceptable Use */}
            <section>
              <h2 className="text-xl font-semibold text-white flex items-center gap-3 mb-4">
                <AlertTriangle className="text-neon-gold" size={22} />
                7. Acceptable Use Policy
              </h2>
              <div className="text-white/70 space-y-3">
                <p>You agree NOT to use the Service to:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Violate any laws or regulations</li>
                  <li>Send spam or unsolicited messages</li>
                  <li>Harass, threaten, or defraud others</li>
                  <li>Transmit malware or harmful code</li>
                  <li>Interfere with the Service's operation</li>
                  <li>Impersonate others or misrepresent your identity</li>
                  <li>Collect data without proper authorization</li>
                  <li>Use the Service for illegal telemarketing</li>
                </ul>
                <p className="mt-3 text-neon-pink">
                  Violation of this policy may result in immediate termination of your account.
                </p>
              </div>
            </section>

            {/* Intellectual Property */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-4">8. Intellectual Property</h2>
              <p className="text-white/70">
                The Service and its original content, features, and functionality are owned by 
                Kryonex Technologies LLC and are protected by copyright, trademark, and other 
                intellectual property laws. You may not copy, modify, or distribute any part of 
                the Service without our written consent.
              </p>
            </section>

            {/* Limitation of Liability */}
            <section>
              <h2 className="text-xl font-semibold text-white flex items-center gap-3 mb-4">
                <Scale className="text-white/60" size={22} />
                9. Limitation of Liability
              </h2>
              <div className="text-white/70 space-y-3">
                <p>
                  TO THE MAXIMUM EXTENT PERMITTED BY LAW, KRYONEX SHALL NOT BE LIABLE FOR ANY 
                  INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING 
                  BUT NOT LIMITED TO LOSS OF PROFITS, DATA, OR BUSINESS OPPORTUNITIES.
                </p>
                <p>
                  Our total liability for any claims arising from the Service shall not exceed 
                  the amount you paid us in the twelve (12) months preceding the claim.
                </p>
                <p>
                  We do not guarantee that the Service will be uninterrupted, secure, or error-free. 
                  The AI may occasionally make mistakes in handling calls or scheduling appointments.
                </p>
              </div>
            </section>

            {/* Indemnification */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-4">10. Indemnification</h2>
              <p className="text-white/70">
                You agree to indemnify and hold harmless Kryonex and its officers, directors, 
                employees, and agents from any claims, damages, losses, or expenses arising from 
                your use of the Service, violation of these Terms, or violation of any rights of 
                another party.
              </p>
            </section>

            {/* Termination */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-4">11. Termination</h2>
              <div className="text-white/70 space-y-3">
                <p>
                  Either party may terminate this agreement at any time. You may cancel your 
                  subscription through your account settings or by contacting support.
                </p>
                <p>
                  We may suspend or terminate your account immediately for:
                </p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Violation of these Terms</li>
                  <li>Non-payment of fees</li>
                  <li>Fraudulent or illegal activity</li>
                  <li>Abuse of the Service or its users</li>
                </ul>
                <p className="mt-3">
                  Upon termination, your right to use the Service ceases immediately. Data may 
                  be deleted after 30 days unless legally required to be retained.
                </p>
              </div>
            </section>

            {/* Governing Law */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-4">12. Governing Law</h2>
              <p className="text-white/70">
                These Terms shall be governed by and construed in accordance with the laws of 
                the State of Ohio, without regard to its conflict of law provisions. Any disputes 
                shall be resolved in the courts located in Ohio.
              </p>
            </section>

            {/* Changes to Terms */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-4">13. Changes to Terms</h2>
              <p className="text-white/70">
                We reserve the right to modify these Terms at any time. We will provide notice of 
                significant changes by email or through the Service. Your continued use of the 
                Service after changes become effective constitutes acceptance of the modified Terms.
              </p>
            </section>

            {/* Contact */}
            <section className="bg-white/5 rounded-2xl p-6 border border-white/10">
              <h2 className="text-xl font-semibold text-white mb-4">14. Contact Information</h2>
              <div className="text-white/70 space-y-2">
                <p>For questions about these Terms, contact us at:</p>
                <div className="mt-4">
                  <p className="text-white font-medium">Kryonex Technologies LLC</p>
                  <p>Email: <a href="mailto:legal@kryonextech.com" className="text-neon-cyan hover:underline">legal@kryonextech.com</a></p>
                  <p>Support: <a href="mailto:support@kryonextech.com" className="text-neon-cyan hover:underline">support@kryonextech.com</a></p>
                  <p>Website: <a href="https://kryonextech.com" className="text-neon-cyan hover:underline">kryonextech.com</a></p>
                </div>
              </div>
            </section>
          </div>

          {/* Footer links */}
          <div className="mt-10 pt-6 border-t border-white/10 flex flex-wrap gap-6 text-sm text-white/50">
            <Link to="/privacy" className="hover:text-neon-cyan transition">Privacy Policy</Link>
            <Link to="/" className="hover:text-neon-cyan transition">Home</Link>
            <Link to="/login" className="hover:text-neon-cyan transition">Login</Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
