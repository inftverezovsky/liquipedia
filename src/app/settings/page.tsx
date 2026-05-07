"use client";

import { SettingsPasswordGate } from "@/components/SettingsPasswordGate";

import LiquipediaGlobalSettings from "@/components/LiquipediaGlobalSettings";

export default function SettingsPage() {
  return (
    <SettingsPasswordGate>
      <div className="space-y-12">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-600">Engine Configuration</p>
          <h1 className="mt-4 text-5xl font-black tracking-tighter text-slate-950">
            Настройки <span className="text-slate-400">Системы.</span>
          </h1>
          <p className="mt-6 text-xl font-bold leading-relaxed text-slate-700 max-w-2xl">
            Управление параметрами подключения к Liquipedia и внешним API.
          </p>
        </div>

        <LiquipediaGlobalSettings />


      </div>
    </SettingsPasswordGate>
  );
}
