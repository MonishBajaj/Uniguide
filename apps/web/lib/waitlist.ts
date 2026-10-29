/**
 * What to do when waitlisted. General steps only: each university's own rules decide whether a
 * letter is welcome, so the first steps send the student to the official page and the portal.
 */
export const WAITLIST_STEPS: { id: string; title: string; body: string }[] = [
  { id: "accept", title: "Accept your waitlist place", body: "Many universities only keep you on the list if you confirm in the portal by a date. Check yours and log it below." },
  { id: "rules", title: "Check whether they want updates", body: "Some universities welcome a short letter of continued interest; others ask you not to send anything. Follow what the official page or your portal says." },
  { id: "letter", title: "If they accept updates, send one short letter", body: "New information since you applied, with dates, and an honest line about whether you would accept. Write it yourself; the coach asks questions and comments but never writes it." },
  { id: "backup", title: "Keep a place elsewhere", body: "Waitlist offers can come late. Reply to the offers you hold and pay deposits by their dates, so you are not left without a place." },
];
