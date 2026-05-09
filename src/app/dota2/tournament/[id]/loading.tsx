import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-8 animate-in">
      <section className="premium-card p-8 bg-white border-slate-200 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-4 flex-1">
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-20 rounded-lg bg-slate-100" />
              <Skeleton className="h-5 w-24 rounded-lg bg-slate-100" />
            </div>
            <Skeleton className="h-12 w-3/4 sm:h-16 bg-slate-100 rounded-2xl" />
            <div className="flex gap-4">
              <Skeleton className="h-4 w-32 bg-slate-100" />
              <Skeleton className="h-4 w-40 bg-slate-100" />
            </div>
          </div>
          <Skeleton className="h-14 w-40 rounded-2xl bg-indigo-50" />
        </div>
      </section>

      <section className="premium-card p-8 bg-white border-slate-200 shadow-sm">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-48 bg-slate-100" />
            <div className="flex gap-2">
              <Skeleton className="h-10 w-32 rounded-xl bg-slate-100" />
              <Skeleton className="h-10 w-32 rounded-xl bg-slate-100" />
            </div>
          </div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl bg-slate-50" />
            ))}
          </div>
        </div>
      </section>

      <section className="premium-card p-8 bg-white border-slate-200 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-40 bg-slate-100" />
            <Skeleton className="h-4 w-64 bg-slate-50" />
          </div>
          <Skeleton className="h-10 w-10 rounded-xl bg-slate-100" />
        </div>
      </section>
    </div>
  );
}
