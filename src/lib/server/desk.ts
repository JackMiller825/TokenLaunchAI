import { Prisma } from "@prisma/client";
import Papa from "papaparse";
import JSZip from "jszip";
import { z } from "zod";
import { audit } from "../audit";
import { assertRole, loadProject, type SessionUser } from "../auth";
import { prisma } from "../db";
import { env } from "../env";
import { discoverChannels } from "../discovery/discover";
import { safeFetch } from "../research/http";
import { enqueueScan } from "../jobs/enqueue";
import { defaultBudget, reoptimizeBudget, applyPercents } from "../marketing/budget";
import { generateDraft } from "../marketing/copy";
import { groundedProfile } from "../marketing/profile";
import { answerQuestion } from "../marketing/assistant";
import { buildReport, markdownToPdf, rowsToCsv } from "../reports/build";
import { reviewSponsoredDraft } from "../telegram/ads";
import { normalizeHttpUrl } from "../research/ssrf";
import type { DraftFact, FactStatusName } from "../research/types";

const analyzeSchema = z.object({
  url: z.string().trim().min(4).max(500),
  blockchain: z.string().trim().max(80).optional(),
  launchAt: z.string().max(40).nullable().optional(),
  budgetUsd: z.number().min(0).max(10_000_000).optional(),
  audiences: z.array(z.string().max(80)).max(12).optional(),
  languages: z.array(z.string().max(16)).max(12).optional(),
  countries: z.array(z.string().max(80)).max(30).optional(),
  durationHoursBefore: z.number().int().min(0).max(720).optional(),
  durationHoursAfter: z.number().int().min(0).max(720).optional(),
  channels: z.array(z.string().max(40)).max(12).optional(),
  telegramTarget: z.string().max(300).nullable().optional(),
  objectives: z.string().max(2000).nullable().optional(),
  timezone: z.string().max(80).optional(),
  projectId: z.string().optional(),
});

export async function createAnalysis(user: SessionUser, raw: unknown) {
  assertRole(user, "ANALYST");
  const input = analyzeSchema.parse(raw);
  const url = normalizeHttpUrl(input.url).toString();
  const launchAt = input.launchAt ? new Date(input.launchAt) : null;
  if (input.launchAt && Number.isNaN(launchAt?.getTime()))
    throw Object.assign(new Error("Launch time is not a valid date."), { status: 400 });
  const project = input.projectId
    ? await loadProject(user, input.projectId)
    : await prisma.project.create({
        data: {
          organizationId: user.organizationId,
          name: hostName(url),
          websiteUrl: url,
          blockchain: input.blockchain || "Ethereum mainnet",
          launchAt,
          budgetUsd: new Prisma.Decimal(input.budgetUsd ?? 0),
          audiences: input.audiences ?? [],
          languages: input.languages?.length ? input.languages : ["en"],
          countries: input.countries ?? [],
          durationHoursBefore: input.durationHoursBefore ?? 48,
          durationHoursAfter: input.durationHoursAfter ?? 24,
          channels: input.channels?.length ? input.channels : ["telegram", "x"],
          telegramTarget: input.telegramTarget || null,
          objectives: input.objectives || null,
          timezone: input.timezone || "UTC",
          budgetPlan: defaultBudget(input.budgetUsd ?? 0) as unknown as Prisma.InputJsonValue,
        },
      });
  if (input.projectId) {
    await prisma.project.update({
      where: { id: project.id },
      data: {
        websiteUrl: url,
        blockchain: input.blockchain || project.blockchain,
        launchAt: launchAt ?? project.launchAt,
        budgetUsd: input.budgetUsd != null ? new Prisma.Decimal(input.budgetUsd) : project.budgetUsd,
        audiences: input.audiences ?? project.audiences,
        languages: input.languages ?? project.languages,
        countries: input.countries ?? project.countries,
        durationHoursBefore: input.durationHoursBefore ?? project.durationHoursBefore,
        durationHoursAfter: input.durationHoursAfter ?? project.durationHoursAfter,
        channels: input.channels ?? project.channels,
        telegramTarget: input.telegramTarget === undefined ? project.telegramTarget : input.telegramTarget,
        objectives: input.objectives === undefined ? project.objectives : input.objectives,
        timezone: input.timezone || project.timezone,
      },
    });
  }
  const website = await prisma.projectWebsite.create({ data: { projectId: project.id, inputUrl: url, domain: hostName(url) } });
  const scan = await prisma.websiteScan.create({
    data: { projectId: project.id, websiteId: website.id, url, status: "QUEUED", stage: "validate", stageLabel: "Queued" },
  });
  await audit({ organizationId: user.organizationId, projectId: project.id, userId: user.id, action: "scan.queued", detail: url });
  const runner = await enqueueScan(scan.id);
  return { projectId: project.id, scanId: scan.id, runner };
}

