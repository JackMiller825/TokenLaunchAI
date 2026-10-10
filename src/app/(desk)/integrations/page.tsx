"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageIntro, api } from "@/components/desk";

const TONE: Record<string, string> = {
  CONNECTED: "text-ok",
  REQUIRES_CREDENTIALS: "text-warning",
  NOT_CONNECTED: "text-muted",
  UNSUPPORTED: "text-muted",
  CONNECTION_ERROR: "text-danger",
};

export default function IntegrationsPage() {
  const query = useQuery({ queryKey: ["integrations"], queryFn: async () => (await fetch("/api/integrations")).json() });
  const [result, setResult] = useState<string>("");
  return (
    <div>
      <PageIntro
        eyebrow="Server-side only"
        title="Integrations"
        text="Keys stay in the server environment. The browser never receives them. Unsupported providers stay manual."
      />
      <div className="grid gap-3 md:grid-cols-2">
        {(query.data?.integrations || []).map((item: { name: string; status: string; detail: string }) => (
          <article key={item.name} className="panel p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white">{item.name}</h2>
              <span className={`text-xs ${TONE[item.status] || ""}`}>{item.status.replaceAll("_", " ")}</span>
            </div>
            <p className="mt-2 text-sm text-muted">{item.detail}</p>
            <button
              className="btn btn-ghost mt-3"
              onClick={() =>
                api("/api/integrations", { method: "POST", body: JSON.stringify({ name: item.name }) }).then((body) =>
                  setResult(`${item.name}: ${body.status}. ${body.detail}`),
                )
              }
            >
              Test connection
            </button>
          </article>
        ))}
      </div>
      {result ? <p className="mt-4 text-sm">{result}</p> : null}
    </div>
  );
}
