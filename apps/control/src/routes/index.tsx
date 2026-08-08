import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ExternalLink,
  Menu,
  X,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { BrandLogo } from "@/components/brand/brand-logo";
import { TechnologyMarquee } from "@/components/landing/technology-marquee";
import { getStoredProjectId } from "@/lib/project-storage";

export const Route = createFileRoute("/")({ component: LandingPage });

const landingNavigation = [
  ["Philosophy", "#philosophy"],
  ["Design", "#design"],
  ["Technology", "#technology"],
  ["Resources", "#resources"],
] as const;

const footerResources = [
  ["Documentation", "https://github.com/Sn0rt/TaskLattice/tree/main/docs"],
  ["Support & issues", "https://github.com/Sn0rt/TaskLattice/issues"],
  ["Releases", "https://github.com/Sn0rt/TaskLattice/releases"],
  [
    "Install guide",
    "https://github.com/Sn0rt/TaskLattice/blob/main/README.md#install-the-latest-release",
  ],
] as const;

const footerOpenSource = [
  ["GitHub", "https://github.com/Sn0rt/TaskLattice"],
  [
    "Contributing",
    "https://github.com/Sn0rt/TaskLattice/blob/main/CONTRIBUTING.md",
  ],
  ["Apache-2.0", "https://github.com/Sn0rt/TaskLattice/blob/main/LICENSE"],
] as const;

const conceptStories = [
  {
    eyebrow: "Human",
    title: "Intent begins the work.",
    description:
      "People provide context, the desired outcome, and the boundaries that matter. They delegate responsibility—not configuration.",
    image: "/assets/landing/concepts/human-delegation.jpg",
  },
  {
    eyebrow: "Capability",
    title: "The organization supplies the means.",
    description:
      "Capabilities belong to the organization. The Supervisor discovers and requests the right knowledge, tools, and specialists for each job.",
    image: "/assets/landing/concepts/capability-discovery.jpg",
  },
  {
    eyebrow: "Experience",
    title: "Every job changes the next one.",
    description:
      "Progress, outcomes, approvals, and human corrections become experience—so the workforce returns better prepared.",
    image: "/assets/landing/concepts/experience-loop.jpg",
  },
] as const;

const runtimeComponents = [
  {
    eyebrow: "Runtime adapter",
    label: "NemoClaw",
    title: "Intent becomes inspectable desired state.",
    description:
      "TaskLattice passes the selected workforce configuration through a pinned NemoClaw adapter instead of hand-editing a sandbox.",
    facts: ["OpenClaw or Hermes", "Desired + observed"],
  },
  {
    eyebrow: "Sandbox boundary",
    label: "OpenShell",
    title: "Every worker gets a policy boundary.",
    description:
      "OpenShell owns the sandbox lifecycle and applies workspace, process, credential, and network policy around execution.",
    facts: ["Filesystem + process", "Network + credentials"],
  },
  {
    eyebrow: "Model gateway",
    label: "LiteLLM",
    title: "Model access stays scoped and attributable.",
    description:
      "Routing controls model selection and each Instance receives an independently revocable key while provider secrets stay outside the workspace.",
    facts: ["Per-instance key", "Routing + budget"],
  },
  {
    eyebrow: "Agent implementation",
    label: "OpenClaw / Hermes",
    title: "Agent implementations stay replaceable.",
    description:
      "OpenClaw or Hermes supplies the primary Agent runtime while TaskLattice keeps identity, capabilities, policy, and evidence above it.",
    facts: ["Primary Agent", "Skills + MCP + knowledge"],
  },
] as const;

const storyEase = [0.22, 1, 0.36, 1] as const;

