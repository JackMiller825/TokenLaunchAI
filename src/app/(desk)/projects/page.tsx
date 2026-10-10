"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageIntro, api, useBootstrap, useInvalidate } from "@/components/desk";

export default function ProjectsPage() {
  const boot = useBootstrap();
  const invalidate = useInvalidate();
  const router = useRouter();
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");

  async function createProject(event: React.FormEvent) {
    event.preventDefault();
    const result = await api("/api/projects", { method: "POST", body: JSON.stringify({ name, websiteUrl: website || undefined }) });
    await api("/api/active-project", { method: "POST", body: JSON.stringify({ projectId: result.project.id }) });
    toast.success("Project created. Analyze its website to fill the research file.");
    invalidate();
    router.push("/");
  }

  return (
    <div>
      <PageIntro
        eyebrow="Library"
        title="Projects"
        text="Each token keeps its own website, facts, plan, budget, and results. Duplicating a project copies reusable tasks only."
      />
      <form
        className="panel mb-4 grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto]"
        onSubmit={(event) => createProject(event).catch((error) => toast.error(error.message))}
      >
        <input className="field" placeholder="Project name" value={name} onChange={(event) => setName(event.target.value)} required />
        <input
          className="field"
          placeholder="Website URL (optional until analysis)"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
        <button className="btn btn-primary">Create project</button>
      </form>
      <div className="grid gap-3">
        {boot.data?.projects.map((project) => (
          <article key={project.id} className="panel flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <h2 className="text-lg text-white">{project.name}</h2>
              <p className="text-sm text-muted">
                {project.websiteUrl || "No website yet"} · {project.status}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                className="btn btn-ghost"
                onClick={() =>
                  api("/api/active-project", { method: "POST", body: JSON.stringify({ projectId: project.id }) }).then(() =>
                    window.location.assign("/dashboard"),
                  )
                }
              >
                Open
              </button>
              <button
                className="btn btn-ghost"
                onClick={() =>
                  api(`/api/projects/${project.id}/duplicate`, { method: "POST", body: "{}" })
                    .then(() => {
                      toast.success("Template copied without token facts.");
                      invalidate();
                    })
                    .catch((error) => toast.error(error.message))
                }
              >
                Duplicate template
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => fetch(`/api/projects/${project.id}`, { method: "DELETE" }).then(() => invalidate())}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
        {!boot.data?.projects.length && !boot.isLoading ? <p className="text-muted">No projects yet.</p> : null}
      </div>
    </div>
  );
}
