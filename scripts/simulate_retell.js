/**
 * SIMULATE RETELL INBOUND CALL
 * Run: node scripts/simulate_retell.js
 * Requires: Server running (e.g. node server.js) and a phone number in agents table.
 *
 * Set env or edit below:
 *   WEBHOOK_URL  - default http://localhost:3000/webhooks/retell-inbound
 *   TO_NUMBER    - must match agents.phone_number in DB (e.g. +15045551234)
 */
const WEBHOOK_URL = process.env.WEBHOOK_URL || "http://localhost:3000/webhooks/retell-inbound";
const TO_NUMBER = process.env.TO_NUMBER || "+15045551234";
const MOCK_AGENT_ID = process.env.MOCK_AGENT_ID || "agent_oBeDL81029";

async function testWebhook() {
  console.log(`🚀 Sending mock Retell inbound to: ${WEBHOOK_URL}`);
  console.log(`   to_number: ${TO_NUMBER} (must exist in agents table)`);

  const payload = {
    event: "call_inbound",
    call_inbound: {
      agent_id: MOCK_AGENT_ID,
      agent_version: 1,
      from_number: "+18005559999",
      to_number: TO_NUMBER,
    },
  };

  try {
    const start = Date.now();
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const duration = Date.now() - start;

    console.log(`\n⏱️ Response time: ${duration}ms`);
    console.log(`   HTTP status: ${response.status}`);

    if (response.status !== 200) {
      const text = await response.text();
      console.error("❌ Non-200 body:", text);
      return;
    }

    const json = await response.json();
    console.log("\n✅ Response body:");
    console.log(JSON.stringify(json, null, 2));

    console.log("\n--- Checks ---");
    if (!json.call_inbound) {
      console.error("❌ Missing root 'call_inbound'.");
    } else {
      console.log("✅ Root 'call_inbound' present.");
      const vars = json.call_inbound.dynamic_variables;
      if (!vars) {
        console.error("❌ Missing 'dynamic_variables'.");
      } else {
        console.log("✅ 'dynamic_variables' present.");
        if (typeof vars.business_name === "string") {
          console.log(`✅ business_name: "${vars.business_name}"`);
        } else {
          console.error("❌ business_name missing or not a string.");
        }
      }
      if (json.call_inbound.agent_override?.retell_llm?.begin_message) {
        console.log("✅ begin_message override present.");
      } else {
        console.warn("⚠️ No begin_message override.");
      }
      if (json.call_inbound.override_agent_id) {
        console.log(`   override_agent_id: ${json.call_inbound.override_agent_id}`);
      } else {
        console.log("   (no override_agent_id — same as request agent)");
      }
    }
  } catch (err) {
    console.error("❌ Request failed:", err.message);
  }
}

testWebhook();
