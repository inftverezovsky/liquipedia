import { NextResponse } from "next/server";
import * as xlsx from "xlsx";
import { prisma } from "@/lib/db";
import { normalizeTeamName } from "@/lib/teams";
import levenshtein from "fast-levenshtein";

function findColumns(headers: string[]) {
  const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());

  const idCandidates = ["platformid", "id", "team_id", "teamid"];
  const nameCandidates = ["teamname", "name", "team", "название", "team name", "команда"];

  let idCol = -1;
  let nameCol = -1;

  for (let i = 0; i < normalizedHeaders.length; i++) {
    const h = normalizedHeaders[i];
    if (idCol === -1 && idCandidates.includes(h)) idCol = i;
    if (nameCol === -1 && nameCandidates.includes(h)) nameCol = i;
  }

  return { idCol, nameCol };
}

async function runAutoMapping(disciplineSlug: string) {
  const adminTeams = await prisma.adminTeam.findMany({
    where: { disciplineSlug },
  });

  const mappings = await prisma.teamMapping.findMany({
    where: {
      disciplineSlug,
      status: {
        in: ["unmapped", "ambiguous"],
      },
      isLockedFromAutoMapping: false,
    },
  });

  let autoMappedCount = 0;
  let ambiguousCount = 0;
  let unmappedCount = 0;

  for (const mapping of mappings) {
    const liqName =
      mapping.liquipediaNormalizedName ||
      normalizeTeamName(mapping.liquipediaName);
    if (!liqName) continue;

    let bestScore = 0;
    let secondBestScore = 0;
    let bestAdminTeam: any = null;
    let candidates: any[] = [];

    for (const admin of adminTeams) {
      const distance = levenshtein.get(liqName, admin.normalizedName);
      const maxLength = Math.max(liqName.length, admin.normalizedName.length);
      const score = maxLength === 0 ? 100 : (1 - distance / maxLength) * 100;

      candidates.push({ admin, score });
    }

    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length > 0) {
      bestScore = candidates[0].score;
      bestAdminTeam = candidates[0].admin;
      if (candidates.length > 1) {
        secondBestScore = candidates[1].score;
      }
    }

    if (bestScore >= 90) {
      if (bestScore - secondBestScore < 3 && secondBestScore >= 90) {
        await prisma.teamMapping.update({
          where: { id: mapping.id },
          data: { status: "ambiguous" },
        });
        ambiguousCount++;
      } else {
        await prisma.teamMapping.update({
          where: { id: mapping.id },
          data: {
            platformId: bestAdminTeam.platformId,
            canonicalName: bestAdminTeam.platformName,
            confidenceScore: bestScore,
            matchMethod: "levenshtein",
            status: "auto_mapped",
          },
        });
        autoMappedCount++;
      }
    } else {
      unmappedCount++;
    }
  }

  return {
    adminTeamsCount: adminTeams.length,
    liquipediaTeamsFound: mappings.length,
    autoMappedCount,
    ambiguousCount,
    unmappedCount,
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const url = formData.get("url") as string;
    const disciplineSlug = (formData.get("disciplineSlug") as string) || "dota2";

    if (!file && !url) {
      return NextResponse.json({ error: "No file or URL provided" }, { status: 400 });
    }

    let buffer: Buffer;
    let fileName: string;

    if (file) {
      const bytes = await file.arrayBuffer();
      buffer = Buffer.from(bytes);
      fileName = file.name;
    } else {
      let fetchUrl = url;
      // Handle Google Sheets links
      if (url.includes("docs.google.com/spreadsheets")) {
        const match = url.match(/\/d\/(.+?)\//);
        if (match) {
          const id = match[1];
          fetchUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;
        }
      }
      
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch from URL: ${response.statusText}`);
      }
      const bytes = await response.arrayBuffer();
      buffer = Buffer.from(bytes);
      fileName = "remote_url";
    }

    const workbook = xlsx.read(buffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    const data: any[][] = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
    if (data.length < 2) {
      return NextResponse.json({ error: "Source has no data" }, { status: 400 });
    }

    const headers = data[0].map(String);
    const { idCol, nameCol } = findColumns(headers);

    if (idCol === -1 || nameCol === -1) {
      return NextResponse.json(
        {
          error: `Could not determine columns. Found headers: ${headers.join(
            ", "
          )}. Need ID and Name columns.`,
        },
        { status: 400 }
      );
    }

    let importedCount = 0;

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;

      const id = row[idCol] ? String(row[idCol]).trim() : "";
      const name = row[nameCol] ? String(row[nameCol]).trim() : "";

      if (!id || !name) continue;

      const normalizedName = normalizeTeamName(name);

      await prisma.adminTeam.upsert({
        where: { id: `admin_${disciplineSlug}_${id}` },
        update: {
          platformName: name,
          normalizedName,
          sourceFileName: fileName,
        },
        create: {
          id: `admin_${disciplineSlug}_${id}`,
          disciplineSlug,
          platformId: id,
          platformName: name,
          normalizedName,
          sourceFileName: fileName,
        },
      });
      importedCount++;
    }

    // Run auto-mapping after import
    const mappingResult = await runAutoMapping(disciplineSlug);

    return NextResponse.json({
      success: true,
      importedCount,
      mappingResult,
    });
  } catch (error: any) {
    console.error("Import error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
