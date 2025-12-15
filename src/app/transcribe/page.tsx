"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useFormInvalidHandler } from "@/hooks/use-form-invalid-handler";
import { Skeleton } from "@/components/ui/skeleton";
import LoadingSkeleton from "./loading";

const VideoForm = dynamic(() => import("@/components/video-form").then(mod => ({ default: mod.VideoForm })), {
  loading: () => <Skeleton className="h-96 w-full" />
});

export default function TranscriptionPage() {
  const [userId, setUserId] = useState(crypto.randomUUID());
  const [loading, setLoading] = useState(true);
  const onInvalid = useFormInvalidHandler();

  useEffect(() => {
    setLoading(false);
  }, []);

  const renderConfigContent = () => (
    <div className="max-w-3xl mx-auto">
      <VideoForm onInvalid={onInvalid} userId={userId} />
    </div>
  );

  const renderContent = () => {
    if (loading) {
      return <LoadingSkeleton />;
    }

    return renderConfigContent();
  };

  return (
    <div className="bg-background text-foreground min-h-screen flex flex-col">
      <main className="flex-1 container mx-auto px-4 py-8 md:py-12">
        {renderContent()}
      </main>
    </div>
  );
}
