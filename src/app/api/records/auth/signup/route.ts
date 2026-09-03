import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  void request;
  return NextResponse.json(
    {
      error: "Password account creation has been retired. Continue with a one-time email code instead.",
      code: "password_signup_retired",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}
