import { getOrCreateLeagueOfLegendsDiscipline } from "@/lib/disciplines";
import { createSearchTournamentPostRoute } from "@/lib/liquipedia/searchRoute";

export const dynamic = "force-dynamic";

export const POST = createSearchTournamentPostRoute({
  disciplineSlug: "leagueoflegends",
  getDiscipline: getOrCreateLeagueOfLegendsDiscipline,
  defaultApiUrl: "https://liquipedia.net/leagueoflegends/api.php",
});
