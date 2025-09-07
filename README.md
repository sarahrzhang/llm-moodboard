# LLM Moodboard 

Micro-MVP: connect Spotify, fetch your top on-repeat, analyze with an LLM into structured JSON (mood tags, activities, energy band, captions, playlist titles, cover prompt).

## 1) Create a Spotify App 
- Go to Spotify Developer Dashboard → Create App.
- **Add Redirect URI:** `http://127.0.0.1:5173/api/auth/callback` (loopback IP; `localhost` is not allowed). You can also use IPv6: `http://[::1]:5173/api/auth/callback`.
- Scopes needed: `playlist-read-private` `user-top-read` `user-read-recently-played`.
- Copy your **Client ID**.

## 2) Configure env
Copy `.env.local.example` to `.env.local` and fill:
```
NEXT_PUBLIC_BASE_URL=http://127.0.0.1:5173
SPOTIFY_CLIENT_ID=your_spotify_client_id
OPENAI_API_KEY=sk-...     # optional; if none, use a rules-based fallback
```

## 3) Install & run
```bash
npm i
npm run dev
# open http://127.0.0.1:5173
```

## 4) Use
- Click **Sign in with Spotify** → authorize.
- Click **Analyze with AI**.
- Toggle **Hype / Focus / Chill** to see different mode output.
- Copy a playlist title; expand **Why this?**.

## Notes
- For sandbox, tokens are stored in an httpOnly cookie (scaffold-level).
- `/api/analyze` calls OpenAI's Chat Completions with `response_format: json_object` and validates against a Zod schema. If the key is missing or validation fails, a deterministic fallback is used.
- If the Spotify dashboard rewrites `127.0.0.1` to `localhost`, try IPv6 (`http://[::1]:5173/...`) or deploy to a real https domain (Vercel/Netlify) and use that domain in your Redirect URIs.

