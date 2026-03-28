"use client";

import Link from "next/link";

const items = [
  { href: "#overview", label: "Overview" },
  { href: "#problem", label: "Problem" },
  { href: "#detection", label: "Detection" },
  { href: "#fleet", label: "Fleet" },
  { href: "#why", label: "Why" },
];

export function LandingMenubar() {
  return (
    <nav className="sticky top-0 z-30 mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white/92 px-4 shadow-[0_14px_40px_rgba(17,17,17,0.08)] backdrop-blur-xl">
      <a
        className="shrink-0 rounded-xl px-3 py-1.5 text-sm font-semibold tracking-[-0.03em] text-[#111111]"
        href="#overview"
      >
        Drive or Not
      </a>

      <div className="hidden items-center gap-1 md:flex">
        {items.map((item) => (
          <a
            className="rounded-xl px-4 py-1.5 text-sm font-medium text-[#111111]/68 transition hover:bg-black/[0.04] hover:text-[#111111]"
            href={item.href}
            key={item.href}
          >
            {item.label}
          </a>
        ))}
      </div>

      <Link
        className="inline-flex h-9 items-center justify-center rounded-xl bg-[#111111] px-5 text-sm font-semibold text-white transition hover:bg-black"
        href="/login"
      >
        Login
      </Link>
    </nav>
  );
}
