import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const imports = await prisma.tournamentImport.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { tournament: true }
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Imports</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">История ручных загрузок</h1>
      </div>

      <section className="rounded-3xl bg-white p-6 ring-1 ring-slate-200">
        {imports.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="border-b border-slate-200 py-2 pr-4">Турнир</th>
                  <th className="border-b border-slate-200 py-2 pr-4">Статус</th>
                  <th className="border-b border-slate-200 py-2 pr-4">Старт</th>
                  <th className="border-b border-slate-200 py-2 pr-4">Источник</th>
                </tr>
              </thead>
              <tbody>
                {imports.map((item) => (
                  <tr key={item.id}>
                    <td className="border-b border-slate-100 py-3 pr-4 font-medium text-slate-950">
                      {item.tournament ? (
                        <Link className="underline underline-offset-4" href={`/${item.tournament.disciplineSlug}/tournament/${item.tournament.id}`}>
                          {item.pageTitle}
                        </Link>
                      ) : (
                        item.pageTitle
                      )}
                    </td>
                    <td className="border-b border-slate-100 py-3 pr-4"><StatusBadge status={item.status} /></td>
                    <td className="border-b border-slate-100 py-3 pr-4 text-slate-600">{formatDateTime(item.startedAt)}</td>
                    <td className="border-b border-slate-100 py-3 pr-4">
                      <a className="text-slate-700 underline underline-offset-4" href={item.pageUrl} target="_blank" rel="noreferrer">
                        Liquipedia
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Пока нет загрузок. Выберите дисциплину и загрузите первый чемпионат.</p>
        )}
      </section>
    </div>
  );
}
