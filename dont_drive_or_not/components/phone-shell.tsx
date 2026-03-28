import type { ReactNode } from "react";

/**
 * Wraps app content in a narrow, phone-shaped column. On md+ viewports, adds
 * device chrome (bezel, dynamic island, status row, home indicator).
 */
export default function PhoneShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="phone-desk flex min-h-dvh flex-1 flex-col md:items-center md:justify-center md:bg-[radial-gradient(ellipse_120%_80%_at_50%_20%,rgba(55,74,126,0.35),transparent),radial-gradient(ellipse_80%_50%_at_80%_80%,rgba(93,45,22,0.22),transparent),linear-gradient(165deg,#161a28_0%,#0b0d14_45%,#08090e_100%)] md:py-8 md:pl-4 md:pr-4">
      <div
        className={
          "relative flex min-h-dvh w-full min-w-0 flex-1 flex-col overflow-hidden " +
          "md:min-h-0 md:max-h-[min(852px,92dvh)] md:max-w-[390px] md:rounded-[2.85rem] " +
          "md:border-[12px] md:border-[#14151a] md:bg-[#08090e] md:shadow-[0_32px_64px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.05)_inset]"
        }
      >
        <div
          className="pointer-events-none absolute left-1/2 top-4 z-20 hidden -translate-x-1/2 md:block"
          aria-hidden
        >
          <div className="h-[28px] w-[120px] rounded-full bg-black shadow-[inset_0_1px_2px_rgba(255,255,255,0.12)] ring-1 ring-white/[0.08]" />
        </div>

        <header
          className="relative z-10 mb-0 hidden shrink-0 items-center justify-between px-5 pb-1 pt-3 text-[12px] font-medium tabular-nums tracking-wide text-white/45 md:flex md:pt-12"
          aria-hidden
        >
          <span>9:41</span>
          <span className="flex items-center gap-1">
            <span className="h-[10px] w-[14px] rounded-[2px] border border-white/30" />
            <span className="h-[10px] w-[4px] rounded-[1px] bg-white/35" />
            <span className="ml-0.5 flex h-[11px] w-[22px] items-center rounded-[3px] border border-white/30 px-[3px]">
              <span className="h-full w-[65%] rounded-[1px] bg-[var(--safe)]" />
            </span>
          </span>
        </header>

        <div className="phone-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]">
          <div className="mx-auto w-full max-w-[420px] px-2 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.35rem,env(safe-area-inset-top))] sm:px-3 md:pt-1">
            {children}
          </div>
        </div>

        <div
          className="mx-auto mb-[max(0.5rem,env(safe-area-inset-bottom))] hidden h-[5px] w-32 shrink-0 rounded-full bg-white/18 md:block"
          aria-hidden
        />
      </div>
    </div>
  );
}
