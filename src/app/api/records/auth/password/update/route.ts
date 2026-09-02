import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  void request;
  return NextResponse.json(
    {
      error: "Password sign in has been retired. Request a one-time email code instead.",
      code: "password_update_retired",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}
