import { describe, expect, it } from "vitest";
import { daysToReply, firstReply, replyText, tallyGutChecks } from "./decision-day";

const now = new Date("2027-04-20T22:30:00Z");

describe("decision day", () => {
  it("counts calendar days to the reply date", () => {
    expect(daysToReply("2027-04-20T00:00:00Z", now)).toBe(0);
    expect(daysToReply("2027-04-21T00:00:00Z", now)).toBe(1);
    expect(daysToReply("2027-05-01T00:00:00+00:00", now)).toBe(11);
    expect(daysToReply("2027-04-18T00:00:00Z", now)).toBe(-2);
  });

  it("words the countdown", () => {
    expect(replyText(0)).toBe("Reply due today");
    expect(replyText(1)).toBe("Reply due tomorrow");
    expect(replyText(11)).toBe("Reply due in 11 days");
    expect(replyText(-1)).toBe("Reply date passed 1 day ago");
    expect(replyText(-3)).toBe("Reply date passed 3 days ago");
  });

  it("finds the soonest reply still to come", () => {
    const offers = [
      { id: "a", due: "2027-05-01T00:00:00Z" },
      { id: "b", due: null },
      { id: "c", due: "2027-04-10T00:00:00Z" },
      { id: "d", due: "2027-04-25T00:00:00Z" },
    ];
    expect(firstReply(offers, now)).toMatchObject({ id: "d", days: 5 });
    expect(firstReply([{ id: "x", due: null }], now)).toBeNull();
  });

  it("tallies reactions per offer", () => {
    const tally = tallyGutChecks([
      { application_id: "a", reaction: "relieved", at: "" },
      { application_id: "a", reaction: "relieved", at: "" },
      { application_id: "b", reaction: "disappointed", at: "" },
    ]);
    expect(tally.get("a")).toEqual({ relieved: 2, disappointed: 0, unsure: 0 });
    expect(tally.get("b")).toEqual({ relieved: 0, disappointed: 1, unsure: 0 });
  });
});
