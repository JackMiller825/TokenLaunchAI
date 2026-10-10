"use client";

import { Gate, PageIntro, api, useInvalidate } from "@/components/desk";

export default function ReadinessPage() {
  const invalidate = useInvalidate();
  return (
    <Gate>
      {(data, projectId) => {
        const blockers = data.readiness.filter((item) => item.status === "blocked");
        const next = blockers[0] || data.readiness.find((item) => item.status === "incomplete");
        const groups = [...new Set(data.readiness.map((item) => item.category))];
        return (
          <div>
            <PageIntro
              eyebrow="Preparation score"
              title={`${data.readinessScore}% ready`}
              text="This measures checklist completion. It is not a prediction of trading success."
            />
            <section className="panel mb-4 p-4">
              <p className="text-sm text-muted">Next: {next ? `${next.label} — ${next.owner || "unassigned"}` : "Nothing incomplete."}</p>
              {blockers.length ? (
                <p className="mt-2 text-sm text-warning">Blockers: {blockers.map((item) => item.label).join(", ")}</p>
              ) : (
                <p className="mt-2 text-sm text-ok">No blockers.</p>
              )}
            </section>
            {groups.map((group) => (
              <section key={group} className="mb-4">
                <h2 className="mb-2 text-white">{group}</h2>
                <div className="space-y-2">
                  {data.readiness
                    .filter((item) => item.category === group)
                    .map((item) => (
                      <article key={item.key} className="panel flex flex-wrap items-center justify-between gap-3 p-3">
                        <div>
                          <h3>{item.label}</h3>
                          <p className="text-xs text-muted">
                            {item.notes} · {item.owner}
                          </p>
                        </div>
                        <select
                          className="field max-w-40 py-1"
                          value={item.status}
                          onChange={(event) =>
                            api(`/api/projects/${projectId}/readiness/${item.key}`, {
                              method: "PATCH",
                              body: JSON.stringify({ status: event.target.value }),
                            }).then(() => invalidate())
                          }
                        >
                          {["complete", "incomplete", "blocked", "warning"].map((status) => (
                            <option key={status}>{status}</option>
                          ))}
                        </select>
                      </article>
                    ))}
                </div>
              </section>
            ))}
          </div>
        );
      }}
    </Gate>
  );
}
