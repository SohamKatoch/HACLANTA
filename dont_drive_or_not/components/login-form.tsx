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
import { Input } from "@/components/ui/input";
import { TypingAnimation } from "@/components/ui/typing-animation";
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
    <div className="mx-auto w-full max-w-xl">
      <Card className="border-slate-200 bg-white">
        <CardHeader className="gap-2 p-6">
          {isLogin ? (
            <TypingAnimation
              as="h1"
              className="text-2xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-3xl"
              delay={120}
              duration={55}
              showCursor={false}
              startOnView={false}
            >
              Welcome back
            </TypingAnimation>
          ) : (
            <>
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-slate-500">
                Create Account
              </p>
              <CardTitle className="text-2xl sm:text-3xl">Set up your access</CardTitle>
            </>
          )}
          <CardDescription>
            {isLogin
              ? "Enter your account details to launch the live monitor."
              : "Fill in a few details to create a local demo account."}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-0">
          <form className="grid gap-5" onSubmit={handleSubmit}>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              <span>Email</span>
              <Input
                onChange={(event) => setEmail(event.target.value)}
                placeholder="your_name@org.in"
                required
                type="email"
                value={email}
              />
            </label>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              <span>Password</span>
              <Input
                onChange={(event) => setPassword(event.target.value)}
                placeholder="password"
                required
                type="password"
                value={password}
              />
            </label>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              <span>VIN Number</span>
              <Input
                onChange={(event) => setVin(event.target.value)}
                placeholder="2FTRX18W1XCA12345"
                required
                type="text"
                value={vin}
              />
            </label>

            {error ? <p className="text-sm text-[var(--risk)]">{error}</p> : null}

            <div className="pt-2">
              <Button className="w-full" size="lg" type="submit">
                {isLogin ? "Log In" : "Create Account"}
              </Button>
            </div>

            <p className="text-sm leading-6 text-slate-600">
              {isLogin ? (
                <>
                  Need an account?{" "}
                  <Link className="font-medium text-slate-900 underline" href="/signup">
                    Create one here
                  </Link>
                  .
                </>
              ) : (
                <>
                  Already created one?{" "}
                  <Link className="font-medium text-slate-900 underline" href="/login">
                    Log in here
                  </Link>
                  .
                </>
              )}
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
