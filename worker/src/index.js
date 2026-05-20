const encoder = new TextEncoder();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, service: "bernina-activation" });
      }

      if (request.method === "POST" && url.pathname === "/activation-codes") {
        return createActivationCode(request, env);
      }

      if (request.method === "POST" && url.pathname === "/activation-codes/from-password") {
        return createActivationCodeFromPassword(request, env);
      }

      if (request.method === "GET" && url.pathname === "/activation-codes") {
        return listActivationCodes(request, env);
      }

      if (request.method === "POST" && url.pathname === "/redeem") {
        return redeemActivationCode(request, env);
      }

      return json({ error: "not_found" }, 404);
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.message }, error.status);
      }

      console.error(error);
      return json({ error: "internal_error" }, 500);
    }
  }
};

async function createActivationCode(request, env) {
  requireAdmin(request, env);

  const body = await readJson(request);
  return insertActivationCode(body, env);
}

async function createActivationCodeFromPassword(request, env) {
  const body = await readJson(request);

  if (!env.LICENSE_PASSWORD || body.password !== env.LICENSE_PASSWORD) {
    return json({ error: "wrong_password" }, 401);
  }

  return insertActivationCode(body, env);
}

async function insertActivationCode(body, env) {
  const expiresAt = parseEpochSeconds(body.expiresAt ?? body.expires_at);
  const startAt = body.startAt == null && body.start_at == null
    ? null
    : parseEpochSeconds(body.startAt ?? body.start_at);

  if (!expiresAt) {
    return json({ error: "expires_at_required" }, 400);
  }

  if (startAt && startAt > expiresAt) {
    return json({ error: "start_after_expiry" }, 400);
  }

  const now = nowSeconds();
  const token = randomToken();
  const id = crypto.randomUUID();
  const tokenHash = await sha256Base64Url(token);
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 500) : "";

  await env.DB.prepare(`
    INSERT INTO activation_codes (
      id, token_hash, start_at, expires_at, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, tokenHash, startAt, expiresAt, notes, now).run();

  const activationCode = `BIANCO1.${token}`;

  return json({
    id,
    activationCode,
    qrPayload: activationCode,
    startAt,
    expiresAt,
    createdAt: now
  }, 201);
}

async function listActivationCodes(request, env) {
  requireAdmin(request, env);

  const rows = await env.DB.prepare(`
    SELECT id, start_at AS startAt, expires_at AS expiresAt, notes,
           created_at AS createdAt, redeemed_at AS redeemedAt,
           redeemed_device_id AS redeemedDeviceId
    FROM activation_codes
    ORDER BY created_at DESC
    LIMIT 50
  `).all();

  return json({ activationCodes: rows.results ?? [] });
}

async function redeemActivationCode(request, env) {
  const body = await readJson(request);
  const token = normalizeActivationCode(body.activationCode ?? body.code ?? body.token);
  const deviceId = normalizeDeviceId(body.deviceId ?? body.device_id);

  if (!token || !deviceId) {
    return json({ error: "activation_code_and_device_id_required" }, 400);
  }

  const tokenHash = await sha256Base64Url(token);
  const now = nowSeconds();
  const existing = await env.DB.prepare(`
    SELECT id, start_at AS startAt, expires_at AS expiresAt,
           redeemed_at AS redeemedAt, redeemed_device_id AS redeemedDeviceId
    FROM activation_codes
    WHERE token_hash = ?
  `).bind(tokenHash).first();

  if (!existing) {
    return json({ error: "invalid_code" }, 404);
  }

  if (existing.expiresAt <= now) {
    return json({ error: "expired_code" }, 410);
  }

  if (existing.redeemedAt && existing.redeemedDeviceId !== deviceId) {
    return json({ error: "already_redeemed" }, 409);
  }

  if (!existing.redeemedAt) {
    const update = await env.DB.prepare(`
      UPDATE activation_codes
      SET redeemed_at = ?, redeemed_device_id = ?
      WHERE token_hash = ? AND redeemed_at IS NULL
    `).bind(now, deviceId, tokenHash).run();

    if (!didChangeRows(update)) {
      const current = await env.DB.prepare(`
        SELECT redeemed_device_id AS redeemedDeviceId
        FROM activation_codes
        WHERE token_hash = ?
      `).bind(tokenHash).first();

      if (current?.redeemedDeviceId !== deviceId) {
        return json({ error: "already_redeemed" }, 409);
      }
    }
  }

  const licenseKey = await encryptedLicenseKey({
    deviceId,
    startAt: existing.startAt,
    expiresAt: existing.expiresAt
  }, env);

  return json({
    licenseKey,
    deviceId,
    startAt: existing.startAt,
    expiresAt: existing.expiresAt,
    redeemedAt: existing.redeemedAt ?? now
  });
}

function requireAdmin(request, env) {
  const expected = env.ADMIN_TOKEN;
  const supplied = request.headers.get("x-admin-token");

  if (!expected || supplied !== expected) {
    throw new HttpError("unauthorized", 401);
  }
}

async function encryptedLicenseKey({ deviceId, startAt, expiresAt }, env) {
  const password = env.LICENSE_PASSWORD;
  if (!password) {
    throw new Error("LICENSE_PASSWORD is not configured");
  }

  const payload = ["v2", deviceId, startAt ?? "", expiresAt].join(";");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const passKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 1000, hash: "SHA-256" },
    passKey,
    { name: "AES-CBC", length: 128 },
    false,
    ["encrypt"]
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv },
    key,
    encoder.encode(payload)
  );

  const bytes = new Uint8Array(salt.byteLength + iv.byteLength + encrypted.byteLength);
  bytes.set(salt, 0);
  bytes.set(iv, salt.byteLength);
  bytes.set(new Uint8Array(encrypted), salt.byteLength + iv.byteLength);

  return base64FromBytes(bytes);
}

function normalizeActivationCode(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("BIANCO1.")) {
    return trimmed.slice("BIANCO1.".length);
  }

  try {
    const url = new URL(trimmed);
    const pathToken = url.pathname.split("/").filter(Boolean).pop();
    return pathToken?.startsWith("BIANCO1.")
      ? pathToken.slice("BIANCO1.".length)
      : pathToken ?? trimmed;
  } catch {
    return trimmed;
  }
}

function normalizeDeviceId(value) {
  return typeof value === "string" && value.trim().length >= 12
    ? value.trim().slice(0, 128)
    : null;
}

function parseEpochSeconds(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }

  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return Math.floor(numeric);
    }

    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return Math.floor(parsed / 1000);
    }
  }

  return null;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError("invalid_json", 400);
  }
}

async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return base64UrlFromBytes(new Uint8Array(digest));
}

function randomToken() {
  return base64UrlFromBytes(crypto.getRandomValues(new Uint8Array(32)));
}

function base64FromBytes(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64UrlFromBytes(bytes) {
  return base64FromBytes(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function didChangeRows(result) {
  return (result.meta?.changes ?? result.changes ?? 0) > 0;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store"
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json"
    }
  });
}

class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
