import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

let client = null;

// null, если Supabase не настроен: тогда сайт работает без сохранения попыток.
export async function db() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  if (!client) {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm");
    client = createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return client;
}
