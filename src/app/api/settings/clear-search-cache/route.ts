import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { requireAdmin } from "@/lib/adminAuth";

export async function POST(request: Request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const hltvCache = path.join(process.cwd(), "cache", "hltv");
    const liquipediaCache = path.join(process.cwd(), "cache", "liquipedia");

    let deletedCount = 0;

    deletedCount += deleteCacheFiles(hltvCache);
    deletedCount += deleteCacheFiles(liquipediaCache);

    return NextResponse.json({ ok: true, deletedCount });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

function deleteCacheFiles(cacheDir: string): number {
  if (!fs.existsSync(cacheDir)) return 0;
  let deletedCount = 0;

  for (const file of fs.readdirSync(cacheDir, { withFileTypes: true })) {
    const fullPath = path.join(cacheDir, file.name);
    if (file.isDirectory()) {
      deletedCount += deleteCacheFiles(fullPath);
      continue;
    }

    if (file.isFile() && (file.name.endsWith(".json") || file.name.endsWith(".png"))) {
      fs.unlinkSync(fullPath);
      deletedCount++;
    }
  }

  return deletedCount;
}
