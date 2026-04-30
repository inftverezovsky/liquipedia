export default function SettingsPage() {
  const apiUrl = process.env.LIQUIPEDIA_DOTA2_API_URL ?? "https://liquipedia.net/dota2/api.php";
  const userAgent = process.env.LIQUIPEDIA_USER_AGENT ?? "not configured";
  const genericInterval = process.env.LIQUIPEDIA_GENERIC_MIN_INTERVAL_MS ?? "2100";
  const parseInterval = process.env.LIQUIPEDIA_PARSE_MIN_INTERVAL_MS ?? "31000";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Configuration</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Настройки API</h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Перед реальным использованием обязательно замени LIQUIPEDIA_USER_AGENT на свой контакт.
        </p>
      </div>

      <section className="rounded-3xl bg-white p-6 ring-1 ring-slate-200">
        <dl className="grid gap-4 text-sm">
          <Row label="Dota 2 API" value={apiUrl} />
          <Row label="User-Agent" value={userAgent} />
          <Row label="Generic interval" value={`${genericInterval} ms`} />
          <Row label="Parse interval" value={`${parseInterval} ms`} />
        </dl>
      </section>

      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
        <h2 className="font-semibold">Важно</h2>
        <p className="mt-2 text-sm">
          Проект не должен ходить по HTML-страницам Liquipedia. Вся загрузка должна идти только через разрешённые API endpoint&apos;ы.
        </p>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-slate-100 pb-3 last:border-0 sm:grid-cols-[220px_minmax(0,1fr)]">
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className="break-all text-slate-950">{value}</dd>
    </div>
  );
}
