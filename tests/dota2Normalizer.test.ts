import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDota2Tournament } from "../src/lib/normalizers/dota2Tournament";

test("Dota2 normalizer preserves empty TBD playoff slots", () => {
  const html = `
    <div class="brkts-match">
      <div class="brkts-opponent-entry"></div>
      <div class="brkts-opponent-entry"></div>
      <div class="brkts-match-info-popup">
        <span class="name">TBD</span>
        <span class="name">TBD</span>
      </div>
    </div>
  `;

  const normalized = normalizeDota2Tournament({
    title: "DreamLeague/29",
    pageUrl: "https://liquipedia.net/dota2/DreamLeague/29",
    wikitext: "{{Infobox league|name=DreamLeague Season 29|sdate=2026-05-13|edate=2026-05-24}}",
    parsedHtml: html,
  });

  assert.equal(normalized.matches.length, 1);
  assert.match(normalized.matches[0].teamAName || "", /^TBD\d+$/);
  assert.match(normalized.matches[0].teamBName || "", /^TBD\d+$/);
});

test("Dota2 normalizer does not treat regional qualifier tabs as event subpages", () => {
  const html = `
    <div class="tabs-static">
      <a href="/dota2/DreamLeague/29/North_America">North America</a>
      <a href="/dota2/DreamLeague/29/Western_Europe">Western Europe</a>
      <a href="/dota2/DreamLeague/29/Playoffs">Playoffs</a>
    </div>
  `;

  const normalized = normalizeDota2Tournament({
    title: "DreamLeague/29",
    pageUrl: "https://liquipedia.net/dota2/DreamLeague/29",
    wikitext: "{{Infobox league|name=DreamLeague Season 29|sdate=2026-05-13|edate=2026-05-24}}",
    parsedHtml: html,
  });

  assert.deepEqual(normalized.subPages, ["https://liquipedia.net/dota2/DreamLeague/29/Playoffs"]);
});

test("Dota2 normalizer extracts round-robin pairs from crosstable", () => {
  const html = `
    <div class="mw-heading mw-heading2"><h2>Group Stage</h2></div>
    <div class="mw-heading mw-heading3"><h3>Group A</h3></div>
    <div><div class="template-box">
      <table class="crosstable">
        <tr class="crosstable-tr">
          <th><a href="/dota2/Team_Alpha" title="Team Alpha">Team Alpha</a></th>
          <td class="crosstable-bgc-cross"></td>
          <td class="crosstable-bgc-r-r"></td>
          <td class="crosstable-bgc-r-r"></td>
        </tr>
        <tr class="crosstable-tr">
          <th><a href="/dota2/PlayTime" title="PlayTime">PlayTime</a></th>
          <td class="crosstable-bgc-r-r"></td>
          <td class="crosstable-bgc-cross"></td>
          <td class="crosstable-bgc-r-r"></td>
        </tr>
        <tr class="crosstable-tr">
          <th><a href="/dota2/Team_Gamma" title="Team Gamma">Team Gamma</a></th>
          <td class="crosstable-bgc-r-r"></td>
          <td class="crosstable-bgc-r-r"></td>
          <td class="crosstable-bgc-cross"></td>
        </tr>
      </table>
    </div></div>
  `;

  const normalized = normalizeDota2Tournament({
    title: "DreamLeague/29",
    pageUrl: "https://liquipedia.net/dota2/DreamLeague/29",
    wikitext: "{{Infobox league|name=DreamLeague Season 29|sdate=2026-05-13|edate=2026-05-24}}",
    parsedHtml: html,
  });

  assert.equal(normalized.matches.length, 3);
  assert.deepEqual(
    normalized.matches.map((match) => [match.teamAName, match.teamBName, match.stage, match.round]),
    [
      ["Team Alpha", "PlayTime", "Group Stage", "Group A"],
      ["Team Alpha", "Team Gamma", "Group Stage", "Group A"],
      ["PlayTime", "Team Gamma", "Group Stage", "Group A"],
    ],
  );
});

test("Dota2 normalizer preserves repeated pair in different rounds without dates", () => {
  const normalized = normalizeDota2Tournament({
    title: "Repeat Pair Cup",
    pageUrl: "https://liquipedia.net/dota2/Repeat_Pair_Cup",
    wikitext: `
      {{Infobox league|name=Repeat Pair Cup|sdate=2026-05-13|edate=2026-05-24}}
      {{Match|team1=Team Alpha|team2=Team Beta|round=Group A}}
      {{Match|team1=Team Alpha|team2=Team Beta|round=Group B}}
    `,
    parsedHtml: "",
  });

  assert.equal(normalized.matches.length, 2);
  assert.deepEqual(normalized.matches.map((match) => match.round), ["Group A", "Group B"]);
});
