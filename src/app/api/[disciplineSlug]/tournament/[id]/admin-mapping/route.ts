import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; disciplineSlug: string }> }
) {
  const { id } = await params;

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
  { params }: { params: Promise<{ id: string; disciplineSlug: string }> }
) {
  const { disciplineSlug: routeDisciplineSlug, id } = await params;

  try {
    const body = await request.json();
    const { adminShapkaId, adminShapkaName, sourceTournamentName } = body;
    const disciplineSlug = body.disciplineSlug || routeDisciplineSlug;

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
