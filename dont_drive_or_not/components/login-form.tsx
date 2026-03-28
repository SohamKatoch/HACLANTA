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
import {
  createLocalAccount,
  createSessionFromAccount,
  loginLocalAccount,
} from "@/lib/local-auth";
import { storeSession } from "@/lib/session";

type LoginFormProps = {
  mode: "login" | "signup";
};

export default function LoginForm({ mode }: Readonly<LoginFormProps>) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [vin, setVin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isLogin = mode === "login";

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = isLogin
      ? loginLocalAccount({
          email,
          password,
          vin,
        })
      : createLocalAccount({
          email,
          password,
          vin,
        });

    if (!result.account) {
      setError(result.error ?? "We could not complete that request.");
      return;
    }

    setError(null);
    storeSession(
      createSessionFromAccount(result.account),
    );

    router.push("/monitor");
  }

  return (
    <Card className="rounded-[1.65rem] border border-[var(--line)]/50 bg-[var(--panel-strong)] sm:rounded-[2rem]">
      <CardHeader className="gap-2 p-4 sm:gap-3 sm:p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-black/45 sm:text-xs sm:tracking-[0.3em]">
          Drive Awake Access
        </p>
        <CardTitle className="text-2xl tracking-[-0.03em] sm:text-3xl">
          {isLogin ? "Log in to open the monitor." : "Create an account for the monitor."}
        </CardTitle>
        <CardDescription className="max-w-xl text-sm leading-relaxed sm:text-base sm:leading-7">
          {isLogin
            ? "Enter the same email, password, and VIN you used when creating the local account."
            : "This is a lightweight local account flow for now. Email, password, and VIN are stored only in this browser until real auth is added."}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
        <form className="grid gap-4 sm:gap-5" onSubmit={handleSubmit}>
          <label className="grid gap-2 text-sm text-black/65">
            <span>Email</span>
            <input
              className="rounded-[1.1rem] border border-black/70 bg-black px-4 py-3 text-zinc-200 outline-none transition placeholder:text-zinc-500 focus:border-[var(--accent)]"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="driver@example.com"
              required
              type="email"
              value={email}
            />
          </label>

          <label className="grid gap-2 text-sm text-black/65">
            <span>Password</span>
            <input
              className="rounded-[1.1rem] border border-black/70 bg-black px-4 py-3 text-zinc-200 outline-none transition placeholder:text-zinc-500 focus:border-[var(--accent)]"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="anything-for-now"
              required
              type="password"
              value={password}
            />
          </label>

          <label className="grid gap-2 text-sm text-black/65">
            <span>VIN Number</span>
            <input
              className="rounded-[1.1rem] border border-black/70 bg-black px-4 py-3 text-zinc-200 outline-none transition placeholder:text-zinc-500 focus:border-[var(--accent)]"
              onChange={(event) => setVin(event.target.value)}
              placeholder="1HGCM82633A004352"
              required
              type="text"
              value={vin}
            />
          </label>

          {error ? <p className="text-sm text-[var(--risk)]">{error}</p> : null}

          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:flex-wrap sm:gap-3">
            <Button className="w-full sm:w-auto" size="lg" type="submit">
              {isLogin ? "Log In" : "Create Account"}
            </Button>
            <Button asChild className="w-full sm:w-auto" size="lg" variant="secondary">
              <Link href="/">Back To Landing</Link>
            </Button>
          </div>

          <p className="text-sm leading-6 text-black/55">
            {isLogin ? (
              <>
                Need an account? <Link className="underline" href="/signup">Create one here</Link>.
              </>
            ) : (
              <>
                Already created one? <Link className="underline" href="/login">Log in here</Link>.
              </>
            )}
          </p>

          <p className="text-sm leading-6 text-black/55">
            Password rules are intentionally disabled for now. This is placeholder
            local auth, not production security.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
