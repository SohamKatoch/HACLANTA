"use client";

import { useEffect, useState, type CSSProperties, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

interface LightRaysProps extends ComponentPropsWithoutRef<"div"> {
  count?: number;
  color?: string;
  blur?: number;
  speed?: number;
  length?: string;
}

type LightRay = {
  id: string;
  left: number;
  rotate: number;
  width: number;
  swing: number;
  delay: number;
  duration: number;
  intensity: number;
};

const createRays = (count: number, cycle: number): LightRay[] => {
  if (count <= 0) return [];

  return Array.from({ length: count }, (_, index) => {
    const left = 8 + Math.random() * 84;
    const rotate = -28 + Math.random() * 56;
    const width = 160 + Math.random() * 160;
    const swing = 0.8 + Math.random() * 1.8;
    const delay = Math.random() * cycle;
    const duration = cycle * (0.75 + Math.random() * 0.5);
    const intensity = 0.5 + Math.random() * 0.45;

    return {
      id: `${index}-${Math.round(left * 10)}`,
      left,
      rotate,
      width,
      swing,
      delay,
      duration,
      intensity,
    };
  });
};

const Ray = ({ left, rotate, width, swing, delay, duration, intensity }: LightRay) => {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -top-[12%] left-[var(--ray-left)] h-[var(--light-rays-length)] w-[var(--ray-width)] origin-top -translate-x-1/2 rounded-full bg-linear-to-b from-[color-mix(in_srgb,var(--light-rays-color)_72%,transparent)] to-transparent mix-blend-screen blur-[var(--light-rays-blur)] will-change-transform"
      style={
        {
          "--ray-left": `${left}%`,
          "--ray-width": `${width}px`,
          "--ray-rotate": `${rotate}deg`,
          "--ray-swing": `${swing}deg`,
          "--ray-intensity": intensity.toString(),
          animation: `light-ray-drift ${duration}s ease-in-out ${delay}s infinite`,
        } as CSSProperties
      }
    />
  );
};

export function LightRays({
  className,
  style,
  count = 7,
  color = "rgba(255, 241, 198, 0.32)",
  blur = 40,
  speed = 14,
  length = "70vh",
  ...props
}: LightRaysProps) {
  const [rays, setRays] = useState<LightRay[]>([]);
  const cycleDuration = Math.max(speed, 0.1);

  useEffect(() => {
    setRays(createRays(count, cycleDuration));
  }, [count, cycleDuration]);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 isolate overflow-hidden rounded-[inherit]",
        className,
      )}
      style={
        {
          "--light-rays-color": color,
          "--light-rays-blur": `${blur}px`,
          "--light-rays-length": length,
          ...style,
        } as CSSProperties
      }
      {...props}
    >
      <div className="absolute inset-0 overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 opacity-70"
          style={
            {
              background:
                "radial-gradient(circle at 18% 10%, color-mix(in srgb, var(--light-rays-color) 46%, transparent), transparent 70%)",
            } as CSSProperties
          }
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-65"
          style={
            {
              background:
                "radial-gradient(circle at 80% 8%, color-mix(in srgb, var(--light-rays-color) 40%, transparent), transparent 74%)",
            } as CSSProperties
          }
        />
        {rays.map((ray) => (
          <Ray key={ray.id} {...ray} />
        ))}
      </div>
    </div>
  );
}
