import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[color,box-shadow,background-color,border-color] disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(255,252,245)] aria-invalid:ring-[var(--risk)]/20 dark:focus-visible:ring-slate-100/20",
  {
    variants: {
      variant: {
        default: "bg-black text-white shadow-sm hover:bg-black/90",
        destructive: "bg-[var(--risk)] text-white shadow-sm hover:brightness-95",
        outline: "border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50",
        secondary: "bg-slate-100 text-slate-900 shadow-sm hover:bg-slate-200/80",
        ghost: "text-slate-700 hover:bg-slate-100 hover:text-slate-950",
        link: "text-slate-900 underline-offset-4 hover:underline",
        accent: "bg-[var(--accent)] text-white shadow-sm hover:brightness-95",
      },
      size: {
        default: "h-10 px-4 py-2",
        xs: "h-8 rounded-md px-3 text-xs",
        sm: "h-9 px-3.5",
        lg: "h-11 px-6 text-base",
        icon: "size-10",
        "icon-xs": "size-8 rounded-md",
        "icon-sm": "size-9 rounded-md",
        "icon-lg": "size-11 rounded-md",
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