export async function projectPayload(user: SessionUser, projectId: string) {
  const project = await loadProject(user, projectId);
  const [facts, profile, strategy, intelligence, opportunities, drafts, assets, campaigns, tasks, readiness, metrics, approvals, reports] =
    await Promise.all([
      prisma.extractedFact.findMany({ where: { projectId }, include: { evidence: true }, orderBy: { fieldKey: "asc" } }),
      prisma.tokenProfile.findUnique({ where: { projectId } }),
      prisma.marketingStrategy.findFirst({ where: { projectId }, orderBy: { version: "desc" } }),
      prisma.intelligenceReport.findFirst({ where: { projectId }, orderBy: { version: "desc" } }),
      prisma.advertisingOpportunity.findMany({ where: { projectId }, include: { quotes: true }, orderBy: { rankScore: "desc" } }),
      prisma.contentDraft.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } }),
      prisma.creativeAsset.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } }),
      prisma.campaign.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } }),
      prisma.campaignTask.findMany({ where: { projectId }, orderBy: { sortOrder: "asc" } }),
      prisma.launchReadinessItem.findMany({ where: { projectId }, orderBy: { category: "asc" } }),
      prisma.campaignMetric.findMany({ where: { projectId }, orderBy: { recordedAt: "asc" } }),
      prisma.approvalRequest.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } }),
      prisma.generatedReport.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } }),
    ]);
  const applicable = readiness.filter((item) => item.status !== "warning");
  const score = applicable.length
    ? Math.round((applicable.filter((item) => item.status === "complete").length / applicable.length) * 100)
    : 0;
  return {
    project: serializeProject(project),
    facts,
    profile,
    strategy,
    intelligence,
    opportunities: opportunities.map(serializeOpportunity),
    drafts,
    assets,
    campaigns: campaigns.map((campaign) => ({ ...campaign, budgetUsd: Number(campaign.budgetUsd) })),
    tasks: tasks.map((task) => ({ ...task, budgetUsd: task.budgetUsd == null ? null : Number(task.budgetUsd) })),
    readiness,
    readinessScore: score,
    metrics: metrics.map((metric) => ({ ...metric, value: metric.value == null ? null : Number(metric.value) })),
    approvals,
    reports: reports.map((report) => ({
      id: report.id,
      kind: report.kind,
      format: report.format,
      title: report.title,
      createdAt: report.createdAt,
    })),
  };
}

export async function updateFact(user: SessionUser, projectId: string, factId: string, raw: unknown) {
  assertRole(user, "ANALYST");
  await loadProject(user, projectId);
  const body = z
    .object({
      value: z.string().max(2000).nullable().optional(),
      status: z.enum(["VERIFIED", "REPORTED_UNVERIFIED", "MISSING", "CONFLICTING", "NEEDS_CONFIRMATION"]).optional(),
      accepted: z.boolean().optional(),
      isPrivate: z.boolean().optional(),
    })
    .parse(raw);
  const fact = await prisma.extractedFact.findFirst({ where: { id: factId, projectId } });
  if (!fact) throw Object.assign(new Error("Fact not found."), { status: 404 });
  const updated = await prisma.extractedFact.update({
    where: { id: fact.id },
    data: {
      originalValue: fact.originalValue ?? fact.value,
      userValue: body.value === undefined ? fact.userValue : body.value,
      value: body.value === undefined ? fact.value : body.value,
      status: (body.status as FactStatusName | undefined) ?? fact.status,
      accepted: body.accepted ?? true,
      isPrivate: body.isPrivate ?? fact.isPrivate,
    },
  });
  await audit({ organizationId: user.organizationId, projectId, userId: user.id, action: "fact.updated", detail: fact.fieldKey });
  return updated;
}

export async function importOpportunities(user: SessionUser, projectId: string, csv: string) {
  assertRole(user, "MARKETING");
  await loadProject(user, projectId);
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  const rows = parsed.data.slice(0, 200);
  let created = 0;
  for (const row of rows) {
    const name = row.channel || row.name || row.Channel;
    const url = row.url || row.telegram || row["Telegram URL"];
    if (!name || !url) continue;
    await prisma.advertisingOpportunity.create({
      data: {
        projectId,
        name,
        telegramUrl: url,
        username: url.split("/").pop() || null,
        category: row.category || null,
        language: row.language || null,
        subscribers: intOrNull(row.subscribers),
        subscriberSource: row.subscribers ? "csv_import" : null,
        averageViews: intOrNull(row.views || row.averageViews),
        viewsSource: row.views || row.averageViews ? "csv_import" : null,
        contact: row.contact || null,
        priceUsd: moneyOrNull(row.price || row.priceUsd),
        priceSource: row.price || row.priceUsd ? "csv_import" : null,
        sourceLabel: "CSV import",
        sourceUrl: url,
        recommendation: "Imported by an operator. Confirm the numbers with the channel before spending.",
        status: "DISCOVERED",
      },
    });
    created += 1;
  }
  return { created, errors: parsed.errors.slice(0, 5).map((error) => error.message) };
}

