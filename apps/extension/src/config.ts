// Build-time settings (scripts/build.mjs). Nothing here is secret: the publishable key is meant for clients,
// and row-level security decides what it can read.
declare const __SUPABASE_URL__: string;
declare const __SUPABASE_KEY__: string;
declare const __WEB_ORIGIN__: string;
declare const __TEST_BUILD__: boolean;

/** The only network destination the extension has (spec 7.7). */
export const SUPABASE_URL: string = __SUPABASE_URL__;
export const SUPABASE_KEY: string = __SUPABASE_KEY__;
/** Our web app, where the student signs the extension in. Opened as a tab, never fetched. */
export const WEB_ORIGIN: string = __WEB_ORIGIN__;
/** Test builds reach the practice portal and let the panel open as a page for a given tab. */
export const TEST_BUILD: boolean = __TEST_BUILD__;
