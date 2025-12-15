import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="bg-background text-foreground min-h-screen flex flex-col">
      <main className="flex-1 container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-3xl mx-auto">
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-8 w-24" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-28" />
                <Skeleton className="h-8 w-12" />
              </div>
            </div>
            <Skeleton className="h-16 w-full" />
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="h-32 w-full" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-28" />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
