(function () {
  "use strict";

  var CATEGORY_COLORS = {
    "重要史跡": "#a3372b",
    "三大石窟": "#7d5ba6",
    "見逃せない史跡": "#b8863b",
    "六大博物院": "#2e6e8e",
    "十大博物館": "#3a6b5c",
    "特色ある博物館": "#6b6b6b"
  };
  var CATEGORY_ORDER = ["重要史跡", "三大石窟", "見逃せない史跡", "六大博物院", "十大博物館", "特色ある博物館"];

  var map = L.map("map", { scrollWheelZoom: true }).setView([32.5, 108], 4);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  var markerLayer = L.layerGroup().addTo(map);

  var detailPanel = document.getElementById("detail-panel");
  var detailContent = document.getElementById("detail-content");
  var detailClose = document.getElementById("detail-close");
  var siteListEl = document.getElementById("site-list");
  var indexListEl = document.getElementById("index-list");
  var categoryFiltersEl = document.getElementById("category-filters");
  var siteSearchEl = document.getElementById("site-search");
  var indexSearchEl = document.getElementById("index-search");

  var sites = [];
  var columns = [];
  var indexRows = [];
  var sitesById = {};
  var markers = {};
  var listItems = {};
  var activeCategories = {};
  CATEGORY_ORDER.forEach(function (c) { activeCategories[c] = true; });

  detailClose.addEventListener("click", hideDetail);

  function hideDetail() {
    detailPanel.classList.add("detail-panel--hidden");
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function numberedIcon(num, color) {
    return L.divIcon({
      className: "",
      html: '<div class="leaflet-div-icon-num" style="background:' + color + '">' + num + "</div>",
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -14]
    });
  }

  function switchView(view) {
    document.querySelectorAll(".view-tab").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-view") === view);
    });
    document.getElementById("map-view-controls").classList.toggle("view-panel--hidden", view !== "map");
    document.getElementById("index-view-controls").classList.toggle("view-panel--hidden", view !== "index");
  }

  document.querySelectorAll(".view-tab").forEach(function (btn) {
    btn.addEventListener("click", function () {
      switchView(btn.getAttribute("data-view"));
    });
  });

  function renderSources(sources) {
    if (!sources || !sources.length) return "";
    var html = '<div class="detail-content__section"><h3>出典・参考情報</h3><ul class="detail-content__sources">';
    sources.forEach(function (s) {
      html += '<li><a href="' + escapeHtml(s.url) + '" target="_blank" rel="noopener noreferrer">' +
        escapeHtml(s.title) + '</a>' + (s.publisher ? '（' + escapeHtml(s.publisher) + '）' : '') + '</li>';
    });
    html += "</ul></div>";
    return html;
  }

  function relatedWorksHtml(works) {
    if (!works || !works.length) return "";
    var html = '<div class="detail-content__section"><h3>関連する書跡・碑刻</h3><div class="detail-content__chips">';
    works.forEach(function (w) {
      html += '<span class="detail-content__chip" data-jump-index="' + escapeHtml(w) + '">' + escapeHtml(w) + "</span>";
    });
    html += "</div></div>";
    return html;
  }

  function renderSiteDetail(item) {
    var color = CATEGORY_COLORS[item.category] || "#555";
    var html = "";
    html += '<div class="detail-content__category" style="background:' + color + '">' + escapeHtml(item.category) + "</div>";
    html += '<div><span class="detail-content__badge" style="background:' + color + '">' + item.number + '</span>';
    html += '<span class="detail-content__title">' + escapeHtml(item.name) + '</span>';
    if (item.reading) html += '<span class="detail-content__reading">（' + escapeHtml(item.reading) + '）</span>';
    html += '</div>';

    html += '<div class="detail-content__meta">';
    html += '<b>所在地:</b> ' + escapeHtml([item.province, item.city].filter(Boolean).join(" ")) + '<br>';
    if (item.era) html += '<b>時代:</b> ' + escapeHtml(item.era);
    html += '</div>';

    if (item.summary) html += '<div class="detail-content__note"><b>' + escapeHtml(item.summary) + "</b></div>";
    if (item.details) html += '<div class="detail-content__note">' + escapeHtml(item.details) + "</div>";

    if (item.travel) {
      html += '<div class="detail-content__travel"><dl>';
      if (item.travel.access) html += "<dt>アクセス</dt><dd>" + escapeHtml(item.travel.access) + "</dd>";
      if (item.travel.hours) html += "<dt>開館時間</dt><dd>" + escapeHtml(item.travel.hours) + "</dd>";
      if (item.travel.admission) html += "<dt>入場料</dt><dd>" + escapeHtml(item.travel.admission) + "</dd>";
      if (item.travel.tips) html += "<dt>旅のヒント</dt><dd>" + escapeHtml(item.travel.tips) + "</dd>";
      html += "</dl></div>";
    }

    if (item.highlights && item.highlights.length) {
      html += '<div class="detail-content__section"><h3>見どころ</h3><ul>';
      item.highlights.forEach(function (h) { html += "<li>" + escapeHtml(h) + "</li>"; });
      html += "</ul></div>";
    }

    html += relatedWorksHtml(item.relatedWorks);
    html += renderSources(item.sources);

    if (item.bookPage) {
      html += '<div class="detail-content__bookpage">参考書籍 該当ページ: p.' + escapeHtml(item.bookPage) + "</div>";
    }

    detailContent.innerHTML = html;
    detailPanel.classList.remove("detail-panel--hidden");

    detailContent.querySelectorAll("[data-jump-index]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        switchView("index");
        indexSearchEl.value = chip.getAttribute("data-jump-index");
        renderIndexList(indexSearchEl.value);
      });
    });
  }

  function focusSite(item) {
    var marker = markers[item.id];
    if (marker) {
      map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 6), { duration: 0.7 });
      marker.openPopup();
    }
    renderSiteDetail(item);
    setActiveListItem(item.id);
  }

  function setActiveListItem(id) {
    Object.keys(listItems).forEach(function (key) {
      listItems[key].classList.toggle("active", key === id);
    });
  }

  function buildCategoryFilters() {
    categoryFiltersEl.innerHTML = "";
    CATEGORY_ORDER.forEach(function (cat) {
      var chip = document.createElement("span");
      chip.className = "category-chip";
      chip.setAttribute("data-cat", cat);
      chip.setAttribute("data-active", "true");
      chip.textContent = cat;
      chip.addEventListener("click", function () {
        activeCategories[cat] = !activeCategories[cat];
        chip.setAttribute("data-active", String(activeCategories[cat]));
        renderSiteList(siteSearchEl.value);
        renderMarkers();
      });
      categoryFiltersEl.appendChild(chip);
    });
  }

  function renderMarkers() {
    markerLayer.clearLayers();
    markers = {};
    sites.filter(function (s) { return activeCategories[s.category]; })
      .forEach(function (item) {
        if (typeof item.lat !== "number" || typeof item.lng !== "number") return;
        var color = CATEGORY_COLORS[item.category] || "#555";
        var marker = L.marker([item.lat, item.lng], { icon: numberedIcon(item.number, color) });
        marker.bindPopup(
          '<div class="popup-title">' + escapeHtml(item.number + ". " + item.name) + "</div>" +
          '<div class="popup-meta">' + escapeHtml(item.category) + "・" + escapeHtml([item.province, item.city].filter(Boolean).join(" ")) + "</div>"
        );
        marker.on("click", function () { focusSite(item); });
        marker.addTo(markerLayer);
        markers[item.id] = marker;
      });

    columns.forEach(function (col) {
      if (typeof col.lat !== "number" || typeof col.lng !== "number") return;
      var marker = L.marker([col.lat, col.lng], {
        icon: L.divIcon({
          className: "",
          html: '<div class="leaflet-div-icon-memorial">欄</div>',
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        })
      });
      marker.bindPopup('<div class="popup-title">' + escapeHtml(col.title) + "（コラム）</div>");
      marker.on("click", function () {
        detailContent.innerHTML =
          '<div class="detail-content__category" style="background:#9a7b4f">コラム</div>' +
          '<div class="detail-content__title">' + escapeHtml(col.title) + '</div>' +
          '<div class="detail-content__note">' + escapeHtml(col.note) + '</div>' +
          renderSources(col.sources) +
          (col.bookPage ? '<div class="detail-content__bookpage">参考書籍 該当ページ: p.' + escapeHtml(col.bookPage) + '</div>' : '');
        detailPanel.classList.remove("detail-panel--hidden");
      });
      marker.addTo(markerLayer);
    });
  }

  function renderSiteList(filterText) {
    siteListEl.innerHTML = "";
    listItems = {};
    var q = (filterText || "").trim().toLowerCase();
    var lastCategory = null;

    sites
      .filter(function (s) { return activeCategories[s.category]; })
      .filter(function (s) {
        if (!q) return true;
        return (s.name + " " + (s.reading || "") + " " + (s.province || "") + " " + (s.city || "")).toLowerCase().indexOf(q) !== -1;
      })
      .forEach(function (item) {
        if (item.category !== lastCategory) {
          var groupEl = document.createElement("li");
          groupEl.className = "site-list-group";
          groupEl.textContent = item.category;
          siteListEl.appendChild(groupEl);
          lastCategory = item.category;
        }
        var color = CATEGORY_COLORS[item.category] || "#555";
        var li = document.createElement("li");
        li.className = "site-list-item";
        li.innerHTML =
          '<span class="site-list-item__num" style="background:' + color + '">' + item.number + '</span>' +
          '<span class="site-list-item__name">' + escapeHtml(item.name) + '</span>' +
          '<div class="site-list-item__loc">' + escapeHtml([item.province, item.city].filter(Boolean).join(" ")) + '</div>';
        li.addEventListener("click", function () { focusSite(item); });
        siteListEl.appendChild(li);
        listItems[item.id] = li;
      });
  }

  function renderIndexList(filterText) {
    indexListEl.innerHTML = "";
    var q = (filterText || "").trim().toLowerCase();
    indexRows.forEach(function (row) {
      var items = row.items.filter(function (it) {
        if (!q) return true;
        return it.name.toLowerCase().indexOf(q) !== -1;
      });
      if (!items.length) return;
      var groupEl = document.createElement("div");
      groupEl.className = "index-list-group";
      groupEl.textContent = row.row;
      indexListEl.appendChild(groupEl);
      items.forEach(function (it) {
        var el = document.createElement("div");
        el.className = "index-list-item" + (it.relatedSiteId ? " linkable" : "");
        el.innerHTML =
          '<span class="index-list-item__name">' + escapeHtml(it.name) + '</span>' +
          '<span class="index-list-item__pages">p.' + it.bookPages.join("・") + '</span>';
        if (it.relatedSiteId && sitesById[it.relatedSiteId]) {
          el.addEventListener("click", function () {
            switchView("map");
            focusSite(sitesById[it.relatedSiteId]);
          });
        }
        indexListEl.appendChild(el);
      });
    });
    if (!indexListEl.children.length) {
      indexListEl.innerHTML = '<p class="index-note">該当する項目が見つかりません。</p>';
    }
  }

  siteSearchEl.addEventListener("input", function () { renderSiteList(siteSearchEl.value); });
  indexSearchEl.addEventListener("input", function () { renderIndexList(indexSearchEl.value); });

  Promise.all([
    fetch("data/calligraphy-sites.json").then(function (r) { return r.json(); }),
    fetch("data/calligraphy-index.json").then(function (r) { return r.json(); })
  ]).then(function (results) {
    var siteData = results[0];
    var indexData = results[1];

    sites = (siteData.sites || []).slice().sort(function (a, b) { return a.number - b.number; });
    columns = siteData.columns || [];
    sites.forEach(function (s) { sitesById[s.id] = s; });

    indexRows = indexData.rows || [];

    buildCategoryFilters();
    renderMarkers();
    renderSiteList("");
    renderIndexList("");
  }).catch(function (err) {
    siteListEl.innerHTML = '<li style="padding:10px;color:#a3372b;">データの読み込みに失敗しました: ' + escapeHtml(err.message) + '</li>';
  });

  var sidebar = document.getElementById("sidebar");
  document.getElementById("toggle-sidebar").addEventListener("click", function () {
    sidebar.classList.toggle("open");
  });
})();
