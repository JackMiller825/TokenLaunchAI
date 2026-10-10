"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Gate, PageIntro, api, show, useInvalidate } from "@/components/desk";

const STATUSES = ["DISCOVERED", "RESEARCHING", "CONTACTED", "QUOTED", "APPROVED", "BOOKED", "PUBLISHED", "REVIEWED"];

export default function DiscoveryPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [savedOnly, setSavedOnly] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const [joins, setJoins] = useState("");
  return (
    <Gate>
      {(data, projectId) => {
        const rows = data.opportunities.filter((item) => {
          const hay = `${item.name} ${item.category} ${item.language}`.toLowerCase();
          if (query && !hay.includes(query.toLowerCase())) return false;
          if (status !== "all" && item.status !== status) return false;
          if (savedOnly && !item.saved) return false;
          return true;
        });
        const selected = data.opportunities.filter((item) => compare.includes(item.id));
        return (
          <div>
            <PageIntro
              eyebrow="Public sources"
              title="Advertising discovery"
              text="Candidates come from public Telegram previews, the project site, and CSV imports. Unknown metrics stay unknown."
            />
            <div className="mb-3 flex flex-wrap gap-2">
              <input
                className="field max-w-xs"
                placeholder="Search channels"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <select className="field max-w-48" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="all">All statuses</option>
                {STATUSES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={savedOnly} onChange={(event) => setSavedOnly(event.target.checked)} /> Saved
              </label>
              <button
                className="btn btn-primary"
                onClick={() =>
                  api(`/api/projects/${projectId}/discover`, { method: "POST", body: "{}" })
                    .then(() => toast.success("Discovery refreshed from public previews."))
                    .catch((error) => toast.error(error.message))
                }
              >
                Refresh public previews
              </button>
              <a className="btn btn-ghost" href={`/api/projects/${projectId}/opportunities?format=csv`}>
                Export CSV
              </a>
              <label className="btn btn-ghost">
                Import CSV
                <input
                  className="hidden"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    file
                      .text()
                      .then((csv) =>
                        fetch(`/api/projects/${projectId}/import`, { method: "POST", body: csv }).then(async (response) => {
                          const body = await response.json();
                          if (!response.ok) throw new Error(body.error);
                          toast.success(`Imported ${body.created} row(s).`);
                          window.location.reload();
                        }),
                      )
                      .catch((error) => toast.error(error.message));
                  }}
                />
              </label>
            </div>
            <div className="table-wrap panel">
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>Channel</th>
                    <th>Category</th>
                    <th>Language</th>
                    <th>Subscribers</th>
                    <th>Views</th>
                    <th>Engagement</th>
                    <th>Contact</th>
                    <th>Price</th>
                    <th>CPM</th>
                    <th>Relevance</th>
                    <th>Freshness</th>
                    <th>Risks</th>
                    <th>Next step</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={compare.includes(item.id)}
                          onChange={() =>
                            setCompare((current) =>
                              current.includes(item.id) ? current.filter((id) => id !== item.id) : current.slice(-2).concat(item.id),
                            )
                          }
                        />
                      </td>
                      <td>
                        <a className="text-primary" href={item.telegramUrl || item.sourceUrl || "#"} target="_blank" rel="noreferrer">
                          {item.name}
                        </a>
                        <div className="text-xs text-muted">{item.sourceLabel}</div>
                      </td>
                      <td>{show(item.category)}</td>
                      <td>{show(item.language)}</td>
                      <td>{show(item.subscribers)}</td>
                      <td>{show(item.averageViews)}</td>
                      <td>{item.engagement == null ? "Unknown" : item.engagement}</td>
                      <td>{show(item.contact)}</td>
                      <td>{item.priceUsd == null ? "Unknown" : `$${item.priceUsd}`}</td>
                      <td>{item.cpmUsd == null ? "Unknown" : `$${item.cpmUsd.toFixed(2)}`}</td>
                      <td>{item.relevance == null ? "Unknown" : `${Math.round(item.relevance * 100)}%`}</td>
                      <td className="text-xs">{item.freshness ? new Date(item.freshness).toLocaleString() : "Unknown"}</td>
                      <td className="max-w-40 text-xs">{item.riskFlags.join("; ") || "None flagged"}</td>
                      <td className="max-w-56 text-xs">
                        {item.recommendation}
                        <button
                          className="btn btn-ghost mt-1 px-2 py-1 text-xs"
                          onClick={() =>
                            api(`/api/projects/${projectId}/opportunities/${item.id}`, {
                              method: "PATCH",
                              body: JSON.stringify({ saved: !item.saved }),
                            }).then(() => window.location.reload())
                          }
                        >
                          {item.saved ? "Unsave" : "Save"}
                        </button>
                      </td>
                      <td>
                        <select
                          className="field py-1"
                          value={item.status}
                          onChange={(event) =>
                            api(`/api/projects/${projectId}/opportunities/${item.id}`, {
                              method: "PATCH",
                              body: JSON.stringify({ status: event.target.value }),
                            })
                              .then(() => window.location.reload())
                              .catch((error) => toast.error(error.message))
                          }
                        >
                          {STATUSES.map((value) => (
                            <option key={value}>{value}</option>
                          ))}
                        </select>
                        <QuoteForm projectId={projectId} opportunityId={item.id} />
                      </td>
                    </tr>
                  ))}
                  {!rows.length ? (
                    <tr>
                      <td colSpan={15}>No candidates match. Refresh previews or import a CSV with channel and url columns.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {selected.length ? (
              <section className="mt-4 grid gap-3 md:grid-cols-3">
                {selected.map((item) => (
                  <article key={item.id} className="panel p-4 text-sm">
                    <h3 className="text-white">{item.name}</h3>
                    <p className="mt-2 text-muted">{item.rankExplanation}</p>
                    <p className="mt-2">{item.relevanceNotes}</p>
                    <label className="mt-3 block text-xs">
                      Assumed joins per 1,000 views
                      <input className="field mt-1" value={joins} onChange={(event) => setJoins(event.target.value)} />
                    </label>
                    <Scenario price={item.priceUsd} views={item.averageViews} joins={Number(joins)} />
                  </article>
                ))}
              </section>
            ) : null}
          </div>
        );
      }}
    </Gate>
  );
}

