"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Gate, PageIntro, api, useInvalidate } from "@/components/desk";

const TONES = ["informative", "funny", "professional", "community-focused", "exciting", "cute", "meme-heavy"] as const;

export default function TelegramPage() {
  const [text, setText] = useState("");
  const [destination, setDestination] = useState("");
  const [review, setReview] = useState<Record<string, unknown> | null>(null);
  return (
    <Gate>
      {(data, projectId) => (
        <div>
          <PageIntro
            eyebrow="Telegram"
            title="Growth desk"
            text="Drafts, sponsorship outreach, and the official Telegram Ads planner. Nothing is sent unless you approve it and a bot is connected."
          />
          <section className="panel p-5">
            <h2 className="text-lg text-white">Official Telegram Ads</h2>
            <p className="mt-1 text-sm text-muted">
              160-character sponsored messages. This check does not submit an ad. Direct meme-token investment ads are treated as likely
              ineligible.
            </p>
            <textarea
              className="field mt-3 min-h-28"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Paste or write a sponsored message"
            />
            <p className="mt-1 text-xs text-muted">{[...text].length} / 160</p>
            <input
              className="field mt-2"
              placeholder="https://t.me/yourchannel"
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
            />
            <button
              className="btn btn-primary mt-3"
              onClick={() =>
                api(`/api/projects/${projectId}/ads-check`, { method: "POST", body: JSON.stringify({ text, destination }) })
                  .then(setReview)
                  .catch((error) => toast.error(error.message))
              }
            >
              Check against local rules
            </button>
            {review ? <pre className="mt-3 overflow-auto text-xs text-muted">{JSON.stringify(review, null, 2)}</pre> : null}
          </section>
          <div className="mt-4 grid gap-3">
            {data.drafts.map((draft) => (
              <DraftCard key={draft.id} draft={draft} projectId={projectId} />
            ))}
          </div>
          <Generate projectId={projectId} />
          <p className="mt-4 text-xs text-muted">Tones available when generating: {TONES.join(", ")}.</p>
        </div>
      )}
    </Gate>
  );
}

function DraftCard({
  draft,
  projectId,
}: {
  draft: {
    id: string;
    title: string;
    tone: string;
    body: string;
    warnings: string[];
    footnotes: string[];
    status: string;
    charCount: number;
  };
  projectId: string;
}) {
  const [body, setBody] = useState(draft.body);
  const invalidate = useInvalidate();
  return (
    <article className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-white">{draft.title}</h3>
        <span className="chip">
          {draft.tone} · {draft.status} · {[...body].length} chars
        </span>
      </div>
      <textarea className="field mt-2 min-h-32" value={body} onChange={(event) => setBody(event.target.value)} />
      {draft.warnings.map((warning) => (
        <p key={warning} className="mt-1 text-xs text-warning">
          {warning}
        </p>
      ))}
      {draft.footnotes.map((note) => (
        <p key={note} className="text-xs text-muted">
          {note}
        </p>
      ))}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          className="btn btn-ghost"
          onClick={() => {
            navigator.clipboard.writeText(body);
            toast.success("Copied.");
          }}
        >
          Copy
        </button>
        <button
          className="btn btn-ghost"
          onClick={() =>
            api(`/api/projects/${projectId}/drafts/${draft.id}`, { method: "PATCH", body: JSON.stringify({ body }) }).then(() =>
              toast.success("Draft saved."),
            )
          }
        >
          Save
        </button>
        <button
          className="btn btn-primary"
          onClick={() =>
            api(`/api/projects/${projectId}/approvals`, {
              method: "POST",
              body: JSON.stringify({
                type: "publish",
                title: `Approve ${draft.title}`,
                targetType: "draft",
                targetId: draft.id,
                detail: body,
              }),
            }).then(() => {
              toast.success("Sent for approval.");
              invalidate();
            })
          }
        >
          Schedule for approval
        </button>
      </div>
    </article>
  );
}

function Generate({ projectId }: { projectId: string }) {
  const [kind, setKind] = useState("telegram_prelaunch");
  const [tone, setTone] = useState<(typeof TONES)[number]>("informative");
  const invalidate = useInvalidate();
  return (
    <form
      className="panel mt-4 flex flex-wrap gap-2 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        api(`/api/projects/${projectId}/drafts`, { method: "POST", body: JSON.stringify({ kind, tone }) }).then(() => {
          toast.success("Draft generated from stored facts.");
          invalidate();
        });
      }}
    >
      <input className="field max-w-xs" value={kind} onChange={(event) => setKind(event.target.value)} />
      <select className="field max-w-48" value={tone} onChange={(event) => setTone(event.target.value as (typeof TONES)[number])}>
        {TONES.map((item) => (
          <option key={item}>{item}</option>
        ))}
      </select>
      <button className="btn btn-teal">Generate draft</button>
    </form>
  );
}
