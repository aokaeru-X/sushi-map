(function () {
  "use strict";

  var map = L.map("map", { scrollWheelZoom: true }).setView([29.5, 112], 5);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  var lifeLayer = L.layerGroup().addTo(map);
  var memorialLayer = L.layerGroup();

  var timelineListEl = document.getElementById("timeline-list");
  var detailPanel = document.getElementById("detail-panel");
  var detailContent = document.getElementById("detail-content");
  var detailClose = document.getElementById("detail-close");

  var lifeMarkers = {};
  var timelineItems = {};

  detailClose.addEventListener("click", function () {
    hideDetail();
  });

  function hideDetail() {
    detailPanel.classList.add("detail-panel--hidden");
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function renderLifeDetail(item) {
    var html = "";
    html += '<div><span class="detail-content__badge">' + item.seq + '</span>';
    html += '<span class="detail-content__title">' + escapeHtml(item.title) + '</span></div>';
    html += '<div class="detail-content__meta">';
    html += '<b>年代:</b> ' + escapeHtml(item.era_year) + '（西暦' + item.western_year + '年頃）　<b>享年:</b> ' + item.age + '歳<br>';
    html += '<b>当時の地名:</b> ' + escapeHtml(item.location_old) + '　<b>現在地:</b> ' + escapeHtml(item.location_modern);
    html += '</div>';
    html += '<div class="detail-content__note">' + escapeHtml(item.note) + '</div>';

    if (item.highlights && item.highlights.length) {
      html += '<div class="detail-content__section"><h3>この地での出来事</h3><ul>';
      item.highlights.forEach(function (h) {
        html += "<li>" + escapeHtml(h) + "</li>";
      });
      html += "</ul></div>";
    }

    if (item.works && item.works.length) {
      html += '<div class="detail-content__section"><h3>この地で生まれた代表作</h3>';
      item.works.forEach(function (w) {
        html += '<div class="work-card">';
        html += '<div class="work-card__title">' + escapeHtml(w.title) + '</div>';
        html += '<div class="work-card__year">' + escapeHtml(w.year) + '</div>';
        html += '<div class="work-card__desc">' + escapeHtml(w.desc) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    detailContent.innerHTML = html;
    detailPanel.classList.remove("detail-panel--hidden");
  }

  function renderMemorialDetail(item) {
    var html = "";
    html += '<div><span class="detail-content__title">' + escapeHtml(item.title) + '</span></div>';
    html += '<div class="detail-content__meta"><b>所在地:</b> ' + escapeHtml(item.location_modern) + '</div>';
    html += '<div class="detail-content__note">' + escapeHtml(item.desc) + '</div>';
    detailContent.innerHTML = html;
    detailPanel.classList.remove("detail-panel--hidden");
  }

  function setActiveTimelineItem(seq) {
    Object.keys(timelineItems).forEach(function (key) {
      timelineItems[key].classList.toggle("active", Number(key) === seq);
    });
  }

  function focusLife(item, opts) {
    var marker = lifeMarkers[item.seq];
    var latlng = marker ? marker.getLatLng() : L.latLng(item.lat, item.lng);
    map.flyTo(latlng, Math.max(map.getZoom(), 6), { duration: 0.8 });
    if (marker) marker.openPopup();
    renderLifeDetail(item);
    setActiveTimelineItem(item.seq);
  }

  function numberedIcon(num) {
    return L.divIcon({
      className: "",
      html: '<div class="leaflet-div-icon-num">' + num + "</div>",
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -14]
    });
  }

  function memorialIcon() {
    return L.divIcon({
      className: "",
      html: '<div class="leaflet-div-icon-memorial">史</div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      popupAnchor: [0, -11]
    });
  }

  function jitteredLatLng(item, seen) {
    var key = item.lat.toFixed(3) + "," + item.lng.toFixed(3);
    var count = seen[key] || 0;
    seen[key] = count + 1;
    if (count === 0) return [item.lat, item.lng];
    var angle = count * 2.4;
    var r = 0.18 * count;
    return [item.lat + r * Math.cos(angle), item.lng + r * Math.sin(angle)];
  }

  function buildTimelineItem(item) {
    var li = document.createElement("li");
    li.className = "timeline-item";
    li.setAttribute("data-num", item.seq);
    li.innerHTML =
      '<div class="timeline-item__year">' + escapeHtml(item.era_year) + "（" + item.western_year + "年）</div>" +
      '<div class="timeline-item__title">' + escapeHtml(item.title) + "</div>" +
      '<div class="timeline-item__loc">' + escapeHtml(item.location_modern) + "</div>";
    li.addEventListener("click", function () {
      focusLife(item);
    });
    timelineListEl.appendChild(li);
    timelineItems[item.seq] = li;
  }

  fetch("data/sushi.json")
    .then(function (res) { return res.json(); })
    .then(function (data) {
      var seen = {};
      var pathPoints = [];

      data.life.forEach(function (item) {
        var pos = jitteredLatLng(item, seen);
        var marker = L.marker(pos, { icon: numberedIcon(item.seq) });
        marker.bindPopup(
          '<div class="popup-title">' + escapeHtml(item.seq + ". " + item.title) + "</div>" +
          '<div class="popup-meta">' + escapeHtml(item.era_year) + "（" + item.western_year + "年）・" + escapeHtml(item.location_modern) + "</div>"
        );
        marker.on("click", function () {
          renderLifeDetail(item);
          setActiveTimelineItem(item.seq);
        });
        marker.addTo(lifeLayer);
        lifeMarkers[item.seq] = marker;
        pathPoints.push(pos);
        buildTimelineItem(item);
      });

      L.polyline(pathPoints, {
        color: "#a3372b",
        weight: 2.5,
        opacity: 0.7,
        dashArray: "6 6"
      }).addTo(lifeLayer);

      data.memorials.forEach(function (m) {
        var marker = L.marker([m.lat, m.lng], { icon: memorialIcon() });
        marker.bindPopup(
          '<div class="popup-title">' + escapeHtml(m.title) + "</div>" +
          '<div class="popup-meta">' + escapeHtml(m.location_modern) + "</div>"
        );
        marker.on("click", function () {
          renderMemorialDetail(m);
        });
        marker.addTo(memorialLayer);
      });

      if (data.life.length) {
        focusLife(data.life[0], { silent: true });
        map.setView([29.5, 112], 5);
        hideDetail();
      }
    })
    .catch(function (err) {
      timelineListEl.innerHTML = '<li style="padding:10px;color:#a3372b;">データの読み込みに失敗しました: ' + escapeHtml(err.message) + '</li>';
    });

  document.getElementById("layer-life").addEventListener("change", function (e) {
    if (e.target.checked) map.addLayer(lifeLayer);
    else map.removeLayer(lifeLayer);
  });

  document.getElementById("layer-memorials").addEventListener("change", function (e) {
    if (e.target.checked) map.addLayer(memorialLayer);
    else map.removeLayer(memorialLayer);
  });

  var sidebar = document.getElementById("sidebar");
  document.getElementById("toggle-sidebar").addEventListener("click", function () {
    sidebar.classList.toggle("open");
  });
})();
