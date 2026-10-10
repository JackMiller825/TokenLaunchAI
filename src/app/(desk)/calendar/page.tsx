"use client";

import { addDays, format, startOfWeek } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { Gate, PageIntro, api } from "@/components/desk";

export default function CalendarPage() {
  const [cursor, setCursor] = useState(new Date());
  const [mode, setMode] = useState<"week" | "day">("week");
  const start = startOfWeek(cursor, { weekStartsOn: 1 });
  const days = mode === "day" ? [cursor] : Array.from({ length: 7 }, (_, index) => addDays(start, index));
  return (
    <Gate>
      {(data, projectId) => (
        <div>
          <PageIntro
            eyebrow={data.project.timezone}
            title="Launch calendar"
            text="Drag a task onto a day to reschedule it. Tasks without a launch time stay in the unscheduled list."
          />
          <div className="mb-3 flex gap-2">
            <button className="btn btn-ghost" onClick={() => setCursor(addDays(cursor, mode === "day" ? -1 : -7))}>
              Previous
            </button>
            <button className="btn btn-ghost" onClick={() => setMode(mode === "week" ? "day" : "week")}>
              {mode === "week" ? "Day view" : "Week view"}
            </button>
            <button className="btn btn-ghost" onClick={() => setCursor(addDays(cursor, mode === "day" ? 1 : 7))}>
              Next
            </button>
          </div>
          <div className={`grid gap-3 ${mode === "week" ? "md:grid-cols-7" : ""}`}>
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const tasks = data.tasks.filter((task) => task.dueAt && task.dueAt.slice(0, 10) === key);
              return (
                <div
                  key={key}
                  className="panel min-h-40 p-3"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    const id = event.dataTransfer.getData("text/plain");
                    const due = new Date(day);
                    due.setHours(15, 0, 0, 0);
                    api(`/api/projects/${projectId}/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ dueAt: due.toISOString() }) })
                      .then(() => window.location.reload())
                      .catch((error) => toast.error(error.message));
                  }}
                >
                  <h3 className="text-sm text-white">{format(day, "EEE d MMM")}</h3>
                  {tasks.map((task) => (
                    <p
                      key={task.id}
                      draggable
                      onDragStart={(event) => event.dataTransfer.setData("text/plain", task.id)}
                      className="mt-2 cursor-grab rounded-lg bg-white/5 p-2 text-xs"
                    >
                      {task.name}
                      <span className="block text-muted">
                        {task.owner || "Unassigned"} · {task.status}
                      </span>
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
          <section className="panel mt-4 p-4">
            <h2 className="text-white">Unscheduled</h2>
            {data.tasks
              .filter((task) => !task.dueAt)
              .map((task) => (
                <p
                  key={task.id}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", task.id)}
                  className="mt-2 text-sm"
                >
                  {task.name}
                </p>
              ))}
          </section>
        </div>
      )}
    </Gate>
  );
}
