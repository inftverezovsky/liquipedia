const https = require('https');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function test() {
  const url = "https://liquipedia.net/dota2/api.php?action=query&format=json&prop=revisions&titles=1win_Essence/1&rvprop=content&rvslots=main&formatversion=2";
  const body = await fetch(url);
  console.log("Body starts with:", body.slice(0, 100));
  if (body.trim().startsWith('{')) {
    const data = JSON.parse(body);
    const wikitext = data.query.pages[0].revisions[0].slots.main.content;
    console.log("Wikitext length:", wikitext.length);
    const enddateMatch = wikitext?.match(/\|\s*(?:edate|enddate|end_date)\s*=\s*([^|\n]+)/)?.[1]?.trim();
    const startdateMatch = wikitext?.match(/\|\s*(?:sdate|startdate|start_date)\s*=\s*([^|\n]+)/)?.[1]?.trim();
    console.log("Startdate:", startdateMatch);
    console.log("Enddate:", enddateMatch);
  }
}

test();
