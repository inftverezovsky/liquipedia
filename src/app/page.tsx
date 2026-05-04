import Link from "next/link";
import PortalDisciplineCard from "@/components/PortalDisciplineCard";
import { fetchDisciplinePortal } from "@/lib/liquipedia/portal";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [dota, cs, lol, valorant] = await Promise.all([
    fetchDisciplinePortal("dota2"),
    fetchDisciplinePortal("counterstrike"),
    fetchDisciplinePortal("leagueoflegends"),
    fetchDisciplinePortal("valorant")
  ]);

  const disciplines = [
    {
      data: dota,
      icon: "https://liquipedia.net/commons/images/0/07/Dota2_light.png",
      bg: "/dota2_bg_1777894185405.png" // Using the generated image ID part
    },
    {
      data: cs,
      icon: "https://liquipedia.net/commons/images/c/c4/Counterstrike_light.png",
      bg: "/cs_bg_1777894203647.png"
    },
    {
      data: lol,
      icon: "https://liquipedia.net/commons/images/e/e0/Leagueoflegends_light.png",
      bg: "/lol_bg_1777894223180.png"
    },
    {
      data: valorant,
      icon: "https://liquipedia.net/commons/images/9/9e/Valorant_light.png",
      bg: "/valorant_bg_1777894248851.png"
    }
  ];

  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-[2.5rem] bg-slate-950 p-10 shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/20 via-transparent to-transparent" />
        <div className="relative z-10 max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-indigo-400">Manual API-first Loader</p>
          <h1 className="mt-4 text-5xl font-black tracking-tighter text-white sm:text-6xl">
            Liquipedia <span className="text-indigo-500">Dashboard.</span>
          </h1>
          <p className="mt-6 text-lg font-medium leading-relaxed text-slate-400">
            Система ручного импорта турнирных данных. Выбирай активный турнир из списка ниже или воспользуйся поиском по названию.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link href="/history" className="rounded-2xl bg-white px-8 py-4 text-sm font-bold text-slate-950 transition hover:bg-slate-200 shadow-xl shadow-white/5">
              История загрузок
            </Link>
            <Link href="/settings" className="rounded-2xl border border-white/10 bg-white/5 px-8 py-4 text-sm font-bold text-white transition hover:bg-white/10 backdrop-blur-md">
              Настройки API
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-10 lg:grid-cols-2">
        {disciplines.map((d) => (
          <PortalDisciplineCard
            key={d.data.slug}
            slug={d.data.slug}
            name={d.data.name}
            iconUrl={d.icon}
            bgUrl={d.bg}
            tournaments={d.data.tournaments}
          />
        ))}
      </div>

      <section className="grid gap-6 md:grid-cols-3">
        <FeatureCard title="Умный Поиск" text="Вводишь название — TI, Riyadh Masters, LPL. Получаешь прямую ссылку на данные." />
        <FeatureCard title="Нормализация" text="Парсинг сложных шаблонов WikiText и преобразование в чистый JSON/CSV." />
        <FeatureCard title="Управление Командами" text="Маппинг Liquipedia-команд на ID вашей платформы в один клик." />
      </section>
    </div>
  );
}

function FeatureCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl bg-white p-8 shadow-soft ring-1 ring-slate-200">
      <h3 className="text-lg font-bold text-slate-950 tracking-tight">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">{text}</p>
    </div>
  );
}
