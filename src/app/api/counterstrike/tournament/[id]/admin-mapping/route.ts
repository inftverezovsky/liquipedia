import { NextResponse } from 'next/server';
import { findTournamentAdminMapping, upsertTournamentAdminMapping } from '@/lib/adminUpload/adminMappingStore';
import { queueIdentitySync } from '@/lib/identitySync';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const mapping = await findTournamentAdminMapping(id);

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

  try {
    const body = await request.json();
    const { adminShapkaId, adminShapkaName, disciplineSlug, sourceTournamentName } = body;

    const mapping = await upsertTournamentAdminMapping({
      tournamentId: id,
      disciplineSlug,
      sourceTournamentName,
      adminShapkaId,
      adminShapkaName,
    });

    const identitySync = queueIdentitySync(`admin-mapping:${disciplineSlug || "counterstrike"}`);
    return NextResponse.json({ ...mapping, identitySync });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
