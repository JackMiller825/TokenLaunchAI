"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { z } from "zod";
import { Gate, PageIntro, api, useInvalidate } from "@/components/desk";

const schema = z.object({
  name: z.string().min(2),
  value: z.coerce.number(),
  unit: z.string().min(1),
  kind: z.enum(["MEASURED", "IMPORTED", "ESTIMATED", "UNAVAILABLE"]),
  recordedAt: z.string().min(4),
  source: z.string().min(2),
  notes: z.string().optional(),
});

export default function AnalyticsPage() {
  const invalidate = useInvalidate();
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "Telegram joins",
      unit: "people",
      kind: "IMPORTED" as const,
      recordedAt: new Date().toISOString().slice(0, 16),
      source: "Manual import",
      notes: "",
      value: 0,
    },
  });
  return (
    <Gate>
      {(data, projectId) => {
        const chart = data.metrics
          .filter((metric) => metric.value != null)
          .map((metric) => ({ time: new Date(metric.recordedAt).toLocaleDateString(), value: metric.value, name: metric.name }));
        const spend = data.metrics.filter((metric) => /spend/i.test(metric.name)).reduce((sum, metric) => sum + (metric.value || 0), 0);
        return (
          <div>
            <PageIntro
              eyebrow="Measured, imported, estimated"
              title="Performance"
              text="Charts use only rows you store. Advertising is not described as the cause of on-chain buys."
            />
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <article className="panel p-4">
                <p className="text-xs text-muted">Recorded spend</p>
                <p className="text-2xl">${spend.toLocaleString()}</p>
              </article>
              <article className="panel p-4">
                <p className="text-xs text-muted">Metric rows</p>
                <p className="text-2xl">{data.metrics.length}</p>
              </article>
              <article className="panel p-4">
                <p className="text-xs text-muted">Measured rows</p>
                <p className="text-2xl">{data.metrics.filter((metric) => metric.kind === "MEASURED").length}</p>
              </article>
            </div>
            <section className="panel h-72 p-4">
              {chart.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart}>
                    <CartesianGrid stroke="rgba(148,163,184,0.15)" />
                    <XAxis dataKey="time" stroke="#93a4bd" />
                    <YAxis stroke="#93a4bd" />
                    <Tooltip />
                    <Line dataKey="value" stroke="#60a5fa" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted">No numeric metrics yet. Import a row below. Empty is not zero performance.</p>
              )}
            </section>
            <form
              className="panel mt-4 grid gap-2 p-4 md:grid-cols-3"
              onSubmit={form.handleSubmit((values) =>
                api(`/api/projects/${projectId}/metrics`, { method: "POST", body: JSON.stringify(values) })
                  .then(() => {
                    toast.success("Metric stored with its source.");
                    invalidate();
                  })
                  .catch((error) => toast.error(error.message)),
              )}
            >
              <input className="field" placeholder="Name" {...form.register("name")} />
              <input className="field" type="number" step="0.01" {...form.register("value")} />
              <input className="field" placeholder="Unit" {...form.register("unit")} />
              <select className="field" {...form.register("kind")}>
                <option>MEASURED</option>
                <option>IMPORTED</option>
                <option>ESTIMATED</option>
                <option>UNAVAILABLE</option>
              </select>
              <input className="field" type="datetime-local" {...form.register("recordedAt")} />
              <input className="field" placeholder="Source" {...form.register("source")} />
              <input className="field md:col-span-2" placeholder="Notes" {...form.register("notes")} />
              <button className="btn btn-primary">Add metric</button>
            </form>
            <a className="btn btn-ghost mt-4" href={`/api/projects/${projectId}/metrics?format=csv`}>
              Export CSV
            </a>
            <div className="table-wrap panel mt-4">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Name</th>
                    <th>Value</th>
                    <th>Kind</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {data.metrics.map((metric) => (
                    <tr key={metric.id}>
                      <td>{new Date(metric.recordedAt).toLocaleString()}</td>
                      <td>{metric.name}</td>
                      <td>
                        {metric.value ?? "Unavailable"} {metric.unit}
                      </td>
                      <td>{metric.kind}</td>
                      <td>{metric.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      }}
    </Gate>
  );
}
