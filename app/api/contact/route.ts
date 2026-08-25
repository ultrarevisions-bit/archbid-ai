import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const subject = String(body.subject || "").trim();
    const message = String(body.message || "").trim();

    if (!name || !email || !subject || !message) {
      return NextResponse.json({ error: "Please complete all required fields." }, { status: 400 });
    }
    if (name.length > 100 || email.length > 200 || subject.length > 150 || message.length > 5000) {
      return NextResponse.json({ error: "One or more fields are too long." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      console.error("ARCHBID CONTACT: Supabase server configuration is missing");
      return NextResponse.json({ error: "Contact service is temporarily unavailable. Please try again later." }, { status: 503 });
    }

    const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error } = await supabase.from("contact_messages").insert({
      name,
      email,
      subject,
      message,
    });

    if (error) {
      console.error("ARCHBID CONTACT: insert failed", error);
      return NextResponse.json({ error: "We could not save your message. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("ARCHBID CONTACT: unexpected error", error);
    return NextResponse.json({ error: "Unable to send your message. Please try again." }, { status: 500 });
  }
}
