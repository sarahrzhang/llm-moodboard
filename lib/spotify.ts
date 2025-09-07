type Tokens = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  obtained_at?: number;
};

export async function ensureAccessToken(tokens: Tokens): Promise<Tokens> {
  const now = Date.now();
  const ttl = (tokens.expires_in ?? 3600) * 1000;
  const obtained = tokens.obtained_at ?? (now - ttl + 1000);
  const exp = obtained + ttl - 60000; // refresh 60s early
  if (now < exp) return tokens;

  if (!tokens.refresh_token) return tokens;
  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
    client_id: clientId
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });

  if (!res.ok) return tokens;
  const j = await res.json();
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token ?? tokens.refresh_token,
    expires_in: j.expires_in,
    obtained_at: Date.now()
  };
}
