"use client";

import { SettingsPasswordGate } from "@/components/SettingsPasswordGate";
import { ExternalPlatformSettings } from "@/components/ExternalPlatformSettings";

export default function SettingsPage() {
  const dota2Api = "https://liquipedia.net/dota2/api.php";
  const csApi = "https://liquipedia.net/counterstrike/api.php";
  const lolApi = "https://liquipedia.net/leagueoflegends/api.php";
  const valorantApi = "https://liquipedia.net/valorant/api.php";
  const userAgent = "liquipedia-local-dev/0.1 (local development; contact@example.com)";
  const genericInterval = "2100";
  const parseInterval = "31000";

  return (
    <SettingsPasswordGate>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Configuration</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Настройки API</h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Здесь вы можете настроить параметры подключения к Liquipedia и вашей внешней платформе.
          </p>
        </div>

        <section className="rounded-3xl bg-white p-8 shadow-soft ring-1 ring-slate-200">
          <h2 className="text-xl font-bold text-slate-950 mb-6">Параметры Liquipedia</h2>
          <dl className="grid gap-4 text-sm">
            <Row label="Dota 2 API" value={dota2Api} />
            <Row label="Counter-Strike API" value={csApi} />
            <Row label="League of Legends API" value={lolApi} />
            <Row label="Valorant API" value={valorantApi} />
            <Row label="User-Agent" value={userAgent} />
            <Row label="Generic interval" value={`${genericInterval} ms`} />
            <Row label="Parse interval" value={`${parseInterval} ms`} />
          </dl>
        </section>

        <ExternalPlatformSettings />

      </div>
    </SettingsPasswordGate>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-slate-100 pb-3 last:border-0 sm:grid-cols-[220px_minmax(0,1fr)]">
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className="break-all text-slate-950 font-mono">{value}</dd>
    </div>
  );
}
