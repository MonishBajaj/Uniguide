import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@uniguide/db-types";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";

export const createClient = () => createBrowserClient<Database>(SUPABASE_URL, SUPABASE_KEY);
