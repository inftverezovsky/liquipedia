import { getOrCreateDota2Discipline } from "@/lib/disciplines";
import { createSearchTournamentPostRoute } from "@/lib/liquipedia/searchRoute";

export const dynamic = "force-dynamic";

export const POST = createSearchTournamentPostRoute({
  disciplineSlug: "dota2",
  getDiscipline: getOrCreateDota2Discipline,
  defaultApiUrl: "https://liquipedia.net/dota2/api.php",
});
