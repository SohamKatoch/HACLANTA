"use client";

import { useRouter } from "next/navigation";
import { RippleButton } from "@/components/ui/ripple-button";

export function GetStartedButton() {
  const router = useRouter();

  return (
    <RippleButton
      className="h-14 bg-[#0d0d0d] px-8 text-base font-semibold text-white shadow-[0_18px_45px_rgba(17,17,17,0.22)] hover:bg-black"
      duration="750ms"
      onClick={() => router.push("/monitor")}
      rippleColor="rgba(255,255,255,0.58)"
      type="button"
    >
      Get Started
    </RippleButton>
  );
}
