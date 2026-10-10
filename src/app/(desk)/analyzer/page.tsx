"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { FACT_STATUS, Fact, Gate, PageIntro, api, useInvalidate } from "@/components/desk";

function AnalyzerInner() {
  const params = useSearchParams();
  const scanId = params.get("scan");
  const [scan, setScan] = useState<{
    status: string;
    progress: number;
    stageLabel: string;
    error?: string;
    summary?: { logs?: string[] };
    facts?: { label: string; value: string | null; status: string }[];
    projectId?: string;
  } | null>(null);
  const client = useQueryClient();

  useEffect(() => {
    if (!scanId) return;
    const source = new EventSource(`/api/scans/${scanId}/events`);
    source.onmessage = (event) => {
      const body = JSON.parse(event.data);
      setScan(body);
      if (["COMPLETED", "FAILED", "CANCELLED"].includes(body.status)) {
        source.close();
        void client.invalidateQueries();
        if (body.status === "COMPLETED" && body.projectId) window.location.assign("/dashboard");
      }
    };
    source.onerror = () => source.close();
    return () => source.close();
  }, [scanId, client]);

  return (
    <div>
      <PageIntro
        eyebrow="Research"
        title="Website analyzer"
        text="Every row keeps the extracted value, your correction, the source, and a status. Accepting a row does not turn a website claim into on-chain proof."
      />
      {scan ? (
        <section className="panel mb-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted">
                {scan.stageLabel} · {scan.status}
              </p>
              <p className="text-2xl text-white">{scan.progress}%</p>
            </div>
            {scan.status === "RUNNING" || scan.status === "QUEUED" ? (
              <button className="btn btn-ghost" onClick={() => fetch(`/api/scans/${scanId}/cancel`, { method: "POST" })}>
                Cancel
              </button>
            ) : null}
            {scan.status === "FAILED" || scan.status === "CANCELLED" ? (
              <button
                className="btn btn-primary"
                onClick={() =>
                  fetch(`/api/scans/${scanId}/retry`, { method: "POST" })
                    .then((response) => response.json())
                    .then((body) => window.location.assign(`/analyzer?scan=${body.scanId}`))
                }
              >
                Retry
              </button>
            ) : null}
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-gradient-to-r from-primary to-violet" style={{ width: `${scan.progress}%` }} />
          </div>
          {scan.error ? <p className="mt-2 text-sm text-danger">{scan.error}</p> : null}
          <ul className="mt-3 max-h-40 space-y-1 overflow-auto text-xs text-muted">
            {scan.summary?.logs?.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <Gate>
        {(data, projectId) => (
          <div className="table-wrap panel">
            <table>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Value</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.facts.map((fact) => (
                  <FactRow key={fact.id} fact={fact} projectId={projectId} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Gate>
    </div>
  );
}

function FactRow({ fact, projectId }: { fact: Fact; projectId: string }) {
  const [value, setValue] = useState(fact.value || "");
  const invalidate = useInvalidate();
  async function save(extra: Record<string, unknown>) {
    await api(`/api/projects/${projectId}/facts/${fact.id}`, { method: "PATCH", body: JSON.stringify({ value, ...extra }) });
    toast.success("Saved. The original extraction is kept.");
    invalidate();
  }
  return (
    <tr>
      <td>
        <div className="font-medium">{fact.label}</div>
        <div className="text-xs text-muted">{fact.excerpt}</div>
        {fact.conflictNotes ? <div className="text-xs text-warning">{fact.conflictNotes}</div> : null}
        {fact.originalValue && fact.originalValue !== fact.value ? (
          <div className="text-xs text-muted">Original: {fact.originalValue}</div>
        ) : null}
      </td>
      <td>
        <input className="field min-w-48" value={value} onChange={(event) => setValue(event.target.value)} />
      </td>
      <td>
        <span className="chip">{FACT_STATUS[fact.status] || fact.status}</span>
        <div className="mt-1 text-xs text-muted">{Math.round(fact.confidence * 100)}% confidence</div>
      </td>
      <td className="max-w-48 text-xs">
        {fact.sourceUrl ? (
          <a className="text-primary" href={fact.sourceUrl} target="_blank" rel="noreferrer">
            {fact.sourceType}
          </a>
        ) : (
          "No source"
        )}
      </td>
      <td className="space-y-1">
        <button
          className="btn btn-teal px-2 py-1 text-xs"
          onClick={() => save({ accepted: true }).catch((error) => toast.error(error.message))}
        >
          Accept
        </button>
        <button
          className="btn btn-ghost px-2 py-1 text-xs"
          onClick={() => save({ accepted: true, isPrivate: !fact.isPrivate }).catch((error) => toast.error(error.message))}
        >
          {fact.isPrivate ? "Unhide" : "Mark private"}
        </button>
      </td>
    </tr>
  );
}

export default function AnalyzerPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading analyzer…</p>}>
      <AnalyzerInner />
    </Suspense>
  );
}
