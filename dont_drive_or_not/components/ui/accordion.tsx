"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

function Accordion({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("w-full", className)} data-slot="accordion" {...props} />;
}

function AccordionItem({ className, ...props }: React.ComponentProps<"details">) {
  return (
    <details
      className={cn(
        "group rounded-2xl border border-slate-200 bg-white shadow-sm open:shadow-sm",
        className,
      )}
      data-slot="accordion-item"
      {...props}
    />
  );
}

function AccordionTrigger({ className, ...props }: React.ComponentProps<"summary">) {
  return (
    <summary
      className={cn(
        "flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium text-slate-950 marker:hidden [&::-webkit-details-marker]:hidden",
        className,
      )}
      data-slot="accordion-trigger"
      {...props}
    />
  );
}

function AccordionContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("border-t border-slate-200 px-5 py-5", className)}
      data-slot="accordion-content"
      {...props}
    />
  );
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
