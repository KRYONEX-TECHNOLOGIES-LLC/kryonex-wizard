require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.TEST_USER_EMAIL || "infinitycleaningcrew@gmail.com";
const password = process.env.TEST_USER_PASSWORD || "mark123";

if (!supabaseUrl || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

const findUserIdByEmail = async (targetEmail) => {
  let page = 1;
  const perPage = 200;
  while (page < 20) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) {
      throw new Error(error.message);
    }
    const match = data?.users?.find(
      (user) => user.email?.toLowerCase() === targetEmail.toLowerCase()
    );
    if (match?.id) return match.id;
    if (!data?.users?.length) break;
    page += 1;
  }
  return null;
};

const run = async () => {
  let userId = null;
  const { data: userData, error: userError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (userError) {
    if (/already exists|already been registered|already registered/i.test(userError.message || "")) {
      userId = await findUserIdByEmail(email);
    } else {
      console.error("Create user failed:", userError.message);
      process.exit(1);
    }
  }

  userId = userId || userData?.user?.id;
  if (!userId) {
    console.error("Could not resolve user id for profile upsert.");
    process.exit(1);
  }

  if (password) {
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      userId,
      {
        password,
        email_confirm: true,
      }
    );
    if (updateError) {
      console.error("Update user password failed:", updateError.message);
      process.exit(1);
    }
  }

  const { error: profileError } = await supabase.from("profiles").upsert({
    user_id: userId,
    business_name: "Test HVAC Co",
    industry: "HVAC",
    role: "admin",
  });

  if (profileError) {
    console.error("Profile upsert failed:", profileError.message);
    process.exit(1);
  }

  console.log("Test user ready:", email);
};

run().catch((err) => {
  console.error("Create test user failed:", err.message);
  process.exit(1);
});
