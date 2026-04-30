import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="rounded-3xl bg-white p-8 shadow-soft ring-1 ring-slate-200">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Manual API-first loader</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight text-slate-950">
          Стартовый проект liquipedia для ручной загрузки турниров Dota 2.
        </h1>
        <p className="mt-4 max-w-3xl text-lg text-slate-600">
          Это не фоновый парсер и не crawler. Пользователь сам вводит примерное название чемпионата,
          выбирает найденную страницу Liquipedia и нажимает кнопку загрузки данных.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/dota2" className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800">
            Перейти в Dota 2
          </Link>
          <Link href="/settings" className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Проверить настройки API
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
          <h2 className="font-semibold text-slate-950">1. Поиск</h2>
          <p className="mt-2 text-sm text-slate-600">Вводишь примерное название: Riyadh Masters, DreamLeague, The International.</p>
        </div>
        <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
          <h2 className="font-semibold text-slate-950">2. Выбор страницы</h2>
          <p className="mt-2 text-sm text-slate-600">Система показывает кандидатов из Liquipedia, но ничего не грузит автоматически.</p>
        </div>
        <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
          <h2 className="font-semibold text-slate-950">3. Загрузка</h2>
          <p className="mt-2 text-sm text-slate-600">По кнопке создаётся import, сохраняется raw snapshot и запускается нормализация.</p>
        </div>
      </section>
    </div>
  );
}
