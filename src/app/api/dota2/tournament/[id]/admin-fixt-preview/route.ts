import { NextResponse } from 'next/server';
import { buildFixtPayload } from '@/lib/adminUpload/buildFixtPayload';
import { phpSerialize } from '@/lib/adminUpload/phpSerialize';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const { disciplineSlug, selectedMatchIds } = await request.json();
    
    // 1. Get settings
    const settings = await prisma.disciplineAdminSettings.findUnique({
      where: { disciplineSlug },
    });

    if (!settings) {
      return NextResponse.json({ ok: false, error: "Admin settings not found." }, { status: 400 });
    }

    // 2. Build payload
    const buildResult = await buildFixtPayload(id, disciplineSlug, selectedMatchIds);
    
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
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
