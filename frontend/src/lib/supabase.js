import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const missingEnv = !supabaseUrl || !supabaseAnonKey;

const missingEnvError = new Error(
  "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY."
);

const createStub = () => {
  const errorResult = { data: null, error: missingEnvError };
  const chain = {
    select: async () => errorResult,
    maybeSingle: async () => errorResult,
    single: async () => errorResult,
    upsert: async () => errorResult,
    update: async () => errorResult,
    insert: async () => errorResult,
    eq: () => chain,
    order: () => chain,
  };
  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: missingEnvError }),
      signInWithPassword: async () => errorResult,
      signUp: async () => errorResult,
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
    from: () => chain,
  };
};

export const supabaseReady = !missingEnv;
export const supabase = missingEnv
  ? createStub()
  : createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
