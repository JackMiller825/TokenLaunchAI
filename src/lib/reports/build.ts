import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { GroundedProfile } from "../marketing/profile";

export type ReportSection = { heading: string; body: string };

export function buildReport(input: {
  kind: string;
  projectName: string;
  website: string;
  generatedAt: string;
  profile: GroundedProfile;
  sections: ReportSection[];
}) {
  const lines = [
    `# ${input.kind}`,
    "",
    `Project: ${input.projectName}`,
    `Website: ${input.website}`,
    `Generated: ${input.generatedAt}`,
    "",
    "Unresolved or unverified facts are listed as such. This report does not fill gaps.",
    "",
    ...input.sections.flatMap((section) => [`## ${section.heading}`, "", section.body, ""]),
  ];
  return lines.join("\n");
}

export function rowsToCsv(rows: Record<string, string | number | boolean | null | undefined>[]) {
  if (!rows.length) return "empty\n";
  const headers = Object.keys(rows[0]);
  const escape = (value: string | number | boolean | null | undefined) => {
    if (value == null) return "";
    const text = String(value);
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((key) => escape(row[key])).join(","))].join("\n");
}

export async function markdownToPdf(markdown: string, title: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([612, 792]);
  let y = 750;
  const write = (text: string, size: number, face: typeof font) => {
    const words = text.split(/\s+/);
    let line = "";
    const flush = () => {
      if (y < 54) {
        page = pdf.addPage([612, 792]);
        y = 750;
      }
      page.drawText(line, { x: 48, y, size, font: face, color: rgb(0.1, 0.12, 0.16), maxWidth: 516 });
      y -= size + 4;
      line = "";
    };
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (face.widthOfTextAtSize(next, size) > 516) flush();
      line = line ? `${line} ${word}` : word;
    }
    if (line) flush();
  };
  write(title, 16, bold);
  y -= 6;
  for (const raw of markdown.split("\n")) {
    const line = raw.replace(/^#+\s*/, "").replace(/[^\x20-\x7E]/g, "");
    if (!line.trim()) {
      y -= 8;
      continue;
    }
    write(line, raw.startsWith("#") ? 12 : 10, raw.startsWith("#") ? bold : font);
  }
  return Buffer.from(await pdf.save());
}