export async function addQuote(user: SessionUser, projectId: string, opportunityId: string, raw: unknown) {
  assertRole(user, "MARKETING");
  await loadProject(user, projectId);
  const body = z
    .object({
      priceUsd: z.number().min(0).max(10_000_000),
      contact: z.string().max(300).optional(),
      notes: z.string().max(2000).optional(),
    })
    .parse(raw);
  const opportunity = await prisma.advertisingOpportunity.findFirst({ where: { id: opportunityId, projectId } });
  if (!opportunity) throw Object.assign(new Error("Opportunity not found."), { status: 404 });
  const quote = await prisma.sponsorshipQuote.create({
    data: { opportunityId, priceUsd: new Prisma.Decimal(body.priceUsd), contact: body.contact, notes: body.notes },
  });
  const cpm = opportunity.averageViews ? body.priceUsd / (opportunity.averageViews / 1000) : null;
  await prisma.advertisingOpportunity.update({
    where: { id: opportunityId },
    data: {
      priceUsd: new Prisma.Decimal(body.priceUsd),
      priceSource: "operator_quote",
      contact: body.contact || opportunity.contact,
      cpmUsd: cpm == null ? null : new Prisma.Decimal(cpm),
      status: "QUOTED",
      freshness: new Date(),
    },
  });
  await audit({ organizationId: user.organizationId, projectId, userId: user.id, action: "quote.recorded", detail: opportunity.name });
  return quote;
}

export async function patchOpportunity(user: SessionUser, projectId: string, opportunityId: string, raw: unknown) {
  assertRole(user, "MARKETING");
  await loadProject(user, projectId);
  const body = z
    .object({
      status: z.enum(["DISCOVERED", "RESEARCHING", "CONTACTED", "QUOTED", "APPROVED", "BOOKED", "PUBLISHED", "REVIEWED"]).optional(),
      saved: z.boolean().optional(),
      proofUrl: z.string().max(500).nullable().optional(),
      notes: z.string().max(2000).nullable().optional(),
    })
    .parse(raw);
  if (body.status && ["APPROVED", "BOOKED"].includes(body.status)) assertRole(user, "OWNER");
  const existing = await prisma.advertisingOpportunity.findFirst({ where: { id: opportunityId, projectId } });
  if (!existing) throw Object.assign(new Error("Opportunity not found."), { status: 404 });
  return prisma.advertisingOpportunity.update({ where: { id: existing.id }, data: body });
}

export async function generateOneDraft(user: SessionUser, projectId: string, raw: unknown) {
  assertRole(user, "MARKETING");
  const project = await loadProject(user, projectId);
  const body = z
    .object({
      kind: z.string().min(2).max(40),
      tone: z.enum(["funny", "cute", "meme-heavy", "exciting", "informative", "professional", "community-focused"]).default("informative"),
      language: z.string().max(12).optional(),
    })
    .parse(raw);
  const facts = await prisma.extractedFact.findMany({ where: { projectId, isPrivate: false } });
  const profile = groundedProfile(facts as unknown as DraftFact[], project.websiteUrl || "");
  const draft = generateDraft(profile, body.kind as never, body.tone);
  return prisma.contentDraft.create({
    data: {
      projectId,
      kind: draft.kind,
      tone: draft.tone,
      language: body.language || "en",
      title: draft.title,
      body: draft.body,
      charCount: [...draft.body].length,
      warnings: draft.warnings,
      footnotes: draft.footnotes,
      generator: "rules",
    },
  });
}

export async function updateDraft(user: SessionUser, projectId: string, draftId: string, raw: unknown) {
  assertRole(user, "MARKETING");
  await loadProject(user, projectId);
  const body = z.object({ body: z.string().max(20000).optional(), status: z.string().max(40).optional() }).parse(raw);
  const existing = await prisma.contentDraft.findFirst({ where: { id: draftId, projectId } });
  if (!existing) throw Object.assign(new Error("Draft not found."), { status: 404 });
  const nextBody = body.body ?? existing.body;
  return prisma.contentDraft.update({
    where: { id: draftId },
    data: { body: nextBody, charCount: [...nextBody].length, status: body.status ?? existing.status },
  });
}

export async function requestApproval(user: SessionUser, projectId: string, raw: unknown) {
  assertRole(user, "MARKETING");
  await loadProject(user, projectId);
  const body = z
    .object({
      type: z.enum(["spend", "publish", "outreach", "links", "broadcast"]),
      title: z.string().min(3).max(200),
      detail: z.string().max(4000).optional(),
      targetType: z.string().max(40).optional(),
      targetId: z.string().max(80).optional(),
    })
    .parse(raw);
  const approval = await prisma.approvalRequest.create({
    data: {
      projectId,
      type: body.type,
      title: body.title,
      detail: body.detail,
      targetType: body.targetType,
      targetId: body.targetId,
      requesterId: user.id,
    },
  });
  if (body.targetType === "draft" && body.targetId) {
    await prisma.contentDraft.updateMany({ where: { id: body.targetId, projectId }, data: { status: "pending_approval" } });
  }
  await audit({ organizationId: user.organizationId, projectId, userId: user.id, action: "approval.requested", detail: body.title });
  return approval;
}

