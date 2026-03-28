"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { storeSession } from "@/lib/session";

export default function LoginForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    storeSession({
      name: name.trim() || "Driver",
      email: email.trim() || "guest@driveawake.local",
      signedInAt: new Date().toISOString(),
    });

    router.push("/monitor");
  }

  return (
    <Card className="rounded-[2rem] bg-[var(--panel-strong)]">
      <CardHeader className="gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-black/45">
          Drive Awake Access
        </p>
        <CardTitle className="text-4xl tracking-[-0.04em]">
          Sign in to open the monitor.
        </CardTitle>
        <CardDescription className="max-w-xl text-base leading-7">
          This is a lightweight product-flow login. It stores a local session for
          now so we can later swap in Supabase Auth or another real auth system.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-5" onSubmit={handleSubmit}>
          <label className="grid gap-2 text-sm text-black/65">
            <span>Name</span>
            <input
              className="rounded-[1.1rem] border border-[var(--line)] bg-white/85 px-4 py-3 outline-none transition focus:border-[var(--accent)]"
              onChange={(event) => setName(event.target.value)}
              placeholder="Adita"
              type="text"
              value={name}
            />
          </label>

          <label className="grid gap-2 text-sm text-black/65">
            <span>Email</span>
            <input
              className="rounded-[1.1rem] border border-[var(--line)] bg-white/85 px-4 py-3 outline-none transition focus:border-[var(--accent)]"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="driver@example.com"
              type="email"
              value={email}
            />
          </label>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button size="lg" type="submit">
              Continue To Monitor
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/">Back To Landing</Link>
            </Button>
          </div>

          <p className="text-sm leading-6 text-black/55">
            This is not production auth yet. It only creates a browser-local
            session.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
