export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Correlation ID for tracing a single request end-to-end
    const rid = crypto.randomUUID?.() || Math.random().toString(36).slice(2);
    const started = Date.now();

    // Basic request context for logs
    const ctxInfo = {
      rid,
      method: request.method,
      path: url.pathname,
      host: url.hostname,
      origin: request.headers.get("Origin") || null,
      cfRay: request.headers.get("cf-ray") || null,
      ip: request.headers.get("CF-Connecting-IP") || null,
      ua: request.headers.get("User-Agent") || null,
    };

    // Healthcheck: GET /ping -> { pong: true }
    if (request.method === "GET" && url.pathname === "/ping") {
      console.log("[PING]", ctxInfo);
      return json({ pong: true, rid }, 200, corsHeaders(env, request));
    }

    // CORS preflight
    if (request.method === "OPTIONS") {
      console.log("[CORS][OPTIONS]", ctxInfo);
      return new Response(null, { headers: corsHeaders(env, request) });
    }

    // Only allow POST /request
    if (request.method !== "POST" || url.pathname !== "/request") {
      console.log("[ROUTING][MISS]", ctxInfo);
      return json({ error: "Not found", rid }, 404, corsHeaders(env, request));
    }

    // Parse JSON body safely
    let data;
    try {
      data = await request.json();
    } catch (e) {
      console.error("[PARSE][JSON_ERROR]", { ...ctxInfo, err: String(e) });
      return json({ error: "Invalid JSON", rid }, 400, corsHeaders(env, request));
    }

    const { name, email, message, company } = data || {};

    // Log minimal body meta (no sensitive content)
    console.log("[BODY][RECEIVED]", {
      ...ctxInfo,
      hasName: Boolean(name),
      hasEmail: Boolean(email),
      msgLen: typeof message === "string" ? message.length : null,
      hasHoneypot: Boolean(company && company.trim()),
    });

    // Honeypot
    if (company && company.trim() !== "") {
      console.warn("[SPAM][HONEYPOT_HIT]", ctxInfo);
      return json({ ok: true, rid }, 200, corsHeaders(env, request));
    }

    // Basic validation
    if (!name || !isValidEmail(email) || !message || message.trim().length < 5) {
      console.warn("[VALIDATION][FAILED]", {
        ...ctxInfo,
        reason: {
          missingName: !name,
          invalidEmail: !isValidEmail(email || ""),
          shortMessage: !(message && message.trim().length >= 5),
        },
      });
      return json({ error: "Validation failed", rid }, 422, corsHeaders(env, request));
    }

    // Compose email to Resend
    const subject = `New request from ${name}`;
    const text = `Name: ${name}\nEmail: ${email}\nMessage:\n${message}`;

    // Send via Resend (with timing + error body on failure)
    let resendStatus = null;
    let resendBody = null;
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.FROM_EMAIL,
          to: [env.TO_EMAIL],
          subject,
          text,
          reply_to: email,
        }),
      });

      resendStatus = r.status;
      const raw = await r.text();
      // Try to parse JSON, otherwise keep raw text
      try { resendBody = JSON.parse(raw); } catch { resendBody = raw; }

      if (!r.ok) {
        console.error("[RESEND][FAIL]", {
          ...ctxInfo,
          status: resendStatus,
          body: truncate(resendBody, 800),
          from: env.FROM_EMAIL,
          to: env.TO_EMAIL,
        });
        return json(
          { error: "Send failed", details: safeString(resendBody), rid },
          502,
          corsHeaders(env, request)
        );
      }
    } catch (e) {
      console.error("[RESEND][ERROR]", { ...ctxInfo, err: String(e) });
      return json({ error: "Resend error", rid }, 502, corsHeaders(env, request));
    }

    // Success
    console.log("[SUCCESS]", {
      ...ctxInfo,
      tookMs: Date.now() - started,
      resendStatus,
      resendResp: truncate(resendBody, 400),
    });
    return json({ ok: true, rid }, 200, corsHeaders(env, request));
  },
};

// ---------- Helpers ----------

function corsHeaders(env, req) {
  const origin = req.headers.get("Origin") || "";
  const allowed = new Set([
    "https://lazure-nikiti.gr",
    "https://www.lazure-nikiti.gr",
    "https://api.lazure-nikiti.gr",
  ]);
  const allow = allowed.has(origin)
    ? origin
    : env.ALLOW_ORIGIN || "https://lazure-nikiti.gr";

  return {
    "Access-Control-Allow-Origin": allow,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}

function json(payload, status, headers) {
  return new Response(JSON.stringify(payload), { status, headers });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Avoid dumping huge objects in logs
function truncate(v, max = 400) {
  const s = typeof v === "string" ? v : safeString(v);
  return s.length > max ? s.slice(0, max) + "…[truncated]" : s;
}
function safeString(v) {
  try { return typeof v === "string" ? v : JSON.stringify(v); }
  catch { return String(v); }
}
