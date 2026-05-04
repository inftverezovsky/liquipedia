"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PortalTournament } from "@/lib/liquipedia/portal";

type Props = {
  slug: string;
  name: string;
  iconUrl: string;
  bgUrl: string;
  tournaments: PortalTournament[];
};

export default function PortalDisciplineCard({ slug, name, iconUrl, bgUrl, tournaments }: Props) {
  const [expanded, setExpanded] = useState(false);
  const displayLimit = expanded ? tournaments.length : 6;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-[2.5rem] bg-slate-900 shadow-2xl ring-1 ring-white/10 transition-all hover:ring-white/20">
      {/* Cinematic Header */}
      <div className="relative h-48 w-full overflow-hidden">
        <img 
          src={bgUrl} 
          alt={name} 
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/20 to-transparent" />
        <div className="absolute bottom-6 left-8 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 p-2.5 ring-1 ring-white/20 backdrop-blur-xl">
            <img src={iconUrl} alt={name} className="h-full w-full object-contain brightness-0 invert" />
          </div>
          <h2 className="text-3xl font-black uppercase tracking-tighter text-white drop-shadow-lg">{name}</h2>
        </div>
      </div>

      {/* Wide Tournament Grid */}
      <div className="flex-1 p-8">
        <div className="grid gap-4 sm:grid-cols-2">
          {tournaments.length > 0 ? (
            tournaments.slice(0, displayLimit).map((t, i) => (
              <TournamentRow key={i} tournament={t} slug={slug} />
            ))
          ) : (
            <div className="col-span-full flex flex-col items-center justify-center py-12 opacity-50">
              <svg className="h-12 w-12 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              <p className="mt-4 text-sm font-bold uppercase tracking-widest text-slate-500">Нет активных турниров</p>
            </div>
          )}
        </div>

        {tournaments.length > 6 && (
          <button 
            onClick={() => setExpanded(!expanded)}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/5 bg-white/[0.02] py-4 text-xs font-black uppercase tracking-[0.2em] text-slate-500 transition-all hover:bg-white/[0.05] hover:text-white"
          >
            {expanded ? "Свернуть" : `Показать еще (${tournaments.length - 6})`}
            <svg className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}

        <Link 
          href={`/${slug}`}
          className="mt-4 flex w-full items-center justify-center rounded-2xl bg-indigo-600/10 py-4 text-xs font-black uppercase tracking-[0.2em] text-indigo-400 ring-1 ring-indigo-500/20 transition-all hover:bg-indigo-600 hover:text-white"
        >
          Все турниры {name}
        </Link>
      </div>
    </div>
  );
}

function TournamentRow({ tournament, slug }: { tournament: PortalTournament; slug: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLoad = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/${slug}/import-tournament`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: tournament.title,
          pageUrl: tournament.url
        })
      });
      const data = await res.json();
      if (data.tournament?.id) {
        router.push(`/${slug}/tournament/${data.tournament.id}`);
      } else {
        alert(data.error || "Ошибка загрузки");
      }
    } catch (err) {
      console.error(err);
      alert("Ошибка сети");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="group/row flex flex-col justify-between gap-3 rounded-2xl bg-white/[0.03] p-5 ring-1 ring-white/5 transition-all hover:bg-white/[0.08] hover:ring-white/10">
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
           <div className="relative mt-1 flex h-2 w-2 shrink-0">
             {tournament.status === 'ongoing' && (
               <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
             )}
             <span className={`relative inline-flex h-2 w-2 rounded-full ${tournament.status === 'ongoing' ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]' : 'bg-slate-600'}`} />
           </div>
           <p className="min-w-0 flex-1 break-all text-[14px] font-black leading-tight tracking-tight text-white/90 group-hover/row:text-white">
             {tournament.title}
           </p>
        </div>
        <p className="mt-2 pl-5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
          {tournament.dates || "DATES TBA"}
        </p>
      </div>
      
      <div className="flex items-center gap-2">
        <button
          onClick={handleLoad}
          disabled={loading}
          className="relative flex h-9 flex-1 items-center justify-center rounded-xl bg-indigo-500 text-[10px] font-black uppercase tracking-widest text-white shadow-[0_4px_15px_rgba(99,102,241,0.3)] transition-all hover:bg-indigo-400 hover:shadow-[0_6px_20px_rgba(99,102,241,0.5)] active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? (
            <svg className="h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : "Загрузить данные"}
        </button>
        <a 
          href={tournament.url} 
          target="_blank" 
          rel="noreferrer"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-slate-500 transition-all hover:bg-white/10 hover:text-indigo-400"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>
    </div>
  );
}
