import React, { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import BackgroundGrid from "../components/BackgroundGrid.jsx";
import { DollarSign, Users, TrendingUp, Gift, ChevronDown, ChevronUp, Zap, Shield, Clock } from "lucide-react";

const UPFRONT_BONUS = 25;
const MONTHLY_PERCENT = 10;
const MAX_MONTHS = 12;
const AVG_PLAN_PRICE = 249; // Pro tier as default

export default function AffiliatePage() {
  const [referrals, setReferrals] = useState(5);
  const [expandedFaq, setExpandedFaq] = useState(null);

  // Calculator logic
  const upfrontTotal = referrals * UPFRONT_BONUS;
  const monthlyCommission = (AVG_PLAN_PRICE * MONTHLY_PERCENT) / 100;
  const yearlyPerReferral = UPFRONT_BONUS + (monthlyCommission * MAX_MONTHS);
  const yearlyTotal = referrals * yearlyPerReferral;

  const faqs = [
    {
      q: "Who can join the affiliate program?",
      a: "Anyone can join! Whether you're an existing customer, influencer, agency, or just someone who knows HVAC/plumbing businesses, you can earn commissions by referring new customers."
    },
    {
      q: "How do I get my referral link?",
      a: "Click 'Get Your Referral Link' to create a free affiliate account. You'll get your unique referral link instantly in your affiliate dashboard. No business setup required!"
    },
    {
      q: "When do I get paid?",
      a: "Commissions have a 30-day hold period to prevent fraud. After that, they become eligible for payout. You can request a payout once you reach the $50 minimum."
    },
    {
      q: "How does tracking work?",
      a: "When someone clicks your referral link, they're tagged with your unique code. If they sign up and become a paying customer, you get credited automatically."
    },
    {
      q: "Is there a limit to how much I can earn?",
      a: "No limits! The more customers you refer, the more you earn. Top affiliates are making thousands per month."
    },
    {
      q: "What if someone cancels or gets a refund?",
      a: "If a referred customer cancels within the first 30 days or requests a refund, the commission is clawed back. This protects against fraud."
    },
  ];

  return (
    <div className="affiliate-page">
      <BackgroundGrid />
      
      {/* Hero Section */}
      <section className="affiliate-hero">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="affiliate-hero-content"
        >
          <div className="affiliate-badge">AFFILIATE PROGRAM</div>
          <h1 className="affiliate-headline">
            Make <span className="highlight-green">$25</span> + <span className="highlight-cyan">10% Monthly</span>
          </h1>
          <p className="affiliate-subheadline">
            Earn recurring commissions for every HVAC or plumbing business you refer to Kryonex.
          </p>
          <div className="affiliate-hero-cta">
            <Link to="/affiliate/signup" className="btn-primary-glow">
              Get Your Referral Link
            </Link>
            <a href="#how-it-works" className="btn-secondary">
              Learn More
            </a>
          </div>
        </motion.div>
      </section>

      {/* Stats Bar */}
      <section className="affiliate-stats-bar">
        <div className="stat-item">
          <DollarSign size={24} />
          <div>
            <span className="stat-value">$25</span>
            <span className="stat-label">Upfront Bonus</span>
          </div>
        </div>
        <div className="stat-item">
          <TrendingUp size={24} />
          <div>
            <span className="stat-value">10%</span>
            <span className="stat-label">Monthly Commission</span>
          </div>
        </div>
        <div className="stat-item">
          <Clock size={24} />
          <div>
            <span className="stat-value">12</span>
            <span className="stat-label">Months of Payouts</span>
          </div>
        </div>
        <div className="stat-item">
          <Shield size={24} />
          <div>
            <span className="stat-value">$50</span>
            <span className="stat-label">Min Payout</span>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="affiliate-section">
        <h2 className="section-title">How It Works</h2>
        <div className="how-it-works-grid">
          <motion.div 
            className="step-card"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            <div className="step-number">01</div>
            <h3>Sign Up</h3>
            <p>Create a free account and get your unique referral link instantly.</p>
          </motion.div>
          <motion.div 
            className="step-card"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <div className="step-number">02</div>
            <h3>Share</h3>
            <p>Share your link with HVAC and plumbing businesses who need AI call handling.</p>
          </motion.div>
          <motion.div 
            className="step-card"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            <div className="step-number">03</div>
            <h3>They Subscribe</h3>
            <p>When they sign up and pay, you earn $25 + 10% monthly (after 30-day hold).</p>
          </motion.div>
          <motion.div 
            className="step-card"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 }}
          >
            <div className="step-number">04</div>
            <h3>Get Paid</h3>
            <p>After 30-day verification, request payout anytime ($50 minimum).</p>
          </motion.div>
        </div>
      </section>

      {/* Earnings Calculator */}
      <section className="affiliate-section calculator-section">
        <h2 className="section-title">Earnings Calculator</h2>
        <div className="calculator-card glass">
          <div className="calculator-input">
            <label>How many businesses will you refer?</label>
            <div className="slider-container">
              <input
                type="range"
                min="1"
                max="50"
                value={referrals}
                onChange={(e) => setReferrals(parseInt(e.target.value))}
                className="affiliate-slider"
              />
              <div className="slider-value">{referrals}</div>
            </div>
          </div>
          
          <div className="calculator-results">
            <div className="result-row">
              <span>Upfront Bonuses</span>
              <span className="result-value">${upfrontTotal.toLocaleString()}</span>
            </div>
            <div className="result-row">
              <span>Monthly Commissions (avg)</span>
              <span className="result-value">${(referrals * monthlyCommission).toFixed(0)}/mo</span>
            </div>
            <div className="result-row total">
              <span>First Year Total</span>
              <span className="result-value highlight">${yearlyTotal.toLocaleString()}</span>
            </div>
          </div>
          
          <p className="calculator-note">
            *Based on Pro plan ($249/mo). Higher tier referrals = higher commissions.
          </p>
        </div>
      </section>

      {/* Why Join */}
      <section className="affiliate-section">
        <h2 className="section-title">Why Affiliates Love Kryonex</h2>
        <div className="benefits-grid">
          <div className="benefit-card">
            <Gift className="benefit-icon" />
            <h3>Generous Commissions</h3>
            <p>$25 upfront + 10% monthly for a full year. Most programs only pay once.</p>
          </div>
          <div className="benefit-card">
            <Users className="benefit-icon" />
            <h3>Perfect Niche</h3>
            <p>HVAC and plumbing businesses desperately need this. Easy sell.</p>
          </div>
          <div className="benefit-card">
            <Zap className="benefit-icon" />
            <h3>High Retention</h3>
            <p>Our AI books real appointments. Customers stay for years = you earn for years.</p>
          </div>
          <div className="benefit-card">
            <Shield className="benefit-icon" />
            <h3>Fraud Protection</h3>
            <p>30-day hold ensures quality referrals. No chargebacks on your earnings.</p>
          </div>
        </div>
      </section>

      {/* Commission Breakdown */}
      <section className="affiliate-section">
        <h2 className="section-title">Commission Breakdown</h2>
        <div className="commission-table glass">
          <div className="commission-header">
            <span>Plan</span>
            <span>Monthly Price</span>
            <span>Your 10%</span>
            <span>12-Month Total</span>
          </div>
          <div className="commission-row">
            <span>Core</span>
            <span>$149/mo</span>
            <span className="highlight-cyan">$14.90/mo</span>
            <span className="highlight-green">$203.80</span>
          </div>
          <div className="commission-row">
            <span>Pro</span>
            <span>$249/mo</span>
            <span className="highlight-cyan">$24.90/mo</span>
            <span className="highlight-green">$323.80</span>
          </div>
          <div className="commission-row">
            <span>Elite</span>
            <span>$497/mo</span>
            <span className="highlight-cyan">$49.70/mo</span>
            <span className="highlight-green">$621.40</span>
          </div>
          <div className="commission-row">
            <span>Scale</span>
            <span>$997/mo</span>
            <span className="highlight-cyan">$99.70/mo</span>
            <span className="highlight-green">$1,221.40</span>
          </div>
          <p className="commission-note">Plus $25 upfront bonus on every referral!</p>
        </div>
      </section>

      {/* FAQ */}
      <section className="affiliate-section">
        <h2 className="section-title">Frequently Asked Questions</h2>
        <div className="faq-list">
          {faqs.map((faq, idx) => (
            <div 
              key={idx} 
              className={`faq-item ${expandedFaq === idx ? 'expanded' : ''}`}
              onClick={() => setExpandedFaq(expandedFaq === idx ? null : idx)}
            >
              <div className="faq-question">
                <span>{faq.q}</span>
                {expandedFaq === idx ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>
              {expandedFaq === idx && (
                <motion.div 
                  className="faq-answer"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ duration: 0.2 }}
                >
                  {faq.a}
                </motion.div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="affiliate-final-cta">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="final-cta-content"
        >
          <h2>Ready to Start Earning?</h2>
          <p>Join thousands of affiliates making passive income with Kryonex.</p>
          <Link to="/affiliate/signup" className="btn-primary-glow large">
            Start Earning Now
          </Link>
          <p className="cta-subtext">Free signup, instant referral link, no business setup required</p>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="affiliate-footer">
        <p>&copy; {new Date().getFullYear()} Kryonex Tech. All rights reserved.</p>
        <div className="footer-links">
          <Link to="/affiliate/signup">Become an Affiliate</Link>
          <span>|</span>
          <Link to="/login">Sign In</Link>
          <span>|</span>
          <a href="mailto:support@kryonextech.com">Support</a>
        </div>
      </footer>
    </div>
  );
}
