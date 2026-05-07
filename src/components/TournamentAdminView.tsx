'use client';

import { useState } from 'react';
import MatchList from "@/components/MatchList";
import AdminUploadPanel from "@/components/AdminUploadPanel";
import ExportPanel from "@/components/ExportPanel";

interface Props {
  tournament: any;
  mappingMap: any;
  disciplineSlug: string;
}

export default function TournamentAdminView({ tournament, mappingMap, disciplineSlug }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div className="space-y-8">
        {/* Matches section */}
        <section className="premium-card p-6">
          <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-6">
            <h2 className="text-xl font-medium text-slate-900">Расписание матчей</h2>
            <div className="rounded-full bg-slate-50 border border-slate-100 px-3 py-1 text-[10px] font-medium text-slate-400">
              {tournament.matches.length} Matches
            </div>
          </div>
          <MatchList 
            matches={tournament.matches.map((m: any) => ({
              ...m,
              lpNumericalId: m.lpNumericalId ? m.lpNumericalId.toString() : null
            }))} 
            mappings={mappingMap} 
            disciplineSlug={disciplineSlug} 
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
          />
        </section>
      </div>

      <div className="space-y-8">
        {/* Admin Upload Section */}
        <AdminUploadPanel 
          tournamentId={tournament.id} 
          disciplineSlug={disciplineSlug} 
          tournamentName={tournament.name} 
          selectedMatchIds={Array.from(selectedIds)}
        />

        {/* Export tools */}
        <ExportPanel tournamentId={tournament.id} disciplineSlug={disciplineSlug} />
      </div>
    </div>
  );
}
