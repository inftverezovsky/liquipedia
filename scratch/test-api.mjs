
async function test() {
  const url = "http://localhost:3010/api/counterstrike/portal";
  console.log(`Fetching ${url}...`);
  try {
    const res = await fetch(url);
    console.log(`Status: ${res.status}`);
    const json = await res.json();
    if (!res.ok) {
      console.error("Error response:", json);
    } else {
      console.log(`Success! Found ${json.tournaments.length} tournaments.`);
    }
  } catch (e) {
    console.error("Fetch failed:", e);
  }
}

test();
