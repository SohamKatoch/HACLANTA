import * as React from "react";
import { cn } from "@/lib/utils";

function Alert({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-[1.4rem] border border-[var(--accent-soft)] bg-[#fff3eb] px-4 py-3 text-[#7d4222]",
        className,
      )}
      data-slot="alert"
      role="alert"
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"h5">) {
  return (
    <h5
      className={cn("font-mono text-[11px] uppercase tracking-[0.2em]", className)}
      data-slot="alert-title"
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mt-2 text-sm leading-6", className)}
      data-slot="alert-description"
      {...props}
    />
  );
}

export { Alert, AlertDescription, AlertTitle };
