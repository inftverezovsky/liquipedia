import SearchTournament from "@/components/SearchTournament";
import DisciplinePlatformIdPanel from "@/components/DisciplinePlatformIdPanel";

export const dynamic = "force-dynamic";

export default function ValorantPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Valorant</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Поиск чемпионата</h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Введи примерное название турнира. Данные не обновляются в фоне: поиск и загрузка происходят только по кнопке.
        </p>
      </div>
      <DisciplinePlatformIdPanel disciplineSlug="valorant" />
      <SearchTournament disciplineSlug="valorant" />
    </div>
  );
}
