import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const mapping = await prisma.tournamentAdminMapping.findUnique({
      where: { tournamentId: params.id },
    });

    return NextResponse.json(mapping || { tournamentId: params.id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { adminShapkaId, adminShapkaName, disciplineSlug, sourceTournamentName } = body;

    const mapping = await prisma.tournamentAdminMapping.upsert({
      where: { tournamentId: params.id },
      update: {
        adminShapkaId: adminShapkaId?.toString(),
        adminShapkaName,
      },
      create: {
        tournamentId: params.id,
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
