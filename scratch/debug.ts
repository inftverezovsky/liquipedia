import { fetchPageWikitext } from "../src/lib/liquipedia/client";
import { extractFirstTemplateByPrefix, parseTemplate } from "../src/lib/normalizers/wikiText";

async function main() {
  const dota2Api = "https://liquipedia.net/dota2/api.php";
  const page = await fetchPageWikitext(dota2Api, "dota2", { title: "The International/2023" });
  const infobox = extractFirstTemplateByPrefix(page.wikitext, "Infobox");
  console.log("Infobox template found:", !!infobox);
  if (infobox) {
    const parsed = parseTemplate(infobox);
    console.log("Params keys:", Object.keys(parsed.params));
    console.log("Start date:", parsed.params.startdate || parsed.params.start_date || parsed.params.date || parsed.params.dates);
    console.log("End date:", parsed.params.enddate || parsed.params.end_date || parsed.params.date2);
    console.log("Prize pool:", parsed.params.prizepool || parsed.params.prize_pool || parsed.params.prize || parsed.params.prizemoney);
    console.log("Teams:", parsed.params.teams || parsed.params.participant_number);
  }
}
main();
