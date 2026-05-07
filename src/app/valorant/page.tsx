import SearchTournament from "@/components/SearchTournament";

export const dynamic = "force-dynamic";

export default function ValorantPage() {
  return (
    <div className="animate-in">
      <div className="space-y-12">
        <SearchTournament disciplineSlug="valorant" />
      </div>
    </div>
  );
}