function StoryFrame({
  activeIndex,
  children,
  className,
  index,
}: {
  activeIndex: number;
  children: ReactNode;
  className: string;
  index: number;
}) {
  const prefersReducedMotion = useReducedMotion();
  const active = activeIndex === index;
  const offset = index < activeIndex ? -16 : 16;

  return (
    <motion.div
      className={`landing-story-frame ${className}`}
      initial={false}
      animate={
        prefersReducedMotion
          ? { opacity: 1, scale: 1, y: 0 }
          : {
              opacity: active ? 1 : 0.72,
              scale: active ? 1 : 0.992,
              y: active ? 0 : offset,
            }
      }
      transition={{ duration: prefersReducedMotion ? 0 : 0.34, ease: storyEase }}
    >
      {children}
    </motion.div>
  );
}

function LandingPage() {
  const { user } = useAuth();
  const [activeStoryIndex, setActiveStoryIndex] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileNavButtonRef = useRef<HTMLButtonElement>(null);
  const mobileNavPanelRef = useRef<HTMLElement>(null);
  const storyScrollerRef = useRef<HTMLElement>(null);
  const projectId = getStoredProjectId() ?? "individual";
  const projectLink = user
    ? { to: "/$projectId" as const, params: { projectId } }
    : { to: "/login" as const };

  useEffect(() => {
    if (!mobileNavOpen) return;

    const previousOverflow = document.body.style.overflow;
    const previousScrollerOverflow = storyScrollerRef.current?.style.overflowY;
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const closeNavigation = () => setMobileNavOpen(false);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeNavigation();
        return;
      }

      if (event.key !== "Tab") return;
      const focusableElements = Array.from(
        mobileNavPanelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0]!;
      const lastElement = focusableElements[focusableElements.length - 1]!;
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };
    const handleViewportChange = (event: MediaQueryListEvent) => {
      if (event.matches) closeNavigation();
    };
    const focusTimer = window.setTimeout(() => {
      mobileNavPanelRef.current
        ?.querySelector<HTMLElement>("a, button")
        ?.focus();
    }, 0);

    document.body.style.overflow = "hidden";
    if (storyScrollerRef.current) {
      storyScrollerRef.current.style.overflowY = "hidden";
    }
    window.addEventListener("keydown", handleKeyDown);
    desktopQuery.addEventListener("change", handleViewportChange);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      desktopQuery.removeEventListener("change", handleViewportChange);
      document.body.style.overflow = previousOverflow;
      if (storyScrollerRef.current) {
        storyScrollerRef.current.style.overflowY =
          previousScrollerOverflow ?? "";
      }
      mobileNavButtonRef.current?.focus();
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    const scroller = storyScrollerRef.current;
    if (!scroller) return;

    const panels = Array.from(
      scroller.querySelectorAll<HTMLElement>("[data-story-index]"),
    );
    const visibility = new Map<Element, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visibility.set(entry.target, entry.intersectionRatio);
        }

        const nextPanel = panels.reduce<HTMLElement | null>(
          (mostVisible, panel) => {
            if (!mostVisible) return panel;
            return (visibility.get(panel) ?? 0) >
              (visibility.get(mostVisible) ?? 0)
              ? panel
              : mostVisible;
          },
          null,
        );
        const nextIndex = Number(nextPanel?.dataset.storyIndex);
        if (Number.isInteger(nextIndex)) setActiveStoryIndex(nextIndex);
      },
      {
        root: scroller,
        threshold: [0.2, 0.35, 0.5, 0.65, 0.8],
      },
    );

    for (const panel of panels) {
      visibility.set(panel, 0);
      observer.observe(panel);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div className="landing-page h-svh overflow-hidden bg-background text-foreground">
      <header className="landing-header relative z-50 border-b border-white/10 bg-[#07090c] text-white">
        <div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between px-5 sm:h-[4.5rem] sm:px-8 lg:px-8 xl:px-12">
          <Link
            to="/"
            aria-label="TaskLattice home"
            className="inline-flex min-h-11 shrink-0 items-center"
          >
            <BrandLogo
              animated
              className="text-white [&_.text-muted-foreground]:text-white/50"
            />
          </Link>
          <nav
            className="hidden h-full items-center gap-5 text-sm text-white/55 lg:flex xl:gap-7"
            aria-label="Landing navigation"
          >
            {landingNavigation.map(([label, href], index) => (
              <a
                key={href}
                href={href}
                aria-current={activeStoryIndex === index ? "page" : undefined}
                data-active={activeStoryIndex === index}
                className="landing-header-link"
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="hidden items-center gap-2 lg:flex xl:gap-3">
            <a
              href="https://github.com/Sn0rt/TaskLattice/tree/main/docs"
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center px-2 text-xs text-white/50 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Docs
            </a>
            <a
              href="https://github.com/Sn0rt/TaskLattice"
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-2 px-2 text-xs text-white/50 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              GitHub
              <ExternalLink className="size-3.5" />
            </a>
            <Link
              {...projectLink}
              className="inline-flex min-h-11 items-center gap-2 bg-[#4339ff] px-4 text-sm font-medium text-white transition-colors hover:bg-[#564dff] focus-visible:outline-2 focus-visible:outline-offset-2 xl:px-5"
            >
              {user ? "Open console" : "Sign in"}
              <ArrowRight className="size-4" />
            </Link>
          </div>
          <button
            ref={mobileNavButtonRef}
            type="button"
            aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileNavOpen}
            aria-controls="landing-mobile-navigation"
            onClick={() => setMobileNavOpen((open) => !open)}
            className="inline-flex size-11 items-center justify-center border border-white/20 text-white transition-colors hover:border-white/55 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 lg:hidden"
          >
            {mobileNavOpen ? (
              <X className="size-4" />
            ) : (
              <Menu className="size-4" />
            )}
          </button>
        </div>
        {mobileNavOpen ? (
          <div className="fixed inset-x-0 bottom-0 top-16 z-50 sm:top-[4.5rem] lg:hidden">
            <button
              type="button"
              aria-label="Close navigation"
              aria-hidden="true"
              tabIndex={-1}
              onClick={() => setMobileNavOpen(false)}
              className="absolute inset-0 bg-black/70"
            />
            <nav
              ref={mobileNavPanelRef}
              id="landing-mobile-navigation"
              aria-label="Mobile landing navigation"
              className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col overflow-y-auto border-l border-white/10 bg-[#0d1014] px-5 py-6 sm:px-8"
            >
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/30">
                Explore TaskLattice
              </p>
              <div className="mt-5 grid border-t border-white/10">
                {landingNavigation.map(([label, href], index) => (
                  <a
                    key={href}
                    href={href}
                    aria-current={
                      activeStoryIndex === index ? "page" : undefined
                    }
                    data-active={activeStoryIndex === index}
                    onClick={() => setMobileNavOpen(false)}
                    className="grid min-h-14 grid-cols-[1fr_auto] items-center border-b border-white/10 py-2 text-sm text-white/70 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <span>{label}</span>
                    <ArrowRight className="size-3.5" />
                  </a>
                ))}
              </div>
              <div className="mt-7 grid grid-cols-2 gap-px border border-white/10 bg-white/10">
                <a
                  href="https://github.com/Sn0rt/TaskLattice/tree/main/docs"
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setMobileNavOpen(false)}
                  className="inline-flex min-h-12 items-center justify-between bg-[#0d1014] px-4 text-sm text-white/62 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                >
                  Docs
                  <ExternalLink className="size-3.5" />
                </a>
                <a
                  href="https://github.com/Sn0rt/TaskLattice"
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setMobileNavOpen(false)}
                  className="inline-flex min-h-12 items-center justify-between bg-[#0d1014] px-4 text-sm text-white/62 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                >
                  GitHub
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
              <Link
                {...projectLink}
                onClick={() => setMobileNavOpen(false)}
                className="mt-auto inline-flex min-h-12 items-center justify-between bg-[#4339ff] px-5 text-sm font-medium text-white transition-colors hover:bg-[#564dff] focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {user ? "Open console" : "Sign in"}
                <ArrowRight className="size-4" />
              </Link>
            </nav>
          </div>
        ) : null}
      </header>

      <main
        ref={storyScrollerRef}
        tabIndex={0}
        aria-label="TaskLattice product overview"
        className="landing-story-scroller h-[calc(100svh-4rem)] overflow-y-auto sm:h-[calc(100svh-4.5rem)]"
      >
        <section
          id="philosophy"
          data-story-index={0}
          data-active={activeStoryIndex === 0}
          className="landing-story-panel landing-agent-hero isolate overflow-hidden border-b border-white/10 bg-[#07090c] text-white"
        >
          <StoryFrame
            index={0}
            activeIndex={activeStoryIndex}
            className="relative mx-auto grid min-h-full max-w-[1480px] items-center px-5 py-10 sm:px-8 sm:py-12 lg:px-12 lg:py-16"
          >
            <div
              aria-hidden="true"
              className="landing-agent-backdrop pointer-events-none absolute inset-0 overflow-hidden"
            >
              <video
                autoPlay
                muted
                loop
                playsInline
                controls={false}
                preload="metadata"
                poster="/assets/landing/tali-landing-page-background-poster.jpg"
                className="pointer-events-none"
                aria-hidden="true"
                width={1280}
                height={720}
              >
                <source
                  src="/assets/landing/tali-landing-page-background.mp4"
                  type="video/mp4"
                  media="(prefers-reduced-motion: no-preference)"
                />
              </video>
            </div>
            <div
              className="landing-agent-scrim pointer-events-none absolute inset-0 z-[1]"
              aria-hidden="true"
            />

            <div className="relative z-10 max-w-[43rem]">
              <p className="mb-6 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.1em] text-white/50 sm:mb-8 sm:text-xs">
                <span className="h-px w-8 bg-[#42e3ff]" />
                Philosophy · Human intent leads
              </p>
              <h1 className="max-w-4xl text-balance text-[clamp(3.25rem,7vw,7rem)] leading-[0.91] tracking-[-0.045em]">
                Delegate work.
                <span className="block text-[#9c96ff]">Build experience.</span>
              </h1>
              <p className="mt-7 max-w-[39rem] text-pretty text-base leading-7 text-white/60 sm:mt-9 sm:text-xl sm:leading-8">
                Give your Supervisor the context, goal, and boundaries. It
                plans the work, assembles the right capabilities, keeps you
                informed, and turns every review into experience for the next
                job.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4 sm:mt-10">
                <Link
                  {...projectLink}
                  className="inline-flex min-h-12 items-center gap-3 bg-[#4339ff] px-6 text-sm font-medium text-white transition-colors hover:bg-[#564dff] focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {user ? "Open console" : "Sign in"}
                  <ArrowRight className="size-4" />
                </Link>
                <a
                  href="#design"
                  className="inline-flex min-h-12 items-center px-2 text-sm font-medium underline decoration-white/25 underline-offset-8 transition-colors hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  Explore the product model
                </a>
              </div>
            </div>

          </StoryFrame>
        </section>

        <section
          id="design"
          data-story-index={1}
          data-active={activeStoryIndex === 1}
          className="landing-story-panel overflow-hidden border-b border-[#d8d4ca] bg-[#f3f0e9] text-[#191c20]"
        >
          <StoryFrame
            index={1}
            activeIndex={activeStoryIndex}
            className="mx-auto flex min-h-full max-w-[1480px] flex-col justify-center px-5 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-6 xl:py-8"
          >
            <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr] lg:items-end lg:gap-12">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#4339ff] sm:text-xs">
                  Product design
                </p>
                <h2 className="mt-4 max-w-xl text-3xl leading-tight tracking-[-0.03em] sm:text-5xl lg:text-4xl 2xl:text-5xl">
                  Intelligence grows through work.
                </h2>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-[#62636a] sm:text-base sm:leading-7 lg:justify-self-end">
                TaskLattice treats AI as a workforce with continuity—not a
                collection of configuration screens. Human intent starts the
                job, organizational capabilities make it possible, and
                experience improves what happens next.
              </p>
            </div>

            <div className="landing-concept-grid mt-7 grid gap-3 sm:mt-8 lg:mt-6 lg:grid-cols-3 lg:gap-px lg:border lg:border-[#d8d4ca] lg:bg-[#d8d4ca]">
              {conceptStories.map((story) => (
                <article
                  key={story.eyebrow}
                  className="landing-concept-card grid overflow-hidden border border-[#d8d4ca] bg-[#faf8f3] lg:border-0"
                >
                  <div className="landing-concept-visual overflow-hidden bg-[#f8f5ef]">
                    <img
                      src={story.image}
                      alt=""
                      aria-hidden="true"
                      width={1254}
                      height={1254}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <div className="landing-concept-copy p-4 sm:p-5 lg:p-5">
                    <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#4339ff]">
                      {story.eyebrow}
                    </p>
                    <h3 className="mt-2 text-lg font-medium tracking-[-0.015em] sm:text-xl">
                      {story.title}
                    </h3>
                    <p className="mt-2 text-xs leading-5 text-[#62636a] sm:text-sm sm:leading-6 lg:text-xs lg:leading-5 xl:text-sm xl:leading-6">
                      {story.description}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </StoryFrame>
        </section>

        <section
          id="technology"
          data-story-index={2}
          data-active={activeStoryIndex === 2}
          className="landing-story-panel overflow-hidden border-b border-white/10 bg-[#0d0f12] text-white"
        >
          <StoryFrame
            index={2}
            activeIndex={activeStoryIndex}
            className="flex min-h-full flex-col"
          >
            <div className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col justify-center px-5 py-7 sm:px-8 sm:py-9 lg:px-12 lg:py-6 xl:py-8">
              <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr] lg:items-end lg:gap-12">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#42e3ff]/70 sm:text-xs">
                    Technology
                  </p>
                  <h2 className="mt-4 max-w-2xl text-3xl leading-tight tracking-[-0.03em] sm:text-5xl lg:text-4xl 2xl:text-5xl">
                    A governed runtime beneath the simple experience.
                  </h2>
                </div>
                <p className="max-w-2xl text-sm leading-6 text-white/48 sm:text-base sm:leading-7 lg:justify-self-end">
                  The product hides infrastructure from everyday work without
                  hiding responsibility. Every worker, capability, permission,
                  model call, and cost remains attributable and inspectable.
                </p>
              </div>

              <div className="landing-technology-cards mt-7 flex gap-3 overflow-x-auto pb-2 sm:mt-8 lg:mt-6 lg:grid lg:grid-cols-4 lg:gap-px lg:overflow-visible lg:border lg:border-white/10 lg:bg-white/10 lg:pb-0">
                {runtimeComponents.map((component) => (
                  <article
                    key={component.label}
                    className="w-[82vw] max-w-[20rem] shrink-0 border border-white/10 bg-[#121519] p-5 lg:w-auto lg:max-w-none lg:border-0 lg:p-3 2xl:p-5"
                  >
                    <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#42e3ff]/62">
                      {component.eyebrow}
                    </p>
                    <p className="mt-5 text-sm font-medium text-[#9c96ff] lg:mt-3 lg:text-xs 2xl:text-sm">
                      {component.label}
                    </p>
                    <h3 className="mt-2 text-xl leading-tight tracking-[-0.02em] lg:text-lg 2xl:text-xl">
                      {component.title}
                    </h3>
                    <p className="mt-4 text-xs leading-5 text-white/45 sm:text-sm sm:leading-6 lg:mt-3 lg:text-[11px] lg:leading-[1.125rem] 2xl:text-sm 2xl:leading-6">
                      {component.description}
                    </p>
                    <ul className="mt-5 grid gap-2 border-t border-white/10 pt-4 font-mono text-[9px] uppercase tracking-[0.06em] text-white/32 lg:mt-3 lg:flex lg:flex-wrap lg:gap-x-3 lg:gap-y-1 lg:pt-3 lg:text-[8px] 2xl:grid 2xl:text-[9px]">
                      {component.facts.map((fact) => (
                        <li key={fact}>{fact}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </div>

            <TechnologyMarquee />
          </StoryFrame>
        </section>

        <footer
          id="resources"
          data-story-index={3}
          data-active={activeStoryIndex === 3}
          className="landing-story-panel landing-footer bg-[#07090c] text-white"
        >
          <StoryFrame
            index={3}
            activeIndex={activeStoryIndex}
            className="flex min-h-full flex-col"
          >
            <div className="mx-auto grid w-full max-w-[1480px] flex-1 gap-10 px-5 py-10 sm:px-8 sm:py-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:gap-20 lg:px-12">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#42e3ff]/70 sm:text-xs">
                  What TaskLattice is
                </p>
                <h2 className="mt-5 max-w-3xl text-4xl leading-[1.04] tracking-[-0.035em] sm:text-6xl">
                  The operating layer for an accountable AI workforce.
                </h2>
                <p className="mt-6 max-w-2xl text-sm leading-7 text-white/52 sm:text-base">
                  TaskLattice is an open-source, Kubernetes-native AI workforce
                  runtime. It brings persistent Supervisors, specialist agents,
                  organizational capabilities, identity, policy, budget, and
                  evidence into one inspectable system.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <Link
                    {...projectLink}
                    className="inline-flex min-h-12 w-fit items-center gap-3 bg-[#4339ff] px-6 text-sm font-medium text-white transition-colors hover:bg-[#564dff] focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    {user ? "Open console" : "Sign in"}
                    <ArrowRight className="size-4" />
                  </Link>
                  <a
                    href="https://github.com/Sn0rt/TaskLattice/tree/main/docs"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-12 items-center gap-2 px-2 text-sm text-white/68 underline decoration-white/25 underline-offset-8 transition-colors hover:text-white hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    Read documentation
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-8 gap-y-8 border-t border-white/10 pt-8 sm:grid-cols-3 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0">
                <nav aria-label="Landing chapters">
                  <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/28">
                    Explore
                  </p>
                  <ul className="mt-4 grid text-sm text-white/52">
                    {landingNavigation.map(([label, href]) => (
                      <li key={href}>
                        <a
                          href={href}
                          className="inline-flex min-h-11 items-center transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          {label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>

                <nav aria-label="TaskLattice resources">
                  <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/28">
                    Resources
                  </p>
                  <ul className="mt-4 grid text-sm text-white/52">
                    {footerResources.map(([label, href]) => (
                      <li key={href}>
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-11 items-center gap-2 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          {label}
                          <ExternalLink className="size-3 shrink-0" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>

                <nav aria-label="Open source links">
                  <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/28">
                    Open source
                  </p>
                  <ul className="mt-4 grid text-sm text-white/52">
                    {footerOpenSource.map(([label, href]) => (
                      <li key={href}>
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-11 items-center gap-2 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          {label}
                          <ExternalLink className="size-3 shrink-0" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              </div>
            </div>

            <div className="border-t border-white/10">
              <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-4 px-5 py-5 font-mono text-[9px] uppercase tracking-[0.08em] text-white/28 sm:px-8 lg:px-12">
                <span>© {new Date().getFullYear()} TaskLattice</span>
                <span>Kubernetes-native · AI workforce runtime</span>
                <span>Self-hosted on Kubernetes</span>
              </div>
            </div>
          </StoryFrame>
        </footer>
      </main>
    </div>
  );
}
