import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreateCounterStrikeDiscipline } from "@/lib/disciplines";
import { makeLiquipediaPageUrl } from "@/lib/liquipedia/client";
import { normalizeCounterStrikeTournament } from "@/lib/normalizers/counterstrikeTournament";
import { importTournamentRecursive } from "@/lib/liquipedia/importer";

export const dynamic = "force-dynamic";

type Body = {
  pageId?: unknown;
  title?: unknown;
  pageUrl?: unknown;
  source?: "liquipedia" | "hltv";
  force?: boolean;
};

export async function POST(request: Request) {
  const body = (await request.json()) as Body;
  const source = body.source || "liquipedia";
  const pageId = typeof body.pageId === "number" ? body.pageId : undefined;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const pageUrl = typeof body.pageUrl === "string" && body.pageUrl.trim().length > 0
    ? body.pageUrl.trim()
    : (source === 'hltv' ? "" : makeLiquipediaPageUrl(title, "counterstrike"));

  if (!pageId && title.length < 2) {
    return NextResponse.json({ error: "Нужен pageId или title выбранной страницы" }, { status: 400 });
  }

  const discipline = await getOrCreateCounterStrikeDiscipline();

  // If source is HLTV, we handle it differently (skip Liquipedia recursive import)
  if (source === "hltv") {
    // 1. Create/Update tournament
    const tournament = await prisma.tournament.upsert({
      where: { disciplineSlug_sourceTitle: { disciplineSlug: "counterstrike", sourceTitle: title } },
      create: {
        name: title,
        sourceTitle: title,
        sourceUrl: pageUrl,
        disciplineSlug: "counterstrike",
        status: "ongoing",
        extractionStatus: "SUCCESS"
      },
      update: {
        sourceUrl: pageUrl,
        updatedAt: new Date()
      }
    });

    // 2. Extract HLTV Event ID and fetch matches
    let hltvEventId = "";
    const idMatch = pageUrl.match(/\/events\/(\d+)\//);
    if (idMatch) {
      hltvEventId = idMatch[1];
    } else {
      // Fallback for different URL formats
      const parts = pageUrl.split('/');
      const eventIdx = parts.indexOf('events');
      if (eventIdx !== -1 && parts[eventIdx + 1]) {
        hltvEventId = parts[eventIdx + 1];
      }
    }

    if (hltvEventId) {
      // Get proxy config
      const settings = await prisma.globalSettings.findMany({
        where: { key: { in: ['proxy_host', 'proxy_port', 'proxy_username', 'proxy_password'] } }
      });
      const config = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {} as Record<string, string>);
      let proxyArg = "";
      if (config.proxy_host && config.proxy_port) {
        const isSocks = config.proxy_host.startsWith('socks') || config.proxy_port === '10800';
        let proxyStr = `${isSocks ? 'socks5' : 'http'}://`;
        if (config.proxy_username && config.proxy_password) proxyStr += `${config.proxy_username}:${config.proxy_password}@`;
        proxyStr += `${config.proxy_host.replace(/^(socks5:\/\/|http:\/\/)/, '')}:${config.proxy_port}`;
        proxyArg = `--proxy "${proxyStr}"`;
      }

      const command = `node scripts/hltv_playwright.mjs ${proxyArg} --mode event --id ${hltvEventId}`;
      console.log(`[HLTV Import] Fetching matches for event ${hltvEventId}: ${command}`);

      const { exec } = require('child_process');
      const hltvData: any = await new Promise((resolve) => {
        exec(command, { timeout: 120000 }, (err: any, stdout: string) => {
          if (err) {
            console.error(`[HLTV Import] Script error:`, err);
            return resolve({ ok: false, error: err.message });
          }
          try {
            const lines = stdout.trim().split('\n');
            const lastLine = lines[lines.length - 1];
            resolve(JSON.parse(lastLine));
          } catch (e) { 
            console.error(`[HLTV Import] JSON parse error. Raw output:`, stdout.slice(-200));
            resolve({ ok: false, error: "Failed to parse script output" }); 
          }
        });
      });

      if (hltvData.ok && hltvData.matches) {
        const uniqueTeams = new Set<string>();
        for (const m of hltvData.matches) {
          if (m.team1) uniqueTeams.add(m.team1);
          if (m.team2) uniqueTeams.add(m.team2);

          const matchDate = m.unix_time ? new Date(m.unix_time * 1000) : null;
          await prisma.tournamentMatch.upsert({
            where: { matchId: `hltv-${m.id}` },
            create: {
              matchId: `hltv-${m.id}`,
              tournamentId: tournament.id,
              teamAName: m.team1,
              teamBName: m.team2,
              matchDate,
              sourceUrl: `https://www.hltv.org/matches/${m.id}/match`,
              status: "upcoming"
            },
            update: {
              teamAName: m.team1,
              teamBName: m.team2,
              matchDate,
              updatedAt: new Date()
            }
          });
        }

        // Add participants for mapping - ROBUST VERSION
        const existingParticipants = await prisma.tournamentParticipant.findMany({
          where: { tournamentId: tournament.id },
          select: { name: true }
        });
        const existingNames = new Set(existingParticipants.map(p => p.name));

        for (const teamName of Array.from(uniqueTeams)) {
          if (!existingNames.has(teamName)) {
            try {
              await prisma.tournamentParticipant.create({
                data: {
                  tournamentId: tournament.id,
                  name: teamName
                }
              });
              existingNames.add(teamName);
            } catch (e) {
              console.log(`[HLTV Import] Participant ${teamName} already exists or error:`, e);
            }
          }
        }
      } else if (hltvData.error) {
        console.error(`[HLTV Import] Fetching failed: ${hltvData.error}`);
      }
    }

    const fullTournament = await prisma.tournament.findUnique({
      where: { id: tournament.id },
      include: { participants: true, matches: true, lastImport: true }
    });

    return NextResponse.json({ 
      tournament: fullTournament, 
      normalized: { status: hltvData?.ok ? "SUCCESS" : "PARTIAL", error: hltvData?.error } 
    });
  }

  const tournamentImport = await prisma.tournamentImport.create({
    data: {
      disciplineId: discipline.id,
      pageId,
      pageTitle: title,
      pageUrl,
      status: "PENDING"
    }
  });

  try {
    const apiUrl = discipline.baseApiUrl ?? "https://liquipedia.net/counterstrike/api.php";
    
    const { tournament, normalized } = await importTournamentRecursive({
      disciplineId: discipline.id,
      disciplineSlug: "counterstrike",
      apiUrl,
      pageId,
      title,
      pageUrl,
      normalizer: normalizeCounterStrikeTournament,
      importRecordId: tournamentImport.id,
      force: body.force
    });

    await prisma.tournamentImport.update({
      where: { id: tournamentImport.id },
      data: {
        status: normalized.status,
        finishedAt: new Date()
      }
    });

    const fullTournament = await prisma.tournament.findUnique({
      where: { id: tournament.id },
      include: { participants: true, matches: true, lastImport: true }
    });

    return NextResponse.json({ tournament: fullTournament, normalized });
  } catch (error) {
    console.error(error);
    await prisma.tournamentImport.update({
      where: { id: tournamentImport.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : "Unknown import error"
      }
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось загрузить турнир" },
      { status: 500 }
    );
  }
}
