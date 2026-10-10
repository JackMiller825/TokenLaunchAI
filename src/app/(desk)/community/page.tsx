"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Gate, PageIntro, api } from "@/components/desk";

export default function CommunityPage() {
  return <Gate>{(data, projectId) => <CommunityBody projectId={projectId} website={data.project.websiteUrl} />}</Gate>;
}

function CommunityBody({ projectId, website }: { projectId: string; website: string | null }) {
  const query = useQuery({
    queryKey: ["community", projectId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/community`);
      return response.json();
    },
  });
  const [faq, setFaq] = useState("What is official?\nWhere is the contract?\nWho will never ask for a seed phrase?");
  const body = query.data || {};
  return (
    <div>
      <PageIntro
        eyebrow="Bot and chat"
        title="Community management"
        text="The bot uses the official Telegram Bot API. It only messages people who opt in, and only after you approve a broadcast."
      />
      <section className="panel p-4">
        <h2 className="text-white">Connection</h2>
        <p className="mt-2 text-sm text-muted">
          {body.integration
            ? `Status: ${body.integration.status}`
            : "No per-project bot record. Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET on the server."}
        </p>
        <p className="mt-2 text-xs text-muted">
          Webhook path: /api/telegram/webhook/{projectId}. Telegram must reach a public HTTPS URL. Localhost cannot receive webhooks.
          Commands: /start /project /website /tokenomics /community /launch /contract /links /subscribe /unsubscribe /help.
        </p>
        <p className="mt-2 text-sm">Website shared by the bot: {website || "Unknown"}</p>
      </section>
      <section className="panel mt-4 p-4">
        <h2 className="text-white">Opt-in subscribers</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Username</th>
                <th>Opted in</th>
              </tr>
            </thead>
            <tbody>
              {(body.subscribers || []).map(
                (subscriber: { id: string; telegramUserId: string; username: string | null; optedIn: boolean }) => (
                  <tr key={subscriber.id}>
                    <td>{subscriber.telegramUserId}</td>
                    <td>{subscriber.username || "Unknown"}</td>
                    <td>{subscriber.optedIn ? "Yes" : "No"}</td>
                  </tr>
                ),
              )}
              {!body.subscribers?.length ? (
                <tr>
                  <td colSpan={3}>No subscribers yet. People appear here after /start or /subscribe.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <form
        className="panel mt-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          api(`/api/projects/${projectId}/faq`, { method: "POST", body: JSON.stringify({ faq: faq.split("\n").filter(Boolean) }) }).then(
            () => toast.success("FAQ saved."),
          );
        }}
      >
        <h2 className="text-white">FAQ</h2>
        <textarea className="field mt-2 min-h-32" value={faq} onChange={(event) => setFaq(event.target.value)} />
        <button className="btn btn-primary mt-2">Save FAQ</button>
      </form>
      <CommentBox projectId={projectId} />
    </div>
  );
}

function CommentBox({ projectId }: { projectId: string }) {
  const [body, setBody] = useState("");
  const query = useQuery({
    queryKey: ["comments", projectId],
    queryFn: async () => (await fetch(`/api/projects/${projectId}/comments`)).json(),
  });
  return (
    <section className="panel mt-4 p-4">
      <h2 className="text-white">Internal comments</h2>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          api(`/api/projects/${projectId}/comments`, {
            method: "POST",
            body: JSON.stringify({ body, targetType: "community", targetId: projectId }),
          }).then(() => {
            setBody("");
            query.refetch();
          });
        }}
      >
        <input className="field" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Note for the team" />
        <button className="btn btn-ghost">Post</button>
      </form>
      <ul className="mt-3 space-y-2 text-sm">
        {(query.data?.comments || []).map((comment: { id: string; body: string; user: { name: string } | null }) => (
          <li key={comment.id}>
            {comment.user?.name || "Teammate"}: {comment.body}
          </li>
        ))}
      </ul>
    </section>
  );
}
