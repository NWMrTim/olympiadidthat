export async function onRequest(context) {
  // Handle preflight (safe for future CORS cases)
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }
  return handleRequest(context);
}

async function handleRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  const biennium = url.searchParams.get("biennium") || "2025-26";
  const bill =
    url.searchParams.get("billNumber") ||
    url.searchParams.get("bill");

  if (!bill) {
    return json({ ok: false, error: "Missing ?billNumber=####" }, 400);
  }

  try {
    const waUrl =
      "https://wslwebservices.leg.wa.gov/legislationservice.asmx/" +
      "GetLegislativeStatusChangesByBillNumber" +
      `?biennium=${encodeURIComponent(biennium)}` +
      `&billNumber=${encodeURIComponent(bill)}` +
      `&beginDate=1900-01-01` +
      `&endDate=2100-01-01`;

    const resp = await fetch(waUrl);

    if (!resp.ok) {
      return json({ ok: false, error: "WA service error" }, 502);
    }

    const xml = await resp.text();

    const matches = [...xml.matchAll(/<LegislativeStatus[\s\S]*?<\/LegislativeStatus>/gi)];

    if (!matches.length) {
      return json({ ok: false, error: "No status found" }, 404);
    }

    const last = matches[matches.length - 1][0];

    const statusText = pick(last, "Status") || "Unknown";
    const historyLine = pick(last, "HistoryLine");
    const actionDate = pick(last, "ActionDate");

    return json({
      ok: true,
      biennium,
      billNumber: bill,
      statusText,
      historyLine,
      actionDate
    });

  } catch (err) {
    return json({ ok: false, error: err.message }, 500);
  }
}

function pick(block, tag) {
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

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
