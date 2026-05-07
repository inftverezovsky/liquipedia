import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: { disciplineSlug: string, id: string } }
) {
  try {
    const logs = await prisma.adminUploadLog.findMany({
      where: {
        tournamentId: params.id,
        status: { in: ['success', 'success_like'] }
      },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        phpArrayJson: true
      }
    });

    return NextResponse.json({ ok: true, logs });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
