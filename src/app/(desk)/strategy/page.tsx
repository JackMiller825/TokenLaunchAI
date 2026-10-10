"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Gate, PageIntro, api, useInvalidate } from "@/components/desk";

export default function StrategyPage() {
  return <Gate>{(data, projectId) => <StrategyBody data={data} projectId={projectId} />}</Gate>;
}

function StrategyBody({ data, projectId }: { data: Parameters<Parameters<typeof Gate>[0]["children"]>[0]; projectId: string }) {
  const plan = data.project.budgetPlan;
  const strategy = data.strategy?.content;
  const invalidate = useInvalidate();
  const [percents, setPercents] = useState(plan?.items.map((item) => item.percent) || []);
  if (!strategy) return <p className="text-muted">No strategy yet. Analyze a website first.</p>;
  return (
    <div>
      <PageIntro
        eyebrow={data.strategy?.generator === "openai" ? `OpenAI ${data.strategy.model || ""}` : "Rule-based draft"}
        title="Advertising strategy"
        text="Built from the stored token profile, your budget, and the launch window. It does not promise buyers."
      />
      {data.strategy?.warnings?.length ? <p className="mb-3 text-sm text-warning">{data.strategy.warnings.join(" ")}</p> : null}
      <section className="panel p-5">
        <h2 className="text-xl text-white">Executive summary</h2>
        <p className="mt-2">{strategy.executive.objective}</p>
        <p className="mt-2 text-sm text-muted">{strategy.executive.positioning}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Info label="Audience" text={strategy.executive.audience} />
          <Info label="Timeline" text={strategy.executive.timeline} />
          <Info label="Budget" text={strategy.executive.budget} />
          <Info label="Channels" text={strategy.executive.channels.join(", ")} />
        </div>
        <ul className="mt-4 list-disc pl-5 text-sm text-muted">
          {strategy.executive.successMetrics.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section className="mt-4 grid gap-3">
        {strategy.prelaunch.map((stage) => (
          <article key={stage.offsetHours} className="panel p-4">
            <h3 className="text-white">{stage.offsetHours} hours before launch</h3>
            <p className="mt-1 text-sm">{stage.goal}</p>
            <p className="mt-2 text-xs text-muted">
              {stage.channel} · {stage.owner} · KPI: {stage.kpi}
            </p>
            <p className="mt-2 text-sm text-muted">{stage.suggestedPost}</p>
            <p className="mt-1 text-xs text-muted">Visual: {stage.visualAsset}</p>
          </article>
        ))}
      </section>
      <section className="mt-4 grid gap-3 md:grid-cols-2">
        {strategy.launch.map((item) => (
          <article key={item.channel} className="panel p-4">
            <h3 className="text-white">{item.channel}</h3>
            <p className="mt-2 text-sm">{item.message}</p>
            <p className="mt-2 text-xs text-warning">Needs confirmation: {item.requiresConfirmation.join(", ")}</p>
          </article>
        ))}
      </section>
      <section className="panel mt-4 p-5">
        <h2 className="text-lg text-white">After launch</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {strategy.postlaunch.map((item) => (
            <div key={item.theme}>
              <h3 className="text-white">{item.theme}</h3>
              <ul className="mt-1 list-disc pl-4 text-sm text-muted">
                {item.actions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
      <section className="panel mt-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg text-white">Budget allocation</h2>
          <button
            className="btn btn-ghost"
            onClick={() =>
              api(`/api/projects/${projectId}/budget`, { method: "POST", body: JSON.stringify({ reoptimize: true }) }).then(() => {
                toast.success("Budget rechecked against measured cost per subscriber.");
                invalidate();
              })
            }
          >
            Re-optimize budget
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {plan?.items.map((item, index) => (
            <label key={item.key} className="grid items-center gap-3 md:grid-cols-[1.4fr_120px_100px]">
              <span>{item.label}</span>
              <input
                className="field"
                type="number"
                value={percents[index] ?? item.percent}
                onChange={(event) =>
                  setPercents((current) => current.map((value, itemIndex) => (itemIndex === index ? Number(event.target.value) : value)))
                }
              />
              <span className="text-sm text-muted">${item.amount.toLocaleString()}</span>
            </label>
          ))}
        </div>
        <button
          className="btn btn-primary mt-4"
          onClick={() =>
            api(`/api/projects/${projectId}/budget`, {
              method: "POST",
              body: JSON.stringify({
                percents: plan?.items.map((item, index) => ({ key: item.key, percent: percents[index] ?? item.percent })),
              }),
            })
              .then(() => {
                toast.success("Budget saved.");
                invalidate();
              })
              .catch((error) => toast.error(error.message))
          }
        >
          Save percents
        </button>
        <ul className="mt-3 list-disc pl-5 text-xs text-muted">
          {plan?.assumptions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section className="mt-4 grid gap-3 md:grid-cols-2">
        {strategy.risks.map((risk) => (
          <article key={risk.area} className="panel p-4">
            <h3 className="text-white">{risk.area}</h3>
            <p className="mt-1 text-sm">{risk.assessment}</p>
            <p className="mt-2 text-xs text-teal">{risk.mitigation}</p>
          </article>
        ))}
      </section>
    </div>
  );
}

function Info({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-xs uppercase text-muted">{label}</p>
      <p className="mt-1 text-sm">{text}</p>
    </div>
  );
}
