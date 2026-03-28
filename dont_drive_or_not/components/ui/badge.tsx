import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.22em] transition-colors",
  {
    variants: {
      variant: {
        default: "bg-slate-100 text-slate-700",
        outline: "border border-slate-200 bg-white text-slate-600",
        safe: "bg-emerald-50 text-[var(--safe)]",
        warn: "bg-amber-50 text-[var(--warn)]",
        danger: "bg-rose-50 text-[var(--risk)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof badgeVariants>) {
  return (
    <div
      className={cn(badgeVariants({ variant }), className)}
      data-slot="badge"
      {...props}
    />
  );
}

export { Badge, badgeVariants };
