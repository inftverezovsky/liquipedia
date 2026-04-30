async function test() {
  const titles = "DreamLeague/Season_26|DreamLeague/Season_25";
  const url = `https://liquipedia.net/dota2/api.php?action=query&format=json&formatversion=2&prop=info|revisions&inprop=url&rvprop=content&rvslots=main&titles=${encodeURIComponent(titles)}`;
  
  const response = await fetch(url, {
    headers: {
      "User-Agent": "liquipedia-local-dev/0.1 (test@example.com)",
      "Accept-Encoding": "gzip",
      Accept: "application/json"
    }
  });

  const json = await response.json();
  const pages = json.query?.pages || [];
  for (const p of pages) {
    const wikitext = p.revisions?.[0]?.slots?.main?.content;
    const enddate = wikitext?.match(/\|\s*(?:edate|enddate|end_date)\s*=\s*(.+)/)?.[1];
    console.log(`Title: ${p.title}, End Date: ${enddate}`);
  }
}

test().catch(console.error);
