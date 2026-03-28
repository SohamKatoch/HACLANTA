import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCamera,
  faChartColumn,
  faCircleCheck,
  faGaugeHigh,
  faShieldHalved,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { GetStartedButton } from "@/components/get-started-button";
import { NumberTicker } from "@/components/ui/number-ticker";
import {
  ScrollVelocityContainer,
  ScrollVelocityRow,
} from "@/components/ui/scroll-based-velocity";
import { ShineBorder } from "@/components/ui/shine-border";
import { BentoCard, BentoGrid } from "@/components/ui/bento-grid";
import { StripedPattern } from "@/components/ui/striped-pattern";

type IconProps = {
  className?: string;
};

const velocityItems = [
  "Detect intoxication",
  "Prevent risky decisions",
  "Create proof that protects drivers",
  "Reduce insurance risk",
];

const CameraIcon = (props: IconProps) => (
  <FontAwesomeIcon icon={faCamera} {...props} />
);

const AlertIcon = (props: IconProps) => (
  <FontAwesomeIcon icon={faTriangleExclamation} {...props} />
);

const PulseIcon = (props: IconProps) => (
  <FontAwesomeIcon icon={faGaugeHigh} {...props} />
);

const ShieldIcon = (props: IconProps) => (
  <FontAwesomeIcon icon={faShieldHalved} {...props} />
);

const DashboardIcon = (props: IconProps) => (
  <FontAwesomeIcon icon={faChartColumn} {...props} />
);

const FlagIcon = (props: IconProps) => (
  <FontAwesomeIcon icon={faCircleCheck} {...props} />
);

