import Image from "next/image";
import Link from "next/link";
import { ArrowRight, History, Search, Settings, ShieldCheck } from "lucide-react";

const disciplines = [
  {
    slug: "dota2",
    name: "Dota 2",
    source: "Liquipedia",
    bg: "/dota2_bg_1777894185405.png",
    accent: "bg-emerald-500",
  },
  {
    slug: "counterstrike",
    name: "Counter-Strike",
    source: "Liquipedia + HLTV",
    bg: "/cs_bg_1777894203647.png",
    accent: "bg-orange-500",
  },
  {
    slug: "leagueoflegends",
    name: "League of Legends",
    source: "Liquipedia",
    bg: "/lol_bg_1777894223180.png",
    accent: "bg-sky-500",
  },
  {
    slug: "valorant",
    name: "Valorant",
    source: "Liquipedia",
    bg: "/valorant_bg_1777894248851.png",
    accent: "bg-rose-500",
  },
];

const quickLinks = [
  { href: "/history", label: "История загрузок", icon: History },
  { href: "/settings", label: "API и прокси", icon: Settings },
];

export default function HomePage() {
  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                <ShieldCheck className="h-3.5 w-3.5" />
                Admin hub
              </div>
              <h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-4xl">
                Оперативная панель TCyber
              </h1>
              <p className="mt-3 max-w-xl text-sm font-medium leading-6 text-slate-600">
                Быстрый вход в поиск турниров, импорт матчей, проверку ID команд и отправку расписания в админку.
              </p>
            </div>
            <Link
              href="/counterstrike"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-indigo-600"
            >
              <Search className="h-4 w-4" />
              Начать поиск
            </Link>
          </div>
        </section>

        <aside className="rounded-lg border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Рабочие разделы</p>
          <div className="mt-5 grid gap-3">
            {quickLinks.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold transition-colors hover:bg-white/10"
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-4 w-4 text-indigo-300" />
                  {label}
                </span>
                <ArrowRight className="h-4 w-4 text-slate-500" />
              </Link>
            ))}
          </div>
        </aside>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {disciplines.map((discipline, index) => (
          <Link 
            key={discipline.slug} 
            href={`/${discipline.slug}`}
            className="group overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-colors hover:border-indigo-300"
          >
            <div className="relative h-36 overflow-hidden">
              <Image
                src={discipline.bg}
                alt={discipline.name}
                fill
                priority={index === 0}
                sizes="(min-width: 1280px) 25vw, (min-width: 768px) 50vw, 100vw"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/20 to-transparent" />
              <div className={`absolute left-4 top-4 h-2.5 w-2.5 rounded-full ${discipline.accent}`} />
            </div>
            <div className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{discipline.source}</p>
                <h2 className="mt-1 truncate text-lg font-black text-slate-950">{discipline.name}</h2>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-slate-300 transition-colors group-hover:text-indigo-600" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
