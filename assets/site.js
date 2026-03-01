// /assets/site.js
(function () {
  "use strict";

  function findQueryInputFromEvent(e){
    const form = e?.target?.closest?.("form") || e?.target;
    if (form && form.querySelector) {
      return form.querySelector('#q, input[type="search"], input[name="q"]');
    }
    return document.querySelector('#q, input[type="search"], input[name="q"]');
  }

  function goToSiteSearch(q) {
    q = (q || "").trim();
    if (!q) return false;
    window.location.href = "/search.html?q=" + encodeURIComponent(q);
    return false;
  }

  window.ODT_siteSearch = function (e) {
    if (e && e.preventDefault) e.preventDefault();
    const input = findQueryInputFromEvent(e);
    const q = (input?.value || "").trim();
    return goToSiteSearch(q);
  };

  window.ODT_goSearch = function (q) {
    return goToSiteSearch((q || "").trim());
  };
})();
