"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Gate, PageIntro, api, useInvalidate } from "@/components/desk";

export default function CampaignsPage() {
  return (
    <Gate>
      {(data, projectId) => (
        <div>
          <PageIntro
            eyebrow="Operations"
            title="Launch campaigns"
            text="Tasks carry an owner, channel, message, and status. Publishing and spending still need an owner approval."
          />
          <TaskForm projectId={projectId} />
          <div className="mt-4 space-y-3">
            {data.tasks.map((task) => (
              <TaskCard key={task.id} task={task} projectId={projectId} />
            ))}
            {!data.tasks.length ? <p className="text-muted">No tasks yet.</p> : null}
          </div>
          <section className="panel mt-4 p-4">
            <h2 className="text-white">Approvals</h2>
            {data.approvals.map((approval) => (
              <div key={approval.id} className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                <div>
                  <strong>{approval.title}</strong>
                  <p className="text-xs text-muted">
                    {approval.type} · {approval.status}
                  </p>
                </div>
                {approval.status === "PENDING" ? (
                  <div className="flex gap-2">
                    <button
                      className="btn btn-primary"
                      onClick={() =>
                        api(`/api/projects/${projectId}/approvals/${approval.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ decision: "APPROVED" }),
                        })
                          .then(() => window.location.reload())
                          .catch((error) => toast.error(error.message))
                      }
                    >
                      Approve
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() =>
                        api(`/api/projects/${projectId}/approvals/${approval.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ decision: "REJECTED" }),
                        }).then(() => window.location.reload())
                      }
                    >
                      Reject
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
            {!data.approvals.length ? <p className="mt-2 text-sm text-muted">No approval requests.</p> : null}
          </section>
        </div>
      )}
    </Gate>
  );
}

function TaskForm({ projectId }: { projectId: string }) {
  const [name, setName] = useState("");
  const invalidate = useInvalidate();
  return (
    <form
      className="panel flex gap-2 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        api(`/api/projects/${projectId}/tasks`, { method: "POST", body: JSON.stringify({ name, channel: "telegram" }) }).then(() => {
          setName("");
          invalidate();
        });
      }}
    >
      <input className="field" placeholder="New task" value={name} onChange={(event) => setName(event.target.value)} required />
      <button className="btn btn-primary">Add</button>
    </form>
  );
}

function TaskCard({
  task,
  projectId,
}: {
  task: {
    id: string;
    name: string;
    description: string | null;
    owner: string | null;
    dueAt: string | null;
    channel: string | null;
    status: string;
    message: string | null;
    result: string | null;
  };
  projectId: string;
}) {
  const [owner, setOwner] = useState(task.owner || "");
  return (
    <article className="panel p-4">
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="text-white">{task.name}</h3>
        <span className="chip">{task.status}</span>
      </div>
      <p className="mt-1 text-sm text-muted">{task.description}</p>
      <p className="mt-1 text-xs text-muted">
        {task.channel || "No channel"} · {task.dueAt ? new Date(task.dueAt).toLocaleString() : "Unscheduled"}
      </p>
      {task.message ? <p className="mt-2 text-sm">{task.message}</p> : null}
      {task.result ? <p className="mt-1 text-xs text-warning">{task.result}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <input className="field max-w-48 py-1" value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="Owner" />
        <button
          className="btn btn-ghost"
          onClick={() => api(`/api/projects/${projectId}/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ owner }) })}
        >
          Save owner
        </button>
        <button
          className="btn btn-primary"
          onClick={() =>
            api(`/api/projects/${projectId}/approvals`, {
              method: "POST",
              body: JSON.stringify({
                type: "publish",
                title: `Publish ${task.name}`,
                targetType: "task",
                targetId: task.id,
                detail: task.message || task.description,
              }),
            }).then(() => toast.success("Approval requested. An owner must accept before a send is queued."))
          }
        >
          Request publish approval
        </button>
      </div>
    </article>
  );
}