function QuoteForm({ projectId, opportunityId }: { projectId: string; opportunityId: string }) {
  const [price, setPrice] = useState("");
  const [contact, setContact] = useState("");
  const invalidate = useInvalidate();
  return (
    <form
      className="mt-2 space-y-1"
      onSubmit={(event) => {
        event.preventDefault();
        api(`/api/projects/${projectId}/quotes/${opportunityId}`, {
          method: "POST",
          body: JSON.stringify({ priceUsd: Number(price), contact }),
        })
          .then(() => {
            toast.success("Quote stored as an operator entry.");
            invalidate();
          })
          .catch((error) => toast.error(error.message));
      }}
    >
      <input className="field py-1" placeholder="Quoted USD" value={price} onChange={(event) => setPrice(event.target.value)} />
      <input className="field py-1" placeholder="Contact" value={contact} onChange={(event) => setContact(event.target.value)} />
      <button className="btn btn-ghost px-2 py-1 text-xs">Save quote</button>
    </form>
  );
}

function Scenario({ price, views, joins }: { price: number | null; views: number | null; joins: number }) {
  const text = useMemo(() => {
    if (views == null) return "Impressions: unknown. Average views were not observed.";
    if (price == null || !joins)
      return `Observed-view band: ${Math.round(views * 0.5).toLocaleString()} – ${Math.round(views * 1.2).toLocaleString()}. Cost per subscriber stays unknown until you enter both a quote and a join assumption.`;
    const estimatedJoins = (views / 1000) * joins;
    return `If ${joins} joins per 1,000 views held, cost per subscriber would be about $${(price / estimatedJoins).toFixed(2)}. That rate is your assumption, not a result.`;
  }, [price, views, joins]);
  return <p className="mt-2 text-xs text-muted">{text}</p>;
}
