"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface RippleButtonProps extends React.ComponentProps<"button"> {
  rippleColor?: string;
  duration?: string;
}

export const RippleButton = React.forwardRef<HTMLButtonElement, RippleButtonProps>(
  (
    {
      className,
      children,
      rippleColor = "rgba(255, 255, 255, 0.5)",
      duration = "700ms",
      onClick,
      ...props
    },
    ref,
  ) => {
    const [buttonRipples, setButtonRipples] = React.useState<
      Array<{ x: number; y: number; size: number; key: number }>
    >([]);

    const createRipple = (target: HTMLElement, clientX: number, clientY: number) => {
      const rect = target.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = clientX - rect.left - size / 2;
      const y = clientY - rect.top - size / 2;

      setButtonRipples((prevRipples) => [
        ...prevRipples,
        { x, y, size, key: Date.now() + prevRipples.length },
      ]);
    };

    const handleClick: React.MouseEventHandler<HTMLElement> = (event) => {
      createRipple(event.currentTarget as HTMLElement, event.clientX, event.clientY);
      onClick?.(event as React.MouseEvent<HTMLButtonElement>);
    };

    React.useEffect(() => {
      if (buttonRipples.length === 0) return;

      const lastRipple = buttonRipples[buttonRipples.length - 1];
      const timeout = setTimeout(() => {
        setButtonRipples((prevRipples) =>
          prevRipples.filter((ripple) => ripple.key !== lastRipple.key),
        );
      }, Number.parseInt(duration, 10));

      return () => clearTimeout(timeout);
    }, [buttonRipples, duration]);

    return (
      <button
        className={cn(
          "relative inline-flex cursor-pointer items-center justify-center overflow-hidden rounded-full border border-black/10 px-6 py-3 text-center text-sm font-medium transition duration-300 ease-out disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
        onClick={handleClick}
        ref={ref}
        {...props}
      >
        <span className="relative z-10">{children}</span>
        <span className="pointer-events-none absolute inset-0">
          {buttonRipples.map((ripple) => (
            <span
              className="animate-rippling absolute rounded-full opacity-40"
              key={ripple.key}
              style={
                {
                  width: `${ripple.size}px`,
                  height: `${ripple.size}px`,
                  top: `${ripple.y}px`,
                  left: `${ripple.x}px`,
                  backgroundColor: rippleColor,
                  transform: "scale(0)",
                  "--duration": duration,
                } as React.CSSProperties
              }
            />
          ))}
        </span>
      </button>
    );
  },
);

RippleButton.displayName = "RippleButton";
