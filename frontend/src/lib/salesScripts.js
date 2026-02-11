// Sales Scripts for Live Script Templates Page
// Edit this file to update script content

export const SCRIPT_CATEGORIES = [
  { id: "intro", label: "Intro / Opener", icon: "👋" },
  { id: "qualifying", label: "Qualifying Questions", icon: "❓" },
  { id: "what-it-does", label: "What This Does", icon: "🎯" },
  { id: "how-it-works", label: "How It Works", icon: "⚙️" },
  { id: "pricing", label: "Why It Costs This Much", icon: "💰" },
  { id: "plan-breakdown", label: "Plan Breakdown", icon: "📊" },
  { id: "upsell-elite", label: "Upsell to ELITE", icon: "⬆️" },
  { id: "upsell-scale", label: "Upsell to SCALE", icon: "🚀" },
  { id: "objections", label: "Objection Handling", icon: "🛡️" },
  { id: "after-hours", label: "After-Hours Pitch", icon: "🌙" },
  { id: "text-first", label: "Text-First Scripts", icon: "💬" },
  { id: "voicemail", label: "Voicemail Scripts", icon: "📞" },
  { id: "follow-up", label: "Follow-Up Scripts", icon: "🔄" },
];

export const SCRIPTS = {
  intro: {
    title: "Intro / Opener",
    content: `**Cold Call Opener:**

"Hey, is this [OWNER NAME]? Perfect — I'll keep this quick.

I built something that stops HVAC and plumbing shops from missing calls when they're on the job. It answers 24/7, books appointments, and sends you a transcript plus recording of every call.

Most shops are losing $3,000–$10,000 a month in missed calls without even knowing it. Have 60 seconds?"

---

**If They Say "Who is this?":**

"My name's [YOUR NAME], I run a tech company that builds AI phone agents specifically for service contractors. We're not selling leads — we help you capture the ones you're already missing."

---

**If They Sound Rushed:**

"Totally get it — you're busy. Quick question: if you're missing calls right now while you're on the job, would you want to know? That's literally what I help fix."

---

**Warm Intro (Referral):**

"Hey [NAME], [REFERRER] gave me your number — said you'd want to hear about this. I built an AI that answers your business line 24/7, books jobs, and sends you transcripts. He's using it and said it's been solid. Got a minute?"`,
  },

  qualifying: {
    title: "Qualifying Questions",
    content: `**Discovery Questions (pick 2-3):**

1. "How many calls do you think you miss on a typical day when you're on a job?"

2. "What happens right now when a customer calls and you can't pick up?"

3. "Do you have someone answering phones full-time, or is it just you?"

4. "When was the last time you lost a job because you couldn't answer in time?"

5. "Are you running any ads right now — Google, Facebook, anything?"

6. "What's your biggest bottleneck right now — leads, labor, or something else?"

---

**Budget Qualifier:**

"Just so I don't waste your time — this runs $249 to $997 a month depending on volume. If that's way outside your range, no hard feelings. But if you're losing even one or two jobs a month to missed calls, it pays for itself. Does that make sense to at least look at?"

---

**Decision Maker Check:**

"Are you the one who handles decisions on tools like this, or is there someone else I'd need to loop in?"

---

**Urgency Check:**

"Is this something you'd want to get set up soon, or more of a 'maybe later' thing? I ask because we can usually have you live in 24 hours."`,
  },

  "what-it-does": {
    title: "What This Does",
    content: `**The One-Liner:**

"It's an AI that answers your phone 24/7, talks to customers like a real person, books appointments on your calendar, and sends you a transcript and recording of every call."

---

**The 30-Second Version:**

"Here's what it actually does:

- When someone calls and you can't pick up, the AI answers — not a voicemail, an actual conversation.
- It asks what's wrong, gets their info, and books them on your calendar.
- You get a text with the full transcript and a recording, so you know exactly what was said.
- If it's urgent, it flags it. If it needs a callback, it tells you.
- Works nights, weekends, holidays — whenever you're unavailable."

---

**What Makes It Different:**

"Most answering services just take a message. This actually handles the call — qualifies the lead, books the job, and gives you everything you need to follow up. You're not paying someone $15/hour to say 'leave a message.'"

---

**Common Use Cases:**

- Missed calls while on a job
- After-hours emergency calls
- Weekend/holiday coverage
- Overflow during busy season
- Qualifying tire-kickers before you call back`,
  },

  "how-it-works": {
    title: "How It Works",
    content: `**Setup Process:**

"We get you live in about 24 hours. Here's how:

1. You sign up and pick your plan
2. We build your AI agent — trained on your business, your services, your pricing
3. We either give you a new number or forward your existing line
4. You connect your calendar (Google, Outlook, or Cal.com)
5. You're live. Every missed call gets handled."

---

**Technical Explanation (if they ask):**

"The AI uses natural language processing — same tech as ChatGPT but fine-tuned for phone conversations. It listens, responds in real-time, and adapts to what the caller says. It's not a phone tree or a bot that reads a script. It actually converses."

---

**What You See:**

"Every call shows up in your dashboard:
- Full transcript
- Audio recording
- Caller info
- Sentiment analysis (were they happy, frustrated, urgent?)
- Whether an appointment was booked
- Recommended follow-up"

---

**Integration Points:**

- Calendar: Google Calendar, Outlook, Cal.com
- Phone: We give you a number or forward your existing line
- Notifications: SMS and email alerts for every call
- CRM: Zapier integration available`,
  },

  pricing: {
    title: "Why It Costs This Much",
    content: `**The Value Frame:**

"Let me ask you this — what's one new job worth to you? $300? $500? $1,000?

If you're missing even 2 or 3 calls a month that would've converted, you're already losing more than this costs. The AI pays for itself if it catches ONE job you would've missed."

---

**Cost Comparison:**

"A part-time receptionist runs you $2,000+ a month.
An answering service that actually books? $500+, and they still miss stuff.
This is $249/month for 24/7 coverage that never calls in sick."

---

**The ROI Breakdown:**

"At $249/month, if you close just ONE extra job per month from a call you would've missed — you're up $1,000+. That's a 4x return. And that's the low end."

---

**If They Push Back on Price:**

"I hear you. But think about it this way — you're already paying for missed calls. You're just paying in lost revenue instead of a monthly fee. This flips that."

---

**Why Not Cheaper:**

"We're not a call center in the Philippines reading a script. This is custom AI, trained on your business, running 24/7, booking real appointments. The tech costs money to run. But it costs less than losing jobs."`,
  },

  "plan-breakdown": {
    title: "Plan Breakdown (PRO / ELITE / SCALE)",
    content: `**PRO — $249/month**
*Launch & Capture*

"For new operations and solo players getting their first consistent lead flow. Stops the bleeding of missed calls."

- 300 Minutes / 1,000 Texts
- Full AI Command Access (Standard)
- Automated Lead Triage
- Smart Call Routing

*Best for:* Businesses just starting to run ads.

---

**ELITE — $497/month**
*Momentum & Growth*

"For active businesses that are scaling up and can't afford a single second of downtime or a missed booking."

- 800 Minutes / 3,000 Texts
- Full AI Command Access (Standard)
- Priority Processing Pipeline
- High-Volume Lead Management

*Best for:* Cheaper than buying PRO + Top-ups if you're scaling.

---

**SCALE — $997/month**
*Dominance & Empire*

"For the heavy hitters. Unrestricted volume for businesses that never want to worry about 'limits' again."

- 3,000 Minutes / 5,000 Texts
- Full AI Command Access (Standard)
- Enterprise-Level Data Handling
- Unlimited Location Support

*Best for:* The absolute lowest cost-per-minute for high-volume users.

---

**Quick Recommendation:**

- Just starting out or testing? → PRO
- Running ads and getting 20+ calls/week? → ELITE
- Multi-location or 50+ calls/week? → SCALE`,
  },

  "upsell-elite": {
    title: "Upsell to ELITE",
    content: `**When They're on PRO and Hitting Limits:**

"Hey, I noticed you're burning through your minutes pretty fast. That's a good problem — means you're getting calls. But here's the thing: if you go over on PRO, you're paying for top-ups at a higher rate.

ELITE gives you 800 minutes for $497. That's actually cheaper per minute than buying PRO + top-ups. And you get priority processing, so your calls get handled faster during peak times."

---

**The Math:**

"Right now you're at $249 for 300 minutes. That's about $0.83/minute.
ELITE is $497 for 800 minutes — that's $0.62/minute.
If you're using 500+ minutes a month, ELITE saves you money."

---

**The Soft Push:**

"I'm not trying to upsell you for the sake of it. But if you're growing, ELITE is built for that. You get more headroom, better rates, and you're not watching your minutes like a hawk."

---

**If They Hesitate:**

"Tell you what — stay on PRO this month, track your usage, and if you're consistently over 300 minutes, we'll bump you up. No pressure. I just don't want you overpaying for top-ups when there's a better option."`,
  },

  "upsell-scale": {
    title: "Upsell to SCALE",
    content: `**When They're a Heavy Hitter:**

"Look, you're running serious volume. At SCALE, you get 3,000 minutes and 5,000 texts for $997. That's about $0.33/minute — the lowest rate we offer.

You're past the point of worrying about limits. SCALE is 'set it and forget it.' Unlimited locations, enterprise-level handling, and you never think about minutes again."

---

**The Multi-Location Pitch:**

"If you've got more than one location, SCALE is the only plan that makes sense. You get unlimited location support, so you can run the AI across all your shops without juggling separate accounts."

---

**The Math:**

"ELITE is $497 for 800 minutes — $0.62/minute.
SCALE is $997 for 3,000 minutes — $0.33/minute.
If you're doing 1,500+ minutes a month, SCALE pays for itself."

---

**The Dominance Frame:**

"At this level, you're not competing with other shops on price. You're competing on responsiveness. SCALE means every call gets answered, every lead gets captured, and you're never the guy who 'didn't pick up.' That's how you own a market."

---

**If They're Close:**

"You're already spending $500+ on ELITE or PRO + top-ups. For another $500, you 4x your capacity and never think about it again. It's a no-brainer at your volume."`,
  },

  objections: {
    title: "Objection Handling",
    content: `**"I need to think about it."**

"Totally fair. What specifically do you want to think over — the price, the tech, or just whether this is the right time?"

*(Get to the real objection, then address it.)*

---

**"I don't have the budget right now."**

"I hear you. But here's the thing — you're already paying for missed calls. You're just paying in lost revenue instead of a monthly fee. If this catches even one job a month, it pays for itself. Does that math make sense?"

---

**"I already have an answering service."**

"Cool — how's that working? Are they actually booking appointments, or just taking messages? Because most answering services cost more and do less. This books jobs directly on your calendar."

---

**"I don't trust AI to talk to my customers."**

"That's fair. But here's the thing — the AI doesn't replace you. It catches the calls you CAN'T take. Would you rather miss the call entirely, or have the AI grab their info so you can call back?"

---

**"What if the AI messes up?"**

"You get a recording and transcript of every call. If something goes sideways, you see it immediately and can call the customer back. But honestly? The AI handles 95%+ of calls without issues."

---

**"I'm too busy to set this up."**

"Setup takes 24 hours and we do most of it. You answer a few questions, connect your calendar, and you're live. It's designed for busy contractors who don't have time to mess with tech."

---

**"Send me some info."**

"Sure, I can do that. But honestly, the best way to see it is a quick demo. Takes 5 minutes and you'll know right away if it's a fit. Can we do that instead?"`,
    hasSubItems: true,
    subItems: [
      {
        id: "obj-think",
        label: "I need to think about it",
        summary: "Get to the real objection: 'What specifically do you want to think over — the price, the tech, or the timing?' Then address that directly. Don't let them leave without uncovering what's actually holding them back.",
      },
      {
        id: "obj-budget",
        label: "I don't have the budget",
        summary: "Reframe: They're already paying for missed calls in lost revenue. If the AI catches ONE job per month, it pays for itself. The question isn't cost — it's ROI.",
      },
      {
        id: "obj-answering",
        label: "I already have an answering service",
        summary: "Ask how it's working. Most services just take messages — they don't book. This books appointments directly on your calendar and costs less than most answering services.",
      },
      {
        id: "obj-trust-ai",
        label: "I don't trust AI",
        summary: "The AI doesn't replace you — it catches calls you CAN'T take. Choice is: miss the call entirely, or have AI grab their info for callback. Which is worse?",
      },
      {
        id: "obj-mess-up",
        label: "What if AI messes up?",
        summary: "Every call has a recording and transcript. If something goes wrong, you see it immediately and call back. But 95%+ of calls are handled without issues.",
      },
      {
        id: "obj-busy",
        label: "I'm too busy to set up",
        summary: "Setup is 24 hours and we do most of it. Just answer a few questions, connect calendar, done. Built for contractors who don't have time for tech.",
      },
      {
        id: "obj-send-info",
        label: "Just send me info",
        summary: "Pivot to demo: 'The best way to see it is a 5-minute demo. You'll know right away if it fits. Can we do that instead?' Info gets ignored; demos convert.",
      },
    ],
  },

  "after-hours": {
    title: "After-Hours Pitch",
    content: `**The After-Hours Angle:**

"Quick question — what happens when someone calls you at 8pm with a burst pipe? Do you have someone answering, or does it go to voicemail?"

*(Wait for answer)*

"Here's the thing — emergencies don't happen 9-to-5. And when someone's got water in their basement, they're calling the first person who picks up. If that's not you, it's your competitor.

The AI answers 24/7 — nights, weekends, holidays. It handles the call, books the job, and texts you the details. You can follow up in the morning, or if it's urgent, you know immediately."

---

**The Emergency Play:**

"For emergency calls, the AI flags them as urgent. You get a text right away with what's happening. You can call back if it's real, or let the AI book a next-day appointment if it can wait."

---

**The Weekend Frame:**

"Most contractors turn their phones off on weekends. I get it — you need a break. But you're also losing jobs to whoever IS answering. The AI lets you unplug without losing business."

---

**The Vacation Pitch:**

"What happens when you take a week off? Do you just lose all those calls? With the AI, you're covered. It handles everything, books appointments for when you're back, and you don't come home to a dead pipeline."`,
  },

  "text-first": {
    title: "Text-First Scripts",
    content: `**Initial Outreach Text:**

"Hey [NAME], this is [YOUR NAME]. I built something that stops HVAC/plumbing shops from missing calls. It answers 24/7, books jobs, and sends you transcripts. 

Most shops miss $3K-$10K/month without knowing it.

Worth a quick look? [LINK]"

---

**Follow-Up Text (No Response):**

"Hey [NAME], following up — did you get a chance to check out the demo? If you're missing calls while on jobs, this fixes that. Happy to walk you through it."

---

**Text After Voicemail:**

"Hey, just left you a voicemail. Quick version: I help contractors stop losing calls when they're busy. AI answers 24/7, books appointments, sends you recordings.

Let me know if you want to see it."

---

**Demo Link Text:**

"Here's the demo link: [LINK]

Takes 3 minutes. Shows exactly how it works. Let me know what you think."

---

**Urgency Text (Limited Time):**

"Hey [NAME], we're doing a pilot program with contractors this month — $50 off the first month if you get set up this week. Want in?"

---

**Social Proof Text:**

"Hey, just set up [COMPETITOR/SIMILAR BUSINESS] with this. They were missing 8-10 calls a week. Now they're not. Worth 5 minutes to see if it helps you?"`,
  },

  voicemail: {
    title: "Voicemail Scripts",
    content: `**Standard Voicemail (15 seconds):**

"Hey [NAME], this is [YOUR NAME]. I built something that stops contractors from missing calls — AI answers 24/7, books jobs, sends you recordings.

Most shops are losing thousands a month to missed calls. If you want to see it, give me a call back or check out [YOUR WEBSITE].

Talk soon."

---

**Short Voicemail (10 seconds):**

"Hey, it's [YOUR NAME]. I help HVAC and plumbing shops stop missing calls. Quick demo at [WEBSITE]. Call me back if you want to see it."

---

**Curiosity Voicemail:**

"Hey [NAME], it's [YOUR NAME]. I've got something I think could make you an extra $3,000 to $5,000 a month. Not selling leads — it's different. Call me back when you get a sec."

---

**Follow-Up Voicemail:**

"Hey [NAME], following up from my call last week. Still want to show you how to stop missing calls. Takes 5 minutes. Give me a ring when you're free."

---

**Last Attempt Voicemail:**

"Hey [NAME], last voicemail from me — I don't want to keep bugging you. But if you're losing jobs to missed calls, this fixes that. [WEBSITE] or call me back. Either way, good luck out there."`,
  },

  "follow-up": {
    title: "Follow-Up Scripts",
    content: `**Day 1 - After Demo:**

"Hey [NAME], great talking to you earlier. Just wanted to follow up — any questions about what we covered? I can have you live by tomorrow if you're ready to roll."

---

**Day 3 - No Response:**

"Hey [NAME], circling back. Still interested in getting that AI set up? If timing's not right, no worries — just let me know either way."

---

**Day 7 - Soft Nudge:**

"Hey [NAME], one more check-in. The offer we talked about is still good if you want to move forward. Otherwise, I'll assume now's not the right time and leave you alone. Just shoot me a text either way."

---

**Day 14 - Final Follow-Up:**

"Hey [NAME], last message from me. If you ever want to revisit the AI answering service, I'm here. Good luck with the business."

---

**After They Go Cold (30 days):**

"Hey [NAME], it's been a few weeks. Just curious — are you still missing calls, or did you find another solution? Either way, no pitch — just checking in."

---

**Re-Engagement (60+ days):**

"Hey [NAME], we talked a while back about AI call answering. We've added some new features since then. Worth a fresh look if you're still losing calls. Let me know if you want a quick update."

---

**Post-No Follow-Up:**

"Hey [NAME], no worries on passing. If things change down the road, door's always open. Good luck with the busy season."`,
  },
};

export default SCRIPTS;
