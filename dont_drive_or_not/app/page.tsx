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
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
      <section className="relative overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--panel-strong)] p-6 shadow-[0_25px_80px_rgba(80,48,24,0.12)] backdrop-blur-xl sm:p-8">
        <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/50 to-transparent" />

        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <Badge className="px-4 py-2 text-xs tracking-[0.25em]" variant="outline">
              Hacklanta Starter
            </Badge>

            <div className="space-y-4">
              <h1 className="max-w-4xl text-5xl font-semibold tracking-[-0.06em] text-black sm:text-6xl">
                Know if the driver is safe before the car moves.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-black/65">
                Drive Awake pairs browser-side drowsiness signals with a Flask
                analysis layer, so we can onboard users with a clean product flow
                today and swap in stronger AI later.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/signup">Create Account</Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/login">Open Login</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/monitor">Go To Monitor</Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-4">
            {highlights.map((item) => (
              <Card
                className="rounded-[1.7rem] bg-[#1d1712] text-white shadow-[0_20px_50px_rgba(40,24,12,0.28)]"
                key={item.label}
              >
                <CardContent className="p-6">
                  <p className="font-mono text-xs uppercase tracking-[0.25em] text-white/55">
                    {item.label}
                  </p>
                  <p className="mt-3 text-2xl font-semibold leading-8 tracking-[-0.03em]">
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
