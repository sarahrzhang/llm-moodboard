import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { challengeFromVerifier, generateVerifier } from "@/lib/pkce";

export async function GET() {
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
    "user-read-recently-played user-read-email user-top-read playlist-read-private",
  );
  const authUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge_method=S256&code_challenge=${challenge}&scope=${scope}`;

  return NextResponse.redirect(authUrl);
}
