import { NextResponse } from "next/server";
import { challengeFromVerifier, generateVerifier } from "@/lib/pkce";

export const dynamic = "force-dynamic";

export async function GET() {
  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!;
  const redirectUri = `${baseUrl}/api/auth/callback`;

  const verifier = generateVerifier(64);
  const challenge = challengeFromVerifier(verifier);

  const scope = encodeURIComponent(
    "user-read-recently-played user-read-email user-top-read playlist-read-private",
  );

  // Encode the verifier in the state parameter so Spotify sends it back
  // This is more reliable than cookies for cross-origin OAuth flows
  const state = Buffer.from(JSON.stringify({ verifier })).toString("base64url");

  const authUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge_method=S256&code_challenge=${challenge}&state=${state}&scope=${scope}`;

  console.log("[LOGIN] Redirecting to Spotify with state");
  return NextResponse.redirect(authUrl);
}
