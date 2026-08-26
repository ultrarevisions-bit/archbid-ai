import { Document, HeadingLevel, Packer, Paragraph } from "docx";
import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function textParagraphs(text: string) {
  return String(text || "").split(/\n\s*\n/).filter(Boolean).map(part => new Paragraph({ text: part.trim(), spacing: { after: 180 } }));
}

function bulletParagraphs(items: string[]) {
  return (items || []).filter(Boolean).map(item => new Paragraph({ text: item, bullet: { level: 0 }, spacing: { after: 100 } }));
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const analysisId = new URL(request.url).searchParams.get("analysisId");
  if (!analysisId) return NextResponse.json({ error: "Missing analysis ID." }, { status: 400 });

  const { data: purchase } = await supabase.from("proposal_purchases").select("id").eq("analysis_id", analysisId).eq("user_id", user.id).eq("status", "paid").maybeSingle();
  if (!purchase) return NextResponse.json({ error: "A paid proposal purchase is required." }, { status: 402 });

  const { data: row, error } = await supabase.from("proposals").select("content").eq("analysis_id", analysisId).eq("user_id", user.id).eq("status", "ready").maybeSingle();
  if (error || !row?.content) return NextResponse.json({ error: "The proposal is not ready for download." }, { status: 404 });

  const p = row.content as Record<string, any>;
  const children: Paragraph[] = [
    new Paragraph({ text: p.title || "Architecture Proposal", heading: HeadingLevel.TITLE }),
    new Paragraph({ text: "ArchBid AI · Proposal Draft", spacing: { after: 240 } }),
    new Paragraph({ text: "Review and complete all firm-specific information before submission.", spacing: { after: 300 } }),
    new Paragraph({ text: "Cover Letter", heading: HeadingLevel.HEADING_1 }), ...textParagraphs(p.coverLetter),
    new Paragraph({ text: "Executive Summary", heading: HeadingLevel.HEADING_1 }), ...textParagraphs(p.executiveSummary),
    new Paragraph({ text: "Project Understanding", heading: HeadingLevel.HEADING_1 }), ...textParagraphs(p.projectUnderstanding),
    new Paragraph({ text: "Our Approach", heading: HeadingLevel.HEADING_1 }), ...bulletParagraphs(p.approach),
    new Paragraph({ text: "Scope & Deliverables", heading: HeadingLevel.HEADING_1 }), ...bulletParagraphs(p.scopeAndDeliverables),
    new Paragraph({ text: "Schedule & Milestones", heading: HeadingLevel.HEADING_1 }), ...bulletParagraphs(p.schedule),
    new Paragraph({ text: "Team & Relevant Experience", heading: HeadingLevel.HEADING_1 }), ...bulletParagraphs(p.teamAndExperience),
    new Paragraph({ text: "Compliance with the RFP", heading: HeadingLevel.HEADING_1 }), ...bulletParagraphs(p.compliance),
    new Paragraph({ text: "Assumptions & Items to Confirm", heading: HeadingLevel.HEADING_1 }), ...bulletParagraphs(p.assumptions),
    new Paragraph({ text: "Closing", heading: HeadingLevel.HEADING_1 }), ...textParagraphs(p.closing),
  ];

  if (Array.isArray(p.placeholders) && p.placeholders.length) {
    children.splice(3, 0, new Paragraph({ text: "Firm Information — To Be Completed", heading: HeadingLevel.HEADING_1 }), ...bulletParagraphs(p.placeholders));
  }

  const doc = new Document({ sections: [{ properties: { page: { margin: { top: 720, right: 900, bottom: 720, left: 900 } } }, children }] });
  const buffer = await Packer.toBuffer(doc);
  const safeTitle = String(p.title || "ArchBid Proposal").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || "ArchBid-Proposal";
  return new NextResponse(buffer as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safeTitle}.docx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
