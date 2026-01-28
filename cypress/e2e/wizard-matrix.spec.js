const getProjectRef = (supabaseUrl) => {
  try {
    const { hostname } = new URL(supabaseUrl);
    return hostname.split(".")[0];
  } catch {
    return null;
  }
};

const setSupabaseSession = (supabaseUrl, session) => {
  const ref = getProjectRef(supabaseUrl);
  if (!ref) return;
  const storageKey = `sb-${ref}-auth-token`;
  window.localStorage.setItem(storageKey, JSON.stringify(session));
};

const login = () => {
  const email = Cypress.env("TEST_EMAIL");
  const password = Cypress.env("TEST_PASSWORD");

  expect(email, "CYPRESS_TEST_EMAIL").to.be.a("string").and.not.be.empty;
  expect(password, "CYPRESS_TEST_PASSWORD").to.be.a("string").and.not.be.empty;

  const supabaseUrl = Cypress.env("SUPABASE_URL");
  const supabaseAnonKey = Cypress.env("SUPABASE_ANON_KEY");

  if (supabaseUrl && supabaseAnonKey) {
    cy.request({
      method: "POST",
      url: `${supabaseUrl}/auth/v1/token?grant_type=password`,
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: {
        email,
        password,
      },
    }).then((response) => {
      const session = {
        access_token: response.body.access_token,
        token_type: response.body.token_type,
        expires_in: response.body.expires_in,
        expires_at: response.body.expires_at,
        refresh_token: response.body.refresh_token,
        user: response.body.user,
      };
      cy.visit("/", {
        onBeforeLoad(win) {
          setSupabaseSession(supabaseUrl, session);
          win.localStorage.setItem("kryonex_session_ok", "1");
        },
      });
    });
    return;
  }

  cy.visit("/login");
  cy.get('input[type="email"]').clear().type(email);
  cy.get('input[type="password"]').clear().type(password);
  cy.contains("SIGN IN").click();
  cy.url().should("not.include", "/login");
};

const visitAuthed = (path, options = {}) => {
  const supabaseUrl = Cypress.env("SUPABASE_URL");
  const supabaseAnonKey = Cypress.env("SUPABASE_ANON_KEY");
  const email = Cypress.env("TEST_EMAIL");
  const password = Cypress.env("TEST_PASSWORD");

  if (supabaseUrl && supabaseAnonKey && email && password) {
    cy.request({
      method: "POST",
      url: `${supabaseUrl}/auth/v1/token?grant_type=password`,
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: {
        email,
        password,
      },
    }).then((response) => {
      const session = {
        access_token: response.body.access_token,
        token_type: response.body.token_type,
        expires_in: response.body.expires_in,
        expires_at: response.body.expires_at,
        refresh_token: response.body.refresh_token,
        user: response.body.user,
      };
      cy.visit(path, {
        onBeforeLoad(win) {
          setSupabaseSession(supabaseUrl, session);
          win.localStorage.setItem("kryonex_session_ok", "1");
          if (options.admin) {
            win.localStorage.setItem("kryonex_admin_mode", "admin");
          }
        },
      });
    });
    return;
  }

  cy.visit(path, {
    onBeforeLoad(win) {
      win.localStorage.setItem("kryonex_session_ok", "1");
      if (options.admin) {
        win.localStorage.setItem("kryonex_admin_mode", "admin");
      }
    },
  });
};

const hashSeed = (value) => {
  const str = String(value || "seed");
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash || 1;
};

