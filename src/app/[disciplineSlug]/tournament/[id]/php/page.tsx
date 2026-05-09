import { buildFixtPayload } from "@/lib/adminUpload/buildFixtPayload";
import { toPhpString } from "@/lib/adminUpload/utils";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import CopyButton from "@/components/CopyButton";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

interface Props {
  params: {
    disciplineSlug: string;
    id: string;
  };
  searchParams: {
    ids?: string;
  };
}

export default async function PhpExportPage({ params, searchParams }: Props) {
  const { disciplineSlug, id } = params;
  const selectedIds = searchParams.ids ? searchParams.ids.split(",") : undefined;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
  });

  if (!tournament) notFound();

  const buildResult = await buildFixtPayload(id, disciplineSlug, selectedIds);
  const phpString = buildResult.payload ? toPhpString(buildResult.payload) : "Данные не готовы. Проверьте маппинг команд и ID шапки.";

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between border-b border-slate-200 pb-8">
        <div className="space-y-2">
          <Link 
            href={`/${disciplineSlug}/tournament/${id}`}
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-indigo-600 transition-colors mb-2"
          >
            <ArrowLeft size={16} />
            Назад к турниру
          </Link>
          <h1 className="text-3xl font-black tracking-tight text-slate-950">
            PHP Export: {tournament.name}
          </h1>
          <p className="text-slate-500 font-medium">
            Формат для заливки в админ-панель ({selectedIds ? `${selectedIds.length} матчей` : "все матчи"})
          </p>
        </div>
        <div className="flex shrink-0">
          <CopyButton text={phpString} />
        </div>
      </div>

      <div className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-3xl blur opacity-5 group-hover:opacity-10 transition duration-1000"></div>
        <div className="relative bg-white border border-slate-200 rounded-3xl shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 bg-slate-50/50">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-slate-200" />
              <div className="w-3 h-3 rounded-full bg-slate-200" />
              <div className="w-3 h-3 rounded-full bg-slate-200" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">PHP Array Format</span>
          </div>
          <pre className="p-8 overflow-auto font-mono text-sm leading-relaxed text-slate-700 max-h-[70vh] scrollbar-thin">
            {phpString}
          </pre>
        </div>
      </div>

      {(buildResult.warnings.length > 0 || buildResult.skippedMatches.length > 0) && (
        <div className="grid gap-6 md:grid-cols-2">
          {buildResult.warnings.length > 0 && (
            <div className="p-6 bg-amber-50/50 border border-amber-100 rounded-3xl space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-amber-700 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-[10px]">!</span>
                Предупреждения ({buildResult.warnings.length})
              </h3>
              <ul className="space-y-2">
                {buildResult.warnings.map((w, i) => (
                  <li key={i} className="text-sm text-amber-800 font-medium leading-tight">
                    • {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {buildResult.skippedMatches.length > 0 && (
            <div className="p-6 bg-slate-50 border border-slate-200 rounded-3xl space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">
                Пропущено матчей ({buildResult.skippedMatches.length})
              </h3>
              <div className="space-y-3 max-h-48 overflow-auto pr-2">
                {buildResult.skippedMatches.map((m, i) => (
                  <div key={i} className="text-[11px] leading-tight">
                    <div className="font-bold text-slate-900">{m.teams}</div>
                    <div className="text-slate-400">{m.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
