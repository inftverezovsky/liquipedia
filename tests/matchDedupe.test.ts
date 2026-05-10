import test from "node:test";
import assert from "node:assert/strict";
import { dedupeTournamentMatches, getCanonicalMatchKey } from "../src/lib/matches/dedupe";

test("dedupeTournamentMatches collapses the same dated pair even when sides are swapped", () => {
  const matches = dedupeTournamentMatches([
    {
      matchId: "raw-a",
      teamAName: "G2",
      teamBName: "The MongolZ",
      matchDate: new Date("2026-05-11T08:00:00.000Z"),
    },
    {
      matchId: "raw-b",
      teamAName: "The MongolZ",
      teamBName: "G2",
      matchDate: new Date("2026-05-11T08:00:30.000Z"),
    },
  ]);

  assert.equal(matches.length, 1);
  assert.equal(matches[0].matchId, "raw-a");
});

test("dedupeTournamentMatches keeps repeated undated pairs in different rounds", () => {
  const matches = dedupeTournamentMatches([
    {
      matchId: "round-1",
      teamAName: "Team Spirit",
      teamBName: "Falcons",
      stage: "Group A",
      round: "Round 1",
    },
    {
      matchId: "round-2",
      teamAName: "Falcons",
      teamBName: "Team Spirit",
      stage: "Group A",
      round: "Round 2",
    },
  ]);

  assert.equal(matches.length, 2);
});

test("dedupeTournamentMatches prefers richer duplicate records and fills missing fields", () => {
  const datedMatches = dedupeTournamentMatches([
    {
      matchId: "old",
      teamAName: "MOUZ",
      teamBName: "9z",
      matchDate: new Date("2026-05-11T11:00:00.000Z"),
      stage: "Group Stage",
    },
    {
      matchId: "new",
      platformId: "436175",
      teamAName: "9z",
      teamBName: "MOUZ",
      matchDate: new Date("2026-05-11T11:00:00.000Z"),
      round: "Opening",
    },
  ]);

  assert.equal(datedMatches.length, 1);
  assert.equal(datedMatches[0].matchId, "new");
  assert.equal(datedMatches[0].platformId, "436175");
  assert.equal(datedMatches[0].stage, "Group Stage");
});

test("getCanonicalMatchKey separates undated repeats by round context", () => {
  const firstKey = getCanonicalMatchKey({
    teamAName: "TBD1",
    teamAId: "team_tbd1",
    teamBName: "TBD2",
    teamBId: "team_tbd2",
    round: "Round 1",
  });
  const secondKey = getCanonicalMatchKey({
    teamAName: "TBD2",
    teamAId: "team_tbd2",
    teamBName: "TBD1",
    teamBId: "team_tbd1",
    round: "Round 2",
  });

  assert.notEqual(firstKey, secondKey);
});

test("dedupeTournamentMatches keeps dated placeholder slots with different source text", () => {
  const matches = dedupeTournamentMatches([
    {
      matchId: "slot-a",
      teamAName: "TBD1",
      teamBName: "TBD2",
      matchDate: new Date("2026-05-15T12:00:00.000Z"),
      round: "Upper Bracket Round 1",
      rawText: "slot 1 upper bracket",
    },
    {
      matchId: "slot-b",
      teamAName: "TBD1",
      teamBName: "TBD2",
      matchDate: new Date("2026-05-15T12:00:00.000Z"),
      round: "Upper Bracket Round 1",
      rawText: "slot 2 upper bracket",
    },
  ]);

  assert.equal(matches.length, 2);
});
