/** 11.6 AMA timing: questions are taken until the event ends; past events are an archive. */
export type AmaPhase = "upcoming" | "live" | "past";

export function amaPhase(ama: { starts_at: string; ends_at: string }, now = new Date()): AmaPhase {
  if (now.getTime() >= Date.parse(ama.ends_at)) return "past";
  return now.getTime() >= Date.parse(ama.starts_at) ? "live" : "upcoming";
}

export function amaWhen(ama: { starts_at: string; ends_at: string }): string {
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(ama.starts_at));
  const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(iso));
  return `${day}, ${time(ama.starts_at)} to ${time(ama.ends_at)} UTC`;
}
