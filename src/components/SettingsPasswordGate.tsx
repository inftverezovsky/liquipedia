"use client";

import { useState, useEffect } from "react";

export function SettingsPasswordGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [correctPassword, setCorrectPassword] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then(data => {
        setCorrectPassword(data["admin_password"] || "63016");
        setLoading(false);
      });
  }, []);

  const handleUnlock = () => {
    if (password === correctPassword) {
      setUnlocked(true);
      setError(false);
    } else {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-800" />
    </div>
  );

  if (!unlocked) {
    return (
      <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-10 shadow-xl mt-20 text-center">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 text-slate-400">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2(c1.1 0 2-.9 2-2)V10a2 2(0-1.1-.9-2-2)H6a2 2(0-1.1-.9-2-2)v11a2 2(0-1.1.9-2 2)zM11 5a3 3(0 016 0v4a3 3(0 01-6 0V5z)" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-950 mb-2">Доступ ограничен</h1>
        <p className="text-sm text-slate-500 mb-8">Для доступа к настройкам API и платформы введите административный пароль.</p>
        
        <div className="space-y-4">
          <input
            type="password"
            placeholder="Пароль..."
            className={`w-full rounded-2xl border px-5 py-3 text-sm focus:outline-none focus:ring-2 ${error ? 'border-red-500 ring-red-500' : 'border-slate-200 focus:ring-slate-900'}`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
            autoFocus
          />
          <button 
            onClick={handleUnlock}
            className="w-full bg-slate-950 text-white rounded-2xl py-3 text-sm font-bold hover:bg-slate-800 transition active:scale-95 shadow-lg shadow-slate-200"
          >
            Разблокировать
          </button>
        </div>
        {error && <p className="mt-4 text-xs font-bold text-red-500 animate-bounce uppercase">Неверный пароль</p>}
      </div>
    );
  }

  return <>{children}</>;
}
