// Server-side Supabase client bound to the request cookies (via @supabase/ssr).
// Used only by the /auth/callback route to complete a magic-link sign-in —
// it reads the PKCE verifier cookie set by the browser client and exchanges it.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const jar = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            jar.set(name, value, options);
          }
        } catch {
          // Called from a context where cookies can't be set — safe to ignore
          // here; we only need the exchange to read the verifier.
        }
      },
    },
  });
}