export async function decideApproval(user: SessionUser, projectId: string, approvalId: string, raw: unknown) {
  assertRole(user, "OWNER");
  const project = await loadProject(user, projectId);
  const body = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), note: z.string().max(2000).optional() }).parse(raw);
  const approval = await prisma.approvalRequest.findFirst({ where: { id: approvalId, projectId } });
  if (!approval) throw Object.assign(new Error("Approval not found."), { status: 404 });
  const updated = await prisma.approvalRequest.update({
    where: { id: approval.id },
    data: { status: body.decision, deciderId: user.id, decidedAt: new Date(), decisionNote: body.note },
  });
  if (approval.targetType === "draft" && approval.targetId && body.decision === "APPROVED") {
    await prisma.contentDraft.updateMany({ where: { id: approval.targetId, projectId }, data: { status: "approved" } });
  }
  if (approval.targetType === "task" && approval.targetId && body.decision === "APPROVED" && approval.type === "publish") {
    await prisma.campaignTask.updateMany({ where: { id: approval.targetId, projectId }, data: { status: "APPROVED" } });
    await prisma.scheduledJob.create({
      data: {
        projectId,
        type: "publish",
        runAt: new Date(),
        payload: { taskId: approval.targetId },
        dedupeKey: `publish:${approval.targetId}:${Date.now()}`,
      },
    });
  }
  await prisma.notification.create({
    data: {
      organizationId: project.organizationId,
      projectId,
      title: `Approval ${body.decision.toLowerCase()}`,
      body: approval.title,
      href: "/campaigns",
    },
  });
  await audit({
    organizationId: user.organizationId,
    projectId,
    userId: user.id,
    action: "approval.decided",
    detail: `${body.decision} ${approval.title}`,
  });
  return updated;
}

export async function updateTask(user: SessionUser, projectId: string, taskId: string, raw: unknown) {
  assertRole(user, "MARKETING");
  await loadProject(user, projectId);
  const body = z
    .object({
      name: z.string().max(200).optional(),
      description: z.string().max(4000).optional(),
      owner: z.string().max(120).nullable().optional(),
      dueAt: z.string().nullable().optional(),
      channel: z.string().max(80).nullable().optional(),
      message: z.string().max(8000).nullable().optional(),
      status: z.enum(["DRAFT", "READY", "PENDING_APPROVAL", "APPROVED", "SCHEDULED", "PUBLISHED", "FAILED", "CANCELLED"]).optional(),
      result: z.string().max(2000).nullable().optional(),
      budgetUsd: z.number().min(0).nullable().optional(),
    })
    .parse(raw);
  if (body.status && ["APPROVED", "PUBLISHED", "SCHEDULED"].includes(body.status)) assertRole(user, "OWNER");
  const existing = await prisma.campaignTask.findFirst({ where: { id: taskId, projectId } });
  if (!existing) throw Object.assign(new Error("Task not found."), { status: 404 });
  return prisma.campaignTask.update({
    where: { id: taskId },
    data: {
      ...("name" in body ? { name: body.name } : {}),
      ...("description" in body ? { description: body.description } : {}),
      ...("owner" in body ? { owner: body.owner } : {}),
      ...("channel" in body ? { channel: body.channel } : {}),
      ...("message" in body ? { message: body.message } : {}),
      ...("status" in body ? { status: body.status } : {}),
      ...("result" in body ? { result: body.result } : {}),
      ...(body.dueAt !== undefined ? { dueAt: body.dueAt ? new Date(body.dueAt) : null } : {}),
      ...(body.budgetUsd !== undefined ? { budgetUsd: body.budgetUsd == null ? null : new Prisma.Decimal(body.budgetUsd) } : {}),
    },
  });
}

export async function updateReadiness(user: SessionUser, projectId: string, key: string, raw: unknown) {
  assertRole(user, "MARKETING");
  await loadProject(user, projectId);
  const body = z
    .object({
      status: z.enum(["complete", "incomplete", "blocked", "warning"]),
      notes: z.string().max(1000).optional(),
      owner: z.string().max(120).optional(),
    })
    .parse(raw);
  return prisma.launchReadinessItem.update({
    where: { projectId_key: { projectId, key } },
    data: { status: body.status, notes: body.notes, owner: body.owner, auto: false },
  });
}

export async function addMetric(user: SessionUser, projectId: string, raw: unknown) {
  assertRole(user, "ANALYST");
  await loadProject(user, projectId);
  const body = z
    .object({
      name: z.string().min(2).max(120),
      value: z.number().nullable(),
      unit: z.string().max(40),
      kind: z.enum(["MEASURED", "IMPORTED", "ESTIMATED", "UNAVAILABLE"]),
      recordedAt: z.string(),
      source: z.string().min(2).max(300),
      notes: z.string().max(1000).optional(),
      campaignId: z.string().optional(),
    })
    .parse(raw);
  return prisma.campaignMetric.create({
    data: {
      projectId,
      campaignId: body.campaignId,
      name: body.name,
      value: body.value == null ? null : new Prisma.Decimal(body.value),
      unit: body.unit,
      kind: body.kind,
      recordedAt: new Date(body.recordedAt),
      source: body.source,
      notes: body.notes,
    },
  });
}

