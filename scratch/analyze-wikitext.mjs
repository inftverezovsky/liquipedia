import * as cheerio from 'cheerio';

async function main() {
  const apiUrl = process.env.LIQUIPEDIA_DOTA2_API_URL || 'https://liquipedia.net/dota2/api.php';
  const userAgent = process.env.LIQUIPEDIA_USER_AGENT || 'liquipedia-local-dev/0.1';

  const params = new URLSearchParams({
    action: 'parse', format: 'json',
    page: 'DreamLeague/Season 26',
    prop: 'text', disabletoc: '1', redirects: '1'
  });

  const resp = await fetch(apiUrl + '?' + params.toString(), {
    headers: { 'User-Agent': userAgent, 'Accept': 'application/json' }
  });
  const data = await resp.json();
  const html = data?.parse?.text?.['*'] || '';
  const $ = cheerio.load(html);

  // Explore crosstable structure
  console.log('=== CROSSTABLE CELLS ===');
  const cells = $('.crosstable-content-cell');
  console.log('crosstable-content-cell count:', cells.length);
  
  cells.each((i, cell) => {
    if (i >= 5) return;
    const $cell = $(cell);
    console.log(`\nCell #${i+1} HTML snippet:`, $cell.html()?.slice(0, 500));
  });

  // Check for popup-like structures inside crosstable
  console.log('\n\n=== ALL POPUP CONTAINERS (not just brkts-popup) ===');
  const allPopups = $('[class*="popup"]');
  console.log('All popup elements:', allPopups.length);

  // Try finding match data from brkts-popup-body which might be outside brackets
  console.log('\n=== POPUP BODY CONTENT ===');
  const bodies = $('.brkts-popup-body');
  console.log('brkts-popup-body count:', bodies.length);
  
  bodies.each((i, body) => {
    if (i >= 3) return;
    const $body = $(body);
    const games = $body.find('.brkts-popup-body-game');
    console.log(`\nPopup body #${i+1}: ${games.length} games`);
    
    games.each((j, game) => {
      const $game = $(game);
      const leftTeam = $game.find('.brkts-popup-body-element-team-left .name').text().trim();
      const rightTeam = $game.find('.brkts-popup-body-element-team-right .name').text().trim();
      const leftScore = $game.find('.brkts-popup-body-element-team-left .brkts-popup-body-element-score').text().trim();
      const rightScore = $game.find('.brkts-popup-body-element-team-right .brkts-popup-body-element-score').text().trim();
      console.log(`  Game ${j+1}: ${leftTeam || '?'} ${leftScore} - ${rightScore} ${rightTeam || '?'}`);
    });
  });

  // Look for matchlist-type containers that hold group matches
  console.log('\n=== MATCHLIST CONTAINERS ===');
  const matchlists = $('[class*="matchlist"]');
  console.log('matchlist elements:', matchlists.length);
  
  // Check if there are hidden/collapsed match sections
  console.log('\n=== TOGGLE BRACKET / COLLAPSED SECTIONS ===');
  const toggles = $('[class*="toggle"]');
  console.log('toggle elements:', toggles.length);

  // Look for GroupTableLeague rendered output
  console.log('\n=== GROUPTABLE RENDERED ===');
  const groupTables = $('.grouptable, .group-table, .wikitable.grouptable, .table-responsive');
  console.log('grouptable elements:', groupTables.length);

  // Find tournament bracket container
  console.log('\n=== BRACKET CONTAINER ===');
  const brackets = $('.brkts-bracket');
  console.log('brkts-bracket elements:', brackets.length);
  
  brackets.each((i, bracket) => {
    const $bracket = $(bracket);
    const matchAttr = $bracket.attr('data-matchsection');
    console.log(`Bracket #${i+1}: matchsection="${matchAttr}"`);
    const matches = $bracket.find('.brkts-match');
    console.log(`  Matches in bracket: ${matches.length}`);
  });

  // Find bestof info
  console.log('\n=== BEST OF INFO ===');
  const bestofs = $('.brkts-popup-header-dev-match-type, .match-bestof');
  console.log('bestof elements:', bestofs.length);
  bestofs.each((i, el) => {
    console.log(`  bestof #${i+1}:`, $(el).text().trim());
  });

  // Try to find ALL match-like structures
  console.log('\n=== ALL BRKTS-MATCH WRAPPERS ===');
  const allBrktsMatch = $('.brkts-match, .brkts-match-popup-wrapper');
  console.log('brkts-match + brkts-match-popup-wrapper:', allBrktsMatch.length);
  
  // Now look specifically at the section structure to find where group matches are
  // DreamLeague uses GroupTableLeague which uses CrossTableLeague to show results
  // The actual matches are from the subpages  
  console.log('\n=== LOOKING FOR MATCHLIST DATA ===');
  const matchlistRows = $('[class*="brkts-matchlist"]');
  console.log('brkts-matchlist elements:', matchlistRows.length);
  
  // Check if there's a data-ref or ID on CrossTableLeague that links to match pages
  const crossTableLeagues = $('.CrossTableLeague');
  console.log('CrossTableLeague elements:', crossTableLeagues.length);
  
  // Look for any data attributes that link to matches
  const dataMatches = $('[data-match-id], [data-match], [data-matchid]');
  console.log('data-match-id/data-match/data-matchid elements:', dataMatches.length);

  // Print section-by-section HTML class structure
  console.log('\n=== SECTION CONTENT ANALYSIS (Group A) ===');
  // Find the Group A heading and see what's after it
  const h3s = $('h3');
  h3s.each((i, h3) => {
    const text = $(h3).text().trim();
    if (text.includes('Group A')) {
      console.log('Found Group A heading');
      const next = $(h3).nextAll().slice(0, 5);
      next.each((j, el) => {
        const $el = $(el);
        console.log(`  Next[${j}]: <${el.tagName}> class="${$el.attr('class') || ''}" id="${$el.attr('id') || ''}"`);
        if (el.tagName === 'div') {
          // Show children
          $el.children().each((k, child) => {
            console.log(`    Child[${k}]: <${child.tagName}> class="${$(child).attr('class') || ''}"`);
          });
        }
      });
    }
  });
}

main().catch(e => { console.error(e); process.exit(1); });
