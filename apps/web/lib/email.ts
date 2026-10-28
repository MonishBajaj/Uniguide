import "server-only";

/**
 * Sends a plain-text email through Resend. Without RESEND_API_KEY (local development) the email
 * is printed to the server log instead and `logged` is returned so the UI can say so.
 */
export async function sendEmail(to: string, subject: string, text: string): Promise<"sent" | "logged" | "failed"> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") return "failed";
    console.info(`[email to ${to}] ${subject}\n${text}`);
    return "logged";
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, text }),
  });
  return response.ok ? "sent" : "failed";
}
