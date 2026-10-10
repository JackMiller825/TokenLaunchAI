"use client";

import { toast } from "sonner";
import { Gate, PageIntro, api } from "@/components/desk";

export default function CreativePage() {
  return (
    <Gate>
      {(data, projectId) => (
        <div>
          <PageIntro
            eyebrow="Assets"
            title="Creative studio"
            text="Extracted images stay linked to their source. Prompts are labeled as prompts. No image is shown as generated unless a provider actually returned one."
          />
          <a className="btn btn-primary mb-4" href={`/api/projects/${projectId}/assets-export`}>
            Download ZIP
          </a>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.assets.map((asset) => (
              <article key={asset.id} className="panel overflow-hidden">
                {asset.previewUrl && asset.availability === "extracted" ? (
                  // Project sites are arbitrary origins, so the file is shown directly.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={asset.previewUrl} alt={asset.usage || asset.role} className="h-44 w-full bg-black/30 object-contain" />
                ) : (
                  <div className="flex h-44 items-center justify-center bg-black/30 p-4 text-sm text-muted">
                    {asset.availability === "prompt_only" ? "Prompt only — no image generated" : "No preview"}
                  </div>
                )}
                <div className="space-y-1 p-4 text-sm">
                  <h2 className="text-white">{asset.role}</h2>
                  <p>{asset.usage}</p>
                  <p className="text-xs text-muted">
                    {asset.width && asset.height ? `${asset.width}×${asset.height}` : "Dimensions unknown"} ·{" "}
                    {asset.mimeType || "type unknown"} · {asset.bytes ? `${asset.bytes} bytes` : "size unknown"}
                  </p>
                  <p className="text-xs text-warning">{asset.qualityNotes}</p>
                  {asset.prompt ? <p className="text-xs text-muted">{asset.prompt}</p> : null}
                  {asset.sourceUrl ? (
                    <a className="text-xs text-primary" href={asset.sourceUrl} target="_blank" rel="noreferrer">
                      Source
                    </a>
                  ) : null}
                  <div className="flex gap-2 pt-2">
                    <button
                      className="btn btn-ghost px-2 py-1 text-xs"
                      onClick={() =>
                        api(`/api/projects/${projectId}/assets/${asset.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ approved: !asset.approved }),
                        }).then(() => toast.success(asset.approved ? "Approval removed." : "Asset approved for use in this desk."))
                      }
                    >
                      {asset.approved ? "Approved" : "Approve"}
                    </button>
                    {asset.previewUrl ? (
                      <a className="btn btn-ghost px-2 py-1 text-xs" href={asset.previewUrl} download>
                        Open file
                      </a>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
          {!data.assets.length ? <p className="text-muted">No assets yet. Analyze a website to collect images and prompts.</p> : null}
        </div>
      )}
    </Gate>
  );
}
