// The UniGuide Assist extension that our sign-in page may hand a session to (plan R14). Only these ids: a page
// that could be told which extension to send to would hand a student's session to anyone's extension.

/** The id of development and test builds, fixed by the public key in apps/extension/scripts/dev-key.txt. */
export const DEV_EXTENSION_ID = "jifoddiefcppdaiohhilpiglhbldfnbf";

// NEXT_PUBLIC_* values must be referenced literally so Next can inline them in client bundles.
const configured = process.env.NEXT_PUBLIC_EXTENSION_ID;

/** The store id when set; the development id outside production; otherwise none, and the page says so. */
export const EXTENSION_ID: string | null = configured || (process.env.NODE_ENV !== "production" ? DEV_EXTENSION_ID : null);
