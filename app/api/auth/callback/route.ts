import { NextRequest } from "next/server";
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
      console.log("[callback] Failed to decode state:", e);
    }
  }

  if (!code || !verifier) {
    return Response.redirect(new URL("/", url.origin));
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
    const err = await tokenRes.text();
    console.log("[callback] token exchange failed:", tokenRes.status, err);
    return Response.redirect(new URL("/", url.origin));
  }

  const tokenJson = await tokenRes.json();

  const sessionId = createSession({
    access_token: tokenJson.access_token,
    refresh_token: tokenJson.refresh_token,
    expires_in: tokenJson.expires_in,
    obtained_at: Date.now(),
  });

  // Use HTML meta refresh to set cookie before redirect (more reliable than 307 redirect)
  const isProd = process.env.NODE_ENV === "production";
  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="refresh" content="0;url=/">
    <title>Redirecting...</title>
  </head>
  <body><p>Authentication successful, redirecting...</p></body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html",
      "Set-Cookie": `session_id=${sessionId}; Path=/; HttpOnly; ${isProd ? "Secure; " : ""}SameSite=Lax; Max-Age=${7 * 24 * 3600}`,
    },
  });
}
