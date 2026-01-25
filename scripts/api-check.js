const axios = require("axios");

const baseUrl = process.env.CHECK_BASE_URL || "http://localhost:3000";
const token = process.env.TEST_API_TOKEN || "";

const client = axios.create({
  baseURL: baseUrl,
  headers: token
    ? {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      }
    : {
        "Content-Type": "application/json",
      },
  timeout: 8000,
});

const tests = [
  {
    name: "Dashboard stats",
    method: "get",
    path: "/api/dashboard/stats",
    auth: true,
  },
  {
    name: "Create appointment (dry run)",
    method: "post",
    path: "/appointments",
    auth: true,
    data: {
      customer_name: "API Checker",
      start_date: new Date().toISOString().slice(0, 10),
      start_time: "12:00",
      duration_minutes: 60,
      reminder_minutes: 15,
    },
  },
  {
    name: "Fetch usage status",
    method: "get",
    path: "/usage/status",
    auth: true,
  },
  {
    name: "Trigger Retell demo call (simulated)",
    method: "post",
    path: "/retell/demo-call",
    auth: true,
    data: {
      leadPhone: "+15551234567",
      leadName: "API Tester",
    },
  },
];

const runTest = async (test) => {
  if (test.auth && !token) {
    console.log(`SKIP ${test.name} (needs TEST_API_TOKEN)`);
    return;
  }

  try {
    const response = await client.request({
      method: test.method,
      url: test.path,
      data: test.data,
    });
    console.log(
      `OK ${test.name} -> ${response.status} ${response.statusText}`
    );
  } catch (err) {
    const status = err.response?.status;
    const message =
      err.response?.data?.error || err.response?.data?.message || err.message;
    console.log(
      `FAIL ${test.name} -> ${status || "??"}: ${message
        .toString()
        .slice(0, 120)}`
    );
  }
};

const runAll = async () => {
  console.log(`Starting API check against ${baseUrl}`);
  for (const test of tests) {
    await runTest(test);
  }
};

runAll().catch((err) => {
  console.error("API check aborted:", err.message);
  process.exit(1);
});
