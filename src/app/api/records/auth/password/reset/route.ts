import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  void request;
  return NextResponse.json(
    {
      error: "Password recovery is no longer needed. Request a one-time email code to sign in.",
      code: "password_recovery_retired",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}
