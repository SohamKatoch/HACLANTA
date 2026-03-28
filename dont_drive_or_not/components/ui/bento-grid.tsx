import { type ComponentPropsWithoutRef, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface BentoGridProps extends ComponentPropsWithoutRef<"section"> {
  children: ReactNode;
}

interface BentoCardProps extends ComponentPropsWithoutRef<"article"> {
  eyebrow: string;
  name: string;
  description: string;
  Icon: ElementType;
  background?: ReactNode;
  details?: string[];
}

const BentoGrid = ({ children, className, ...props }: BentoGridProps) => {
  return (
    <section
      className={cn("grid w-full auto-rows-[18rem] grid-cols-1 gap-5 lg:grid-cols-3", className)}
      {...props}
    >
      {children}
    </section>
  );
};

const BentoCard = ({
  eyebrow,
  name,
  description,
  Icon,
  background,
  details,
  className,
  ...props
}: BentoCardProps) => {
  return (
    <article
      className={cn(
        "group relative isolate flex h-full flex-col justify-between overflow-hidden rounded-[2rem] border border-black/10 bg-white/72 p-6 shadow-[0_18px_60px_rgba(15,15,15,0.08)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_80px_rgba(15,15,15,0.12)]",
        className,
      )}
      {...props}
    >
      <div className="absolute inset-0">{background}</div>
      <div className="absolute inset-0 bg-linear-to-b from-white/18 via-transparent to-white/10" />

      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#111111]/42">
            {eyebrow}
          </p>
          <h3 className="mt-4 max-w-xl text-2xl font-semibold tracking-[-0.05em] text-[#101010]">
            {name}
          </h3>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white/60 p-3 text-[#101010] shadow-[0_12px_30px_rgba(15,15,15,0.08)]">
          <Icon className="size-6" />
        </div>
      </div>

      <div className="relative z-10 space-y-4">
        <p className="max-w-xl text-base leading-7 text-[#111111]/62">{description}</p>
        {details && details.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {details.map((detail) => (
              <span
                className="rounded-full border border-black/10 bg-black/[0.045] px-3 py-1.5 text-xs font-medium tracking-[0.02em] text-[#111111]/70"
                key={detail}
              >
                {detail}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
};

export { BentoCard, BentoGrid };
