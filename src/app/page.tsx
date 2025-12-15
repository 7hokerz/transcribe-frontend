import Link from "next/link";
import { ArrowRight, Film, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <main className="container mx-auto px-4 py-12 md:py-16">
        <div className="max-w-5xl mx-auto space-y-8">
          <div className="flex flex-col gap-3">
            <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Transcription</p>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">영상 업로드부터 텍스트 추출까지 한 번에</h1>
            <p className="text-muted-foreground max-w-4xl">브라우저에서 바로 비디오를 올리고, 음성을 텍스트로 변환하세요. 실시간 진행 상황과 편집 가능한 결과물을 제공합니다.</p>
          </div>

          <div className="group rounded-2xl focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
            <div className="relative overflow-hidden rounded-2xl border bg-card/70 backdrop-blur shadow-lg transition hover:shadow-xl">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent opacity-90" aria-hidden />
              <div className="relative p-8 md:p-10 flex flex-col gap-6">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-primary/10 text-primary p-3">
                    <Film className="h-6 w-6" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-semibold">/transcribe 바로가기</h2>
                    <p className="text-muted-foreground">영상 파일을 업로드하고, 실시간 상태 패널과 프롬프트 설정으로 원하는 텍스트를 받아보세요.</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  {["MP4, MOV 등 주요 포맷 지원", "업로드 진행률과 상태 다이얼로그", "편집 가능한 텍스트 미리보기"].map((feature) => (
                    <div key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <Button size="lg" className="gap-2" asChild>
                    <Link href="/transcribe" className="flex items-center">
                      시작하기
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
