import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { buildFixtPayload } from '@/lib/adminUpload/buildFixtPayload';
import { phpSerialize } from '@/lib/adminUpload/phpSerialize';
import { resolveAdminSettings } from '@/lib/adminUpload/resolveAdminSettings';
import { sendFixtPayload } from '@/lib/adminUpload/sendFixtPayload';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { disciplineSlug, selectedMatchIds } = await request.json();
    const slug = disciplineSlug || "counterstrike";
    
    // 1. Get settings
    const settings = await resolveAdminSettings(slug);

    if (!settings.apiUrl) {
      return NextResponse.json({ ok: false, error: "Admin API URL is not configured." }, { status: 400 });
    }

    // 2. Build payload
    const buildResult = await buildFixtPayload(params.id, slug, selectedMatchIds);
    
    if (!buildResult.payload) {
      return NextResponse.json({ 
        ok: false, 
        error: "Payload is not ready. Check warnings and matched teams.",
        warnings: buildResult.warnings,
        skippedMatches: buildResult.skippedMatches
      }, { status: 400 });
    }

    const serialized = phpSerialize(buildResult.payload);

    // 3. Send payload
    const sendResult = await sendFixtPayload(
      settings.apiUrl,
      serialized,
      settings.requestMode,
      settings.sslVerify
    );

    // 4. Log the attempt
    await prisma.adminUploadLog.create({
      data: {
        disciplineSlug: slug,
        tournamentId: params.id,
        apiUrl: settings.apiUrl,
        adminSportId: settings.adminSportId,
        adminMax: settings.adminMax,
        adminShapkaId: buildResult.payload.shapka.toString(),
        requestMode: settings.requestMode,
        timezone: settings.timezone,
        dateFormat: settings.dateFormat,
        phpArrayJson: buildResult.payload as any,
        serializedFixt: serialized,
        readyMatchesCount: buildResult.readyMatchesCount,
        skippedMatchesCount: buildResult.skippedMatches.length,
        skippedMatchesJson: buildResult.skippedMatches as any,
        responseRaw: sendResult.rawResponse,
        status: sendResult.status,
        errorMessage: sendResult.errorMessage,
      },
    });

    return NextResponse.json({
      ok: sendResult.status !== 'failed',
      status: sendResult.status,
      rawResponse: sendResult.rawResponse,
      errorMessage: sendResult.errorMessage,
      error: sendResult.status === 'failed' ? (sendResult.errorMessage || "Ошибка при отправке данных в платформу") : undefined
    });
  } catch (error: any) {
    console.error('[Admin Send CS] Error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
