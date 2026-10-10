"use client";

import { toast } from "sonner";
import { Gate, PageIntro, api, useInvalidate } from "@/components/desk";

const KINDS = [
  "Token Research Report",
  "Advertising Strategy",
  "Pre-Launch Preparation Checklist",
  "Telegram Sponsorship Shortlist",
  "Promotional Copy Pack",
  "Launch Schedule",
  "Budget Plan",
  "Post-Launch Performance Report",
];

export default function ReportsPage() {
  const invalidate = useInvalidate();
  return (
    <Gate>
      {(data, projectId) => (
        <div>
          <PageIntro
            eyebrow="Exports"
            title="Reports"
            text="Exports use stored facts, drafts, and metrics. Missing sections stay missing."
          />
          <div className="grid gap-3 md:grid-cols-2">
            {KINDS.map((kind) => (
              <button
                key={kind}
                className="panel p-4 text-left"
                onClick={() =>
                  api(`/api/projects/${projectId}/reports`, { method: "POST", body: JSON.stringify({ kind }) }).then(() => {
                    toast.success("Report generated.");
                    invalidate();
                  })
                }
              >
                {kind}
              </button>
            ))}
          </div>
          <ul className="mt-4 space-y-2">
            {data.reports.map((report) => (
              <li key={report.id} className="panel flex flex-wrap items-center justify-between gap-2 p-3">
                <span>
                  {report.title}
                  <span className="block text-xs text-muted">{new Date(report.createdAt).toLocaleString()}</span>
                </span>
                <span className="flex gap-2">
                  <a className="btn btn-ghost" href={`/api/projects/${projectId}/reports?reportId=${report.id}&format=md`}>
                    Markdown
                  </a>
                  <a className="btn btn-ghost" href={`/api/projects/${projectId}/reports?reportId=${report.id}&format=json`}>
                    JSON
                  </a>
                  <a className="btn btn-ghost" href={`/api/projects/${projectId}/reports?reportId=${report.id}&format=pdf`}>
                    PDF
                  </a>
                  <a className="btn btn-ghost" href={`/api/projects/${projectId}/reports?reportId=${report.id}&format=csv`}>
                    CSV
                  </a>
                </span>
              </li>
            ))}
          </ul>
          <a className="btn btn-teal mt-4" href={`/api/projects/${projectId}/assets-export`}>
            Creative ZIP
          </a>
        </div>
      )}
    </Gate>
  );
}
