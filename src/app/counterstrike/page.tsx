import SearchTournament from "@/components/SearchTournament";

export const dynamic = "force-dynamic";

export default function CounterStrikePage() {
  return (
    <div className="animate-in">
      <div className="space-y-12">
        <SearchTournament disciplineSlug="counterstrike" />
      </div>
    </div>
  );
}
