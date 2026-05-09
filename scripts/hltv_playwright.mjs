import { chromium } from 'playwright';
import ProxyChain from 'proxy-chain';
import minimist from 'minimist';

const args = minimist(process.argv.slice(2));
const PROXY_URL = args.proxy; 
const MODE = args.mode || 'scrape'; // 'scrape', 'search', or 'event'
const QUERY = args.q || '';
const EVENT_ID = args.id || '';

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const CACHE_DIR = './cache/hltv';
const CACHE_TTL = 300000; // 5 minutes

function getCache() {
  if (args.no_cache) return null;
  const key = crypto.createHash('md5').update(`${MODE}-${QUERY}-${EVENT_ID}`).digest('hex');
  const cachePath = path.join(CACHE_DIR, `${key}.json`);
  if (fs.existsSync(cachePath)) {
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (Date.now() - data.timestamp < CACHE_TTL) {
      return data.result;
    }
  }
  return null;
}

function setCache(result) {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  const key = crypto.createHash('md5').update(`${MODE}-${QUERY}-${EVENT_ID}`).digest('hex');
  const cachePath = path.join(CACHE_DIR, `${key}.json`);
  fs.writeFileSync(cachePath, JSON.stringify({ timestamp: Date.now(), result }));
}

async function scrapeHltv() {
  const cached = getCache();
  if (cached) {
    console.error('[HLTV Playwright] Returning cached result');
    console.log(JSON.stringify(cached));
    return;
  }

  let anonymizedProxyUrl = null;

  try {
    let launchArgs = ['--disable-blink-features=AutomationControlled'];

    if (PROXY_URL) {
      anonymizedProxyUrl = await ProxyChain.anonymizeProxy(PROXY_URL);
      launchArgs.push(`--proxy-server=${anonymizedProxyUrl}`);
    }

    const browser = await chromium.launch({ headless: true, args: launchArgs });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    
    // OPTIMIZATION: Block images, styles, and fonts to save traffic and speed up loading
    await page.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      if (['image', 'stylesheet', 'font', 'media', 'other'].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    
    if (MODE === 'search') {
      console.error(`[HLTV Playwright] Searching for: ${QUERY}`);
      await page.goto(`https://www.hltv.org/search?query=${encodeURIComponent(QUERY)}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(5000);
      
      const results = await page.evaluate(() => {
        const events = [];
        document.querySelectorAll('a[href*="/events/"]').forEach(a => {
          const href = a.getAttribute('href');
          const title = a.textContent.trim().replace(/^Live\s+/, '').replace(/\s+/g, ' ');
          const id = href.split('/')[2];
          
          // Try to find dates
          let dates = "";
          const parent = a.parentElement;
          if (parent) {
             const dateEl = parent.querySelector('.search-event-date, .date, [class*="date"]');
             if (dateEl) dates = dateEl.textContent.trim();
             else {
               // Fallback: look for date-like text in siblings
               const text = parent.textContent;
               const match = text.match(/([A-Z][a-z]+ \d+ - [A-Z][a-z]+ \d+, \d+)/);
               if (match) dates = match[1];
             }
          }

          if (id && !isNaN(parseInt(id)) && title.length > 2) {
            if (!events.some(e => e.id === id)) {
              events.push({ title, url: 'https://www.hltv.org' + href, id, dates });
            }
          }
        });
        return events;
      });
      const finalResult = { ok: true, events: results.slice(0, 10) };
      setCache(finalResult);
      console.log(JSON.stringify(finalResult));
    } else {
      let targetUrl = 'https://www.hltv.org/matches';
      if (MODE === 'event' && EVENT_ID) {
        targetUrl = `https://www.hltv.org/events/${EVENT_ID}/matches`;
        console.error(`[HLTV Playwright] Scraping Event Matches: ${targetUrl}`);
      } else {
        console.error('[HLTV Playwright] Navigating to HLTV Global Matches...');
      }

      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(MODE === 'event' ? 5000 : 10000);
      
      const matches = await page.evaluate(() => {
        const results = [];
        const els = document.querySelectorAll('.upcomingMatch, .upcoming-match, [class*="match-fixture"]');
        
        els.forEach(el => {
          let team1 = "", team2 = "", tournament = "Upcoming", unixTime = "0", id = "";

          const teamNames = el.querySelectorAll('.matchTeamName, .team-name, .team-1 .team-name, .team-2 .team-name');
          if (teamNames.length >= 2) {
            team1 = teamNames[0].textContent.trim().replace(/\d+$/, '');
            team2 = teamNames[1].textContent.trim().replace(/\d+$/, '');
          } else {
            const altTeams = el.querySelectorAll('.team, [class*="team-name"]');
            if (altTeams.length >= 2) {
              team1 = altTeams[0].textContent.trim().replace(/\d+$/, '');
              team2 = altTeams[1].textContent.trim().replace(/\d+$/, '');
            }
          }

          tournament = el.querySelector('.matchEventName, .event-headline, .event, [class*="event-name"]')?.textContent?.trim() || "Upcoming";
          const timeEl = el.querySelector('[data-unix], .matchTime, .time');
          unixTime = timeEl?.getAttribute('data-unix') || timeEl?.getAttribute('data-time') || "0";

          const link = el.querySelector('a[href*="/matches/"]');
          if (link) {
            const parts = link.getAttribute('href').split('/');
            id = parts[parts.length - 2] || "";
            if (!id || isNaN(parseInt(id))) id = parts[2];
          }

          if (team1 && team2 && team1 !== 'TBD' && team2 !== 'TBD') {
            results.push({
              id: id || Math.random().toString(36).substr(2, 9),
              tournament,
              team1,
              team2,
              unix_time: parseInt(unixTime) || 0
            });
          }
        });

        if (results.length === 0) {
          document.querySelectorAll('a[href*="/matches/"]').forEach(a => {
            const text = a.textContent;
            if (text && text.includes(' vs ')) {
              const parts = text.split(' vs ');
              results.push({
                id: a.getAttribute('href').split('/')[2],
                tournament: "Upcoming",
                team1: parts[0].trim(),
                team2: parts[1].trim(),
                unix_time: 0
              });
            }
          });
        }
        return results;
      });

      const finalResult = { ok: true, matches };
      setCache(finalResult);
      console.log(JSON.stringify(finalResult));
    }

    await browser.close();
  } catch (err) {
    console.log(JSON.stringify({ ok: false, error: err.message }));
  } finally {
    if (anonymizedProxyUrl) {
      await ProxyChain.closeAnonymizedProxy(anonymizedProxyUrl, true);
    }
  }
}

scrapeHltv();
