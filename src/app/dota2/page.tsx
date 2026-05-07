import SearchTournament from "@/components/SearchTournament";

export const dynamic = "force-dynamic";

export default function Dota2Page() {
  return (
    <div className="animate-in">
      <div className="space-y-12">
        <SearchTournament disciplineSlug="dota2" />
      </div>
    </div>
  );
}
