import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BadgeCheck,
  BookOpenText,
  Code2,
  ScrollText,
  ShieldCheck,
  SquareTerminal,
  TriangleAlert,
  UserRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProject } from "@/hooks/use-project";
import { defaultLanguage, normalizeLanguage } from "@/i18n/config";
import {
  getHelpRoute,
  getHelpTopics,
  helpTopicIds,
  isHelpTopicId,
  type HelpTopic,
  type HelpTopicId,
} from "@/lib/help-content";
import { cn } from "@/lib/utils";

interface HelpSearch {
  topic?: HelpTopicId;
}

export const Route = createFileRoute("/$projectId/help")({
  validateSearch: (search: Record<string, unknown>): HelpSearch =>
    isHelpTopicId(search.topic) ? { topic: search.topic } : {},
  component: HelpPage,
});

const topicIcons: Record<HelpTopicId, LucideIcon> = {
  admin: ShieldCheck,
  developer: Code2,
  approver: BadgeCheck,
  auditor: ScrollText,
  user: UserRound,
  maintenance: Wrench,
  troubleshooting: TriangleAlert,
};

function TopicLink({
  active,
  projectId,
  topic,
}: {
  active: boolean;
  projectId: string;
  topic: HelpTopic;
}) {
  const Icon = topicIcons[topic.id];
  const { t } = useTranslation("help");
  return (
    <li>
      <Link
        to="/$projectId/help"
        params={{ projectId }}
        search={{ topic: topic.id }}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-11 items-center gap-3 rounded-md border-l-2 border-transparent px-3 py-2 text-sm outline-none transition-colors",
          "hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/30",
          active && "border-primary bg-primary/[0.06] font-medium text-primary",
        )}
      >
        <Icon className={cn("size-4 shrink-0 text-muted-foreground", active && "text-primary")} />
        <span>{t(`topics.${topic.id}`)}</span>
      </Link>
    </li>
  );
}

function MarkdownDocument({ body, projectId }: { body: string; projectId: string }) {
  const components: Components = {
    h1: ({ children }) => (
      <h1 className="font-display text-2xl font-medium tracking-tight sm:text-3xl">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="mt-8 border-t pt-6 font-display text-xl font-medium tracking-tight first:mt-0 first:border-0 first:pt-0">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="mt-6 text-base font-semibold">{children}</h3>
    ),
    p: ({ children }) => (
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-[0.9375rem]">
        {children}
      </p>
    ),
    ol: ({ children }) => (
      <ol className="mt-4 max-w-3xl list-decimal space-y-4 pl-6 text-sm leading-6 marker:font-mono marker:text-muted-foreground">
        {children}
      </ol>
    ),
    ul: ({ children }) => (
      <ul className="mt-4 max-w-3xl list-disc space-y-4 pl-6 text-sm leading-6 marker:text-muted-foreground">
        {children}
      </ul>
    ),
    li: ({ children }) => <li className="pl-1 text-muted-foreground">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
    a: ({ children, href }) => {
      const route = getHelpRoute(href);
      const className = "font-medium text-primary underline decoration-primary/35 underline-offset-4 hover:decoration-primary focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";
      return route ? (
        <Link className={className} to={route} params={{ projectId }}>
          {children}
        </Link>
      ) : (
        <a className={className} href={href} rel="noreferrer" target="_blank">
          {children}
        </a>
      );
    },
    blockquote: ({ children }) => (
      <blockquote className="mt-6 border-l-2 border-amber-500 bg-amber-500/5 px-4 py-1 [&>p]:mt-2 [&>p]:mb-2">
        {children}
      </blockquote>
    ),
    pre: ({ children }) => (
      <div className="mt-4 overflow-hidden rounded-md border bg-foreground text-background">
        <div className="flex items-center gap-2 border-b border-background/15 px-3 py-2 font-mono text-[10px] text-background/70">
          <SquareTerminal className="size-3.5" />
          shell
        </div>
        <pre className="overflow-x-auto p-3 text-xs leading-5">{children}</pre>
      </div>
    ),
    code: ({ children, className }) => className ? (
      <code className={cn("font-mono", className)}>{children}</code>
    ) : (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
        {children}
      </code>
    ),
  };

  return (
    <div className="p-5 sm:p-6 [&>h1+p]:text-base">
      <ReactMarkdown components={components} skipHtml>
        {body}
      </ReactMarkdown>
    </div>
  );
}

