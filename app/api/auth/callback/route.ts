import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // Extract verifier from state parameter
  let verifier: string | undefined;
  if (state) {
    try {
      const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
      verifier = decoded.verifier;
    } catch (e) {
      console.log("[CALLBACK] Failed to decode state:", e);
    }
  }

  console.log("[CALLBACK] code:", !!code, "verifier:", !!verifier);
  if (!code || !verifier) {
    console.log("[CALLBACK] Missing code or verifier, redirecting to home");
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
    code_verifier: verifier,
  });

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!tokenRes.ok) {
    console.log("[CALLBACK] Token exchange failed:", tokenRes.status);
    return NextResponse.redirect(new URL("/", url.origin));
  }

  const tokenJson = await tokenRes.json();
  console.log("[CALLBACK] Got tokens successfully");

  // Create session and store tokens in server-side session store
  const sessionId = createSession({
    access_token: tokenJson.access_token,
    refresh_token: tokenJson.refresh_token,
    expires_in: tokenJson.expires_in,
    obtained_at: Date.now(),
  });

  // Use HTML meta refresh to set cookie before redirect (more reliable than 307 redirect)
  const isProd = process.env.NODE_ENV === "production";
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta http-equiv="refresh" content="0;url=/">
        <title>Redirecting...</title>
      </head>
      <body>
        <p>Authentication successful, redirecting...</p>
      </body>
    </html>
  `;

  const response = new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html',
      'Set-Cookie': `session_id=${sessionId}; Path=/; HttpOnly; ${isProd ? "Secure; " : ""}SameSite=Lax; Max-Age=${7 * 24 * 3600}`,
    },
  });

  console.log("[CALLBACK] Session created, returning HTML redirect");
  return response;
}
