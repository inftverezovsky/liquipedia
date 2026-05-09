"use client";

import { useState, useEffect } from "react";

const DEFAULT_SETTINGS = {
  "dota2_api": "https://liquipedia.net/dota2/api.php",
  "cs_api": "https://liquipedia.net/counterstrike/api.php",
  "lol_api": "https://liquipedia.net/leagueoflegends/api.php",
  "valorant_api": "https://liquipedia.net/valorant/api.php",
  "user_agent": "liquipedia-local-dev/0.1 (local development; contact@example.com)",
  "generic_interval": "2100",
  "parse_interval": "31000",
  "admin_api_url": "",
  "admin_sport_id": "73",
  "proxy_host": "geo.g-w.info",
  "proxy_port": "10080",
  "proxy_username": "",
  "proxy_password": ""
};

export default function LiquipediaGlobalSettings() {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/global")
      .then(res => res.json())
      .then(data => {
        if (Object.keys(data).length > 0) {
          setSettings(prev => ({ ...prev, ...data }));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings/global", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      setIsEditing(false);
    } catch (err) {
      alert("Ошибка при сохранении");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="animate-pulse h-20 bg-slate-100 rounded-3xl" />;

  return (
    <section className="premium-card overflow-hidden transition-all duration-500">
      <div 
        className="flex items-center justify-between p-8 cursor-pointer hover:bg-slate-50/50 transition-colors"
        onClick={() => !isEditing && setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-4">
           <div className={`h-10 w-10 rounded-2xl flex items-center justify-center transition-all ${isOpen ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-slate-100 text-slate-400'}`}>
             <svg className={`h-6 w-6 transition-transform duration-500 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
             </svg>
           </div>
           <div>
             <h2 className="text-2xl font-black text-slate-900 tracking-tight">Параметры Liquipedia</h2>
             <p className="text-xs font-bold text-slate-500 mt-0.5">Конфигурация API и сетевых задержек</p>
           </div>
        </div>

        <div className="flex items-center gap-3">
          {isEditing ? (
            <>
              <button 
                onClick={(e) => { e.stopPropagation(); setIsEditing(false); }}
                className="px-6 py-2 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
              >
                Отмена
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); handleSave(); }}
                disabled={saving}
                className="btn-primary px-8 py-2 text-xs"
              >
                {saving ? "..." : "Сохранить"}
              </button>
            </>
          ) : (
            <button 
              onClick={(e) => { e.stopPropagation(); setIsEditing(true); setIsOpen(true); }}
              className="btn-secondary px-8 py-2 text-xs"
            >
              Изменить
            </button>
          )}
        </div>
      </div>

      <div className={`transition-all duration-500 ease-in-out ${isOpen ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'} overflow-hidden`}>
        <div className="p-8 pt-0 space-y-6">
          <div className="h-px bg-slate-100 mb-8" />
          
          <dl className="grid gap-6">
            <SettingsRow 
              label="Прокси-хост" 
              name="proxy_host"
              value={settings.proxy_host} 
              isEditing={isEditing}
              onChange={(val) => setSettings({ ...settings, proxy_host: val })}
            />
            <SettingsRow 
              label="Порт" 
              name="proxy_port"
              value={settings.proxy_port} 
              isEditing={isEditing}
              onChange={(val) => setSettings({ ...settings, proxy_port: val })}
            />
            <SettingsRow 
              label="Логин" 
              name="proxy_username"
              value={settings.proxy_username} 
              isEditing={isEditing}
              onChange={(val) => setSettings({ ...settings, proxy_username: val })}
            />
            <SettingsRow 
              label="Пароль" 
              name="proxy_password"
              value={settings.proxy_password} 
              isEditing={isEditing}
              type="password"
              onChange={(val) => setSettings({ ...settings, proxy_password: val })}
            />
            <div className="h-px bg-slate-100 my-4" />
            <SettingsRow 
              label="Dota 2 API" 
              name="dota2_api"
              value={settings.dota2_api} 
              isEditing={isEditing}
              onChange={(val) => setSettings({ ...settings, dota2_api: val })}
            />
            <SettingsRow 
              label="Counter-Strike API" 
              name="cs_api"
              value={settings.cs_api} 
              isEditing={isEditing}
              onChange={(val) => setSettings({ ...settings, cs_api: val })}
            />
            <SettingsRow 
              label="League of Legends API" 
              name="lol_api"
              value={settings.lol_api} 
              isEditing={isEditing}
              onChange={(val) => setSettings({ ...settings, lol_api: val })}
            />
            <SettingsRow 
              label="Valorant API" 
              name="valorant_api"
              value={settings.valorant_api} 
              isEditing={isEditing}
              onChange={(val) => setSettings({ ...settings, valorant_api: val })}
            />
            <SettingsRow 
              label="User-Agent" 
              name="user_agent"
              value={settings.user_agent} 
              isEditing={isEditing}
              onChange={(val) => setSettings({ ...settings, user_agent: val })}
            />
            <SettingsRow 
              label="Generic Interval (ms)" 
              name="generic_interval"
              value={settings.generic_interval} 
              isEditing={isEditing}
              onChange={(val) => setSettings({ ...settings, generic_interval: val })}
            />
            <SettingsRow 
              label="Parse Interval (ms)" 
              name="parse_interval"
              value={settings.parse_interval} 
              isEditing={isEditing}
              onChange={(val) => setSettings({ ...settings, parse_interval: val })}
            />
            <div className="h-px bg-slate-100 my-4" />
            <SettingsRow 
              label="Universal Admin API URL" 
              name="admin_api_url"
              value={settings.admin_api_url} 
              isEditing={isEditing}
              onChange={(val) => setSettings({ ...settings, admin_api_url: val })}
            />
            <SettingsRow 
              label="Universal Admin Sport ID" 
              name="admin_sport_id"
              value={settings.admin_sport_id} 
              isEditing={isEditing}
              onChange={(val) => setSettings({ ...settings, admin_sport_id: val })}
            />
          </dl>
        </div>
      </div>
    </section>
  );
}

function SettingsRow({ label, name, value, isEditing, type = "text", onChange }: { 
  label: string; 
  name: string;
  value: string; 
  isEditing: boolean;
  type?: string;
  onChange: (val: string) => void;
}) {
  return (
    <div className="grid gap-3 border-b border-slate-50 pb-6 last:border-0 sm:grid-cols-[220px_minmax(0,1fr)] items-center">
      <dt className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</dt>
      <dd>
        {isEditing ? (
          <input 
            type={type}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 focus:outline-none focus:ring-4 focus:ring-indigo-600/5 focus:border-indigo-600 transition-all"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <span className="break-all text-sm font-bold text-slate-900 font-mono bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 block w-fit">
            {type === 'password' ? '********' : value} {label.includes("ms") ? "" : ""}
          </span>
        )}
      </dd>
    </div>
  );
}
