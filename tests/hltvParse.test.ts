import test from "node:test";
import assert from "node:assert/strict";
import { cleanHltvTeamName, formatHltvDate, parseHltvDate, shouldKeepHltvEvent } from "../src/lib/hltv/parse";

const today = new Date("2026-05-10T12:00:00Z");

test("parseHltvDate parses single and ranged HLTV dates", () => {
  const single = parseHltvDate("May 11th, 2026", today);
  assert.equal(single?.start.getFullYear(), 2026);
  assert.equal(single?.start.getMonth(), 4);
  assert.equal(single?.start.getDate(), 11);

  const ranged = parseHltvDate("May 9th - May 17th, 2026", today);
  assert.equal(ranged?.start.getDate(), 9);
  assert.equal(ranged?.end.getDate(), 17);
});

test("formatHltvDate formats ranges with ISO dates", () => {
  assert.equal(formatHltvDate("May 9th - May 17th, 2026", today), "2026-05-09 — 2026-05-17");
});

test("cleanHltvTeamName preserves digits that are part of team names", () => {
  assert.equal(cleanHltvTeamName("G2"), "G2");
  assert.equal(cleanHltvTeamName("K27"), "K27");
  assert.equal(cleanHltvTeamName("9z"), "9z");
  assert.equal(cleanHltvTeamName("G2 13"), "G2");
  assert.equal(cleanHltvTeamName("K27 2"), "K27");
});

test("shouldKeepHltvEvent filters finished and old events", () => {
  assert.equal(shouldKeepHltvEvent({
    title: "PGL Astana 2026",
    href: "/events/8049/pgl-astana-2026",
    dates: "May 9th - May 17th, 2026",
    status: "upcoming",
    query: "PGL As",
    today,
  }), true);

  assert.equal(shouldKeepHltvEvent({
    title: "PGL Astana 2025",
    href: "/events/8045/pgl-astana-2025",
    dates: "May 9th - May 17th, 2025",
    status: "finished",
    query: "PGL As",
    today,
  }), false);
});
