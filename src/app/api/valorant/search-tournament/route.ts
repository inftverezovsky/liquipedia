import { getOrCreateValorantDiscipline } from "@/lib/disciplines";
import { createSearchTournamentGetRoute, createSearchTournamentPostRoute } from "@/lib/liquipedia/searchRoute";

export const dynamic = "force-dynamic";

const config = {
  disciplineSlug: "valorant",
  getDiscipline: getOrCreateValorantDiscipline,
  defaultApiUrl: "https://liquipedia.net/valorant/api.php",
};

export const GET = createSearchTournamentGetRoute(config);
export const POST = createSearchTournamentPostRoute(config);