export async function saveBudget(user: SessionUser, projectId: string, raw: unknown) {
  assertRole(user, "MARKETING");
  const project = await loadProject(user, projectId);
  const body = z
    .object({
      total: z.number().min(0).max(10_000_000).optional(),
      percents: z.array(z.object({ key: z.string(), percent: z.number().min(0).max(100) })).optional(),
      reoptimize: z.boolean().optional(),
    })
    .parse(raw);
  const total = body.total ?? Number(project.budgetUsd);
  let plan = defaultBudget(total);
  if (body.reoptimize) {
    const metrics = await prisma.campaignMetric.findMany({
      where: { projectId, name: { contains: "cost per subscriber" }, kind: "MEASURED" },
    });
    plan = reoptimizeBudget(
      total,
      metrics.map((metric) => ({ channel: metric.source, costPerSubscriber: Number(metric.value ?? 0) })),
    );
  } else if (body.percents) {
    plan = applyPercents(total, body.percents);
  }
  await prisma.project.update({
    where: { id: projectId },
    data: { budgetUsd: new Prisma.Decimal(total), budgetPlan: plan as unknown as Prisma.InputJsonValue },
  });
  return plan;
}

export async function askAssistant(user: SessionUser, projectId: string, question: string) {
  const payload = await projectPayload(user, projectId);
  const facts = payload.facts.filter((fact) => !fact.isPrivate);
  const profile = groundedProfile(facts as unknown as DraftFact[], payload.project.websiteUrl || "");
  const scans = await prisma.websiteScan.findMany({ where: { projectId, status: "COMPLETED" }, orderBy: { createdAt: "desc" }, take: 2 });
  const changes: string[] = [];
  if (scans.length === 2) {
    const [latest, previous] = await Promise.all([
      prisma.extractedFact.findMany({ where: { scanId: scans[0].id } }),
      prisma.extractedFact.findMany({ where: { scanId: scans[1].id } }),
    ]);
    for (const fact of latest) {
      const before = previous.find((item) => item.fieldKey === fact.fieldKey);
      if ((before?.originalValue || before?.value || null) !== (fact.originalValue || fact.value || null)) {
        changes.push(`${fact.label}: ${before?.value || "empty"} -> ${fact.originalValue || fact.value || "empty"}`);
      }
    }
  }
  const blockers = payload.readiness.filter((item) => item.status === "blocked").map((item) => item.label);
  const next = payload.readiness.find((item) => item.status === "blocked" || item.status === "incomplete");
  return answerQuestion(question, {
    profile,
    readinessScore: payload.readinessScore,
    nextAction: next ? `${next.label} (${next.owner || "unassigned"})` : null,
    blockers,
    opportunities: payload.opportunities.map((item) => ({
      name: item.name,
      priceUsd: item.priceUsd,
      cpmUsd: item.cpmUsd,
      confidence: item.rankConfidence,
      recommendation: item.recommendation,
    })),
    metrics: payload.metrics.map((metric) => ({ name: metric.name, value: metric.value, kind: metric.kind })),
    changes,
    budget: Number(payload.project.budgetUsd),
  });
}

export async function makeReport(user: SessionUser, projectId: string, kind: string) {
  const payload = await projectPayload(user, projectId);
  const facts = payload.facts.filter((fact) => !fact.isPrivate);
  const profile = groundedProfile(facts as unknown as DraftFact[], payload.project.websiteUrl || "");
  const unresolved =
    facts
      .filter((fact) => fact.status !== "VERIFIED")
      .map((fact) => `- ${fact.label}: ${fact.value || "empty"} (${fact.status})`)
      .join("\n") || "None stored.";
  const sections = sectionsFor(kind, payload, unresolved);
  const markdown = buildReport({
    kind,
    projectName: payload.project.name,
    website: payload.project.websiteUrl || "",
    generatedAt: new Date().toISOString(),
    profile,
    sections,
  });
  const report = await prisma.generatedReport.create({
    data: { projectId, kind, format: "markdown", title: kind, content: markdown },
  });
  return report;
}

export async function reportFile(user: SessionUser, projectId: string, reportId: string, format: string) {
  await loadProject(user, projectId);
  const report = await prisma.generatedReport.findFirst({ where: { id: reportId, projectId } });
  if (!report?.content) throw Object.assign(new Error("Report not found."), { status: 404 });
  if (format === "pdf") {
    const pdf = await markdownToPdf(report.content, report.title);
    return { contentType: "application/pdf", filename: `${report.kind}.pdf`, body: pdf };
  }
  const payload = await projectPayload(user, projectId);
  const rows = reportRows(report.kind, payload);
  if (format === "json") {
    return {
      contentType: "application/json",
      filename: `${report.kind}.json`,
      body: Buffer.from(
        JSON.stringify({ title: report.title, generatedFrom: "stored project records", markdown: report.content, rows }, null, 2),
      ),
    };
  }
  if (format === "csv") {
    return { contentType: "text/csv; charset=utf-8", filename: `${slug(report.kind)}.csv`, body: Buffer.from(rowsToCsv(rows)) };
  }
  return { contentType: "text/markdown", filename: `${report.kind}.md`, body: Buffer.from(report.content) };
}

