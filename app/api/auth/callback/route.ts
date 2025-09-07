import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const verifier = cookies().get("pkce_verifier")?.value;
  if (!code || !verifier) {
    return NextResponse.redirect(new URL("/", url.origin));
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!;
  const redirectUri = `${baseUrl}/api/auth/callback`;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: verifier
  });

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL("/", url.origin));
  }

  const tokenJson = await tokenRes.json();

  // store token JSON (access + refresh) in an httpOnly cookie (scaffold-level; consider a real session in prod)
  cookies().set({
    name: "spotify_tokens",
    value: JSON.stringify({
      access_token: tokenJson.access_token,
      refresh_token: tokenJson.refresh_token,
      expires_in: tokenJson.expires_in,
      obtained_at: Date.now()
    }),
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 3600
  });

  // clear verifier
  cookies().set({ name: "pkce_verifier", value: "", maxAge: 0, path: "/" });

  return NextResponse.redirect(new URL("/", url.origin));
}
