import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { challengeFromVerifier, generateVerifier } from "@/lib/pkce";

export async function GET() {
  console.log("env CC present?", !!process.env.SPOTIFY_CLIENT_ID, !!process.env.SPOTIFY_CLIENT_SECRET);

  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!;
  const redirectUri = `${baseUrl}/api/auth/callback`;

  const verifier = generateVerifier(64);
  const challenge = challengeFromVerifier(verifier);
  // const isProd = process.env.NODE_ENV === "production";

  cookies().set({
    name: "pkce_verifier",
    value: verifier,
    httpOnly: true,
    // secure: isProd,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  const scope = encodeURIComponent(
    "user-read-recently-played user-read-email user-top-read playlist-read-private playlist-read-collaborative",
  );
  const authUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge_method=S256&code_challenge=${challenge}&scope=${scope}`;
  // Log status only (don’t dump the token)
    const cid =
    process.env.SPOTIFY_CLIENT_ID ??
    process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? // last-ditch, if someone mis-set it
    null;
  const secret =
    process.env.SPOTIFY_CLIENT_SECRET ??
    process.env.SPOTIFY_SECRET ?? // some projects use this name
    null;

  if (!cid || !secret) {
    console.warn("getAppToken: missing client credentials", {
      hasCID: !!cid,
      hasSECRET: !!secret,
    });
    return null;
  }

  const body = new URLSearchParams({ grant_type: "client_credentials" });
    const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${cid}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });
  console.log("[login] getAppToken status", res.status);
  return NextResponse.redirect(authUrl);
}
