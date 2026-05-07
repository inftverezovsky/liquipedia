import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAdminAuthConfigStatus } from '@/lib/adminUpload/adminHttpClient';
import { getAdminSettings } from '@/lib/adminUpload/getAdminSettings';

export async function GET(
  request: Request,
  { params }: { params: { disciplineSlug: string } }
) {
  try {
    const settings = getAdminSettings(params.disciplineSlug);
    const authStatus = getAdminAuthConfigStatus();

    const merged = {
      disciplineSlug: params.disciplineSlug,
      apiUrl: settings?.apiUrl || null,
      adminSportId: settings?.adminSportId || null,
      adminMax: settings?.adminMax || '5000',
      defaultShapkaId: settings?.defaultShapkaId || null,
      timezone: settings?.timezone || 'Europe/Moscow',
      dateFormat: settings?.dateFormat || 'DD.MM.YYYY HH:mm:ss',
      requestMode: settings?.requestMode || 'legacy_raw',
      sslVerify: settings?.sslVerify ?? true,
      authStatus,
    };

    return NextResponse.json(merged);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { disciplineSlug: string } }
) {
  try {
    const body = await request.json();
    const {
      apiUrl,
      adminSportId,
      adminMax,
      defaultShapkaId,
      timezone,
      dateFormat,
      requestMode,
      sslVerify,
    } = body;

    const settings = await prisma.disciplineAdminSettings.upsert({
      where: { disciplineSlug: params.disciplineSlug },
      update: {
        apiUrl,
        adminSportId: adminSportId?.toString(),
        adminMax: adminMax?.toString(),
        defaultShapkaId: defaultShapkaId?.toString(),
        timezone,
        dateFormat,
        requestMode,
        sslVerify,
      },
      create: {
        disciplineSlug: params.disciplineSlug,
        apiUrl,
        adminSportId: adminSportId?.toString(),
        adminMax: adminMax?.toString(),
        defaultShapkaId: defaultShapkaId?.toString(),
        timezone: timezone || 'Europe/Moscow',
        dateFormat: dateFormat || 'DD.MM.YYYY HH:mm:ss',
        requestMode: requestMode || 'legacy_raw',
        sslVerify: sslVerify ?? true,
      },
    });

    return NextResponse.json(settings);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
