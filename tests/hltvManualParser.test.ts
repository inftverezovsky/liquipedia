import test from "node:test";
import assert from "node:assert/strict";
import { parseHltvCopiedText } from "../src/lib/hltv/manualTextParser";

test("parseHltvCopiedText parses duplicate HLTV copied team lines", () => {
  const matches = parseHltvCopiedText(`
Saturday - 2026-05-09
17:00
bo3
Nemiga
Nemiga
INOX Division
INOX Division
20:00
bo3
AM
AM
CYBERSHOKE
CYBERSHOKE
`);

  assert.equal(matches.length, 2);
  assert.deepEqual(matches.map((match) => [match.team1, match.team2, match.date]), [
    ["Nemiga", "INOX Division", "09.05.2026 17:00:00"],
    ["AM", "CYBERSHOKE", "09.05.2026 20:00:00"],
  ]);
});

test("parseHltvCopiedText handles OCR time/team and bo/team lines", () => {
  const matches = parseHltvCopiedText(`
Sunday - 2026-05-10
17:00 | ® Falcons
bo3 © 9z
`);

  assert.equal(matches.length, 1);
  assert.equal(matches[0].team1, "Falcons");
  assert.equal(matches[0].team2, "9z");
  assert.equal(matches[0].date, "10.05.2026 17:00:00");
});
