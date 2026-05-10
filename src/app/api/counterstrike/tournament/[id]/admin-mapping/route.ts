import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const mapping = await prisma.tournamentAdminMapping.findUnique({
      where: { tournamentId: id },
    });

    return NextResponse.json(mapping || { tournamentId: id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const { adminShapkaId, adminShapkaName, disciplineSlug, sourceTournamentName } = body;

    const mapping = await prisma.tournamentAdminMapping.upsert({
      where: { tournamentId: id },
      update: {
        adminShapkaId: adminShapkaId?.toString(),
        adminShapkaName,
      },
      create: {
        tournamentId: id,
        disciplineSlug,
        sourceTournamentName,
        adminShapkaId: adminShapkaId?.toString(),
        adminShapkaName,
      },
    });

    return NextResponse.json(mapping);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
