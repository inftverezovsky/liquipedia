import { NextResponse } from 'next/server';
import { buildFixtPayload } from '@/lib/adminUpload/buildFixtPayload';
import { phpSerialize } from '@/lib/adminUpload/phpSerialize';
import { prisma } from '@/lib/db';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { disciplineSlug, selectedMatchIds } = await request.json();
    
    // 1. Get settings
    const settings = await prisma.disciplineAdminSettings.findUnique({
      where: { disciplineSlug: "counterstrike" },
    });

    // 2. Build payload
    const buildResult = await buildFixtPayload(params.id, "counterstrike", selectedMatchIds);
    
    let serialized = '';
    let postBody = '';
    
    if (buildResult.payload) {
      serialized = phpSerialize(buildResult.payload);
      postBody = `fixt=${serialized}`;
    }

    return NextResponse.json({
      ok: true,
      phpArray: buildResult.payload,
      serialized,
      postBody,
      readyMatchesCount: buildResult.readyMatchesCount,
      skippedMatches: buildResult.skippedMatches,
      warnings: buildResult.warnings,
    });
  } catch (error: any) {
    console.error('[Admin Preview CS] Error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
