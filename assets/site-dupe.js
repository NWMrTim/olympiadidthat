// /assets/site.js
(function () {
  "use strict";

  /* =========================
     Search helpers
  ========================= */

  function normalizeQuery(q) {
    return (q || "")
      .replace(/\u00A0/g, " ")   // non-breaking space -> normal space
      .replace(/\s+/g, " ")     // collapse whitespace
      .trim();
  }

  function getHeaderSearchInput(form) {
    if (form && form.querySelector) {
      return form.querySelector('#q, input[type="search"], input[name="q"]');
    }
    return null;
  }

  function findQueryInputFromEvent(e) {
    const form = e?.target?.closest?.("form") || e?.target;

    // 1) Prefer the form that triggered submit
    const inForm = getHeaderSearchInput(form);
    if (inForm) return inForm;

    // 2) Fallback: look in the header first
    const header = document.querySelector(".siteHeader");
    const inHeader = header?.querySelector?.('#q, input[type="search"], input[name="q"]');
    if (inHeader) return inHeader;

    // 3) Last resort: any search input
    return document.querySelector('#q, input[type="search"], input[name="q"]');
  }

  function goToSiteSearch(q) {
    q = normalizeQuery(q);
    if (!q) return false;
    window.location.href = "/search.html?q=" + encodeURIComponent(q);
    return false;
  }

  // ✅ Called by the header search form
  window.ODT_siteSearch = function (e) {
    if (e && e.preventDefault) e.preventDefault();
    const input = findQueryInputFromEvent(e);
    const q = input ? input.value : "";
    return goToSiteSearch(q);
  };

  // Optional helper
  window.ODT_goSearch = function (q) {
    return goToSiteSearch(q);
  };

  /* =========================
     Donate button wiring
  ========================= */

  (function wireDonateButtons() {
    const DONATE_URL = "https://pu4wa.com/donate/";

    function apply() {
      document.querySelectorAll("a.fund-btn").forEach(a => {
        a.href = DONATE_URL;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      });
    }

    // Run now (covers initial DOM)
    apply();

    // Watch for injected footer/header/partials (covers late DOM)
    if ("MutationObserver" in window) {
      const mo = new MutationObserver(() => apply());
      mo.observe(document.documentElement, { childList: true, subtree: true });
    }
  })();

})();
