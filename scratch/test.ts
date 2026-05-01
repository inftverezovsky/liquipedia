import { searchTournamentPages, fetchPageWikitext, fetchPageParsed } from "../src/lib/liquipedia/client";
import { normalizeDota2Tournament } from "../src/lib/normalizers/dota2Tournament";

const queries = [
  "The International",
  "Riyadh Masters",
  "DreamLeague",
  "ESL One",
  "BetBoom Dacha",
  "BLAST"
];

async function main() {
  for (const query of queries) {
    console.log(`\n============================`);
    console.log(`Testing query: ${query}`);
    try {
      const dota2Api = "https://liquipedia.net/dota2/api.php";
      const results = await searchTournamentPages(query, dota2Api, "dota2", 1);
      if (results.length === 0) {
        console.log(`No results for ${query}`);
        continue;
      }
      
      const target = results[0];
      console.log(`Found: ${target.title} (${target.pageUrl})`);
      
      const page = await fetchPageWikitext(dota2Api, "dota2", { title: target.title });
      console.log(`Wikitext fetched: ${page.wikitext.length} chars`);
      
      let normalized = normalizeDota2Tournament({
        title: page.title,
        pageUrl: page.fullUrl,
        wikitext: page.wikitext
      });
      
      if (normalized.warnings.some(w => w.includes("Infobox не найден"))) {
        console.log(`Infobox missing, fetching parsed HTML...`);
        const parsedHtml = await fetchPageParsed(dota2Api, page.title);
        console.log(`Parsed HTML fetched: ${parsedHtml.length} chars`);
        normalized = normalizeDota2Tournament({
          title: page.title,
          pageUrl: page.fullUrl,
          wikitext: page.wikitext,
          parsedHtml
        });
      }
      
      console.log(`Extraction Result:`);
      console.log(`Name: ${normalized.name}`);
      console.log(`Start Date: ${normalized.startDate}`);
      console.log(`End Date: ${normalized.endDate}`);
      console.log(`Prize Pool: ${normalized.prizePool}`);
      console.log(`Teams: ${normalized.participants.length}`);
      console.log(`Location: ${normalized.location}`);
      console.log(`Region: ${normalized.region}`);
      console.log(`Status: ${normalized.status}`);
      if (normalized.warnings.length > 0) {
        console.log(`Warnings: ${normalized.warnings.join(" | ")}`);
      }
      
    } catch (e) {
      console.error(`Error for ${query}:`, e);
    }
  }
}

main();
