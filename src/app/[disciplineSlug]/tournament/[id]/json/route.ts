import { buildFixtPayload } from "@/lib/adminUpload/buildFixtPayload";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { disciplineSlug: string; id: string } }
) {
  const { disciplineSlug, id } = params;
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids");
  const selectedIds = idsParam ? idsParam.split(",") : undefined;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
  });

  if (!tournament) {
    return new Response("Tournament not found", { status: 404 });
  }

  const buildResult = await buildFixtPayload(id, disciplineSlug, selectedIds);
  
  if (!buildResult.payload) {
    const errorMsg = "Данные не готовы.\n\n" + buildResult.warnings.join("\n");
    return new Response(errorMsg, { 
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }

  const jsonString = JSON.stringify(buildResult.payload, null, 2);

  return new Response(jsonString, {
    headers: { 
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0'
    }
  });
}
