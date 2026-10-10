"use client";

import Link from "next/link";
import { FACT_STATUS, Gate, PageIntro, show } from "@/components/desk";

export default function DashboardPage() {
  return (
    <Gate>
      {(data) => {
        const blockers = data.readiness.filter((item) => item.status === "blocked");
        const next = blockers[0] || data.readiness.find((item) => item.status === "incomplete");
        const verified = data.facts.filter((fact) => fact.status === "VERIFIED").length;
        const launch = data.project.launchAt ? new Date(data.project.launchAt).getTime() - Date.now() : null;
        return (
          <div>
            <PageIntro
              eyebrow="Command center"
              title={data.project.name}
              text={data.profile?.tagline || data.profile?.description || "Research is stored against the website you analyzed."}
            />
            <div className="grid gap-4 md:grid-cols-4">
              <Stat
                label="Preparation"
                value={`${data.readinessScore}%`}
                note="Completed applicable checklist items. Not a trading forecast."
              />
              <Stat
                label="Verified facts"
                value={`${verified}/${data.facts.length || 0}`}
                note="The rest are reported, missing, or waiting on you."
              />
              <Stat
                label="Budget"
                value={`$${Number(data.project.budgetUsd).toLocaleString()}`}
                note="Planning cap. Nothing is spent from this screen."
              />
              <Stat
                label="Launch"
                value={launch == null ? "Unscheduled" : formatDistance(launch)}
                note={data.project.launchAt || "Set a launch time to place tasks."}
              />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <section className="panel p-5">
                <h2 className="text-lg text-white">Next recommended action</h2>
                <p className="mt-2">{next ? next.label : "No open preparation item."}</p>
                <p className="mt-1 text-sm text-muted">
                  {next?.notes || "Review the readiness board."} Owner: {next?.owner || "Unassigned"}
                </p>
                <Link className="btn btn-primary mt-4" href="/readiness">
                  Open readiness
                </Link>
                {blockers.length ? (
                  <ul className="mt-4 space-y-1 text-sm text-warning">
                    {blockers.map((item) => (
                      <li key={item.key}>{item.label}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
              <section className="panel p-5">
                <h2 className="text-lg text-white">Claim snapshot</h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {data.facts.slice(0, 8).map((fact) => (
                    <li key={fact.id} className="flex justify-between gap-3 border-b border-border py-1">
                      <span>{fact.label}</span>
                      <span className="text-right text-muted">
                        {show(fact.value)} · {FACT_STATUS[fact.status] || fact.status}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link className="chip mt-3" href="/analyzer">
                  Edit the research report
                </Link>
              </section>
            </div>
            <section className="panel mt-4 p-5">
              <h2 className="text-lg text-white">Advertising candidates</h2>
              <p className="text-sm text-muted">
                Prices stay unknown until a quote is entered. Subscriber counts appear only when a public preview provided them.
              </p>
              <div className="table-wrap mt-3">
                <table>
                  <thead>
                    <tr>
                      <th>Channel</th>
                      <th>Subscribers</th>
                      <th>Views</th>
                      <th>Price</th>
                      <th>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.opportunities.slice(0, 5).map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{show(item.subscribers)}</td>
                        <td>{show(item.averageViews)}</td>
                        <td>{item.priceUsd == null ? "Unknown" : `$${item.priceUsd}`}</td>
                        <td>{item.rankConfidence == null ? "Unknown" : `${Math.round(item.rankConfidence * 100)}%`}</td>
                      </tr>
                    ))}
                    {!data.opportunities.length ? (
                      <tr>
                        <td colSpan={5}>No candidates stored yet.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        );
      }}
    </Gate>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="panel p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-2xl text-white">{value}</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </article>
  );
}

function formatDistance(ms: number) {
  const hours = Math.round(ms / 3_600_000);
  if (hours >= 0) return `${hours}h to launch`;
  return `${Math.abs(hours)}h after launch`;
}
