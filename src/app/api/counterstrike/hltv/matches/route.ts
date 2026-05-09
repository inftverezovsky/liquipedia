import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 1. Get proxy settings
    const settings = await prisma.globalSettings.findMany({
      where: { key: { in: ['proxy_host', 'proxy_port', 'proxy_username', 'proxy_password'] } }
    });
    const config = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {} as Record<string, string>);
    
    let proxyArg = "";
    if (config.proxy_host && config.proxy_port) {
      const isSocks = config.proxy_host.startsWith('socks') || config.proxy_port === '10800';
      const protocol = isSocks ? 'socks5' : 'http';
      
      let proxyStr = `${protocol}://`;
      if (config.proxy_username && config.proxy_password) {
        proxyStr += `${config.proxy_username}:${config.proxy_password}@`;
      }
      proxyStr += `${config.proxy_host.replace(/^(socks5:\/\/|http:\/\/)/, '')}:${config.proxy_port}`;
      proxyArg = `--proxy "${proxyStr}"`;
    }

    // 2. Run the Playwright scraper script
    const command = `node scripts/hltv_playwright.mjs ${proxyArg}`;
    console.log(`[HLTV API] Running playwright scraper: ${command}`);

    const hltvMatches = await new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`[HLTV API] Exec error: ${error}`);
          return reject(new Error(`Scraper execution failed: ${error.message}`));
        }

        try {
          // Playwright script might output multiple lines, we need the JSON one
          const lines = stdout.trim().split('\n');
          const lastLine = lines[lines.length - 1];
          const data = JSON.parse(lastLine);
          
          if (data.ok) {
            resolve(data.matches);
          } else {
            console.error(`[HLTV API] Scraper error: ${data.error}`);
            reject(new Error(`HLTV Scraper Error: ${data.error}`));
          }
        } catch (e) {
          console.error(`[HLTV API] Parse error. Stdout: ${stdout}`);
          reject(new Error("Failed to parse scraper output"));
        }
      });
    });

    // 2. Get all team mappings for Counter-Strike
    const mappings = await prisma.teamMapping.findMany({
      where: { disciplineSlug: "counterstrike" }
    });

    const mappingMap = new Map(mappings.map(m => [m.liquipediaName.toLowerCase(), m]));

    // 3. Transform and map
    const matches = (hltvMatches as any[]).map((m: any) => {
      const teamA = mappingMap.get(m.team1.toLowerCase());
      const teamB = mappingMap.get(m.team2.toLowerCase());

      // Format date from unix timestamp
      const date = new Date(m.unix_time * 1000);
      const dateStr = date.toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        timeZone: 'Europe/Moscow'
      }).replace(',', '');

      return {
        id: m.id,
        tournament: m.tournament,
        team1: {
          name: m.team1,
          platformId: teamA?.platformId || null,
        },
        team2: {
          name: m.team2,
          platformId: teamB?.platformId || null,
        },
        date: dateStr,
        isReady: !!teamA?.platformId && !!teamB?.platformId
      };
    });

    return NextResponse.json({ ok: true, matches });
  } catch (error: any) {
    console.error('[HLTV Scrape Route] Error:', error);
    return NextResponse.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 });
  }
}
