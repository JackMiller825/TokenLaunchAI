"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PageIntro, api, useBootstrap, useInvalidate } from "@/components/desk";

export default function SettingsPage() {
  const boot = useBootstrap();
  const invalidate = useInvalidate();
  const org = boot.data?.organization;
  const [timezone, setTimezone] = useState(org?.timezone || "UTC");
  const [retention, setRetention] = useState(org?.retentionDays || 365);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("VIEWER");
  return (
    <div>
      <PageIntro
        eyebrow="Desk"
        title="Settings"
        text="Owners manage the organization, retention, and who can approve spend. Viewers can read. Analysts can correct research. Marketing can draft and schedule."
      />
      <form
        className="panel grid gap-3 p-4 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          api("/api/settings", { method: "PATCH", body: JSON.stringify({ timezone, retentionDays: Number(retention) }) })
            .then(() => {
              toast.success("Settings saved.");
              invalidate();
            })
            .catch((error) => toast.error(error.message));
        }}
      >
        <label className="text-sm">
          Timezone
          <input className="field mt-1" value={timezone} onChange={(event) => setTimezone(event.target.value)} />
        </label>
        <label className="text-sm">
          Retention days
          <input className="field mt-1" type="number" value={retention} onChange={(event) => setRetention(Number(event.target.value))} />
        </label>
        <button className="btn btn-primary md:col-span-2">Save organization</button>
      </form>
      <section className="panel mt-4 p-4">
        <h2 className="text-white">Team</h2>
        <ul className="mt-2 text-sm">
          {org?.members.map((member) => (
            <li key={member.id}>
              {member.name} · {member.email} · {member.role}
            </li>
          ))}
        </ul>
        <form
          className="mt-4 grid gap-2 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            api("/api/settings", { method: "POST", body: JSON.stringify({ email, name, password, role }) })
              .then(() => {
                toast.success("Member saved.");
                invalidate();
              })
              .catch((error) => toast.error(error.message));
          }}
        >
          <input className="field" placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} required />
          <input className="field" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <input
            className="field"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <select className="field" value={role} onChange={(event) => setRole(event.target.value)}>
            <option>OWNER</option>
            <option>MARKETING</option>
            <option>ANALYST</option>
            <option>VIEWER</option>
          </select>
          <button className="btn btn-ghost">Add or update member</button>
        </form>
      </section>
      <button
        className="btn btn-ghost mt-4"
        onClick={() => fetch("/api/auth/logout", { method: "POST" }).then(() => window.location.assign("/login"))}
      >
        Sign out
      </button>
      <Cross />
    </div>
  );
}

function Cross() {
  const query = useBootstrap();
  const [rows, setRows] = useState<{ name: string; readiness: number; measuredMetrics: number; lesson: string }[] | null>(null);
  return (
    <section className="panel mt-4 p-4">
      <h2 className="text-white">Cross-project lessons</h2>
      <button
        className="btn btn-ghost mt-2"
        onClick={() =>
          fetch("/api/analytics/cross")
            .then((response) => response.json())
            .then((body) => setRows(body.projects))
        }
      >
        Compare projects
      </button>
      <ul className="mt-3 space-y-2 text-sm">
        {rows?.map((row) => (
          <li key={row.name}>
            {row.name}: readiness {row.readiness}%, measured metrics {row.measuredMetrics}. {row.lesson}
          </li>
        ))}
        {!rows && !query.isLoading ? null : null}
      </ul>
    </section>
  );
}
