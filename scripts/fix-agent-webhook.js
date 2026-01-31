/**
 * FIX AGENT WEBHOOK URL
 * 
 * This script:
 * 1. Gets the phone number from Retell to find the inbound_agent_id
 * 2. Updates that agent's webhook_url to point to your server
 * 
 * Run: node scripts/fix-agent-webhook.js
 * 
 * Env (or edit below):
 *   RETELL_API_KEY - your Retell API key
 *   PHONE_NUMBER - E.164 format, e.g. +14154297307
 *   SERVER_URL - your Railway URL, e.g. https://kryonex-wizard-production.up.railway.app
 */

require("dotenv").config();

const RETELL_API_KEY = process.env.RETELL_API_KEY;
const PHONE_NUMBER = process.env.PHONE_NUMBER || "+14154297307";
const SERVER_URL = process.env.SERVER_URL || "https://kryonex-wizard-production.up.railway.app";

if (!RETELL_API_KEY) {
  console.error("❌ Missing RETELL_API_KEY in .env");
  process.exit(1);
}

const WEBHOOK_URL = `${SERVER_URL.replace(/\/$/, "")}/retell-webhook`;

async function main() {
  console.log("🔧 Fixing agent webhook URL...\n");
  console.log(`Phone Number: ${PHONE_NUMBER}`);
  console.log(`Target Webhook: ${WEBHOOK_URL}\n`);

  // Step 1: Get phone number info from Retell
  console.log("1️⃣ Getting phone number from Retell...");
  const phoneRes = await fetch(`https://api.retellai.com/get-phone-number/${encodeURIComponent(PHONE_NUMBER)}`, {
    headers: { "Authorization": `Bearer ${RETELL_API_KEY}` }
  });

  if (!phoneRes.ok) {
    const text = await phoneRes.text();
    console.error(`❌ Failed to get phone number: ${phoneRes.status}`, text);
    process.exit(1);
  }

  const phoneData = await phoneRes.json();
  console.log("   Phone number data:");
  console.log(`   - inbound_agent_id: ${phoneData.inbound_agent_id || "(not set)"}`);
  console.log(`   - outbound_agent_id: ${phoneData.outbound_agent_id || "(not set)"}`);
  console.log(`   - inbound_webhook_url: ${phoneData.inbound_webhook_url || "(not set)"}`);

  const agentId = phoneData.inbound_agent_id;
  if (!agentId) {
    console.error("\n❌ No inbound_agent_id on this phone number!");
    console.log("   The phone number needs an agent assigned.");
    process.exit(1);
  }

  // Step 2: Get current agent config
  console.log(`\n2️⃣ Getting agent ${agentId}...`);
  const agentRes = await fetch(`https://api.retellai.com/get-agent/${agentId}`, {
    headers: { "Authorization": `Bearer ${RETELL_API_KEY}` }
  });

  if (!agentRes.ok) {
    const text = await agentRes.text();
    console.error(`❌ Failed to get agent: ${agentRes.status}`, text);
    process.exit(1);
  }

  const agentData = await agentRes.json();
  console.log("   Current agent config:");
  console.log(`   - agent_name: ${agentData.agent_name || "(none)"}`);
  console.log(`   - webhook_url: ${agentData.webhook_url || "(NOT SET - this is the problem!)"}`);

  if (agentData.webhook_url === WEBHOOK_URL) {
    console.log("\n✅ webhook_url is already correct!");
    return;
  }

  // Step 3: Update agent with correct webhook_url
  console.log(`\n3️⃣ Updating agent webhook_url to: ${WEBHOOK_URL}`);
  const updateRes = await fetch(`https://api.retellai.com/update-agent/${agentId}`, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${RETELL_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      webhook_url: WEBHOOK_URL
    })
  });

  if (!updateRes.ok) {
    const text = await updateRes.text();
    console.error(`❌ Failed to update agent: ${updateRes.status}`, text);
    process.exit(1);
  }

  const updatedAgent = await updateRes.json();
  console.log(`\n✅ Agent updated successfully!`);
  console.log(`   - webhook_url: ${updatedAgent.webhook_url}`);

  console.log("\n🎉 Done! Now when calls end, Retell will POST to:");
  console.log(`   ${WEBHOOK_URL}`);
  console.log("\n   Make another test call and check Railway logs for 'POST /retell-webhook'");
}

main().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
