import fs from 'fs';
fetch("http://localhost:3010/api/dota2/search-tournament", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query: "Riyadh Masters" })
}).then(async r => {
  const text = await r.text();
  fs.writeFileSync("scratch/error.html", text);
  console.log("Written to scratch/error.html");
}).catch(console.error);
