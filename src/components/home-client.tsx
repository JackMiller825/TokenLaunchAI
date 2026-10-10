"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "./desk";

const schema = z.object({
  url: z.string().trim().min(4, "Enter the token website URL."),
  blockchain: z.string().trim().min(2),
  launchAt: z.string().optional(),
  budgetUsd: z.number().min(0).max(10_000_000),
  audience: z.string().optional(),
  languages: z.string().optional(),
  countries: z.string().optional(),
  durationHoursBefore: z.number().int().min(0).max(720),
  durationHoursAfter: z.number().int().min(0).max(720),
  telegramTarget: z.string().optional(),
  objectives: z.string().optional(),
  telegram: z.boolean(),
  x: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export function HomeClient() {
  const router = useRouter();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      url: "https://elonerd.site/",
      blockchain: "Ethereum mainnet",
      budgetUsd: 500,
      durationHoursBefore: 48,
      durationHoursAfter: 24,
      languages: "en",
      audience: "Ethereum meme-token readers",
      telegram: true,
      x: true,
    },
  });

  async function onSubmit(values: FormValues) {
    const channels = [values.telegram ? "telegram" : null, values.x ? "x" : null].filter((item): item is string => Boolean(item));
    if (!channels.length) {
      toast.error("Choose at least one channel.");
      return;
    }
    const result = await api("/api/analyze", {
      method: "POST",
      body: JSON.stringify({
        url: values.url,
        blockchain: values.blockchain,
        launchAt: values.launchAt || null,
        budgetUsd: values.budgetUsd,
        audiences: values.audience ? [values.audience] : [],
        languages: values.languages
          ? values.languages
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          : ["en"],
        countries: values.countries
          ? values.countries
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          : [],
        durationHoursBefore: values.durationHoursBefore,
        durationHoursAfter: values.durationHoursAfter,
        channels,
        telegramTarget: values.telegramTarget || null,
        objectives: values.objectives || null,
      }),
    });
    await api("/api/active-project", { method: "POST", body: JSON.stringify({ projectId: result.projectId }) });
    router.push(`/analyzer?scan=${result.scanId}`);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:py-14">
      <header className="mb-10 flex items-center justify-between">
        <p className="font-semibold tracking-tight">TokenLaunch AI</p>
        <Link href="/dashboard" className="chip">
          Open desk
        </Link>
      </header>
      <div className="grid items-start gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal">Telegram-first launch desk</p>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-5xl leading-tight text-white md:text-6xl">
            Launch Your Next Token With a Research-Driven Marketing Plan
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            Paste a token website. The desk crawls public pages, keeps every claim attached to a source, and drafts a Telegram plan you can
            edit before anything is published or spent.
          </p>
          <dl className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              ["Evidence", "Missing contracts stay missing. LP burn claims stay unverified."],
              ["Telegram", "Public channel research, copy, and an opt-in bot when you connect one."],
              ["Approval", "Spend, outreach, and broadcasts wait for an owner."],
            ].map(([title, text]) => (
              <div key={title} className="panel p-4">
                <dt className="font-semibold text-white">{title}</dt>
                <dd className="mt-1 text-sm text-muted">{text}</dd>
              </div>
            ))}
          </dl>
        </div>
        <form className="panel p-5" onSubmit={form.handleSubmit((values) => onSubmit(values).catch((error) => toast.error(error.message)))}>
          <label className="text-sm text-muted" htmlFor="url">
            Enter your token website URL
          </label>
          <input id="url" className="field mt-2" placeholder="https://elonerd.site/" {...form.register("url")} />
          {form.formState.errors.url ? <p className="mt-1 text-sm text-danger">{form.formState.errors.url.message}</p> : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-muted">
              Blockchain
              <input className="field mt-1" {...form.register("blockchain")} />
            </label>
            <label className="text-sm text-muted">
              Launch date and time
              <input className="field mt-1" type="datetime-local" {...form.register("launchAt")} />
            </label>
            <label className="text-sm text-muted">
              Advertising budget (USD)
              <input className="field mt-1" type="number" min={0} {...form.register("budgetUsd", { valueAsNumber: true })} />
            </label>
            <label className="text-sm text-muted">
              Primary audience
              <input className="field mt-1" {...form.register("audience")} />
            </label>
            <label className="text-sm text-muted">
              Languages
              <input className="field mt-1" {...form.register("languages")} />
            </label>
            <label className="text-sm text-muted">
              Countries
              <input className="field mt-1" {...form.register("countries")} />
            </label>
            <label className="text-sm text-muted">
              Hours before launch
              <input className="field mt-1" type="number" {...form.register("durationHoursBefore", { valueAsNumber: true })} />
            </label>
            <label className="text-sm text-muted">
              Hours after launch
              <input className="field mt-1" type="number" {...form.register("durationHoursAfter", { valueAsNumber: true })} />
            </label>
          </div>
          <label className="mt-3 block text-sm text-muted">
            Existing Telegram
            <input className="field mt-1" placeholder="https://t.me/…" {...form.register("telegramTarget")} />
          </label>
          <label className="mt-3 block text-sm text-muted">
            Campaign objective
            <textarea className="field mt-1 min-h-20" {...form.register("objectives")} />
          </label>
          <div className="mt-3 flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" {...form.register("telegram")} /> Telegram
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" {...form.register("x")} /> X
            </label>
          </div>
          <button className="btn btn-primary mt-5 w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Starting research…" : "Analyze Website & Build Advertising Plan"}
          </button>
          <p className="mt-3 text-xs text-muted">
            Defaults: Ethereum mainnet, Telegram first, X second, USD, 48 hours before through 24 hours after. The category is detected from
            the site, not assumed.
          </p>
        </form>
      </div>
      <ol className="mt-12 grid gap-3 md:grid-cols-3">
        {[
          "Validating website",
          "Crawling pages",
          "Extracting project details",
          "Finding social communities",
          "Verifying token information",
          "Researching target audiences",
          "Finding advertising opportunities",
          "Developing marketing strategy",
          "Preparing promotional content",
          "Building campaign schedule",
          "Validating final report",
          "Analysis complete",
        ].map((step, index) => (
          <li key={step} className="panel px-4 py-3 text-sm">
            <span className="text-teal">{index + 1}.</span> {step}
          </li>
        ))}
      </ol>
    </div>
  );
}
