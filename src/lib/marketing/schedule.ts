import type { StrategyDoc } from "./strategy";

export type PlannedTask = {
  name: string;
  description: string;
  owner: string;
  dueAt: Date | null;
  channel: string;
  message: string | null;
  sortOrder: number;
  reusable: boolean;
  budgetUsd?: number | null;
};

export function tasksFromStrategy(strategy: StrategyDoc, launchAt: Date | null): PlannedTask[] {
  const timed = strategy.prelaunch.map((stage, index) => ({
    name: `${stage.offsetHours} hours before launch`,
    description: `${stage.goal} Expected action: ${stage.expectedAction}. KPI: ${stage.kpi}. Depends on: ${stage.dependencies.join("; ")}.`,
    owner: stage.owner,
    dueAt: launchAt ? new Date(launchAt.getTime() - stage.offsetHours * 3_600_000) : null,
    channel: stage.channel,
    message: stage.suggestedPost,
    sortOrder: index,
    reusable: false,
  }));
  const ops: PlannedTask[] = [
    ["Confirm launch time", "The calendar stays relative until a real launch time is saved.", "Owner / Launch Manager", "operations"],
    [
      "Assign Telegram admins",
      "Record who can publish. This app does not grant Telegram admin rights.",
      "Owner / Launch Manager",
      "telegram",
    ],
    ["Approve launch announcement", "Publishing stays blocked until an owner approves the draft.", "Owner / Launch Manager", "telegram"],
    [
      "Prepare backup channel",
      "Name a second public place to post if Telegram is unavailable.",
      "Marketing / Community Manager",
      "operations",
    ],
    ["Record sponsorship quotes", "Enter prices only from a real quote. Leave unknown fields blank.", "Analyst", "telegram"],
  ].map(([name, description, owner, channel], index) => ({
    name,
    description,
    owner,
    dueAt: null,
    channel,
    message: null,
    sortOrder: 100 + index,
    reusable: true,
  }));
  return [...timed, ...ops];
}
