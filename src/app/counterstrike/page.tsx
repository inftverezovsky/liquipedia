import SearchTournament from "@/components/SearchTournament";
import SearchHltv from "@/components/SearchHltv";
import UpcomingTournamentsWidget from "@/components/UpcomingTournamentsWidget";
import HltvTournamentsWidget from "@/components/HltvTournamentsWidget";

export const dynamic = "force-dynamic";

export default function CounterStrikePage() {
  return (
    <div className="animate-in">
      <div className="grid items-start gap-6 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_340px]">
        {/* Liquipedia Search */}
        <div className="min-w-0">
          <SearchTournament disciplineSlug="counterstrike" hideSidebar={true} />
        </div>

        {/* HLTV Search */}
        <div className="min-w-0">
          <SearchHltv disciplineSlug="counterstrike" />
        </div>
        
        {/* Sidebar Widgets */}
        <div className="min-w-0 space-y-6 lg:col-span-2 xl:col-span-1">
          <UpcomingTournamentsWidget disciplineSlug="counterstrike" />
          <HltvTournamentsWidget disciplineSlug="counterstrike" />
        </div>
      </div>
    </div>
  );
}
