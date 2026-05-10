import { getOrCreateCounterStrikeDiscipline } from "@/lib/disciplines";
import { createSearchTournamentPostRoute } from "@/lib/liquipedia/searchRoute";

export const dynamic = "force-dynamic";

export const POST = createSearchTournamentPostRoute({
  disciplineSlug: "counterstrike",
  getDiscipline: getOrCreateCounterStrikeDiscipline,
  defaultApiUrl: "https://liquipedia.net/counterstrike/api.php",
});
