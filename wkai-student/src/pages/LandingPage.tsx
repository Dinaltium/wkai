import { useRef } from "react";
import { Link } from "react-router-dom";
import { useGSAP } from "@gsap/react";
import { ArrowDown, ArrowRight, Check, Download } from "lucide-react";
import { Reveal, RevealHeading, ScrollHighlightText, ScrollProgress } from "../components/marketing/Reveal";
import { FloatingDock } from "../components/marketing/FloatingDock";
import { Accordion } from "../components/marketing/Accordion";
import { PinnedSteps } from "../components/marketing/PinnedSteps";
import { HorizontalFeatures } from "../components/marketing/HorizontalFeatures";
import { SettingsFab } from "../components/shared/SettingsFab";
import { EASE, gsap, prefersReducedMotion } from "../lib/motion";

export function LandingPage() {
  return (
    <div className="min-h-full bg-wkai-bg text-wkai-text">
      <ScrollProgress />
      <FloatingDock />
      <main>
        <Hero />
        <Problem />
        <PinnedSteps />
        <HorizontalFeatures />
        <Audiences />
        <UnderTheHood />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
      <SettingsFab />
    </div>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

const HERO_CHECKS = ["No install for students", "Runs in any browser", "One six-character code"];

/**
 * Full-bleed footage of the thing the product is actually for: a student
 * mid-workshop with code on screen. No metaphor to decode — the subject is the
 * room WKAI runs in. Pexels licence: free for commercial use, no attribution
 * required. Source clip is documented in the project memory.
 */
function Hero() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;

      // Load: the headline arrives line by line from behind its own mask.
      gsap
        .timeline({ defaults: { ease: EASE } })
        .from(".hero-line > span", { yPercent: 118, duration: 1.25, stagger: 0.1 }, 0.15)
        .from(".hero-fade", { y: 22, autoAlpha: 0, duration: 1, stagger: 0.09 }, 0.6);

      // Scroll: the footage drifts slower than the copy, and the copy leaves first.
      gsap.to(".hero-media", {
        yPercent: 12,
        scale: 1.08,
        ease: "none",
        scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true },
      });
      gsap.to(".hero-copy", {
        y: -70,
        autoAlpha: 0,
        ease: "none",
        scrollTrigger: { trigger: root.current, start: "top top", end: "65% top", scrub: true },
      });
    },
    { scope: root }
  );

  return (
    <section
      ref={root}
      className="stage relative isolate flex min-h-[100dvh] flex-col justify-end overflow-hidden"
    >
      <div className="hero-media pointer-events-none absolute inset-0 -z-10 will-change-transform" aria-hidden="true">
        <video
          className="h-full w-full object-cover"
          src="/hero-workshop.mp4"
          poster="/hero-workshop-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          tabIndex={-1}
        />
        {/* One wash that both sits the type on the footage and lands the
            section below without a seam. */}
        <div className="absolute inset-0 bg-[linear-gradient(to_top,#08080a_3%,rgba(8,8,10,0.88)_36%,rgba(8,8,10,0.6)_72%,rgba(8,8,10,0.92)_100%)]" />
      </div>

      <div className="hero-copy shell pb-20 pt-32 sm:pb-28">
        <h1 className="display max-w-4xl text-[2.75rem] text-zinc-50 sm:text-6xl lg:text-[4.5rem]">
          {["The workshop", "writes itself down."].map((line) => (
            <span key={line} className="hero-line block overflow-hidden pb-[0.1em]">
              <span className="block">{line}</span>
            </span>
          ))}
        </h1>

        <p className="hero-fade mt-7 max-w-[56ch] text-base leading-relaxed text-zinc-300 sm:text-lg">
          You teach the way you already teach. WKAI listens to the room, watches the screen you are
          sharing, and turns it into a running guide, a comprehension check, and an error fix for
          every student — while the session is still going.
        </p>

        <div className="hero-fade mt-9 flex flex-col gap-3 sm:flex-row">
          <Link
            className="group inline-flex h-12 items-center justify-center gap-3 bg-teal-400 pl-6 pr-2 text-base font-semibold text-teal-950 transition-[filter] duration-500 hover:brightness-110"
            to="/join"
          >
            Join with a code
            <span className="flex h-8 w-8 items-center justify-center bg-teal-950/15 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5">
              <ArrowRight size={16} />
            </span>
          </Link>
          <Link
            className="inline-flex h-12 items-center justify-center gap-2 border border-zinc-100/25 px-6 text-base font-medium text-zinc-100 transition-colors duration-500 hover:border-zinc-100/60"
            to="/download"
          >
            <Download size={17} /> Get the instructor app
          </Link>
        </div>

        <ul className="hero-fade mt-8 flex flex-wrap gap-x-7 gap-y-2 text-sm text-zinc-400">
          {HERO_CHECKS.map((t) => (
            <li key={t} className="flex items-center gap-2">
              <Check size={14} className="shrink-0 text-teal-400" />
              {t}
            </li>
          ))}
        </ul>

        <p className="hero-fade mt-14 flex items-center gap-2 text-xs text-zinc-500">
          <ArrowDown size={13} className="animate-bounce" />
          Scroll
        </p>
      </div>
    </section>
  );
}

