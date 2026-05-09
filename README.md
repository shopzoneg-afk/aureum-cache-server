# Aureum Cache Server

Backend proxy that caches Firestore queries for the Aureum Chrome Extension.
Reduces Firestore reads from ~300,000/day to ~5,000/day regardless of user count.

## Deploy on Render (free)

1. Push this folder to a GitHub repo
2. Go to https://render.com → New → Web Service
3. Connect your repo
4. Settings:
   - **Runtime**: Node
   - **Build command**: `npm install`
   - **Start command**: `npm start`
5. Click Deploy
6. Copy your Render URL (e.g. `https://aureum-cache.onrender.com`)
7. Open `app.js` in the extension and set:
   ```js
   var CACHE_URL = "https://aureum-cache.onrender.com";
   ```

## Endpoints

| Endpoint | Cache TTL | Description |
|---|---|---|
| `GET /accounts/:toolName` | 60s | Accounts for a tool |
| `GET /tools` | 5 min | All tools list |
| `GET /online` | 5 min | Active user count |
| `GET /health` | none | Server status |

## Quota savings

| Scenario | Without cache | With cache |
|---|---|---|
| 50 users | 1,500,000 reads/day | ~5,000 reads/day |
| 200 users | 6,000,000 reads/day | ~5,000 reads/day |
| 1,000 users | 30,000,000 reads/day | ~5,000 reads/day |
