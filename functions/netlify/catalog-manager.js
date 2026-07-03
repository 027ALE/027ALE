import { getStore } from "@netlify/blobs";

const STORE_NAME = "calendar-catalog";
const CATALOG_KEY = "catalog";

const DEFAULT_CATALOG = {
  version: 1,
  updatedAt: null,
  calendars: []
};

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "X-Content-Type-Options": "nosniff"
    },
    body: JSON.stringify(data)
  };
}

function getAdminKey(event) {
  return event.headers["x-admin-key"] || event.headers["X-Admin-Key"] || "";
}

function isAuthorized(event) {
  return getAdminKey(event) === (process.env.ADMIN_KEY || "");
}

async function readCatalog(store) {
  const catalog = await store.get(CATALOG_KEY, { type: "json" });
  if (catalog && Array.isArray(catalog.calendars)) return catalog;
  return structuredClone(DEFAULT_CATALOG);
}

async function writeCatalog(store, catalog) {
  const nextCatalog = {
    version: Number.isFinite(catalog.version) ? catalog.version : 1,
    updatedAt: new Date().toISOString(),
    calendars: catalog.calendars
  };
  await store.setJSON(CATALOG_KEY, nextCatalog);
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

async function handleGet(store, q) {
  const catalog = await readCatalog(store);

  if (!q.id) {
    return jsonResponse(200, publicCatalog(catalog));
  }

  const item = findCalendar(catalog.calendars, q.id);
  if (!item) {
    return jsonResponse(404, { error: "Not found" });
  }

  if ((item.type || (item.url ? "public" : "private")) === "public") {
    return jsonResponse(200, {
      id: item.id,
      name: item.name,
      encrypted: !!item.encrypted,
      type: "public",
      url: item.url
    });
  }

  const blobKey = item.blobKey || `calendar:${item.id}:blob`;
  const blob = await store.get(blobKey, { type: "text" });
  if (!blob) {
    return jsonResponse(404, { error: "Blob not found" });
  }

  return jsonResponse(200, {
    id: item.id,
    name: item.name,
    encrypted: !!item.encrypted,
    type: "private",
    blob
  });
}

async function handlePost(store, event) {
  if (!isAuthorized(event)) {
    return jsonResponse(403, { error: "Forbidden" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
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

    const current = await readCatalog(store);
    const nextCatalog = await writeCatalog(store, {
      version: Number.isFinite(payload.version) ? payload.version : current.version,
      calendars
    });

    return jsonResponse(200, { success: true, catalog: publicCatalog(nextCatalog) });
  }

  if (mode === "upsert") {
    const item = normalizeCalendar(payload.calendar || payload);
    const error = validateCalendar(item);
    if (error) return jsonResponse(400, { error });

    const catalog = await readCatalog(store);
    if (duplicateNameExists(catalog.calendars, item.name, item.id)) {
      return jsonResponse(409, { error: "Duplicate calendar name" });
    }

    const index = catalog.calendars.findIndex(c => c.id === item.id);
    if (index >= 0) catalog.calendars[index] = item;
    else catalog.calendars.push(item);

    const nextCatalog = await writeCatalog(store, catalog);
    return jsonResponse(200, { success: true, catalog: publicCatalog(nextCatalog) });
  }

  if (mode === "delete") {
    const id = String(payload.id || "").trim();
    if (!id) return jsonResponse(400, { error: "Invalid calendar id" });

    const catalog = await readCatalog(store);
    const removed = findCalendar(catalog.calendars, id);
    if (!removed) return jsonResponse(404, { error: "Not found" });

    const nextCalendars = catalog.calendars.filter(c => c.id !== id);
    if (removed.blobKey || removed.id) {
      const blobKey = removed.blobKey || `calendar:${removed.id}:blob`;
      try {
        await store.delete(blobKey);
      } catch {}
    }

    const nextCatalog = await writeCatalog(store, {
      version: catalog.version,
      calendars: nextCalendars
    });

    return jsonResponse(200, { success: true, catalog: publicCatalog(nextCatalog) });
  }

  return jsonResponse(400, { error: "Unknown mode" });
}

export async function handler(event) {
  try {
    const store = getStore(STORE_NAME);
    const q = event.queryStringParameters || {};

    if (event.httpMethod === "GET") return await handleGet(store, q);
    if (event.httpMethod === "POST") return await handlePost(store, event);

    return jsonResponse(405, { error: "Method Not Allowed" });
  } catch {
    return jsonResponse(500, { error: "Internal Server Error" });
  }
}