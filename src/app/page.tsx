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
    { data: dota, icon: "https://liquipedia.net/commons/images/0/07/Dota2_light.png", bg: "/dota2_bg_1777894185405.png" },
    { data: cs, icon: "https://liquipedia.net/commons/images/c/c4/Counterstrike_light.png", bg: "/cs_bg_1777894203647.png" },
    { data: lol, icon: "https://liquipedia.net/commons/images/e/e0/Leagueoflegends_light.png", bg: "/lol_bg_1777894223180.png" },
    { data: valorant, icon: "https://liquipedia.net/commons/images/9/9e/Valorant_light.png", bg: "/valorant_bg_1777894248851.png" }
  ];

  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white p-10 lg:p-16 shadow-sm">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(45%_45%_at_50%_50%,rgba(79,70,229,0.08)_0%,transparent_100%)]" />
        <div className="relative z-10 max-w-4xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-700 border border-indigo-100">
             Admin Control Center
          </div>
          <h1 className="mt-8 text-5xl font-black tracking-tighter text-slate-950 sm:text-6xl lg:text-7xl">
            Liquipedia <span className="text-indigo-600">Portal.</span>
          </h1>
          <p className="mt-8 text-xl font-bold leading-relaxed text-slate-700 lg:text-2xl">
            Управляйте турнирными данными из одного места. 
            Прямой импорт, автоматический маппинг и экспорт в API.
          </p>
          <div className="mt-12 flex flex-wrap gap-4">
            <Link href="/history" className="btn-primary px-10 py-4 text-base">
              История загрузок
            </Link>
            <Link href="/settings" className="btn-secondary px-10 py-4 text-base border-slate-300">
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

      <section className="grid gap-8 md:grid-cols-3">
        <FeatureCard 
          title="Смарт Поиск" 
          text="Мгновенный доступ к базе Liquipedia. Вводите название — получаете данные." 
        />
        <FeatureCard 
          title="Нормализация" 
          text="Очистка WikiText и автоматическое преобразование в структурированный JSON." 
        />
        <FeatureCard 
          title="Team Sync" 
          text="Интеграция с вашей платформой через автоматический маппинг команд." 
        />
      </section>
    </div>
  );
}

function FeatureCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="premium-card p-8 border-slate-200">
      <h3 className="text-xl font-black text-slate-950 tracking-tight">{title}</h3>
      <p className="mt-4 text-base font-bold leading-relaxed text-slate-700">{text}</p>
    </div>
  );
}