// ─── The problem ──────────────────────────────────────────────────────────────

const FAILURES = [
  {
    when: "Minute 4",
    text: "One student types the path wrong and spends the next twenty minutes on a single typo. Nobody notices.",
  },
  {
    when: "Minute 19",
    text: "Someone looks down to fix their terminal, misses one command, and is quietly lost from there on.",
  },
  {
    when: "Minute 40",
    text: "You answer the same setup question for the fifth time, and lose the thread of what you were teaching.",
  },
];

function Problem() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from(".failure-row", {
        y: 40,
        autoAlpha: 0,
        duration: 1,
        ease: EASE,
        stagger: 0.14,
        scrollTrigger: { trigger: ".failure-list", start: "top 80%" },
      });
    },
    { scope: root }
  );

  return (
    <section ref={root} className="border-b border-wkai-border py-24 sm:py-32">
      <div className="shell grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20">
        <div>
          <RevealHeading
            lines={["A workshop does", "not fail loudly."]}
            className="display text-3xl text-wkai-text sm:text-4xl"
          />
          <ScrollHighlightText
            className="mt-6 max-w-[42ch] text-lg leading-relaxed text-wkai-text sm:text-xl"
            text="It fails one person at a time, quietly, and you find out at the end. The usual fix is more teaching assistants, and there are never enough of them."
          />
        </div>

        <ol className="failure-list divide-y divide-wkai-border border-y border-wkai-border">
          {FAILURES.map((f) => (
            <li key={f.when} className="failure-row flex flex-col gap-2 py-6 sm:flex-row sm:gap-8">
              <span className="shrink-0 font-mono text-sm text-accent-text sm:w-24">{f.when}</span>
              <p className="max-w-[52ch] text-base leading-relaxed text-wkai-text">{f.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ─── Audiences ────────────────────────────────────────────────────────────────

function Audiences() {
  const cols = [
    {
      who: ["If you are running", "the session"],
      points: [
        "Install once, start a room, teach. No console to watch.",
        "See who joined, what they are stuck on, and answer inline.",
        "Share a file from a watched folder, an upload, or a URL.",
        "Set a room password when the session is not public.",
      ],
      cta: { to: "/download", label: "Download the app", primary: true },
    },
    {
      who: ["If you are sitting", "in it"],
      points: [
        "Open a browser, type six characters, you are in.",
        "The guide, the live screen, and the files in one place.",
        "Paste an error and get an answer without asking out loud.",
        "Everything stays readable after the session ends.",
      ],
      cta: { to: "/join", label: "Join a session", primary: false },
    },
  ];

  return (
    <section className="border-b border-wkai-border py-24 sm:py-32">
      <div className="shell grid gap-12 md:grid-cols-2 md:gap-16">
        {cols.map((c) => (
          <div key={c.cta.to} className="flex h-full flex-col">
            <RevealHeading lines={c.who} className="display text-2xl text-wkai-text sm:text-3xl" />
            <Reveal delay={0.08} className="flex flex-1 flex-col">
              <ul className="mt-6 flex-1 space-y-3">
                {c.points.map((p) => (
                  <li key={p} className="flex gap-3 text-sm leading-relaxed text-wkai-text">
                    <Check size={16} className="mt-0.5 shrink-0 text-accent-text" />
                    {p}
                  </li>
                ))}
              </ul>
              <Link className={`mt-8 self-start ${c.cta.primary ? "btn-primary" : "btn-outline"}`} to={c.cta.to}>
                {c.cta.label} <ArrowRight size={15} />
              </Link>
            </Reveal>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Under the hood ───────────────────────────────────────────────────────────

const STACK: [string, string][] = [
  ["Speech", "Whisper large-v3, streamed in chunks"],
  ["Screen", "Qwen3.8-27B vision on sampled frames"],
  ["Reasoning", "GPT-OSS-120B, structured and schema-validated"],
  ["Orchestration", "LangGraph state machines with bounded retries"],
  ["Delivery", "WebRTC video, WebSocket events, TURN fallback"],
  ["Access", "Per-room signed join tokens, optional password"],
  ["State", "Postgres for the record, Redis for session memory"],
];

function UnderTheHood() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from(".stack-row", {
        x: -18,
        autoAlpha: 0,
        duration: 0.8,
        ease: EASE,
        stagger: 0.07,
        scrollTrigger: { trigger: ".stack-list", start: "top 80%" },
      });
    },
    { scope: root }
  );

  return (
    <section id="stack" ref={root} className="scroll-mt-20 border-b border-wkai-border py-24 sm:py-32">
      <div className="shell grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20">
        <div>
          <RevealHeading
            lines={["Built out of parts", "you can name."]}
            className="display text-3xl text-wkai-text sm:text-4xl"
          />
          <Reveal delay={0.1}>
            <p className="mt-5 max-w-[44ch] text-base leading-relaxed text-wkai-text-dim">
              No black box, and nothing invented for the pitch. Every piece below is in the codebase
              and runs on the machine in front of you.
            </p>
          </Reveal>
        </div>

        <dl className="stack-list divide-y divide-wkai-border border-y border-wkai-border">
          {STACK.map(([k, v]) => (
            <div key={k} className="stack-row flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:gap-8">
              <dt className="shrink-0 text-sm font-medium text-wkai-text sm:w-36">{k}</dt>
              <dd className="font-mono text-[13px] leading-relaxed text-wkai-text-dim">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const FAQS: [string, string][] = [
  [
    "Do students need to install anything?",
    "No. A student opens the site, types the six-character room code and their name, and they are in. It works on a locked-down lab machine and on a phone.",
  ],
  [
    "What happens if the instructor drops off?",
    "The room stays up. The guide, the files, and everything already delivered keep working, and the stream reconnects on its own when they come back.",
  ],
  [
    "Is the session recorded?",
    "The guide, the shared files, and the transcript-derived blocks are stored so students can read them afterwards. The instructor app can also record locally to disk if you want a copy of the screen.",
  ],
  [
    "Can anyone with the code join?",
    "Only if you leave the room open. Rooms can require a password, and every student is issued a signed token scoped to that one room.",
  ],
  [
    "How accurate is the error help?",
    "Good enough to unblock the common cases in seconds — imports, paths, environments, versions. It says what it is unsure about rather than inventing a fix, and it always points back to you for the rest.",
  ],
  [
    "What does it cost to run?",
    "It runs on hosted open models through Groq and a small Node backend. There is no per-seat licence in the product; the running cost is inference and hosting.",
  ],
];

function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 border-b border-wkai-border py-24 sm:py-32">
      <div className="shell">
        <RevealHeading
          lines={["Questions people", "actually ask"]}
          className="display text-3xl text-wkai-text sm:text-4xl"
        />

        <Reveal delay={0.08}>
          <div className="mt-12">
            <Accordion items={FAQS} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ─── Close ────────────────────────────────────────────────────────────────────

function FinalCta() {
  return (
    <section className="stage">
      <div className="shell py-24 text-center sm:py-32">
        <RevealHeading
          lines={["Teach the session.", "Let it take the notes."]}
          className="display mx-auto max-w-[20ch] text-3xl text-zinc-50 sm:text-5xl"
        />
        <Reveal delay={0.1}>
          <p className="mx-auto mt-6 max-w-[48ch] text-base leading-relaxed text-zinc-400">
            Start a room from the desktop app, read the code out to the room, and every student has
            the guide in front of them thirty seconds later.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              className="inline-flex h-12 items-center justify-center gap-2 bg-teal-400 px-6 text-base font-semibold text-teal-950 transition-[filter] hover:brightness-110"
              to="/download"
            >
              <Download size={17} /> Download the instructor app
            </Link>
            <Link
              className="inline-flex h-12 items-center justify-center gap-2 border border-zinc-100/20 px-6 text-base font-medium text-zinc-100 transition-colors hover:border-zinc-100/50"
              to="/join"
            >
              I have a room code <ArrowRight size={17} />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="stage border-t border-white/10">
      <div className="shell flex flex-col gap-4 py-8 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2.5">
          <img src="/wkai-logo.svg" alt="" className="h-7 w-7 object-contain" />
          <span className="text-sm text-zinc-400">WKAI — Workshop AI</span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-400 sm:ml-auto">
          <Link className="inline-flex items-center py-2.5 transition-colors hover:text-zinc-50" to="/join">Join</Link>
          <Link className="inline-flex items-center py-2.5 transition-colors hover:text-zinc-50" to="/download">Download</Link>
          <a className="inline-flex items-center py-2.5 transition-colors hover:text-zinc-50" href="#how">How it works</a>
          <a className="inline-flex items-center py-2.5 transition-colors hover:text-zinc-50" href="#faq">FAQ</a>
        </div>
      </div>
    </footer>
  );
}
