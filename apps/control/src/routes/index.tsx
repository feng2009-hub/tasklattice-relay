import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  Boxes,
  Check,
  Command,
  Cpu,
  Network,
  ShieldCheck,
  SquareTerminal,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { BrandLogo } from "@/components/brand/brand-logo";

export const Route = createFileRoute("/")({ component: LandingPage });

const workflow = [
  { label: "Declare", detail: "Describe the agent and model boundary." },
  { label: "Provision", detail: "Create an isolated OpenShell sandbox." },
  { label: "Operate", detail: "Inspect state and enter the live terminal." },
];

const systemFeatures: Array<[LucideIcon, string, string]> = [
  [Boxes, "Isolation", "One agent, one inspectable sandbox boundary."],
  [Network, "Orchestration", "A deliberate path from declaration to runtime."],
  [Cpu, "Operations", "Live status and terminal access at the point of work."],
];

function LandingPage() {
  const { user } = useAuth();
  return (
    <div className="landing-page min-h-svh overflow-hidden bg-background text-foreground">
      <header className="relative z-20 mx-auto flex h-20 max-w-[1480px] items-center justify-between px-5 sm:px-8 lg:px-12">
        <Link to="/" aria-label="TaskLattice home" className="inline-flex min-h-11 items-center">
          <BrandLogo animated />
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex" aria-label="Landing navigation">
          <a href="#system" className="hover:text-foreground">System</a>
          <a href="#workflow" className="hover:text-foreground">Workflow</a>
          <a href="#trust" className="hover:text-foreground">Trust</a>
        </nav>
        <Link
          to={user ? "/dashboard" : "/login"}
          className="inline-flex min-h-11 items-center gap-2 border border-foreground px-5 text-sm font-medium transition-colors hover:bg-foreground hover:text-background focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {user ? "Open workspace" : "Sign in"}
          <ArrowRight className="size-4" />
        </Link>
      </header>

      <main>
        <section className="landing-grid relative mx-auto grid min-h-[calc(100svh-5rem)] max-w-[1480px] items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1.08fr_0.92fr] lg:px-12 lg:py-20">
          <div className="relative z-10 max-w-3xl">
            <p className="mb-8 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
              <span className="h-px w-8 bg-primary" />
              Agent operations, made legible
            </p>
            <h1 className="max-w-4xl text-balance text-[clamp(3.7rem,7.4vw,8rem)] leading-[0.92] tracking-[-0.045em]">
              Give agents
              <span className="block text-primary">real ground.</span>
            </h1>
            <p className="mt-9 max-w-xl text-pretty text-lg leading-8 text-muted-foreground sm:text-xl">
              TaskLattice is the control plane for creating, isolating, and
              operating AI agents on Kubernetes—without hiding the runtime
              state that matters.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                to={user ? "/dashboard" : "/login"}
                className="inline-flex min-h-12 items-center gap-3 bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {user ? "Enter the workspace" : "Start operating"}
                <ArrowRight className="size-4" />
              </Link>
              <a
                href="#workflow"
                className="inline-flex min-h-12 items-center px-2 text-sm font-medium underline decoration-border underline-offset-8 hover:decoration-foreground"
              >
                See the operating loop
              </a>
            </div>
          </div>

          <div className="relative z-10 lg:justify-self-end">
            <div className="operator-window" aria-label="TaskLattice agent operation preview">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div className="flex items-center gap-2 text-xs text-white/55">
                  <Command className="size-3.5" />
                  OPERATIONS / AGENT-07
                </div>
                <span className="flex items-center gap-2 text-[11px] font-medium text-[#9c96ff]">
                  <span className="size-1.5 rounded-full bg-[#7068ff]" />
                  READY
                </span>
              </div>
              <div className="grid gap-8 p-6 sm:p-8">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-white/35">Desired agent</p>
                  <div className="mt-3 flex items-center gap-3">
                    <Bot className="size-5 text-[#9c96ff]" />
                    <span className="text-lg font-medium text-white">research-operator</span>
                  </div>
                  <p className="mt-2 font-mono text-xs text-white/42">deepseek-chat · openshell</p>
                </div>
                <div className="lattice-path" aria-hidden="true">
                  <span className="is-complete"><Check /></span>
                  <i />
                  <span className="is-complete"><Check /></span>
                  <i />
                  <span><SquareTerminal /></span>
                </div>
                <div className="grid grid-cols-[1fr_auto] items-end gap-5 border-t border-white/10 pt-6">
                  <div>
                    <p className="text-xs text-white/38">Runtime sandbox</p>
                    <p className="mt-2 font-mono text-sm text-white/80">nemo-agent-07-a1f9</p>
                  </div>
                  <span className="bg-[#4339ff] px-4 py-2 text-xs font-medium text-white">Open terminal</span>
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-between px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <span>Control plane / 01</span>
              <span>Evidence over abstraction</span>
            </div>
          </div>
        </section>

        <section id="system" className="border-y border-border bg-[#191a1b] text-white">
          <div className="mx-auto grid max-w-[1480px] lg:grid-cols-[0.8fr_1.2fr]">
            <div className="border-b border-white/10 p-8 sm:p-12 lg:border-b-0 lg:border-r lg:p-16">
              <p className="font-mono text-xs uppercase tracking-[0.08em] text-[#9c96ff]">The system</p>
              <h2 className="mt-8 max-w-md text-4xl leading-tight tracking-[-0.025em] sm:text-5xl">
                The runtime remains visible.
              </h2>
              <p className="mt-6 max-w-md leading-7 text-white/58">
                Desired configuration and actual sandbox state stay separate,
                so operators can see what was requested, what exists, and
                where a failure happened.
              </p>
            </div>
            <div className="grid sm:grid-cols-3">
              {systemFeatures.map(([Icon, title, copy], index) => (
                <article key={String(title)} className="border-b border-white/10 p-8 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 sm:p-10">
                  <div className="flex items-center justify-between">
                    <Icon className="size-5 text-[#9c96ff]" />
                    <span className="font-mono text-[10px] text-white/28">0{index + 1}</span>
                  </div>
                  <h3 className="mt-16 text-lg font-semibold">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/50">{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="workflow" className="mx-auto max-w-[1480px] px-5 py-24 sm:px-8 lg:px-12 lg:py-32">
          <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr]">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.08em] text-primary">Operating loop</p>
              <h2 className="mt-6 text-4xl tracking-[-0.025em] sm:text-5xl">Three moves.<br />No hidden leap.</h2>
            </div>
            <ol className="border-t border-border">
              {workflow.map((item, index) => (
                <li key={item.label} className="grid gap-4 border-b border-border py-7 sm:grid-cols-[4rem_0.65fr_1fr] sm:items-center">
                  <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
                  <strong className="text-xl font-medium">{item.label}</strong>
                  <span className="text-sm leading-6 text-muted-foreground">{item.detail}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="trust" className="border-y border-border bg-muted px-5 py-20 sm:px-8 lg:px-12 lg:py-24">
          <div className="mx-auto flex max-w-[1380px] flex-col justify-between gap-12 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <ShieldCheck className="size-7 text-primary" />
              <h2 className="mt-8 text-4xl leading-tight tracking-[-0.025em] sm:text-6xl">Control starts with a boundary you can explain.</h2>
            </div>
            <div className="max-w-md">
              <p className="text-base leading-7 text-muted-foreground">Local identity and OIDC SSO lead into the same authenticated workspace. Agent APIs remain behind that boundary, while runtime session tokens stay short-lived and task-specific.</p>
              <Link to={user ? "/dashboard" : "/login"} className="mt-8 inline-flex min-h-11 items-center gap-2 border-b border-foreground text-sm font-medium">
                {user ? "Open your workspace" : "Authenticate to continue"}
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-5 px-5 py-10 text-xs text-muted-foreground sm:px-8 lg:px-12">
        <BrandLogo />
        <span>Isolated agents. Observable operations.</span>
        <span>© {new Date().getFullYear()} TaskLattice</span>
      </footer>
    </div>
  );
}
