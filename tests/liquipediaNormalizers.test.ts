import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDota2Tournament } from "../src/lib/normalizers/dota2Tournament";
import { normalizeCounterStrikeTournament } from "../src/lib/normalizers/counterstrikeTournament";
import { normalizeLeagueOfLegendsTournament } from "../src/lib/normalizers/leagueoflegendsTournament";
import { normalizeValorantTournament } from "../src/lib/normalizers/valorantTournament";

const emptyBracketHtml = `
  <div class="brkts-match">
    <div class="brkts-opponent-entry"><span class="name">TBD</span></div>
    <div class="brkts-opponent-entry"><span class="name">TBD</span></div>
    <div class="brkts-match-info-popup"></div>
  </div>
`;

const infobox = "{{Infobox league|name=Parser Guard Cup|sdate=2026-05-13|edate=2026-05-24}}";

test("Liquipedia normalizers preserve pure placeholder bracket slots for future TBD handling", () => {
  const cases = [
    normalizeDota2Tournament({
      title: "Parser Guard Cup",
      pageUrl: "https://liquipedia.net/dota2/Parser_Guard_Cup",
      wikitext: infobox,
      parsedHtml: emptyBracketHtml,
    }),
    normalizeCounterStrikeTournament({
      title: "Parser Guard Cup",
      pageUrl: "https://liquipedia.net/counterstrike/Parser_Guard_Cup",
      wikitext: infobox,
      parsedHtml: emptyBracketHtml,
    }),
    normalizeLeagueOfLegendsTournament({
      title: "Parser Guard Cup",
      pageUrl: "https://liquipedia.net/leagueoflegends/Parser_Guard_Cup",
      wikitext: infobox,
      parsedHtml: emptyBracketHtml,
    }),
    normalizeValorantTournament({
      title: "Parser Guard Cup",
      pageUrl: "https://liquipedia.net/valorant/Parser_Guard_Cup",
      wikitext: infobox,
      parsedHtml: emptyBracketHtml,
    }),
  ];

  for (const normalized of cases) {
    assert.equal(normalized.matches.length, 1);
    assert.match(normalized.matches[0].teamAName || "", /^TBD\d+$/);
    assert.match(normalized.matches[0].teamBName || "", /^TBD\d+$/);
  }
});

test("Counter-Strike and LoL normalizers extract crosstable round-robin pairs", () => {
  const html = `
    <div class="mw-heading mw-heading2"><h2>Group Stage</h2></div>
    <div class="mw-heading mw-heading3"><h3>Group A</h3></div>
    <div><div class="template-box">
      <table class="crosstable">
        <tr class="crosstable-tr">
          <th><a href="/counterstrike/Team_Alpha" title="Team Alpha">Team Alpha</a></th>
          <td class="crosstable-bgc-cross"></td>
          <td class="crosstable-bgc-r-r"></td>
        </tr>
        <tr class="crosstable-tr">
          <th><a href="/counterstrike/Team_Beta" title="Team Beta">Team Beta</a></th>
          <td class="crosstable-bgc-r-r"></td>
          <td class="crosstable-bgc-cross"></td>
        </tr>
      </table>
    </div></div>
  `;

  const cs = normalizeCounterStrikeTournament({
    title: "Parser Guard Cup",
    pageUrl: "https://liquipedia.net/counterstrike/Parser_Guard_Cup",
    wikitext: infobox,
    parsedHtml: html,
  });
  const lol = normalizeLeagueOfLegendsTournament({
    title: "Parser Guard Cup",
    pageUrl: "https://liquipedia.net/leagueoflegends/Parser_Guard_Cup",
    wikitext: infobox,
    parsedHtml: html.replaceAll("/counterstrike/", "/leagueoflegends/"),
  });

  assert.equal(cs.matches.length, 1);
  assert.equal(lol.matches.length, 1);
  assert.equal(cs.matches[0].round, "Group A");
  assert.equal(lol.matches[0].stage, "Group Stage");
});
