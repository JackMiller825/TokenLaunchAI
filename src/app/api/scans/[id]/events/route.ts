import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await context.params;
  const encoder = new TextEncoder();
  let timer: NodeJS.Timeout | null = null;
  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => {
        const scan = await prisma.websiteScan.findFirst({
          where: { id, project: { organizationId: user.organizationId } },
          include: { facts: { select: { id: true, label: true, value: true, status: true } } },
        });
        if (!scan) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Scan not found" })}\n\n`));
          controller.close();
          return;
        }
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ id: scan.id, status: scan.status, progress: scan.progress, stage: scan.stage, stageLabel: scan.stageLabel, error: scan.error, summary: scan.summary, facts: scan.facts, projectId: scan.projectId })}\n\n`,
          ),
        );
        if (["COMPLETED", "FAILED", "CANCELLED"].includes(scan.status)) {
          if (timer) clearInterval(timer);
          controller.close();
        }
      };
      await send();
      timer = setInterval(() => {
        void send().catch(() => {
          if (timer) clearInterval(timer);
          controller.close();
        });
      }, 1000);
      request.signal.addEventListener("abort", () => {
        if (timer) clearInterval(timer);
      });
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
