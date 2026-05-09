import * as cheerio from 'cheerio';

export interface ScrapedHltvMatch {
  id: string;
  tournament: string;
  team1: string;
  team2: string;
  date: string; // We'll try to format it as "DD.MM.YYYY HH:mm:ss"
}

export async function scrapeHltvMatches(): Promise<ScrapedHltvMatch[]> {
  const url = 'https://www.hltv.org/matches';
  
  console.log(`[HLTV Scraper] Fetching from ${url}`);
  
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (res.status === 403) {
      throw new Error("HLTV blocked the request (Cloudflare). Direct scraping from the server is restricted. Please use a proxy or check your environment.");
    }

    if (!res.ok) {
      throw new Error(`Failed to fetch HLTV: ${res.status} ${res.statusText}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const matches: ScrapedHltvMatch[] = [];

    // The selectors based on HLTV structure (not the user's placeholder ones)
    // HLTV groups matches by day in .upcomingMatchesSection
    $('.upcomingMatch').each((i, el) => {
      const $el = $(el);
      
      // Teams
      const team1 = $el.find('.matchTeamName').first().text().trim() || 'TBD';
      const team2 = $el.find('.matchTeamName').last().text().trim() || 'TBD';
      
      // Tournament
      const tournament = $el.find('.matchEventName').text().trim() || 'Unknown Tournament';
      
      // Time/Date
      // HLTV uses a timestamp in data-unix or similar
      const unixTime = $el.find('.matchTime').attr('data-unix');
      let dateStr = '—';
      if (unixTime) {
        const date = new Date(parseInt(unixTime));
        // Format to DD.MM.YYYY HH:mm:ss
        dateStr = date.toLocaleString('ru-RU', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          timeZone: 'Europe/Moscow'
        }).replace(',', '');
      }

      matches.push({
        id: $el.find('a.match').attr('href')?.split('/')[2] || Math.random().toString(),
        tournament,
        team1,
        team2,
        date: dateStr
      });
    });

    return matches;
  } catch (error) {
    console.error('[HLTV Scraper] Error:', error);
    throw error;
  }
}