const mulberry32 = (seed) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffleMatrix = (matrix, seedValue) => {
  const seed = hashSeed(seedValue);
  const rand = mulberry32(seed);
  const copy = [...matrix];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const buildMatrix = () => {
  const dimensions = [
    {
      key: "consentAccepted",
      values: [true, false],
    },
    {
      key: "weekendEnabled",
      values: [true, false],
    },
    {
      key: "emergency247",
      values: [true, false],
    },
    {
      key: "industry",
      values: ["hvac", "plumbing"],
    },
    {
      key: "tone",
      values: ["Calm & Professional", "Warm & Friendly", "Executive & Direct"],
    },
    {
      key: "travelMode",
      values: ["miles", "minutes"],
    },
    {
      key: "transferNumber",
      values: [
        { label: "e164", value: "+18005550123" },
        { label: "local", value: "8005550123" },
      ],
    },
    {
      key: "dispatchBase",
      values: [
        { label: "zip", value: "98101" },
        { label: "address", value: "123 Service Rd, Seattle, WA" },
      ],
    },
    {
      key: "fees",
      values: [
        { label: "min", standard: "25", emergency: "75" },
        { label: "typical", standard: "89", emergency: "189" },
        { label: "edge", standard: "399", emergency: "999" },
      ],
    },
    {
      key: "coreOffer",
      values: [true, false],
    },
  ];

  return dimensions.reduce(
    (acc, dimension) =>
      acc.flatMap((current) =>
        dimension.values.map((value) => ({
          ...current,
          [dimension.key]: value,
        }))
      ),
    [{}]
  );
};

const setupWizardIntercepts = (config) => {
  cy.intercept("GET", "**/subscription-status", {
    statusCode: 200,
    body: { status: "inactive" },
  }).as("subscriptionStatus");

  cy.intercept("GET", "**/rest/v1/profiles**", (req) => {
    const url = new URL(req.url);
    const select = url.searchParams.get("select") || "";
    if (select.includes("consent_accepted_at")) {
      req.reply({
        statusCode: 200,
        body: {
          consent_accepted_at: null,
          consent_version: "v1",
          role: "admin",
        },
      });
      return;
    }
    if (select.includes("business_name")) {
      req.reply({
        statusCode: 200,
        body: {
          business_name: null,
          industry: null,
          role: "admin",
        },
      });
      return;
    }
    req.reply({
      statusCode: 200,
      body: { role: "admin" },
    });
  }).as("profileSelect");

  cy.intercept("POST", "**/rest/v1/profiles**", {
    statusCode: 201,
    body: {},
  }).as("profileUpsert");

  cy.intercept("POST", "**/consent", {
    statusCode: 200,
    body: { ok: true },
  }).as("acceptConsent");

  cy.intercept("POST", "**/create-checkout-session", (req) => {
    expect(req.body.planTier).to.be.a("string").and.not.be.empty;
    req.reply({
      statusCode: 200,
      body: {
        sessionId: "sess_test_matrix",
        url: null,
      },
    });
  }).as("stripeCheckout");

  cy.intercept("POST", "**/deploy-agent", {
    statusCode: 200,
    body: { phone_number: "+1 (800) 555-0199" },
  }).as("deployAgent");
};

const visitWizard = (config) => {
  const url = config.coreOffer ? "/wizard?core=1" : "/wizard";
  visitAuthed(url, { admin: true });
  cy.window().then((win) => {
    win.localStorage.removeItem("wizard.form");
    win.localStorage.removeItem("wizard.step");
    win.localStorage.removeItem("kryonex:wizard.form");
    win.localStorage.removeItem("kryonex:wizard.step");
    win.localStorage.removeItem("kryonex_wizard_step");
    win.localStorage.removeItem("kryonex_pending_checkout_session");
  });
  cy.reload();
};

const selectIndustry = (industry) => {
  if (industry === "plumbing") {
    cy.contains("Hydro-Static Agent").click();
  } else {
    cy.contains("Thermal Control Agent").click();
  }
};

describe("Wizard matrix sweep", () => {
  const baseMatrix = buildMatrix();
  const seed = Cypress.env("MATRIX_SEED");
  const matrix = seed ? shuffleMatrix(baseMatrix, seed) : baseMatrix;
  const limit = Number(Cypress.env("MATRIX_LIMIT"));
  const cases =
    Number.isFinite(limit) && limit > 0 ? matrix.slice(0, limit) : matrix;

  beforeEach(() => {
    cy.viewport(1280, 720);
    cy.session([Cypress.env("TEST_EMAIL"), Cypress.env("TEST_PASSWORD")], () => {
      login();
    });
  });

  cases.forEach((config, index) => {
    const titleParts = [
      `consent=${config.consentAccepted ? "yes" : "no"}`,
      `weekend=${config.weekendEnabled ? "on" : "off"}`,
      `emergency=${config.emergency247 ? "on" : "off"}`,
      `industry=${config.industry}`,
      `tone=${config.tone}`,
      `travel=${config.travelMode}`,
      `transfer=${config.transferNumber.label}`,
      `base=${config.dispatchBase.label}`,
      `fees=${config.fees.label}`,
      `core=${config.coreOffer ? "1" : "0"}`,
    ];

    it(`wizard matrix ${index + 1}: ${titleParts.join(", ")}`, () => {
      setupWizardIntercepts(config);
      visitWizard(config);

      cy.contains("Confirm Identity").should("be.disabled");
      cy.get('input[placeholder="e.g. Apex Comfort Co."]')
        .clear()
        .type(`Cypress Matrix ${index + 1}`);
      cy.get('input[placeholder="___"]').clear().type("415");

      if (config.consentAccepted) {
        cy.get('input[type="checkbox"]').check({ force: true });
        cy.wait("@acceptConsent");
        cy.contains("Confirm Identity").should("not.be.disabled").click();
        cy.wait("@profileUpsert");
      } else {
        cy.contains("Confirm Identity").should("be.disabled");
        return;
      }

      cy.window().then((win) => {
        const saved = JSON.parse(
          win.localStorage.getItem("kryonex:wizard.form") || "{}"
        );
        expect(saved.nameInput).to.eq(`Cypress Matrix ${index + 1}`);
        expect(saved.areaCodeInput).to.eq("415");
        expect(win.localStorage.getItem("kryonex:wizard.step")).to.eq("2");
      });

      cy.contains("Initialize Logic").should("be.disabled");
      cy.contains(config.tone).click();
      selectIndustry(config.industry);
      cy.wait("@profileUpsert");
      cy.contains("Initialize Logic").should("not.be.disabled").click();

      cy.contains("Proceed to Pay").should("not.be.disabled");
      if (config.weekendEnabled) {
        cy.contains("Weekend Operations").click();
      }
      if (config.emergency247) {
        cy.contains("Emergency Override Protocol").click();
      }

      cy.get('input[placeholder="+1 800 555 0123"]')
        .clear()
        .type(config.transferNumber.value)
        .blur();

      cy.contains("Smart Service Radius")
        .closest(".glass-panel")
        .within(() => {
          cy.contains(config.travelMode).click();
          cy.get('input[type="number"]').clear().type("30");
        });

      cy.get(
        'input[placeholder="Enter Start Zip Code (Recommended) or Full Address"]'
      )
        .clear()
        .type(config.dispatchBase.value);

      cy.get('input[placeholder="89"]').clear().type(config.fees.standard);
      cy.get('input[placeholder="189"]').clear().type(config.fees.emergency);

      cy.contains("Proceed to Pay").click();
      cy.wait("@profileUpsert");

      cy.window().should((win) => {
        const saved = JSON.parse(
          win.localStorage.getItem("kryonex:wizard.form") || "{}"
        );
        const expectedTransfer =
          config.transferNumber.label === "e164"
            ? config.transferNumber.value
            : `+1${config.transferNumber.value.replace(/\D/g, "")}`;
        expect(saved.transferNumber).to.eq(expectedTransfer);
        expect(saved.dispatchBaseLocation).to.eq(config.dispatchBase.value);
        expect(saved.travelLimitMode).to.eq(config.travelMode);
        expect(saved.standardFee).to.eq(config.fees.standard);
        expect(saved.emergencyFee).to.eq(config.fees.emergency);
        expect(win.localStorage.getItem("kryonex:wizard.step")).to.eq("4");
      });

      if (config.coreOffer) {
        cy.contains("CORE — $99/mo").click();
      } else {
        cy.contains("PRO — $249/mo").click();
      }

      cy.contains("OPEN STRIPE CHECKOUT").click();
      cy.wait("@stripeCheckout");

      cy.contains("BYPASS BILLING").click();
      cy.contains("Review Payload").should("not.be.disabled").click();

      cy.contains("DEPLOY RECEPTIONIST").click();
      cy.contains("Confirm Deploy").click();
      cy.wait("@deployAgent");
      cy.contains("DEPLOYED").should("exist");
    });
  });
});
