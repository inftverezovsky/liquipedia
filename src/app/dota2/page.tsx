import SearchTournament from "@/components/SearchTournament";
import DisciplinePlatformIdPanel from "@/components/DisciplinePlatformIdPanel";

export default function Dota2Page() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Dota 2</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Поиск чемпионата</h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Введи примерное название турнира. Данные не обновляются в фоне: поиск и загрузка происходят только по кнопке.
        </p>
      </div>
      <DisciplinePlatformIdPanel />
      <SearchTournament />
    </div>
  );
}
