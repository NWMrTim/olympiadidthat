// /assets/site.js
(function () {
  "use strict";

  function getQueryFromHeader() {
    return (document.getElementById("q")?.value || "").trim();
  }

  function goToSiteSearch(q) {
    if (!q) return false;
    window.location.href = "/search.html?q=" + encodeURIComponent(q);
    return false;
  }

  // ✅ Called by the header search form
  window.ODT_siteSearch = function (e) {
    if (e && e.preventDefault) e.preventDefault();
    const q = getQueryFromHeader();
    return goToSiteSearch(q);
  };

  // Optional helper if you want to call it from buttons later
  window.ODT_goSearch = function (q) {
    return goToSiteSearch((q || "").trim());
  };
})();
