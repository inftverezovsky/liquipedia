import * as cheerio from "cheerio";
import { getLiquipediaUserAgent } from "../env";

export type PortalTournament = {
  title: string;
  url: string;
  dates: string;
  status: "ongoing" | "upcoming" | "completed";
};

export type DisciplinePortalData = {
  slug: string;
  name: string;
  tournaments: PortalTournament[];
};

export async function fetchDisciplinePortal(slug: string): Promise<DisciplinePortalData> {
  const urls = [`https://liquipedia.net/${slug}/Main_Page`];
  if (slug === 'leagueoflegends') {
    urls.push(`https://liquipedia.net/leagueoflegends/Portal:Tournaments`);
  }
  
  let html = "";
  try {
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": getLiquipediaUserAgent() },
          next: { revalidate: 0 }
        });
        if (res.ok) {
          const content = await res.text();
          if (content.length > 5000) {
            html = content;
            break;
          }
        }
      } catch (e) {
        console.error(`Failed to fetch ${url}:`, e);
      }
    }

    if (!html) return { slug, name: slug, tournaments: [] };
    
    const $ = cheerio.load(html);
    const tournaments: PortalTournament[] = [];

    const sections = [
      { header: "Ongoing", status: "ongoing" as const },
      { header: "Upcoming", status: "upcoming" as const }
    ];

    for (const section of sections) {
      const $header = $(`h2, h3, b, .t-h-header, .tournament-tabs > div, span`).filter((_, el) => {
        const t = $(el).text().trim().toLowerCase();
        return t === section.header.toLowerCase();
      }).first();

      if ($header.length === 0) continue;

      let $container = $header.nextAll(".tournaments-list, .t-h-list").first();
      if ($container.length === 0) {
        $container = $header.closest("div").parent().find(".tournaments-list, .t-h-list").first();
      }
      if ($container.length === 0) {
        $container = $(".tournaments-list, .t-h-list").first();
      }

      $container.find(".t-h-row, li").each((_, el) => {
        const $el = $(el);
        const $titleEl = $el.find(".t-h-name, .tournaments-list-name").first();
        let title = "";
        let href = "";
        
        if ($titleEl.length > 0) {
          const $a = $titleEl.find("a").first();
          title = $a.attr("title") || $a.text().trim();
          href = $a.attr("href") || "";
        } else {
          const $a = $el.find("a").first();
          title = $a.attr("title") || $a.text().trim();
          href = $a.attr("href") || "";
        }

        const $dateEl = $el.find(".t-h-dates, .tournaments-list-date, small").first();
        let dates = "";
        if ($dateEl.length > 0) {
          dates = $dateEl.text().trim().replace(/[()]/g, "");
        }

        if (title && href && !href.includes("Special:") && !href.includes("action=edit") && title.length > 2) {
          tournaments.push({
            title,
            url: href.startsWith("http") ? href : `https://liquipedia.net${href}`,
            dates,
            status: section.status
          });
        }
      });
    }

    // Aggressive Fallback
    if (tournaments.length === 0 || (slug === 'leagueoflegends' && tournaments.length < 3)) {
      $(".t-h-row, .tournaments-list li, .tournaments-list-name").each((_, el) => {
        const $el = $(el);
        const $a = $el.find("a").first();
        const title = $a.attr("title") || $a.text().trim();
        const href = $a.attr("href") || "";
        const dates = $el.find(".t-h-dates, .tournaments-list-date, small").text().trim().replace(/[()]/g, "");
        
        if (title && href && !href.includes("Special:") && title.length > 2) {
          if (slug === 'leagueoflegends' && !href.includes('/leagueoflegends/')) return;
          tournaments.push({
            title,
            url: href.startsWith("http") ? href : `https://liquipedia.net${href}`,
            dates,
            status: "ongoing"
          });
        }
      });
    }

    const uniqueTournaments = Array.from(new Map(tournaments.map(t => [t.url, t])).values());

    const now = new Date();
    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };

    const enriched = uniqueTournaments.map(t => {
      let startDate: Date | null = null;
      let endDate: Date | null = null;
      try {
        const dateLower = t.dates.toLowerCase();
        let month = -1;
        
        for (const [m, i] of Object.entries(months)) {
          if (dateLower.includes(m)) {
            month = i;
            break;
          }
        }

        const days = dateLower.match(/\d+/g);
        if (month !== -1 && days && days.length > 0) {
          const startDay = parseInt(days[0]);
          startDate = new Date(now.getFullYear(), month, startDay);
          
          if (startDate.getTime() < now.getTime() - 1000 * 60 * 60 * 24 * 30) {
             if (month < now.getMonth()) {
               startDate.setFullYear(now.getFullYear() + 1);
             }
          }

          if (days.length > 1) {
            const endDay = parseInt(days[days.length - 1]);
            endDate = new Date(startDate.getFullYear(), month, endDay);
          } else {
            endDate = new Date(startDate.getTime());
          }
        }
      } catch (e) {}
      return { ...t, startDate, endDate };
    });

    const filtered = enriched.filter(t => {
      if (t.status === 'ongoing') return true;
      if (!t.startDate || !t.endDate) return t.status !== 'completed';
      if (t.endDate.getTime() < now.getTime() - 1000 * 60 * 60 * 24) return false;
      if (t.status === 'upcoming') {
        const diffDays = (t.startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        return diffDays <= 14;
      }
      return true;
    });

    const sortedTournaments = filtered.sort((a, b) => {
      if (a.status === 'ongoing' && b.status !== 'ongoing') return -1;
      if (a.status !== 'ongoing' && b.status === 'ongoing') return 1;
      if (a.startDate && b.startDate) {
        return a.startDate.getTime() - b.startDate.getTime();
      }
      return 0;
    });

    const nameMapping: Record<string, string> = {
      dota2: "Dota 2",
      counterstrike: "Counter-Strike",
      leagueoflegends: "League of Legends",
      valorant: "Valorant"
    };

    return {
      slug,
      name: nameMapping[slug] || (slug.charAt(0).toUpperCase() + slug.slice(1)),
      tournaments: sortedTournaments.slice(0, 15)
    };
  } catch (err) {
    console.error(`Error in fetchDisciplinePortal for ${slug}:`, err);
    return { slug, name: slug, tournaments: [] };
  }
}
