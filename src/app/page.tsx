import { Suspense } from "react";
import DisciplinePortalSection from "@/components/DisciplinePortalSection";
import { DisciplineCardSkeleton } from "@/components/ui/Skeleton";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const disciplines = [
    { slug: "dota2", icon: "https://liquipedia.net/commons/images/0/07/Dota2_light.png", bg: "/dota2_bg_1777894185405.png" },
    { slug: "counterstrike", icon: "https://liquipedia.net/commons/images/c/c4/Counterstrike_light.png", bg: "/cs_bg_1777894203647.png" },
    { slug: "leagueoflegends", icon: "https://liquipedia.net/commons/images/e/e0/Leagueoflegends_light.png", bg: "/lol_bg_1777894223180.png" },
    { slug: "valorant", icon: "https://liquipedia.net/commons/images/9/9e/Valorant_light.png", bg: "/valorant_bg_1777894248851.png" }
  ];

  return (
    <div className="space-y-12">
      <div className="grid gap-10 lg:grid-cols-2">
        {disciplines.map((d) => (
          <Suspense key={d.slug} fallback={<DisciplineCardSkeleton />}>
            <DisciplinePortalSection 
              slug={d.slug} 
              icon={d.icon} 
              bg={d.bg} 
            />
          </Suspense>
        ))}
      </div>
    </div>
  );
}

