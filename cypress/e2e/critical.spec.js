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
      cy.visit("/dashboard", {
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
  cy.url().should("include", "/dashboard");
};

describe("Critical path", () => {
  it("authenticates and loads dashboard", () => {
    cy.viewport(1280, 720);
    cy.session([Cypress.env("TEST_EMAIL"), Cypress.env("TEST_PASSWORD")], () => {
      login();
    });
    cy.contains("Kryonex Command Deck").should("exist");
  });
});
