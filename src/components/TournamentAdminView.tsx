'use client';

import { useState } from 'react';
import MatchList from "@/components/MatchList";
import AdminUploadPanel from "@/components/AdminUploadPanel";
import ExportPanel from "@/components/ExportPanel";
import { motion } from "framer-motion";
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { CalendarDays, ShieldCheck, Zap } from "lucide-react";

interface Props {
  tournament: any;
  mappingMap: any;
  disciplineSlug: string;
}

export default function TournamentAdminView({ tournament: initialTournament, mappingMap, disciplineSlug }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // SWR for caching (SAFE: Only hits local DB, not Liquipedia)
  const { data: tournament, mutate } = useSWR(
    `/api/${disciplineSlug}/tournament/${initialTournament.id}`,
    fetcher,
    { 
      fallbackData: initialTournament, 
      refreshInterval: 60000, // Refresh from local DB every minute
      revalidateOnFocus: true,
      revalidateOnReconnect: true
    }
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid gap-8 lg:grid-cols-[1fr_360px]"
    >
      <div className="space-y-8">
        {/* Matches section */}
        <section className="premium-card p-6">
          <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-6">
            <div className="flex items-center gap-3">
              <CalendarDays className="w-5 h-5 text-indigo-600" />
              <h2 className="text-xl font-bold text-slate-900">Расписание</h2>
            </div>
            <div className="rounded-full bg-slate-50 border border-slate-100 px-3 py-1 text-[10px] font-bold text-slate-400">
              {tournament.matches?.length || 0} Matches
            </div>
          </div>
          <MatchList 
            matches={tournament.matches?.map((m: any) => ({
              ...m,
              lpNumericalId: m.lpNumericalId ? m.lpNumericalId.toString() : null
            })) || []} 
            mappings={mappingMap} 
            disciplineSlug={disciplineSlug} 
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            mutate={mutate}
          />
        </section>
      </div>

      <div className="space-y-8">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
        >
          <AdminUploadPanel 
            tournamentId={tournament.id} 
            disciplineSlug={disciplineSlug} 
            tournamentName={tournament.name} 
            selectedMatchIds={Array.from(selectedIds)}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <ExportPanel 
            tournamentId={tournament.id} 
            disciplineSlug={disciplineSlug} 
            selectedMatchIds={Array.from(selectedIds)}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}
