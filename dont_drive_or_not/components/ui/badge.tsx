import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.22em] transition-colors",
  {
    variants: {
      variant: {
        default: "bg-white/75 text-black/55",
        outline: "border border-[var(--line)] bg-transparent text-black/60",
        safe: "bg-[color:rgba(36,90,66,0.12)] text-[var(--safe)]",
        warn: "bg-[color:rgba(138,77,22,0.12)] text-[var(--warn)]",
        danger: "bg-[color:rgba(150,47,42,0.12)] text-[var(--risk)]",
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
