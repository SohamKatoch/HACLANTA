import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const highlights = [
  {
    label: "Frontend",
    value: "Webcam capture plus reaction flow",
  },
  {
    label: "Backend",
    value: "Flask analysis and Supabase logging",
  },
  {
    label: "Future",
    value: "Model-ready contract for ML handoff",
  },
];

export default function Home() {
  return (
    <main className="flex w-full flex-col gap-4 py-2 sm:py-3">
      <section className="relative overflow-hidden rounded-[1.65rem] border border-[var(--line)]/60 bg-[var(--panel-strong)] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:rounded-[2rem] sm:p-6">
        <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/45 to-transparent sm:inset-x-8" />

        <div className="flex flex-col gap-6">
          <Badge
            className="w-fit px-3 py-1.5 text-[10px] tracking-[0.22em] sm:px-4 sm:py-2 sm:text-xs sm:tracking-[0.25em]"
            variant="outline"
          >
            Hacklanta Starter
          </Badge>

          <div className="space-y-3">
            <h1 className="text-2xl font-semibold tracking-[-0.04em] text-black sm:text-3xl">
              Know if the driver is safe before the car moves.
            </h1>
            <p className="text-sm leading-relaxed text-black/65 sm:text-base sm:leading-7">
              Drive Awake pairs browser-side drowsiness signals with a Flask analysis layer—built
              for a phone-first flow today, model-ready for tomorrow.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button asChild className="w-full sm:w-auto" size="lg">
              <Link href="/signup">Create Account</Link>
            </Button>
            <Button asChild className="w-full sm:w-auto" size="lg" variant="secondary">
              <Link href="/login">Open Login</Link>
            </Button>
            <Button asChild className="w-full sm:w-auto" size="lg" variant="outline">
              <Link href="/monitor">Go To Monitor</Link>
            </Button>
          </div>

          <div className="grid gap-3">
            {highlights.map((item) => (
              <Card
                className="rounded-xl bg-[#1d1712] text-white shadow-[0_16px_40px_rgba(40,24,12,0.35)] sm:rounded-[1.35rem]"
                key={item.label}
              >
                <CardContent className="p-4 sm:p-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/55 sm:text-xs sm:tracking-[0.25em]">
                    {item.label}
                  </p>
                  <p className="mt-2 text-lg font-semibold leading-snug tracking-[-0.02em] sm:mt-3 sm:text-xl sm:leading-8">
                    {item.value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
