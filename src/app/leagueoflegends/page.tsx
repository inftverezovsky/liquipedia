import SearchTournament from "@/components/SearchTournament";

export const dynamic = "force-dynamic";

export default function LeagueOfLegendsPage() {
  return (
    <div className="animate-in">
      <div className="space-y-12">
        <SearchTournament disciplineSlug="leagueoflegends" />
      </div>
    </div>
  );
}