function HelpPage() {
  const { i18n, t } = useTranslation("help");
  const language =
    normalizeLanguage(i18n.resolvedLanguage ?? i18n.language) ??
    defaultLanguage;
  const topics = getHelpTopics(language);
  const { currentProject } = useProject();
  const { projectId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const roleTopicId = currentProject?.activeRole ?? "user";
  const selectedTopicId = search.topic ?? roleTopicId;
  const selectedTopic = topics[selectedTopicId];
  const roleTopics = helpTopicIds
    .map((topicId) => topics[topicId])
    .filter((topic) => topic.category === "role");
  const operationsTopics = helpTopicIds
    .map((topicId) => topics[topicId])
    .filter((topic) => topic.category === "operations");

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        badge={
          <Badge variant="outline" className="gap-1.5">
            <BookOpenText />
            {t("navigation.userGuides")} · {t("navigation.operations")}
          </Badge>
        }
      />

      <div className="lg:hidden">
        <label className="mb-2 block text-xs font-medium text-muted-foreground" htmlFor="help-topic-select">
          {t("browse")}
        </label>
        <Select
          value={selectedTopicId}
          onValueChange={(value) => {
            void navigate({ search: { topic: value as HelpTopicId } });
          }}
        >
          <SelectTrigger id="help-topic-select" size="lg" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>{t("navigation.userGuides")}</SelectLabel>
              {roleTopics.map((topic) => (
                <SelectItem key={topic.id} value={topic.id}>
                  {t(`topics.${topic.id}`)}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>{t("navigation.operations")}</SelectLabel>
              {operationsTopics.map((topic) => (
                <SelectItem key={topic.id} value={topic.id}>
                  {t(`topics.${topic.id}`)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <nav
            aria-label={t("navigation.title")}
            className="sticky top-24 rounded-lg border border-border/65 bg-card p-2"
          >
            <div className="px-3 pb-2 pt-1">
              <h2 className="text-sm font-semibold">{t("navigation.userGuides")}</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t("navigation.userGuidesDescription")}
              </p>
            </div>
            <ul className="space-y-0.5">
              {roleTopics.map((topic) => (
                <TopicLink
                  key={topic.id}
                  active={selectedTopicId === topic.id}
                  projectId={projectId}
                  topic={topic}
                />
              ))}
            </ul>
            <div className="mx-3 my-3 h-px bg-border" />
            <div className="px-3 pb-2">
              <h2 className="text-sm font-semibold">{t("navigation.operations")}</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t("navigation.operationsDescription")}
              </p>
            </div>
            <ul className="space-y-0.5">
              {operationsTopics.map((topic) => (
                <TopicLink
                  key={topic.id}
                  active={selectedTopicId === topic.id}
                  projectId={projectId}
                  topic={topic}
                />
              ))}
            </ul>
          </nav>
        </aside>

        <article className="min-w-0 overflow-hidden rounded-lg border border-border/65 bg-card">
          <header className="border-b bg-muted/20 px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {selectedTopic.category === "role"
                  ? t("navigation.userGuides")
                  : t("navigation.operations")}
              </Badge>
              {selectedTopic.id === roleTopicId ? (
                <Badge variant="outline">{t("currentRole")}</Badge>
              ) : null}
              {selectedTopic.preview ? (
                <Badge variant="outline" className="border-amber-500/35 text-amber-700 dark:text-amber-300">
                  {t("preview")}
                </Badge>
              ) : null}
            </div>
          </header>
          <MarkdownDocument body={selectedTopic.body} projectId={projectId} />
        </article>
      </div>
    </div>
  );
}
