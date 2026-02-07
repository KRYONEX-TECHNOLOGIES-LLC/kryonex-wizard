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

const visitAdmin = (path) => visitAuthed(path, { admin: true });

describe("Kryonex smoke test", () => {
  beforeEach(() => {
    cy.viewport(1280, 720);
    cy.session([Cypress.env("TEST_EMAIL"), Cypress.env("TEST_PASSWORD")], () => {
      login();
    });
  });

  it("renders dashboard KPIs and usage", () => {
    visitAuthed("/dashboard");
    cy.contains("Kryonex Command Deck");
    cy.contains("Estimated Revenue").should("exist");
    cy.contains("Operational Fuel (AI Minutes)").should("exist");
  });

  it("opens the calendar manifest, books an appointment, and closes it", () => {
    cy.intercept("POST", "**/appointments", {
      statusCode: 200,
      body: { id: "mocked-appointment" },
    }).as("createAppointment");

    visitAuthed("/calendar");
    cy.get(".calendar-day:not(.placeholder)").first().click();
    cy.contains("Manifest").should("exist");
    cy.contains("+ Add New Job").click();
    cy.get('input[placeholder="Jane Smith"]').clear().type("Cypress Test Lead");
    cy.get('input[placeholder="+1 555 220 1399"]').clear().type("+15551234567");
    cy.get('input[placeholder="123 Service Rd"]').clear().type("987 Demo Lane");
    cy.get('input[type="date"]').first().invoke("val").then((val) => {
      cy.get('input[type="date"]').first().clear().type(val);
    });
    cy.get('input[type="time"]').first().clear().type("09:30");
    cy.get('select')
      .contains("60 minutes")
      .then((option) => {
        cy.wrap(option).parent().select("60");
      });
    cy.contains("Confirm & Book")
      .scrollIntoView()
      .click();

    cy.wait("@createAppointment").its("response.statusCode").should("eq", 200);
  });

  it("renders the black box table and allows playback buttons", () => {
    visitAuthed("/black-box");
    cy.contains("COMMUNICATION INTERCEPTS").should("exist");
    cy.get(".blackbox-table").within(() => {
      cy.get(".blackbox-row.blackbox-header").should("exist");
      cy.get(".blackbox-row").then(($rows) => {
        const dataRows = Cypress.$($rows).filter(
          (_, el) => !el.classList.contains("blackbox-header")
        );
        if (dataRows.length === 0) {
          cy.get(".blackbox-empty-row").should("exist");
          return;
        }
        cy.wrap(dataRows).first().within(() => {
          cy.get(".blackbox-player button").click();
          cy.get(".blackbox-actions a").then(($links) => {
            if ($links.length) {
              cy.wrap($links[0])
                .should("have.attr", "download")
                .then((attr) => expect(attr).to.contain("recording-"));
            }
          });
        });
      });
    });
  });

  it("loads the lead grid page and lists rows", () => {
    visitAuthed("/leads");
    cy.contains("Lead Grid Command").should("exist");
    cy.get("tbody").then(($tbody) => {
      if ($tbody.find(".scanline-row").length) {
        cy.get(".scanline-row").should("have.length.at.least", 1);
      } else {
        cy.contains("No leads captured yet.").should("exist");
      }
    });
  });

  it("loads admin dashboard and core pages", () => {
    visitAdmin("/admin/dashboard");
    cy.contains(/Kryonex Empire HQ|Grandmaster Command Center/i).should("exist");

    visitAdmin("/admin/call-center");
    cy.contains("Admin Call Center").should("exist");

    visitAdmin("/admin/leads");
    cy.contains("Lead Grid Command").should("exist");

    visitAdmin("/admin/calendar");
    cy.contains("Satellite Grid").should("exist");
  });

  it("loads admin logs and comms", () => {
    visitAdmin("/admin/black-box");
    cy.contains("Black Box").should("exist");

    visitAdmin("/admin/logs");
    cy.contains("Sales Floor Activity").should("exist");

    visitAdmin("/admin/messages");
    cy.contains("Messages").should("exist");

    visitAdmin("/admin/final-logs");
    cy.contains("Lead Activity Archive").should("exist");
  });

  it("loads admin financials, sellers, users, and wizard", () => {
    visitAdmin("/admin/financials");
    cy.contains("Financial Command").should("exist");

    visitAdmin("/admin/sellers");
    cy.contains("The Boiler Room").should("exist");

    visitAdmin("/admin/users");
    cy.contains("System Users").should("exist");

    visitAdmin("/admin/wizard/create");
    cy.contains("Admin Client Wizard").should("exist");
  });
});
