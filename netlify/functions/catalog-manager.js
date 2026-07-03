import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(__dirname, "catalog.json");

const DEFAULT_CATALOG = {
  version: 1,
  updatedAt: null,
  calendars: []
};

function jsonResponse(statusCode, data) {
  return new Response(JSON.stringify(data), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function getAdminKey(request) {
  return request.headers.get("x-admin-key") || "";
}

function isAuthorized(request) {
  return getAdminKey(request) === (process.env.ADMIN_KEY || "");
}

// LEGGE DAL FILE JSON LOCALE
async function readCatalog() {
  try {
    const data = await fs.readFile(CATALOG_PATH, "utf8");
    const catalog = JSON.parse(data);
    if (catalog && Array.isArray(catalog.calendars)) return catalog;
    return structuredClone(DEFAULT_CATALOG);
  } catch {
    return structuredClone(DEFAULT_CATALOG);
  }
}

// SCRIVE NEL FILE JSON LOCALE
async function writeCatalog(catalog) {
  const nextCatalog = {
    version: Number.isFinite(catalog.version) ? catalog.version : 1,
    updatedAt: new Date().toISOString(),
    calendars: catalog.calendars
  };
  await fs.writeFile(CATALOG_PATH, JSON.stringify(nextCatalog, null, 2), "utf8");
  return nextCatalog;
}

function publicCatalog(catalog) {
  return {
    version: catalog.version || 1,
    updatedAt: catalog.updatedAt || null,
    calendars: catalog.calendars.map(c => ({
      id: c.id,
      name: c.name,
      encrypted: !!c.encrypted,
      type: c.type || (c.url ? "public" : "private")
    }))
  };
}

function normalizeCalendar(item) {
  return {
    id: String(item.id || "").trim(),
    name: String(item.name || "").trim(),
    encrypted: !!item.encrypted,
    type: item.type === "public" ? "public" : "private",
    url: typeof item.url === "string" ? item.url.trim() : "",
    blobKey: typeof item.blobKey === "string" ? item.blobKey.trim() : ""
  };
}

function validateCalendar(item) {
  if (!item.id) return "Invalid calendar id";
  if (!item.name) return "Invalid calendar name";
  return null;
}

function duplicateNameExists(calendars, name, ignoreId = null) {
  const target = name.trim().toLowerCase();
  return calendars.some(
    c => c.id !== ignoreId && String(c.name || "").trim().toLowerCase() === target
  );
}

function findCalendar(calendars, id) {
  return calendars.find(c => c.id === id) || null;
}

async function handleGet(url) {
  const q = Object.fromEntries(url.searchParams.entries());
  const catalog = await readCatalog();

  if (!q.id) return jsonResponse(200, publicCatalog(catalog));

  const item = findCalendar(catalog.calendars, q.id);
  if (!item) return jsonResponse(404, { error: "Not found" });

  if ((item.type || (item.url ? "public" : "private")) === "public") {
    return jsonResponse(200, {
      id: item.id,
      name: item.name,
      encrypted: !!item.encrypted,
      type: "public",
      url: item.url
    });
  }

  // NOTA: I Calendari privati cercavano un blob esterno. 
  // Ora che usiamo il JSON locale, restituiamo un errore controllato.
  return jsonResponse(400, { 
    error: "Private blobs are disabled. This calendar must be switched to public." 
  });
}

async function handlePost(request) {
  if (!isAuthorized(request)) return jsonResponse(403, { error: "Forbidden" });

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON" });
  }

  if (!payload || typeof payload !== "object") {
    return jsonResponse(400, { error: "Invalid payload" });
  }

  const mode = payload.mode || "replace";

  if (mode === "replace") {
    if (!Array.isArray(payload.calendars)) {
      return jsonResponse(400, { error: "Invalid catalog" });
    }

    const calendars = payload.calendars.map(normalizeCalendar);
    for (const c of calendars) {
      const error = validateCalendar(c);
      if (error) return jsonResponse(400, { error });
    }

    const names = new Set();
    for (const c of calendars) {
      const key = c.name.toLowerCase();
      if (names.has(key)) return jsonResponse(409, { error: "Duplicate calendar name" });
      names.add(key);
    }

    const current = await readCatalog();
    const nextCatalog = await writeCatalog({
      version: Number.isFinite(payload.version) ? payload.version : current.version,
      calendars
    });

    return jsonResponse(200, { success: true, catalog: publicCatalog(nextCatalog) });
  }

  if (mode === "upsert") {
    const item = normalizeCalendar(payload.calendar || payload);
    const error = validateCalendar(item);
    if (error) return jsonResponse(400, { error });

    const catalog = await readCatalog();
    if (duplicateNameExists(catalog.calendars, item.name, item.id)) {
      return jsonResponse(409, { error: "Duplicate calendar name" });
    }

    const index = catalog.calendars.findIndex(c => c.id === item.id);
    if (index >= 0) catalog.calendars[index] = item;
    else catalog.calendars.push(item);

    const nextCatalog = await writeCatalog(catalog);
    return jsonResponse(200, { success: true, catalog: publicCatalog(nextCatalog) });
  }

  if (mode === "delete") {
    const id = String(payload.id || "").trim();
    if (!id) return jsonResponse(400, { error: "Invalid calendar id" });

    const catalog = await readCatalog();
    const removed = findCalendar(catalog.calendars, id);
    if (!removed) return jsonResponse(404, { error: "Not found" });

    const nextCalendars = catalog.calendars.filter(c => c.id !== id);

    const nextCatalog = await writeCatalog({
      version: catalog.version,
      calendars: nextCalendars
    });

    return jsonResponse(200, { success: true, catalog: publicCatalog(nextCatalog) });
  }

  return jsonResponse(400, { error: "Unknown mode" });
}

export default async function handler(request, context) {
  try {
    const url = new URL(request.url);

    if (request.method === "GET") return await handleGet(url);
    if (request.method === "POST") return await handlePost(request);

    return jsonResponse(405, { error: "Method Not Allowed" });
  } catch (error) {
    return jsonResponse(500, {
      error: "Internal Server Error",
      detail: String(error?.message || error)
    });
  }
}
