import SearchTournament from "@/components/SearchTournament";
import DisciplinePlatformIdPanel from "@/components/DisciplinePlatformIdPanel";

export const dynamic = "force-dynamic";

export default function Dota2Page() {
  return (
    <div className="space-y-12 animate-in">
      <header className="relative overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white p-10 shadow-sm">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-indigo-500/5 via-transparent to-transparent" />
        <div className="max-w-3xl">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-600">Manual Loader Engine</p>
          <h1 className="mt-4 text-5xl font-black tracking-tighter text-slate-950 sm:text-6xl">
            Dota 2 <span className="text-slate-400">Portal.</span>
          </h1>
          <p className="mt-6 text-xl font-bold leading-relaxed text-slate-700">
            Поиск и импорт турниров Liquipedia. Все данные сохраняются в базу для последующего маппинга и экспорта в ваш API.
          </p>
        </div>
      </header>

      <div className="space-y-12">
        <DisciplinePlatformIdPanel disciplineSlug="dota2" />
        
        <div className="border-t border-slate-200 pt-12">
          <SearchTournament disciplineSlug="dota2" />
        </div>
      </div>
    </div>
  );
}
