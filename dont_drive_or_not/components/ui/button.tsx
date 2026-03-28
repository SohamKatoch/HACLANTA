import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40",
  {
    variants: {
      variant: {
        default:
          "bg-[linear-gradient(135deg,#1f1d1a,#47352a)] text-white shadow-[0_14px_35px_rgba(45,26,12,0.18)] hover:opacity-95",
        secondary:
          "border border-[var(--line)] bg-white/70 text-black/70 hover:bg-white",
        outline:
          "border border-[var(--line)] bg-transparent text-black/75 hover:bg-white/55",
        accent:
          "bg-[linear-gradient(135deg,#c45d2f,#ef9e55)] text-white shadow-[0_18px_45px_rgba(196,93,47,0.3)] hover:opacity-95",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 px-4",
        lg: "h-12 px-6 text-base",
        icon: "size-10 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      data-slot="button"
      {...props}
    />
  );
}

export { Button, buttonVariants };