const cards = [
  {
    eyebrow: "OVERVIEW",
    id: "overview",
    name: "10 seconds to verify a safe driver.",
    description:
      "A quick camera check before every shift gives teams a simple yes, caution, or no-go answer before the wheels move.",
    details: ["10-second scan", "Instant verdict", "Pre-trip workflow"],
    Icon: CameraIcon,
    className: "lg:col-span-2 bg-white shadow-[0_30px_90px_rgba(17,17,17,0.08)]",
    background: (
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-y-0 right-0 w-[58%] bg-[radial-gradient(circle_at_top_right,rgba(255,236,168,0.24),transparent_58%)]" />
        <div className="absolute -right-10 bottom-0 text-[10rem] font-semibold tracking-[-0.08em] text-black/5 md:text-[13rem]">
          10s
        </div>
      </div>
    ),
  },
  {
    eyebrow: "THE PROBLEM",
    id: "problem",
    name: "Fatigue is a safety risk that usually gets noticed too late.",
    description:
      "Trucking teams still rely on manual checks and instinct, which means readiness is hard to verify before a major mistake happens.",
    details: ["Major accident risk", "Manual checks", "No fast proof"],
    Icon: AlertIcon,
    className: "lg:row-span-2",
    background: (
      <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(255,213,122,0.24),transparent_46%),linear-gradient(180deg,rgba(255,255,255,0.2),rgba(255,255,255,0))]">
        <div className="absolute -left-8 top-16 h-28 w-28 rounded-full border border-black/10 bg-white/50 blur-2xl" />
        <div className="absolute bottom-6 right-6 rounded-full border border-black/10 bg-[#161616] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-white">
          Risk
        </div>
      </div>
    ),
  },
  {
    eyebrow: "AI DETECTION",
    id: "detection",
    name: "The scan checks the signals humans miss.",
    description:
      "Drive or Not looks at the face and reaction cues that point to drowsiness or impairment before a drive even starts.",
    details: ["Eye movement", "Blink rate", "Head position", "Reaction time"],
    Icon: PulseIcon,
    background: (
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-x-5 top-1/2 h-px -translate-y-1/2 bg-black/10" />
        <div className="absolute inset-x-7 top-1/2 -translate-y-1/2">
          <div className="h-14 w-full bg-[linear-gradient(90deg,transparent_0%,transparent_15%,rgba(17,17,17,0.08)_15%,rgba(17,17,17,0.08)_17%,transparent_17%,transparent_42%,rgba(17,17,17,0.08)_42%,rgba(17,17,17,0.08)_44%,transparent_44%,transparent_70%,rgba(17,17,17,0.08)_70%,rgba(17,17,17,0.08)_72%,transparent_72%)]" />
        </div>
      </div>
    ),
  },
  {
    eyebrow: "DECISION",
    id: "decision",
    name: "Drivers get a clear answer, not a vague warning.",
    description:
      "The result is immediate and simple enough to act on in the field, whether the driver is cleared, fatigued, or unsafe to drive.",
    details: ["Clear to drive", "Fatigue flagged", "Unsafe to drive"],
    Icon: ShieldIcon,
    background: (
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-x-6 bottom-6 h-px bg-gradient-to-r from-transparent via-black/10 to-transparent" />
        <div className="absolute bottom-8 left-6 text-[3.5rem] font-semibold tracking-[-0.08em] text-black/5">
          yes / no
        </div>
      </div>
    ),
  },
  {
    eyebrow: "FLEET VIEW",
    id: "fleet",
    name: "Managers see who is ready in real time.",
    description:
      "Fleet teams can track driver status, spot risk early, and respond before one unsafe shift becomes a larger operational problem.",
    details: ["View all drivers", "Track safety status", "Get alerts fast"],
    Icon: DashboardIcon,
    background: (
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute left-6 top-10 grid w-[55%] grid-cols-2 gap-3">
          <div className="h-14 rounded-2xl border border-black/8 bg-white/60" />
          <div className="h-14 rounded-2xl border border-black/8 bg-black/8" />
          <div className="col-span-2 h-20 rounded-[1.5rem] border border-black/8 bg-[linear-gradient(135deg,rgba(17,17,17,0.08),rgba(17,17,17,0.02))]" />
        </div>
      </div>
    ),
  },
  {
    eyebrow: "WHY IT MATTERS",
    id: "why",
    name: "Prevent accidents before they happen and make safety measurable.",
    description:
      "This turns a stressful judgment call into a repeatable readiness check that protects drivers and gives companies real-time visibility.",
    details: ["Safer drivers", "Fewer preventable incidents", "Measurable readiness"],
    Icon: FlagIcon,
    className: "lg:col-span-2",
    background: (
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-y-0 right-0 w-[45%] bg-[radial-gradient(circle_at_center,rgba(255,227,157,0.32),transparent_62%)]" />
        <div className="absolute bottom-3 right-6 text-[4.5rem] font-semibold tracking-[-0.08em] text-[#111111]/6 md:text-[6rem]">
          Proof
        </div>
      </div>
    ),
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#efe6d7] text-[#111111]">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#efe6d7_0%,#eadfce_38%,#e9dece_100%)]" />
        <StripedPattern
          className="text-black/6 [mask-image:radial-gradient(circle_at_top,white,transparent_72%)]"
          direction="right"
          height={44}
          width={44}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.72),transparent_42%)]" />

        <section className="relative mx-auto flex min-h-[100svh] max-w-7xl items-center px-6 pb-10 pt-8 lg:min-h-0 lg:px-10 lg:pb-18 lg:pt-28">
          
          <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center px-2 text-center sm:px-0">
            <div className="relative inline-flex overflow-hidden rounded-[3px] bg-white/72 px-4 py-1.5 shadow-[0_12px_30px_rgba(17,17,17,0.08)] backdrop-blur-sm">
              <ShineBorder
                borderWidth={1.5}
                duration={10}
                shineColor={["rgba(255,255,255,0.2)", "rgba(255,220,120,0.95)", "rgba(255,255,255,0.2)"]}
              />
              <p className="relative z-10 text-xs font-semibold uppercase tracking-[0.32em] text-[#111111]/56">
                Fleet Safety Readiness
              </p>
            </div>
            <h1
              className="mt-5 text-[clamp(3.8rem,22vw,11rem)] leading-[0.88] tracking-[-0.1em] text-[#0f0f10] sm:text-[clamp(4.75rem,18vw,11rem)]"
            >
              DON&apos;T
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-[#111111]/66 sm:text-lg sm:leading-8 md:text-xl">
              A 10-second AI check for drowsiness, reaction time, and attention before a driver
              starts a shift.
            </p>
            <p
              className="mt-3 max-w-2xl text-sm text-[#6d675c] sm:text-base md:text-lg"
              style={{ fontStyle: "italic" }}
            >
              Drive or Not: 10 seconds to verify a safe driver.
            </p>

            <div className="mt-8 flex justify-center sm:mt-10">
              <GetStartedButton />
            </div>

            <ScrollVelocityContainer className="mt-20 w-full max-w-none sm:w-[calc(100%+6rem)]">
              <ScrollVelocityRow
                baseVelocity={16}
                className="border-y border-black/10 py-3"
                direction={1}
              >
                <div className="flex items-center">
                  {velocityItems.map((item) => (
                    <span
                      className="mx-4 text-sm font-semibold uppercase tracking-[0.22em] text-[#111111]/68 sm:mx-6 sm:text-base"
                      key={`${item}-forward`}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </ScrollVelocityRow>
              <ScrollVelocityRow
                baseVelocity={13}
                className="py-3"
                direction={-1}
              >
                <div className="flex items-center">
                  {velocityItems.map((item) => (
                    <span
                      className="mx-4 text-xs uppercase tracking-[0.28em] text-[#111111]/42 sm:mx-6 sm:text-sm"
                      key={`${item}-reverse`}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </ScrollVelocityRow>
            </ScrollVelocityContainer>

            <div className="mt-10 grid w-full max-w-5xl grid-cols-3 gap-2 text-center sm:mt-12 sm:gap-4 md:gap-6">
              <div className="flex flex-col items-center px-2 py-2 md:border-r md:border-black/10">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#111111]/42">
                  Saved Money
                </p>
                <p className="mt-3 text-[1.9rem] font-semibold tracking-[-0.07em] text-[#111111] sm:mt-4 sm:text-4xl md:text-5xl">
                  $<NumberTicker delay={0.1} value={18} />M
                </p>
                <p className="mt-2 max-w-[10rem] text-[11px] leading-5 text-[#111111]/58 sm:mt-3 sm:text-sm sm:leading-6">
                  Estimated annual reduction in preventable losses across early fleet rollouts.
                </p>
              </div>

              <div className="flex flex-col items-center px-2 py-2 md:border-r md:border-black/10">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#111111]/42">
                  Potential Users
                </p>
                <p className="mt-3 text-[1.9rem] font-semibold tracking-[-0.07em] text-[#111111] sm:mt-4 sm:text-4xl md:text-5xl">
                  <NumberTicker delay={0.2} value={82} />M
                </p>
                <p className="mt-2 max-w-[10rem] text-[11px] leading-5 text-[#111111]/58 sm:mt-3 sm:text-sm sm:leading-6">
                  Reachable early users across students, nightlife, and commercial driving segments.
                </p>
              </div>

              <div className="flex flex-col items-center px-2 py-2">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#111111]/42">
                  Fast Detection
                </p>
                <p className="mt-3 text-[1.9rem] font-semibold tracking-[-0.07em] text-[#111111] sm:mt-4 sm:text-4xl md:text-5xl">
                  <NumberTicker decimalPlaces={1} delay={0.3} value={3.4} />s
                </p>
                <p className="mt-2 max-w-[10rem] text-[11px] leading-5 text-[#111111]/58 sm:mt-3 sm:text-sm sm:leading-6">
                  Average time to flag abnormal behavior during an active check.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="relative mx-auto max-w-7xl px-6 pb-16 lg:px-10 lg:pb-24">
          <div className="mb-10 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[2rem] border border-black/10 bg-white/68 p-6 shadow-[0_18px_60px_rgba(15,15,15,0.08)] backdrop-blur-xl md:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#111111]/38">
                Why Us
              </p>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.06em] text-[#111111] md:text-5xl">
                Strong incentives, big market, simple revenue path.
              </h2>
              <div className="mt-5 space-y-3 text-base leading-7 text-[#111111]/66 md:text-lg">
                <p>
                  College students, truckers, party-goers, and insurers all have a clear reason to
                  care because this product protects safety, reputation, and money at the same
                  time.
                </p>
                <p>
                  We are targeting people ages 20 to 40, a market of about 200,000,000 people, or
                  roughly 60% of the population.
                </p>
                <p>
                  If 5% of that group subscribes, that is 10,000,000 users and $30,000,000 in
                  monthly revenue, with ad-based revenue adding another growth lane.
                </p>
              </div>
            </div>

            <div className="grid gap-5">
              <div className="rounded-[2rem] border border-black/10 bg-white/68 p-6 shadow-[0_18px_60px_rgba(15,15,15,0.08)] backdrop-blur-xl">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#111111]/38">
                  Incentives
                </p>
                <div className="mt-4 space-y-4 text-sm leading-6 text-[#111111]/68">
                  <p>
                    <span className="font-semibold text-[#111111]">College students:</span> DUI
                    prevention, social accountability, and clean record protection.
                  </p>
                  <p>
                    <span className="font-semibold text-[#111111]">Truckers:</span> insurance
                    discounts, job protection, and proof of sobriety.
                  </p>
                  <p>
                    <span className="font-semibold text-[#111111]">Party-goers:</span> family
                    safety and liability protection.
                  </p>
                  <p>
                    <span className="font-semibold text-[#111111]">Insurance companies:</span>{" "}
                    direct cost reduction, fraud reduction, and potential revenue growth.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <BentoGrid>
            {cards.map((card) => (
              <BentoCard key={card.name} {...card} />
            ))}
          </BentoGrid>
        </section>
      </div>
    </main>
  );
}
