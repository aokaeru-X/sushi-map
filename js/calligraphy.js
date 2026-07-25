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

  // 國立故宮博物院 Open Data（scripts/fetch-npm-opendata.mjs が生成。無くても動作する）
  var npmCollection = { meta: null, bySite: {} };

  // 現在詳細パネルに表示中の対象（表記切替時の再描画用）
  var currentDetail = null;

  detailClose.addEventListener("click", hideDetail);

  function hideDetail() {
    detailPanel.classList.add("detail-panel--hidden");
    currentDetail = null;
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

  // 中国語表記の設定: "auto"（台湾所在は繁体字・大陸は簡体字）/ "cn"（簡体字固定）/ "tw"（繁体字固定）
  var scriptPref = "auto";

  function resolveScript(region) {
    if (scriptPref === "cn") return "cn";
    if (scriptPref === "tw") return "tw";
    return region === "TW" ? "tw" : "cn";
  }

  function zhBlockHtml(o) {
    var useTw = resolveScript(o.region) === "tw";
    var name = useTw ? (o.nameZhTw || o.nameZh) : (o.nameZh || o.nameZhTw);
    var address = useTw ? (o.addressZhTw || o.addressZh) : (o.addressZh || o.addressZhTw);
    if (!address) return "";

    var label = useTw ? "現地で見せる中国語住所（繁体字）" : "現地で見せる中国語住所（簡体字）";
    if (o.region === "TW") label += "　※台湾は繁体字を使用します";

    var html = '<div class="detail-content__zh">';
    html += '<div class="detail-content__zh-label">' + escapeHtml(label) + '</div>';
    html += '<div class="detail-content__zh-row">';
    html += '<div class="detail-content__zh-body">';
    if (name) html += '<div class="detail-content__zh-name">' + escapeHtml(name) + '</div>';
    html += '<div class="detail-content__zh-address">' + escapeHtml(address) + '</div>';
    html += '</div>';
    html += '<button type="button" class="detail-content__zh-copy" data-copy-text="' +
      escapeHtml((name ? name + " " : "") + address) + '">コピー</button>';
    html += '</div></div>';
    return html;
  }

  function digitalResourcesHtml(list) {
    if (!list || !list.length) return "";
    var html = '<div class="detail-content__section digital-block">';
    html += '<h3>中国のデジタルアーカイブ</h3>';
    list.forEach(function (r) {
      html += '<a class="digital-card" href="' + escapeHtml(r.url) + '" target="_blank" rel="noopener noreferrer">';
      html += '<div class="digital-card__head">';
      html += '<span class="digital-card__title">' + escapeHtml(r.title) + '</span>';
      if (r.kind) html += '<span class="digital-card__kind">' + escapeHtml(r.kind) + '</span>';
      html += '</div>';
      if (r.publisher) html += '<div class="digital-card__pub">' + escapeHtml(r.publisher) + '</div>';
      if (r.note) html += '<div class="digital-card__note">' + escapeHtml(r.note) + '</div>';
      html += '</a>';
    });
    html += '</div>';
    return html;
  }

  function npmCollectionHtml(siteId) {
    var items = npmCollection.bySite[siteId];
    if (!items || !items.length) return "";

    var html = '<div class="detail-content__section npm-block">';
    html += '<h3>國立故宮博物院 Open Data 所蔵品</h3>';
    html += '<div class="npm-block__list">';

    items.forEach(function (it) {
      html += '<a class="npm-card" href="' + escapeHtml(it.detailUrl) + '" target="_blank" rel="noopener noreferrer">';
      if (it.imageUrl) {
        html += '<img class="npm-card__img" src="' + escapeHtml(it.imageUrl) + '" alt="' +
          escapeHtml(it.workJa) + '" loading="lazy">';
      }
      html += '<div class="npm-card__body">';
      html += '<div class="npm-card__title">' + escapeHtml(it.workJa);
      if (it.workZhTw && it.workZhTw !== it.workJa) {
        html += '<span class="npm-card__zh">' + escapeHtml(it.workZhTw) + '</span>';
      }
      html += '</div>';
      html += '<div class="npm-card__meta">' +
        escapeHtml([it.dynasty, it.artist].filter(function (v) { return v && v !== "—"; }).join("・")) + '</div>';
      if (it.npmId) html += '<div class="npm-card__id">文物統一編號: ' + escapeHtml(it.npmId) + '</div>';
      if (it.license) html += '<div class="npm-card__license">' + escapeHtml(it.license) + '</div>';
      if (it.provenance === "manual") {
        html += '<div class="npm-card__pending">Open Data未照合（参照リンクのみ）</div>';
      }
      html += '</div></a>';
    });

    html += '</div>';
    if (npmCollection.meta) {
      html += '<p class="npm-block__note">出典: ' +
        '<a href="' + escapeHtml(npmCollection.meta.portal) + '" target="_blank" rel="noopener noreferrer">' +
        escapeHtml(npmCollection.meta.source) + '</a>　' + escapeHtml(npmCollection.meta.license) + '</p>';
    }
    html += '</div>';
    return html;
  }

  function renderSiteDetail(item) {
    currentDetail = { kind: "site", data: item };
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

    html += zhBlockHtml({
      region: item.region,
      nameZh: item.nameZh,
      addressZh: item.addressZh,
      nameZhTw: item.nameZhTw,
      addressZhTw: item.addressZhTw
    });

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

    if (item.extraLocations && item.extraLocations.length) {
      html += '<div class="detail-content__section"><h3>離れた場所にある関連地点</h3>';
      item.extraLocations.forEach(function (ex) {
        html += '<div class="extra-loc">';
        html += '<div class="extra-loc__label">' + escapeHtml(ex.label) + '</div>';
        html += '<div class="extra-loc__place">' + escapeHtml([ex.province, ex.city].filter(Boolean).join(" ")) + '</div>';
        if (ex.note) html += '<div class="extra-loc__note">' + escapeHtml(ex.note) + '</div>';
        html += zhBlockHtml({
          region: item.region,
          nameZh: ex.nameZh,
          addressZh: ex.addressZh,
          nameZhTw: ex.nameZhTw,
          addressZhTw: ex.addressZhTw
        });
        html += '</div>';
      });
      html += '</div>';
    }

    html += npmCollectionHtml(item.id);
    html += digitalResourcesHtml(item.digitalResources);

    if (item.japanContext) {
      html += '<div class="detail-content__knowledge detail-content__knowledge--jp">';
      html += '<h3>日本との関わり・日本での受容</h3>';
      html += '<p>' + escapeHtml(item.japanContext) + '</p>';
      html += '</div>';
    }

    if (item.latestFindings) {
      html += '<div class="detail-content__knowledge detail-content__knowledge--latest">';
      html += '<h3>最新の知見・現状</h3>';
      html += '<p>' + escapeHtml(item.latestFindings) + '</p>';
      html += '</div>';
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
    wireCopyButtons();
  }

  function renderColumnDetail(col) {
    currentDetail = { kind: "column", data: col };
    var html = '<div class="detail-content__category" style="background:#9a7b4f">コラム</div>';
    html += '<div class="detail-content__title">' + escapeHtml(col.title) + '</div>';
    html += zhBlockHtml({
      region: col.region,
      nameZh: col.titleZh,
      addressZh: col.addressZh,
      nameZhTw: col.titleZhTw,
      addressZhTw: col.addressZhTw
    });
    html += '<div class="detail-content__note">' + escapeHtml(col.note) + '</div>';

    if (col.japanContext) {
      html += '<div class="detail-content__knowledge detail-content__knowledge--jp">' +
        '<h3>日本との関わり・日本での受容</h3><p>' + escapeHtml(col.japanContext) + '</p></div>';
    }
    if (col.latestFindings) {
      html += '<div class="detail-content__knowledge detail-content__knowledge--latest">' +
        '<h3>最新の知見・現状</h3><p>' + escapeHtml(col.latestFindings) + '</p></div>';
    }

    html += renderSources(col.sources);
    if (col.bookPage) {
      html += '<div class="detail-content__bookpage">参考書籍 該当ページ: p.' + escapeHtml(col.bookPage) + '</div>';
    }

    detailContent.innerHTML = html;
    detailPanel.classList.remove("detail-panel--hidden");
    wireCopyButtons();
  }

  function wireCopyButtons() {
    detailContent.querySelectorAll(".detail-content__zh-copy").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var text = btn.getAttribute("data-copy-text") || "";
        var done = function () {
          var original = btn.textContent;
          btn.textContent = "コピーしました";
          setTimeout(function () { btn.textContent = original; }, 1500);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
        } else {
          fallbackCopy(text, done);
        }
      });
    });
  }

  function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
    done();
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

  function jitteredLatLng(lat, lng, seen) {
    var key = lat.toFixed(2) + "," + lng.toFixed(2);
    var count = seen[key] || 0;
    seen[key] = count + 1;
    if (count === 0) return [lat, lng];
    var angle = count * 2.4;
    var r = 0.06 * count;
    return [lat + r * Math.cos(angle), lng + r * Math.sin(angle)];
  }

  function renderMarkers() {
    markerLayer.clearLayers();
    markers = {};
    var seen = {};
    sites.filter(function (s) { return activeCategories[s.category]; })
      .forEach(function (item) {
        if (typeof item.lat !== "number" || typeof item.lng !== "number") return;
        var color = CATEGORY_COLORS[item.category] || "#555";
        var pos = jitteredLatLng(item.lat, item.lng, seen);
        var marker = L.marker(pos, { icon: numberedIcon(item.number, color) });
        marker.bindPopup(
          '<div class="popup-title">' + escapeHtml(item.number + ". " + item.name) + "</div>" +
          '<div class="popup-meta">' + escapeHtml(item.category) + "・" + escapeHtml([item.province, item.city].filter(Boolean).join(" ")) + "</div>"
        );
        marker.on("click", function () { focusSite(item); });
        marker.addTo(markerLayer);
        markers[item.id] = marker;

        // 同一項目でも離れた場所にある関連地点（副ピン）
        (item.extraLocations || []).forEach(function (ex) {
          if (typeof ex.lat !== "number" || typeof ex.lng !== "number") return;
          var exPos = jitteredLatLng(ex.lat, ex.lng, seen);
          var exMarker = L.marker(exPos, {
            icon: L.divIcon({
              className: "",
              html: '<div class="leaflet-div-icon-sub" style="border-color:' + color + ';color:' + color + '">' + item.number + '</div>',
              iconSize: [24, 24],
              iconAnchor: [12, 12],
              popupAnchor: [0, -12]
            })
          });
          exMarker.bindPopup(
            '<div class="popup-title">' + escapeHtml(ex.label) + "</div>" +
            '<div class="popup-meta">' + escapeHtml(item.number + ". " + item.name) + " の関連地点・" +
            escapeHtml([ex.province, ex.city].filter(Boolean).join(" ")) + "</div>"
          );
          exMarker.on("click", function () { renderSiteDetail(item); });
          exMarker.addTo(markerLayer);
        });
      });

    columns.forEach(function (col) {
      if (typeof col.lat !== "number" || typeof col.lng !== "number") return;
      var colPos = jitteredLatLng(col.lat, col.lng, seen);
      var marker = L.marker(colPos, {
        icon: L.divIcon({
          className: "",
          html: '<div class="leaflet-div-icon-memorial">欄</div>',
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        })
      });
      marker.bindPopup('<div class="popup-title">' + escapeHtml(col.title) + "（コラム）</div>");
      marker.on("click", function () { renderColumnDetail(col); });
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
      if (row.note) {
        var noteEl = document.createElement("p");
        noteEl.className = "index-note";
        noteEl.textContent = row.note;
        indexListEl.appendChild(noteEl);
      }
      items.forEach(function (it) {
        var el = document.createElement("div");
        el.className = "index-list-item" + (it.relatedSiteId ? " linkable" : "");
        var site = it.relatedSiteId ? sitesById[it.relatedSiteId] : null;
        var rightText = site ? site.number + ". " + site.name : "";
        el.innerHTML =
          '<span class="index-list-item__name">' + escapeHtml(it.name) + '</span>' +
          '<span class="index-list-item__pages">' + escapeHtml(rightText) + '</span>';
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

  document.querySelectorAll(".script-pref__btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      scriptPref = btn.getAttribute("data-script");
      document.querySelectorAll(".script-pref__btn").forEach(function (b) {
        b.classList.toggle("active", b === btn);
      });
      // 開いている詳細パネルを新しい表記で描き直す
      if (currentDetail) {
        if (currentDetail.kind === "site") renderSiteDetail(currentDetail.data);
        else renderColumnDetail(currentDetail.data);
      }
    });
  });

  // 故宮Open Dataは任意ファイル。存在しない/壊れていてもサイト本体は動く。
  var npmPromise = fetch("data/npm-collection.json")
    .then(function (r) { return r.ok ? r.json() : null; })
    .catch(function () { return null; });

  Promise.all([
    fetch("data/calligraphy-sites.json").then(function (r) { return r.json(); }),
    fetch("data/calligraphy-index.json").then(function (r) { return r.json(); }),
    npmPromise
  ]).then(function (results) {
    var siteData = results[0];
    var indexData = results[1];
    var npmData = results[2];

    if (npmData && Array.isArray(npmData.items)) {
      npmCollection.meta = npmData.meta || null;
      npmData.items.forEach(function (it) {
        if (!it.siteId) return;
        (npmCollection.bySite[it.siteId] = npmCollection.bySite[it.siteId] || []).push(it);
      });
    }

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
