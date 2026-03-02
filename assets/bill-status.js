// /assets/bill-status.js
// Shared bill status updater for ODT
// Uses WA Legislature SOAP endpoint GetCurrentStatus
// Updates each bill's `status` and the corresponding `.pill` in the DOM (if present)

(() => {
  const SOAP_URL = "https://wslwebservices.leg.wa.gov/legislationservice.asmx";

  // ---------- helpers ----------
  function escapeXml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function codeIdFromParts(billType, billNumber) {
    // matches your existing codeId() logic: "HB 2034" -> "hb2034"
    return (billType + billNumber).toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function normalize(s) {
    return (s || "").toLowerCase().trim();
  }

  // ---------- classify WA "HistoryLine" into your pill categories ----------
  // You can expand this as you see more real status strings.
  function classifyHistoryLine(historyLine) {
    const s = normalize(historyLine);

    // "Effective" / "Signed" / enacted-type
    if (
      s.includes("effective") ||
      s.includes("chapter") ||
      s.includes("signed by governor") ||
      s.includes("signed into law") ||
      s.includes("governor signed")
    ) {
      return { pillClass: "signed", label: "Signed / Effective" };
    }

    // Passed-type (but not final signed)
    if (
      s.includes("passed") ||
      s.includes("third reading, passed") ||
      s.includes("yeas") && s.includes("nays") ||
      s.includes("adopted") ||
      s.includes("concurred") ||
      s.includes("final passage")
    ) {
      return { pillClass: "passed", label: "Passed" };
    }

    // Committee / referred / rules / exec action
    if (
      s.includes("referred to") ||
      s.includes("re-ref") ||
      s.includes("committee") ||
      s.includes("executive action") ||
      s.includes("ways & means") ||
      s.includes("rules") ||
      s.includes("appropriations") ||
      s.includes("transportation") ||
      s.includes("finance") ||
      s.includes("hearing") ||
      s.includes("do pass") ||
      s.includes("do pass substitute") ||
      s.includes("public hearing")
    ) {
      // If the line says "referred to X", show as Committee: X (nice UX)
      const m = historyLine.match(/referred to\s+(.+?)(?:\.|$)/i);
      const committee = m ? m[1].trim() : "";
      const label = committee ? `Committee: ${committee}` : "In Committee";
      return { pillClass: "committee", label };
    }

    // Introduced / first reading / filed
    if (
      s.includes("first reading") ||
      s.includes("introduced") ||
      s.includes("prefiled") ||
      s.includes("filed") ||
      s.includes("read first time")
    ) {
      return { pillClass: "introduced", label: "Introduced" };
    }

    // Dead / killed / failed
    if (
      s.includes("died") ||
      s.includes("dead") ||
      s.includes("failed") ||
      s.includes("not passed") ||
      s.includes("did not pass") ||
      s.includes("no action") ||
      s.includes("returned to") && s.includes("without action") ||
      s.includes("withdrawn") ||
      s.includes("stricken") ||
      s.includes("removed from") && s.includes("calendar")
    ) {
      return { pillClass: "blocked", label: "Blocked / Dead" };
    }

    // Default bucket
    return { pillClass: "proposed", label: "Proposed / Unknown" };
  }

  // ---------- SOAP call ----------
  async function getCurrentStatus({ biennium, billNumber }) {
    // NOTE: The endpoint takes biennium + billNumber (number only)
    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetCurrentStatus xmlns="http://WSLWebServices.leg.wa.gov/">
      <biennium>${escapeXml(biennium)}</biennium>
      <billNumber>${escapeXml(billNumber)}</billNumber>
    </GetCurrentStatus>
  </soap:Body>
</soap:Envelope>`;

    const res = await fetch(SOAP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": "http://WSLWebServices.leg.wa.gov/GetCurrentStatus",
      },
      body: soapBody,
    });

    if (!res.ok) throw new Error(`SOAP HTTP ${res.status} ${res.statusText}`);

    const text = await res.text();
    const xml = new DOMParser().parseFromString(text, "text/xml");

    // These elements are in the WSL namespace; easiest is query by localName
    const pick = (name) => {
      const nodes = Array.from(xml.getElementsByTagName("*"));
      const n = nodes.find((x) => x.localName === name);
      return n ? (n.textContent || "").trim() : "";
    };

    return {
      billId: pick("BillId"),
      historyLine: pick("HistoryLine"),
      actionDate: pick("ActionDate"),
      rawXml: text,
    };
  }

  // ---------- DOM update ----------
  function applyPillToDom(bill, statusLabel, pillClass) {
    const id = bill.domId || codeIdFromParts(bill.billType, bill.billNumber);
    const el = document.getElementById(id);
    if (!el) return; // card might not exist on this page

    const pill = el.querySelector(".pill");
    if (!pill) return;

    pill.classList.remove("signed", "passed", "committee", "introduced", "blocked", "proposed");
    pill.classList.add(pillClass);
    pill.textContent = statusLabel;
  }

  // ---------- public function ----------
  // options:
  //   - dryRun: true => don't touch DOM, just console output
  //   - logUnknown: true => log lines that classify as "proposed/unknown" so you can refine mapping
  //   - throttleMs: spacing between requests (polite)
  async function ODT_updateBills(bills, options = {}) {
    const { dryRun = false, logUnknown = true, throttleMs = 350 } = options;

    const seenHistoryLines = new Set();

    for (let i = 0; i < bills.length; i++) {
      const bill = bills[i];
      if (!bill || !bill.biennium || !bill.billNumber) continue;

      try {
        const r = await getCurrentStatus({
          biennium: bill.biennium,
          billNumber: bill.billNumber,
        });

        const history = r.historyLine || "";
        const { pillClass, label } = classifyHistoryLine(history);

        // Prefer the more specific label from WA line when we can:
        // If committee label is "Committee: X" from parsing, keep it.
        // Otherwise use our classifier label.
        const display = label;

        // Update data object
        bill.status = display;
        bill._wa = {
          billId: r.billId,
          historyLine: r.historyLine,
          actionDate: r.actionDate,
        };

        if (!dryRun) applyPillToDom(bill, display, pillClass);

        // Logging to build your "all statuses" list
        if (logUnknown && pillClass === "proposed") {
          if (history && !seenHistoryLines.has(history)) {
            seenHistoryLines.add(history);
            console.warn("[ODT] Unmapped HistoryLine:", history, "=>", bill.code || `${bill.billType} ${bill.billNumber}`);
          }
        }
      } catch (err) {
        console.warn("[ODT] Status fetch failed:", bill.code || `${bill.billType} ${bill.billNumber}`, err);
      }

      if (throttleMs) await new Promise((r) => setTimeout(r, throttleMs));
    }

    return bills;
  }

  // expose globally
  window.ODT_updateBills = ODT_updateBills;
})();
