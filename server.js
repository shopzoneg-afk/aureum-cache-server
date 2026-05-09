// aureum-cache-server — Render.com backend
// Caches Firestore queries so 1000 users = same reads as 1 user
// Deploy on Render as a Node.js web service (free tier OK)

const express = require("express");
const cors    = require("cors");
const fetch   = (...a) => import("node-fetch").then(({default: f}) => f(...a));

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Firebase config (same as app.js) ──────────────────────────────────────
const PID  = "aureum-system";
const AK   = "AIzaSyAxGJkh84xTmHExmEBtXNUZnh08qVKy6-I";
const BASE = `https://firestore.googleapis.com/v1/projects/${PID}/databases/(default)/documents`;

// ── In-memory cache ────────────────────────────────────────────────────────
const cache    = {};
const CACHE_TTL = 60 * 1000; // 60 seconds per entry

function isFresh(key) {
  return cache[key] && (Date.now() - cache[key].ts) < CACHE_TTL;
}

// ── Firestore helpers ──────────────────────────────────────────────────────
function parseVal(v) {
  if (v.stringValue  !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return parseInt(v.integerValue);
  if (v.doubleValue  !== undefined) return parseFloat(v.doubleValue);
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.nullValue    !== undefined) return null;
  if (v.arrayValue)  return (v.arrayValue.values || []).map(parseVal);
  if (v.mapValue) {
    const o = {};
    Object.keys(v.mapValue.fields || {}).forEach(k => o[k] = parseVal(v.mapValue.fields[k]));
    return o;
  }
  return null;
}

function parseDoc(doc) {
  const id  = doc.name.split("/").pop();
  const obj = { id };
  Object.keys(doc.fields || {}).forEach(k => obj[k] = parseVal(doc.fields[k]));
  return obj;
}

async function fsQuery(col, filters = []) {
  const f = filters.map(x => ({
    fieldFilter: { field: { fieldPath: x.f }, op: "EQUAL", value: { stringValue: x.v } }
  }));
  const where = f.length === 1 ? f[0] : f.length > 1 ? { compositeFilter: { op: "AND", filters: f } } : undefined;
  const body  = { structuredQuery: { from: [{ collectionId: col }], where, limit: 200 } };
  const r     = await fetch(`${BASE}:runQuery?key=${AK}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const arr = await r.json();
  return arr.filter(x => x.document).map(x => parseDoc(x.document));
}

// ── CORS ───────────────────────────────────────────────────────────────────
app.use(cors()); // allow all origins (Chrome extension needs this)
app.use(express.json());

// ── Routes ─────────────────────────────────────────────────────────────────

// GET /accounts/:toolName
// Returns cached accounts for a given toolName
app.get("/accounts/:toolName", async (req, res) => {
  const toolName = decodeURIComponent(req.params.toolName);
  const key      = "acc:" + toolName.toLowerCase();

  if (isFresh(key)) {
    return res.json(cache[key].data);
  }

  try {
    const data    = await fsQuery("accounts", [{ f: "toolName", v: toolName }]);
    cache[key]    = { data, ts: Date.now() };
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /tools
// Returns all tools (cached 5 min)
app.get("/tools", async (req, res) => {
  const key = "tools:all";
  if (isFresh(key) && (Date.now() - cache[key].ts) < 5 * 60 * 1000) {
    return res.json(cache[key].data);
  }
  try {
    const data = await fsQuery("tools");
    cache[key] = { data, ts: Date.now() };
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /online
// Returns count of active non-expired users (cached 5 min)
app.get("/online", async (req, res) => {
  const key = "online:count";
  if (isFresh(key) && (Date.now() - cache[key].ts) < 5 * 60 * 1000) {
    return res.json(cache[key].data);
  }
  try {
    const users = await fsQuery("users");
    const now   = Date.now();
    const count = users.filter(u => {
      if (u.status !== "active") return false;
      if (!u.expiresAt) return true;
      const exp = u.expiresAt instanceof Date ? u.expiresAt : new Date(u.expiresAt);
      return exp >= now;
    }).length;
    cache[key] = { data: { count }, ts: Date.now() };
    res.json({ count });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /health
app.get("/health", (_, res) => res.json({ status: "ok", cacheKeys: Object.keys(cache).length }));

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`Aureum Cache Server running on port ${PORT}`));
