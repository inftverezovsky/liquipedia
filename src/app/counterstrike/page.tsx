import SearchTournament from "@/components/SearchTournament";
import SearchHltv from "@/components/SearchHltv";
import UpcomingTournamentsWidget from "@/components/UpcomingTournamentsWidget";
import HltvTournamentsWidget from "@/components/HltvTournamentsWidget";

export const dynamic = "force-dynamic";

export default function CounterStrikePage() {
  return (
    <div className="animate-in">
      <div className="grid gap-8 lg:grid-cols-[1fr_1fr_380px]">
        {/* Liquipedia Search */}
        <div className="space-y-6">
          <SearchTournament disciplineSlug="counterstrike" hideSidebar={true} />
        </div>

        {/* HLTV Search */}
        <div className="space-y-6">
          <SearchHltv disciplineSlug="counterstrike" />
        </div>
        
        {/* Sidebar Widgets */}
        <div className="space-y-8">
          <UpcomingTournamentsWidget disciplineSlug="counterstrike" />
          <HltvTournamentsWidget disciplineSlug="counterstrike" />
        </div>
      </div>
    </div>
  );
}