function reportRows(kind: string, payload: Awaited<ReturnType<typeof projectPayload>>) {
  if (kind === "Telegram Sponsorship Shortlist") {
    return payload.opportunities.map((item) => ({
      channel: item.name,
      telegramUrl: item.telegramUrl,
      category: item.category,
      language: item.language,
      subscribers: item.subscribers,
      averageViews: item.averageViews,
      engagement: item.engagement,
      contact: item.contact,
      priceUsd: item.priceUsd,
      cpmUsd: item.cpmUsd,
      relevance: item.relevance,
      freshness: item.freshness ? new Date(item.freshness).toISOString() : null,
      risks: item.riskFlags.join("; "),
      recommendation: item.recommendation,
      status: item.status,
      source: item.sourceUrl,
    }));
  }
  if (kind === "Launch Schedule" || kind === "Pre-Launch Preparation Checklist") {
    return payload.tasks.map((task) => ({
      name: task.name,
      owner: task.owner,
      dueAt: task.dueAt ? new Date(task.dueAt).toISOString() : null,
      channel: task.channel,
      status: task.status,
      budgetUsd: task.budgetUsd,
    }));
  }
  if (kind === "Post-Launch Performance Report") {
    return payload.metrics.map((metric) => ({
      recordedAt: new Date(metric.recordedAt).toISOString(),
      name: metric.name,
      value: metric.value,
      unit: metric.unit,
      kind: metric.kind,
      source: metric.source,
    }));
  }
  return payload.facts
    .filter((fact) => !fact.isPrivate)
    .map((fact) => ({
      field: fact.fieldKey,
      label: fact.label,
      value: fact.value,
      status: fact.status,
      confidence: fact.confidence,
      sourceUrl: fact.sourceUrl,
    }));
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function assetZip(user: SessionUser, projectId: string) {
  await loadProject(user, projectId);
  const assets = await prisma.creativeAsset.findMany({ where: { projectId } });
  const zip = new JSZip();
  const manifest: unknown[] = [];
  let index = 1;
  for (const asset of assets) {
    const filename = `${String(index).padStart(2, "0")}-${asset.role}-${(asset.filename || "asset").replace(/[^a-zA-Z0-9._-]/g, "")}`;
    if (asset.previewUrl && asset.availability === "extracted") {
      try {
        const response = await safeFetch(asset.previewUrl, { maxBytes: 5_000_000, accept: "image/*,*/*" });
        zip.file(filename, response.body);
        manifest.push({
          filename,
          sourceUrl: asset.previewUrl,
          width: asset.width,
          height: asset.height,
          availability: asset.availability,
          note: asset.qualityNotes,
        });
      } catch (error) {
        manifest.push({ filename, sourceUrl: asset.previewUrl, error: error instanceof Error ? error.message : "fetch failed" });
      }
    } else {
      manifest.push({ filename: `${filename}.txt`, prompt: asset.prompt, availability: asset.availability, note: asset.qualityNotes });
      zip.file(`${filename}.txt`, asset.prompt || asset.qualityNotes || "No file was generated.");
    }
    index += 1;
  }
  zip.file("manifest.json", JSON.stringify({ generatedAt: new Date().toISOString(), assets: manifest }, null, 2));
  const body = await zip.generateAsync({ type: "nodebuffer" });
  return body;
}

export async function duplicateProject(user: SessionUser, projectId: string) {
  assertRole(user, "MARKETING");
  const project = await loadProject(user, projectId);
  const copy = await prisma.project.create({
    data: {
      organizationId: project.organizationId,
      name: `${project.name} template`,
      blockchain: project.blockchain,
      budgetUsd: project.budgetUsd,
      currency: project.currency,
      timezone: project.timezone,
      durationHoursBefore: project.durationHoursBefore,
      durationHoursAfter: project.durationHoursAfter,
      audiences: project.audiences,
      languages: project.languages,
      countries: project.countries,
      channels: project.channels,
      objectives: project.objectives,
      budgetPlan: project.budgetPlan ?? undefined,
      status: "template",
    },
  });
  const tasks = await prisma.campaignTask.findMany({ where: { projectId, reusable: true } });
  if (tasks.length) {
    const campaign = await prisma.campaign.create({
      data: { projectId: copy.id, name: "Launch preparation", objective: "Template tasks only. Token facts were not copied." },
    });
    await prisma.campaignTask.createMany({
      data: tasks.map((task) => ({
        campaignId: campaign.id,
        projectId: copy.id,
        name: task.name,
        description: task.description,
        owner: task.owner,
        channel: task.channel,
        sortOrder: task.sortOrder,
        reusable: true,
        status: "DRAFT" as const,
      })),
    });
  }
  await audit({
    organizationId: user.organizationId,
    projectId: copy.id,
    userId: user.id,
    action: "project.duplicated",
    detail: `From ${project.name}. Facts, metrics, and token-specific drafts were not copied.`,
  });
  return copy;
}

export async function rediscover(user: SessionUser, projectId: string) {
  assertRole(user, "MARKETING");
  const project = await loadProject(user, projectId);
  const profile = await prisma.tokenProfile.findUnique({ where: { projectId } });
  const discovery = await discoverChannels({
    tokenCategory: profile?.category ?? null,
    blockchain: profile?.blockchain ?? project.blockchain,
    theme: profile?.theme ?? null,
    fetchText: async (url) => {
      try {
        const response = await safeFetch(url, { accept: "text/html,*/*" });
        return response.status < 400 ? response.body.toString("utf8") : null;
      } catch {
        return null;
      }
    },
  });
  let created = 0;
  for (const channel of discovery.channels) {
    const exists = await prisma.advertisingOpportunity.findFirst({ where: { projectId, username: channel.username } });
    if (exists) continue;
    await prisma.advertisingOpportunity.create({
      data: {
        projectId,
        name: channel.name,
        username: channel.username,
        telegramUrl: channel.telegramUrl,
        category: channel.category,
        language: channel.language,
        subscribers: channel.subscribers,
        subscriberSource: channel.subscriberSource,
        averageViews: channel.averageViews,
        viewsSource: channel.viewsSource,
        contact: channel.contact,
        relevance: channel.relevance,
        relevanceNotes: channel.relevanceNotes,
        freshness: new Date(channel.freshness),
        riskFlags: channel.riskFlags,
        recommendation: channel.recommendation,
        rankScore: channel.rankScore,
        rankConfidence: channel.rankConfidence,
        rankExplanation: channel.rankExplanation,
        sourceLabel: channel.sourceLabel,
        sourceUrl: channel.sourceUrl,
      },
    });
    created += 1;
  }
  return { created, notes: discovery.notes };
}

export async function integrations() {
  return [
    provider(
      "OpenAI",
      env.openaiKey ? "CONNECTED" : "REQUIRES_CREDENTIALS",
      "Chat completions for grounded rewrites when OPENAI_API_KEY is set.",
      Boolean(env.openaiKey),
    ),
    provider(
      "Web search",
      env.searchProvider !== "none" && env.searchKey ? "CONNECTED" : "REQUIRES_CREDENTIALS",
      "Brave or Serper. Without a key, discovery uses the public directory and imports.",
      Boolean(env.searchKey),
    ),
    provider(
      "Ethereum RPC",
      env.ethRpcUrl ? "CONNECTED" : "REQUIRES_CREDENTIALS",
      "Reads bytecode, symbol, supply, and owner when a contract address exists.",
      Boolean(env.ethRpcUrl),
    ),
    provider(
      "Etherscan",
      env.etherscanKey ? "CONNECTED" : "REQUIRES_CREDENTIALS",
      "Optional explorer source check. RPC remains the contract read.",
      Boolean(env.etherscanKey),
    ),
    provider(
      "Telegram Bot API",
      env.telegramToken ? "CONNECTED" : "REQUIRES_CREDENTIALS",
      "Official Bot API for opt-in commands and approved sends.",
      Boolean(env.telegramToken),
    ),
    provider(
      "Telegram analytics",
      "UNSUPPORTED",
      "No third-party analytics API is configured. Public t.me previews and manual imports are used instead.",
      false,
    ),
    provider(
      "Image generation",
      env.imageProvider === "openai" && env.openaiKey ? "CONNECTED" : "REQUIRES_CREDENTIALS",
      "When unset, the studio stores prompts and extracted images only.",
      env.imageProvider === "openai" && Boolean(env.openaiKey),
    ),
  ];
}

export async function testIntegration(name: string) {
  try {
    if (name === "OpenAI") {
      if (!env.openaiKey) return { status: "REQUIRES_CREDENTIALS", detail: "OPENAI_API_KEY is empty." };
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${env.openaiKey}` },
        signal: AbortSignal.timeout(12_000),
      });
      return {
        status: response.ok ? "CONNECTED" : "CONNECTION_ERROR",
        detail: response.ok ? "Model list responded." : `HTTP ${response.status}`,
      };
    }
    if (name === "Ethereum RPC") {
      if (!env.ethRpcUrl) return { status: "REQUIRES_CREDENTIALS", detail: "ETH_RPC_URL is empty." };
      const response = await fetch(env.ethRpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
        signal: AbortSignal.timeout(12_000),
      });
      const payload = (await response.json()) as { result?: string };
      return {
        status: payload.result ? "CONNECTED" : "CONNECTION_ERROR",
        detail: payload.result ? `chainId ${payload.result}` : "No chain id returned.",
      };
    }
    if (name === "Telegram Bot API") {
      if (!env.telegramToken) return { status: "REQUIRES_CREDENTIALS", detail: "TELEGRAM_BOT_TOKEN is empty." };
      const response = await fetch(`https://api.telegram.org/bot${env.telegramToken}/getMe`, { signal: AbortSignal.timeout(12_000) });
      const payload = (await response.json()) as { ok?: boolean; result?: { username?: string } };
      return {
        status: payload.ok ? "CONNECTED" : "CONNECTION_ERROR",
        detail: payload.ok ? `@${payload.result?.username}` : "getMe failed.",
      };
    }
    if (name === "Web search") {
      if (!env.searchKey) return { status: "REQUIRES_CREDENTIALS", detail: "SEARCH_API_KEY is empty." };
      return { status: "CONNECTED", detail: `${env.searchProvider} key is present. A live query is not sent from this button.` };
    }
    return { status: "UNSUPPORTED", detail: "This provider has no automated test." };
  } catch (error) {
    return { status: "CONNECTION_ERROR", detail: error instanceof Error ? error.message : "Test failed" };
  }
}

export async function crossProject(user: SessionUser) {
  const projects = await prisma.project.findMany({
    where: { organizationId: user.organizationId },
    include: { metrics: true, readiness: true, _count: { select: { facts: true, opportunities: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return projects.map((project) => {
    const applicable = project.readiness.filter((item) => item.status !== "warning");
    const score = applicable.length
      ? Math.round((applicable.filter((item) => item.status === "complete").length / applicable.length) * 100)
      : 0;
    const measured = project.metrics.filter((metric) => metric.kind === "MEASURED");
    return {
      id: project.id,
      name: project.name,
      website: project.websiteUrl,
      budgetUsd: Number(project.budgetUsd),
      readiness: score,
      facts: project._count.facts,
      opportunities: project._count.opportunities,
      measuredMetrics: measured.length,
      lesson: measured.length
        ? "Measured metrics exist. Compare them on the analytics page before copying a budget."
        : "No measured results yet, so this project cannot teach a cost lesson.",
    };
  });
}

export async function adsCheck(text: string, destination: string | null) {
  return reviewSponsoredDraft(text, destination);
}

function sectionsFor(kind: string, payload: Awaited<ReturnType<typeof projectPayload>>, unresolved: string) {
  const strategy = payload.strategy?.content ? JSON.stringify(payload.strategy.content, null, 2) : "No strategy stored.";
  const facts = payload.facts
    .map((fact) => `- ${fact.label}: ${fact.value || "empty"} [${fact.status}] ${fact.sourceUrl || ""}`)
    .join("\n");
  if (kind === "Token Research Report")
    return [
      { heading: "Facts", body: facts },
      { heading: "Unresolved", body: unresolved },
    ];
  if (kind === "Advertising Strategy")
    return [
      { heading: "Strategy", body: strategy },
      { heading: "Unresolved", body: unresolved },
    ];
  if (kind === "Telegram Sponsorship Shortlist") {
    return [
      {
        heading: "Candidates",
        body:
          payload.opportunities
            .map(
              (item) =>
                `- ${item.name} ${item.telegramUrl || ""} subscribers:${item.subscribers ?? "Unknown"} price:${item.priceUsd ?? "Unknown"}`,
            )
            .join("\n") || "None.",
      },
    ];
  }
  if (kind === "Promotional Copy Pack")
    return [{ heading: "Drafts", body: payload.drafts.map((draft) => `### ${draft.title} (${draft.tone})\n${draft.body}`).join("\n\n") }];
  if (kind === "Launch Schedule")
    return [
      {
        heading: "Tasks",
        body: payload.tasks
          .map((task) => `- ${task.name} | ${task.owner || "unassigned"} | ${task.dueAt || "unscheduled"} | ${task.status}`)
          .join("\n"),
      },
    ];
  if (kind === "Budget Plan") return [{ heading: "Budget", body: JSON.stringify(payload.project.budgetPlan, null, 2) }];
  if (kind === "Pre-Launch Preparation Checklist")
    return [
      { heading: "Readiness", body: payload.readiness.map((item) => `- [${item.status}] ${item.label} — ${item.notes || ""}`).join("\n") },
    ];
  return [
    {
      heading: "Metrics",
      body:
        payload.metrics
          .map(
            (metric) => `- ${metric.recordedAt} ${metric.name}: ${metric.value ?? "unavailable"} (${metric.kind}) source: ${metric.source}`,
          )
          .join("\n") || "No metrics stored.",
    },
    { heading: "Unresolved", body: unresolved },
  ];
}

function provider(name: string, status: string, detail: string, configured: boolean) {
  return { name, status, detail, configured };
}

function hostName(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "New project";
  }
}

function intOrNull(value: string | undefined) {
  if (!value || !value.trim()) return null;
  const number = Number(value.replace(/[, ]/g, ""));
  return Number.isFinite(number) ? Math.round(number) : null;
}

function moneyOrNull(value: string | undefined) {
  if (!value || !value.trim()) return null;
  const number = Number(value.replace(/[$, ]/g, ""));
  return Number.isFinite(number) ? new Prisma.Decimal(number) : null;
}

function serializeProject<T extends { budgetUsd: Prisma.Decimal; launchAt: Date | null }>(project: T) {
  return { ...project, budgetUsd: Number(project.budgetUsd), launchAt: project.launchAt ? project.launchAt.toISOString() : null };
}

function serializeOpportunity<
  T extends {
    priceUsd: Prisma.Decimal | null;
    cpmUsd: Prisma.Decimal | null;
    engagement: Prisma.Decimal | null;
    quotes: { priceUsd: Prisma.Decimal | null }[];
  },
>(item: T) {
  return {
    ...item,
    priceUsd: item.priceUsd == null ? null : Number(item.priceUsd),
    cpmUsd: item.cpmUsd == null ? null : Number(item.cpmUsd),
    engagement: item.engagement == null ? null : Number(item.engagement),
    quotes: item.quotes.map((quote) => ({ ...quote, priceUsd: quote.priceUsd == null ? null : Number(quote.priceUsd) })),
  };
}
