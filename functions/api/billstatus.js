export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);

  const biennium = url.searchParams.get("biennium") || "2025-26";
  const bill =
    url.searchParams.get("billNumber") ||  // what your HTML sends
    url.searchParams.get("bill");          // fallback
  if (!bill) return json({ ok: false, error: "Missing ?billNumber=####" }, 400);
  // Cache key includes biennium+bill
  const cacheKey = new Request(url.toString(), request);
  const cache = caches.default;

  // Serve cached response when available
  const cached = await cache.match(cacheKey);
  if (cached) return withCors(cached);

  // WA endpoint (HTTP GET)
  const waUrl =
    "https://wslwebservices.leg.wa.gov/legislationservice.asmx/" +
    "GetLegislativeStatusChangesByBillNumber" +
    `?biennium=${encodeURIComponent(biennium)}` +
    `&billNumber=${encodeURIComponent(bill)}` +
    `&beginDate=${encodeURIComponent("1900-01-01")}` +
    `&endDate=${encodeURIComponent("2100-01-01")}`;

  const resp = await fetch(waUrl, {
    headers: { "User-Agent": "olympiadidthat-cloudflare" },
  });

  if (!resp.ok) {
    return json(
      { error: "WA service error", status: resp.status, statusText: resp.statusText },
      502
    );
  }

  const xml = await resp.text();

  // Minimal XML extraction (no DOMParser in Workers runtime)
  // We extract all <LegislativeStatus> blocks, then pick the last one.
  const items = [];
  const reItem = /<LegislativeStatus\b[^>]*>([\s\S]*?)<\/LegislativeStatus>/gi;
  let m;
  while ((m = reItem.exec(xml)) !== null) {
    const block = m[1];
    items.push({
      billId: pick(block, "BillId"),
      status: pick(block, "Status"),
      actionDate: pick(block, "ActionDate"),
      historyLine: pick(block, "HistoryLine"),
      amendedByOppositeBody: pick(block, "AmendedByOppositeBody"),
      partialVeto: pick(block, "PartialVeto"),
      veto: pick(block, "Veto"),
      amendmentsExist: pick(block, "AmendmentsExist"),
    });
  }

  if (!items.length) {
    return json({ error: "No status records found", biennium, bill }, 404);
  }

  const current = items[items.length - 1];

  const out = {
    biennium,
    billNumber: bill,
    current,
    // uncomment if you want the whole history array:
    // history: items,
    fetchedAt: new Date().toISOString(),
  };

  const response = json(out, 200, {
    // Cache at edge for 5 minutes (tweak freely)
    "Cache-Control": "public, max-age=0, s-maxage=300",
  });

  // Put into CF cache (respects headers above)
  context.waitUntil(cache.put(cacheKey, response.clone()));

  return withCors(response);
}

function pick(block, tag) {
  // Handles simple tags like <Status>...</Status>
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  return m ? decodeXml(m[1].trim()) : null;
}

function decodeXml(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function withCors(resp) {
  const h = new Headers(resp.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(resp.body, { status: resp.status, headers: h });
}
