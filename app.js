/**
 * IntraCity Medical Resource Tracker - Frontend Application Engine
 * Pure vanilla JavaScript with Leaflet integration, reactive state,
 * triage matching algorithm, and hospital admin management.
 */

// ==========================================
// STATE MANAGEMENT
// ==========================================
const state = {
  hospitals: [],
  cities: [],
  stats: null,
  alerts: [],
  userCoords: null, // { lat, lng }
  activeTab: "directory",
  activeFilters: {
    q: "",
    city: "",
    area: "",
    resource: "",
    bloodGroup: "",
    emergencyOnly: false,
    sort: "name"
  },
  admin: {
    authenticated: false,
    hospital: null,
    pin: ""
  },
  triage: {
    need: "icu",
    bloodGroup: "O+",
    coords: { lat: 25.6093, lng: 85.1235 } // Default to Bailey Road, Patna
  },
  map: null,
  markers: []
};

// ==========================================
// UTILITY HELPERS
// ==========================================
const $ = (id) => document.getElementById(id);
const $$ = (selector) => document.querySelectorAll(selector);

// Show accessible toast notification
function showToast(message, type = "info") {
  const container = $("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const icon = type === "success" ? "✓" : type === "error" ? "⚠" : "ℹ";
  toast.innerHTML = `<span><b>${icon}</b> ${message}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(20px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Format relative time (e.g. "5m ago")
function formatTimeAgo(isoDate) {
  if (!isoDate) return "Unknown";
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 2) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Distance formatting
function formatDistance(km) {
  if (km == null || isNaN(km)) return "Distance unavailable";
  return `${km.toFixed(1)} km away`;
}

// Debounce utility
function debounce(fn, delay = 250) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// Safe API Fetch Wrapper
async function fetchApi(endpoint, options = {}) {
  try {
    const response = await fetch(endpoint, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      ...options
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}: Request failed`);
    }
    return data;
  } catch (err) {
    console.error(`API Error on ${endpoint}:`, err);
    throw err;
  }
}

// ==========================================
// API DATA LOADERS
// ==========================================

// 1. Load City-wide Statistics Summary
async function loadStats() {
  try {
    const res = await fetchApi("/api/stats");
    if (res.success && res.stats) {
      state.stats = res.stats;
      renderStatsBar(res.stats);
    }
  } catch (err) {
    console.warn("Could not load stats:", err.message);
  }
}

// Render Stats Header Bar
function renderStatsBar(s) {
  if ($("statHospitals")) $("statHospitals").textContent = s.totalHospitals;
  if ($("statIcu")) $("statIcu").textContent = `${s.icuBeds.available}/${s.icuBeds.total}`;
  if ($("statVentilators")) $("statVentilators").textContent = `${s.ventilators.available}/${s.ventilators.total}`;
  if ($("statOxygenCylinders")) $("statOxygenCylinders").textContent = s.oxygen.cylindersAvailable;
  if ($("statAmbulances")) $("statAmbulances").textContent = s.ambulancesOnDuty;
  if ($("statBlood")) $("statBlood").textContent = s.bloodUnitsTotal;
}

// 2. Load Indexed Cities & Areas
async function loadCities() {
  try {
    const res = await fetchApi("/api/cities");
    if (res.success && res.data) {
      state.cities = res.data;
      populateCitySelects(res.data);
    }
  } catch (err) {
    console.warn("Could not load cities:", err.message);
  }
}

function populateCitySelects(cities) {
  const citySelect = $("citySelect");
  if (citySelect) {
    citySelect.innerHTML = `<option value="">All Cities (${cities.length})</option>` +
      cities.map(c => `<option value="${c.name}">${c.name}</option>`).join("");
  }
}

// Update Area options when City changes
function updateAreaOptions(cityName) {
  const areaSelect = $("areaSelect");
  if (!areaSelect) return;

  if (!cityName) {
    areaSelect.innerHTML = `<option value="">All Areas</option>`;
    areaSelect.disabled = true;
    return;
  }

  const found = state.cities.find(c => c.name.toLowerCase() === cityName.toLowerCase());
  if (found && found.areas && found.areas.length) {
    areaSelect.disabled = false;
    areaSelect.innerHTML = `<option value="">All Areas (${found.areas.length})</option>` +
      found.areas.map(a => `<option value="${a}">${a}</option>`).join("");
  } else {
    areaSelect.innerHTML = `<option value="">All Areas</option>`;
    areaSelect.disabled = true;
  }
}

// 3. Load Live Alerts
async function loadAlerts() {
  try {
    const res = await fetchApi("/api/alerts");
    if (res.success && res.data) {
      state.alerts = res.data;
      if ($("headerAlertCount")) $("headerAlertCount").textContent = res.data.length;
      renderAlertsFeed(res.data);
    }
  } catch (err) {
    console.warn("Could not load alerts:", err.message);
  }
}

// 4. Load Hospitals with Active Filters
async function loadHospitals() {
  const listEl = $("hospitalList");
  if (listEl) {
    // Show skeleton cards during fetch
    listEl.innerHTML = `
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
    `;
  }

  try {
    const params = new URLSearchParams();
    if (state.activeFilters.q) params.set("q", state.activeFilters.q);
    if (state.activeFilters.city) params.set("city", state.activeFilters.city);
    if (state.activeFilters.area) params.set("area", state.activeFilters.area);
    if (state.activeFilters.resource) params.set("resource", state.activeFilters.resource);
    if (state.activeFilters.bloodGroup) params.set("bloodGroup", state.activeFilters.bloodGroup);
    if (state.activeFilters.emergencyOnly) params.set("emergencyOnly", "true");
    if (state.activeFilters.sort) params.set("sort", state.activeFilters.sort);

    if (state.userCoords) {
      params.set("lat", state.userCoords.lat);
      params.set("lng", state.userCoords.lng);
    }

    const res = await fetchApi(`/api/hospitals?${params.toString()}`);
    if (res.success && res.data) {
      state.hospitals = res.data;
      renderHospitalCards(res.data);
      renderMapMarkers(res.data);
      renderBloodInventory(res.data);
      if ($("hospitalCount")) $("hospitalCount").textContent = `${res.data.length} Facilities Found`;
    }
  } catch (err) {
    if (listEl) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <h3>Failed to load facilities</h3>
          <p class="muted">${err.message}</p>
          <button class="btn btn-primary" onclick="loadHospitals()">Retry</button>
        </div>
      `;
    }
  }
}

// ==========================================
// RENDERERS
// ==========================================

// Render Hospital Directory Cards
function renderHospitalCards(items) {
  const listEl = $("hospitalList");
  if (!listEl) return;

  if (!items.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <h3>No matching facilities found</h3>
        <p class="muted">Try adjusting your filters, clearing search terms, or checking neighboring areas.</p>
        <button class="btn btn-outline" onclick="resetFilters()">Reset All Filters</button>
      </div>
    `;
    return;
  }

  listEl.innerHTML = items.map(h => {
    const res = h.resources;
    const freshClass = `freshness-${h.freshness.level}`;
    const distanceText = h.distanceKm != null ? `<span class="distance-tag">${formatDistance(h.distanceKm)}</span>` : "";
    const emergencyTag = h.emergencyReady
      ? `<span class="emergency-pill ready">● Emergency Triage Open</span>`
      : `<span class="emergency-pill limited">Limited Emergency Care</span>`;

    // Highlight key resources
    const icuClass = (res.icuBeds?.available ?? 0) <= 0 ? "alert-zero" : "available";
    const ventClass = (res.ventilators?.available ?? 0) <= 0 ? "alert-zero" : "available";
    const ambClass = (res.ambulances?.onDuty ?? 0) <= 0 ? "alert-zero" : "available";

    // Blood preview
    const bloodPills = Object.entries(res.blood || {})
      .map(([grp, units]) => `<span class="blood-chip ${units > 0 ? "in-stock" : ""}">${grp}: ${units}</span>`)
      .slice(0, 6)
      .join("");

    return `
      <article class="hospital-card" data-id="${h.id}">
        <div class="card-top-row">
          <div class="card-title-group">
            <h3>${h.name}</h3>
            <div class="card-subtitle">
              <span>📍 ${h.area}, ${h.city}</span>
              ${distanceText}
              <span>· ${h.traumaLevel || h.type}</span>
            </div>
          </div>
          <div class="card-status-badges">
            <span class="freshness-tag ${freshClass}">● ${h.freshness.label}</span>
            ${emergencyTag}
          </div>
        </div>

        <!-- Resource Matrix -->
        <div class="resource-status-matrix">
          <div class="res-cell ${icuClass}">
            <span class="res-name">🫀 ICU Beds</span>
            <span class="res-count">${res.icuBeds?.available ?? 0} <small class="muted">/ ${res.icuBeds?.total ?? 0}</small></span>
          </div>
          <div class="res-cell ${ventClass}">
            <span class="res-name">💨 Ventilators</span>
            <span class="res-count">${res.ventilators?.available ?? 0} <small class="muted">/ ${res.ventilators?.total ?? 0}</small></span>
          </div>
          <div class="res-cell available">
            <span class="res-name">🫁 Oxygen Beds</span>
            <span class="res-count">${res.oxygen?.supportedBeds ?? 0}</span>
          </div>
          <div class="res-cell ${ambClass}">
            <span class="res-name">🚑 Ambulances</span>
            <span class="res-count">${res.ambulances?.onDuty ?? 0} ready</span>
          </div>
        </div>

        <!-- Blood Mini Stock -->
        <div class="blood-mini-strip">
          <span class="muted" style="font-size:11px;">Blood Units:</span>
          ${bloodPills}
        </div>

        <!-- Card Actions -->
        <div class="card-actions-row">
          <div class="call-group">
            <a href="tel:${h.contacts?.emergency || h.phone}" class="btn btn-sm btn-emergency" title="Call Emergency Desk">
              📞 Emergency (${h.contacts?.emergency || h.phone})
            </a>
            <a href="tel:${h.contacts?.ambulance || h.resources?.ambulances?.dispatchContact || h.phone}" class="btn btn-sm btn-outline" title="Call Ambulance">
              🚑 Ambulance
            </a>
          </div>
          <button class="btn btn-sm btn-primary view-details-btn" data-id="${h.id}">
            View Full Bed Breakdown →
          </button>
        </div>
      </article>
    `;
  }).join("");

  // Attach click listeners to "View Full Bed Breakdown" buttons
  $$(".view-details-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const hospitalId = btn.getAttribute("data-id");
      openHospitalDetail(hospitalId);
    });
  });
}

// Render Leaflet Map
function initMap() {
  if (state.map) return;
  const mapEl = $("map");
  if (!mapEl) return;

  // Default view centered on Patna Metro
  state.map = L.map("map", {
    zoomControl: true,
    scrollWheelZoom: false
  }).setView([25.6093, 85.1235], 11);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 18
  }).addTo(state.map);
}

function renderMapMarkers(items) {
  initMap();
  if (!state.map) return;

  // Clear existing markers
  state.markers.forEach(m => m.remove());
  state.markers = [];

  const latLngs = [];

  items.forEach(h => {
    if (!h.lat || !h.lng) return;

    latLngs.push([h.lat, h.lng]);
    const icuAvail = h.resources?.icuBeds?.available ?? 0;
    const pinClass = icuAvail === 0 ? "critical" : icuAvail > 3 ? "plenty" : "";

    const customIcon = L.divIcon({
      className: "custom-div-icon",
      html: `<div class="custom-map-pin ${pinClass}" style="width:34px;height:34px;">${icuAvail}</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });

    const marker = L.marker([h.lat, h.lng], { icon: customIcon }).addTo(state.map);

    const popupContent = `
      <div style="font-family: inherit; min-width: 200px; padding: 4px;">
        <h4 style="margin: 0 0 4px; font-size: 15px; color: #fff;">${h.name}</h4>
        <p style="margin: 0 0 6px; font-size: 12px; color: #94a3b8;">${h.area}, ${h.city}</p>
        <div style="font-size: 12px; margin-bottom: 8px;">
          <b>ICU Beds:</b> ${icuAvail} free<br>
          <b>Ventilators:</b> ${h.resources?.ventilators?.available ?? 0} free<br>
          <b>Ambulances:</b> ${h.resources?.ambulances?.onDuty ?? 0} on duty
        </div>
        <button style="width: 100%; padding: 6px; background: #0284c7; color: #fff; border: none; border-radius: 6px; font-weight: 700; cursor: pointer;"
          onclick="openHospitalDetail('${h.id}')">
          Open Full Details
        </button>
      </div>
    `;

    marker.bindPopup(popupContent);
    state.markers.push(marker);
  });

  // Fit bounds if markers exist
  if (latLngs.length > 0) {
    state.map.fitBounds(latLngs, { padding: [35, 35], maxZoom: 13 });
  }
}

// Render Blood Bank Inventory Matrix
function renderBloodInventory(hospitals) {
  const gridEl = $("bloodSummaryGrid");
  const tableBody = $("bloodInventoryTableBody");

  // Sum city-wide blood counts
  const groups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
  const totals = {};
  groups.forEach(g => totals[g] = 0);

  hospitals.forEach(h => {
    if (h.resources?.blood) {
      groups.forEach(g => {
        totals[g] += (Number(h.resources.blood[g]) || 0);
      });
    }
  });

  if (gridEl) {
    gridEl.innerHTML = groups.map(grp => {
      const units = totals[grp];
      const statusClass = units > 20 ? "status-plenty" : units >= 8 ? "status-low" : "status-critical";
      const statusText = units > 20 ? "Ample Supply" : units >= 8 ? "Moderate" : "Critical Shortage";
      return `
        <div class="blood-matrix-card">
          <span class="grp-title">${grp}</span>
          <div class="grp-units">${units}</div>
          <span class="grp-status ${statusClass}">${statusText}</span>
        </div>
      `;
    }).join("");
  }

  // Populate Hospital Blood Table
  renderBloodTable(hospitals, "all");
}

function renderBloodTable(hospitals, targetGroup = "all") {
  const tableBody = $("bloodInventoryTableBody");
  if (!tableBody) return;

  const filtered = targetGroup === "all"
    ? hospitals
    : hospitals.filter(h => (h.resources?.blood?.[targetGroup] || 0) > 0);

  if (!filtered.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 24px;" class="muted">
          No facilities currently report stock for blood group <b>${targetGroup}</b>.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filtered.map(h => {
    const bloodMap = h.resources?.blood || {};
    let stockDisplay = "";

    if (targetGroup === "all") {
      stockDisplay = Object.entries(bloodMap)
        .map(([g, u]) => `<span class="blood-chip ${u > 0 ? "in-stock" : ""}">${g}: <b>${u}</b></span>`)
        .join(" ");
    } else {
      const count = bloodMap[targetGroup] || 0;
      stockDisplay = `<b style="font-size: 16px; color: ${count > 0 ? '#10b981' : '#ef4444'};">${count} Units Available</b>`;
    }

    const bloodPhone = h.contacts?.bloodBank || h.contacts?.emergency || h.phone;

    return `
      <tr>
        <td>
          <b>${h.name}</b><br>
          <small class="muted">${h.type}</small>
        </td>
        <td>${h.city} · ${h.area}</td>
        <td>${stockDisplay}</td>
        <td><span class="freshness-tag freshness-${h.freshness?.level || 'green'}">● ${h.freshness?.label || 'Verified'}</span></td>
        <td>
          <a href="tel:${bloodPhone}" class="btn btn-sm btn-outline">
            🩸 Call Desk (${bloodPhone})
          </a>
        </td>
      </tr>
    `;
  }).join("");
}

// Render Live Alerts Feed
function renderAlertsFeed(alerts, severityFilter = "all") {
  const feedEl = $("alertsFeed");
  if (!feedEl) return;

  let filtered = alerts;
  if (severityFilter !== "all") {
    filtered = alerts.filter(a => a.severity === severityFilter);
  }

  if (!filtered.length) {
    feedEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">✅</div>
        <h3>No alerts matching filter</h3>
        <p class="muted">All monitored medical resources and hospital verification feeds in this category are operating within safe operational parameters.</p>
      </div>
    `;
    return;
  }

  feedEl.innerHTML = filtered.map(a => {
    const icon = a.severity === "critical" ? "🚨" : a.severity === "high" ? "⚠️" : "ℹ️";
    return `
      <div class="alert-item-card ${a.severity}">
        <div class="alert-icon-wrap">${icon}</div>
        <div class="alert-content-wrap">
          <div class="alert-meta-top">
            <span class="alert-severity-badge">${a.severity}</span>
            <span class="alert-hospital-name">${a.hospital}</span>
            <span class="muted">· ${a.city}</span>
          </div>
          <p class="alert-text">${a.message}</p>
          <div class="alert-timestamp">Category: ${a.category || 'General'} · Verified: ${formatTimeAgo(a.timestamp)}</div>
        </div>
        <button class="btn btn-sm btn-outline" onclick="openHospitalDetail('${a.hospitalId}')">
          Inspect Facility
        </button>
      </div>
    `;
  }).join("");
}

// ==========================================
// HOSPITAL DETAIL DIALOG
// ==========================================
async function openHospitalDetail(id) {
  const dialog = $("hospitalDetailDialog");
  if (!dialog) return;

  try {
    const params = new URLSearchParams();
    if (state.userCoords) {
      params.set("lat", state.userCoords.lat);
      params.set("lng", state.userCoords.lng);
    }

    const res = await fetchApi(`/api/hospitals/${id}?${params.toString()}`);
    if (!res.success || !res.data) throw new Error("Could not find hospital details");

    const h = res.data;
    const resrc = h.resources;

    // Header info
    $("dialogHospitalTitle").textContent = h.name;
    $("dialogAddress").textContent = `${h.address} · ${h.city}`;
    $("dialogTraumaBadge").textContent = h.traumaLevel || h.type;
    $("dialogFreshnessBadge").textContent = `● ${h.freshness.label}`;
    $("dialogFreshnessBadge").className = `freshness-badge freshness-${h.freshness.level}`;

    const emergencyBadge = $("dialogEmergencyBadge");
    if (h.emergencyReady) {
      emergencyBadge.textContent = "Emergency Ready";
      emergencyBadge.className = "readiness-badge";
    } else {
      emergencyBadge.textContent = "Limited Readiness";
      emergencyBadge.className = "readiness-badge muted";
    }

    // Direct action buttons
    $("dialogEmergencyCall").href = `tel:${h.contacts?.emergency || h.phone}`;
    $("dialogAmbulanceCall").href = `tel:${h.contacts?.ambulance || resrc?.ambulances?.dispatchContact || h.phone}`;
    $("dialogBloodCall").href = `tel:${h.contacts?.bloodBank || h.phone}`;
    $("dialogDirectionsLink").href = `https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`;

    // Bed Breakdown with progress bars
    const bedCategories = [
      { name: "General Inpatient Beds", total: resrc.generalBeds?.total || 1, avail: resrc.generalBeds?.available || 0 },
      { name: "Emergency / Triage Beds", total: resrc.emergencyBeds?.total || 1, avail: resrc.emergencyBeds?.available || 0 },
      { name: "Intensive Care Unit (ICU)", total: resrc.icuBeds?.total || 1, avail: resrc.icuBeds?.available || 0 },
      { name: "Mechanical Ventilators", total: resrc.ventilators?.total || 1, avail: resrc.ventilators?.available || 0 }
    ];

    $("dialogBedGrid").innerHTML = bedCategories.map(b => {
      const occupied = Math.max(0, b.total - b.avail);
      const pctOccupied = Math.min(100, Math.round((occupied / b.total) * 100));
      const isHigh = pctOccupied >= 85;
      return `
        <div class="dialog-bed-card">
          <div class="bed-card-top">
            <span class="bed-card-title">${b.name}</span>
            <span class="bed-card-numbers"><span>${b.avail} Available</span> / ${b.total} Total</span>
          </div>
          <div class="bed-progress-bar">
            <div class="bed-progress-fill ${isHigh ? 'high-occupancy' : ''}" style="width: ${pctOccupied}%;"></div>
          </div>
          <small class="muted" style="font-size:11px; margin-top:4px; display:block;">Occupancy: ${pctOccupied}% (${occupied} beds occupied)</small>
        </div>
      `;
    }).join("");

    // Oxygen Infrastructure
    const oxy = resrc.oxygen || {};
    $("dialogOxygenBox").innerHTML = `
      <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
        <div class="res-cell available">
          <span class="res-name">Oxygen Supported Beds</span>
          <span class="res-count">${oxy.supportedBeds || 0}</span>
        </div>
        <div class="res-cell available">
          <span class="res-name">Backup Oxygen Cylinders</span>
          <span class="res-count">${oxy.cylindersAvailable || 0}</span>
        </div>
        <div class="res-cell">
          <span class="res-name">Pipeline Status</span>
          <span class="res-count" style="font-size: 14px; color: ${oxy.pipelineStatus === 'Operational' ? '#10b981' : '#f59e0b'};">
            ● ${oxy.pipelineStatus || 'Operational'}
          </span>
        </div>
      </div>
    `;

    // Blood Bank Stock Breakdown
    const bld = resrc.blood || {};
    $("dialogBloodGrid").innerHTML = Object.entries(bld).map(([grp, count]) => `
      <div class="dialog-blood-pill">
        <b>${grp}</b>
        <span style="color: ${count > 0 ? '#f1f5f9' : '#ef4444'};">${count} Units</span>
      </div>
    `).join("");

    // Ambulance Fleet
    const amb = resrc.ambulances || {};
    $("dialogAmbulanceInfo").innerHTML = `
      <p style="margin-bottom:6px;"><b>Basic Life Support (BLS):</b> ${amb.bls || 0} vehicles</p>
      <p style="margin-bottom:6px;"><b>Advanced Cardiac Life Support (ALS):</b> ${amb.als || 0} vehicles</p>
      <p style="margin-bottom:6px;"><b>Total On-Duty:</b> <span style="color:#10b981; font-weight:700;">${amb.onDuty || 0} active</span></p>
      <p><b>Hotline:</b> <a href="tel:${amb.dispatchContact || h.phone}">${amb.dispatchContact || h.phone}</a></p>
    `;

    // Clinical Specialties
    const specs = h.specialties || ["General Medicine", "Emergency"];
    $("dialogSpecialtiesList").innerHTML = specs.map(s => `<span class="spec-badge">${s}</span>`).join("");

    // Open Modal
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "true");
    }
  } catch (err) {
    showToast(`Error opening hospital detail: ${err.message}`, "error");
  }
}

// Close Dialog
function closeHospitalDetail() {
  const dialog = $("hospitalDetailDialog");
  if (!dialog) return;
  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}

// ==========================================
// EMERGENCY TRIAGE QUICK-MATCH WIZARD
// ==========================================
async function runTriageMatch() {
  const resultsContainer = $("triageResultsContainer");
  const listEl = $("triageResultsList");
  if (!resultsContainer || !listEl) return;

  resultsContainer.style.display = "block";
  listEl.innerHTML = `<div class="skeleton-card"></div><div class="skeleton-card"></div>`;

  try {
    const { need, bloodGroup, coords } = state.triage;
    const params = new URLSearchParams({
      lat: coords.lat,
      lng: coords.lng,
      resource: need
    });

    if (need === "blood") {
      params.set("bloodGroup", bloodGroup);
    }

    const res = await fetchApi(`/api/match?${params.toString()}`);
    if (!res.success || !res.data) throw new Error("Match calculation failed");

    if (!res.data.length) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <h3>No Immediate Matches Found</h3>
          <p class="muted">No facility in this zone currently reports available stock for <b>${need.toUpperCase()}</b>. Consider expanding radius or dialing the emergency dispatch coordinator.</p>
          <a href="tel:108" class="btn btn-emergency">Call National Emergency (108)</a>
        </div>
      `;
      return;
    }

    listEl.innerHTML = res.data.map((h, idx) => {
      const isTop = idx === 0;
      const resrc = h.resources;

      let keyMetric = "";
      if (need === "icu") keyMetric = `🫀 ${resrc.icuBeds?.available ?? 0} ICU Beds Available`;
      else if (need === "ventilator") keyMetric = `💨 ${resrc.ventilators?.available ?? 0} Ventilators Free`;
      else if (need === "oxygen") keyMetric = `🫁 ${resrc.oxygen?.supportedBeds ?? 0} Oxygen Beds Available`;
      else if (need === "blood") keyMetric = `🩸 ${resrc.blood?.[bloodGroup] ?? 0} Units of ${bloodGroup}`;
      else if (need === "ambulance") keyMetric = `🚑 ${resrc.ambulances?.onDuty ?? 0} Ambulances Ready`;
      else keyMetric = `🏥 ${resrc.emergencyBeds?.available ?? 0} Emergency Beds Available`;

      const approxEtaMins = Math.max(3, Math.round((h.distanceKm || 5) * 2.2));

      return `
        <div class="triage-match-item ${isTop ? 'rank-1' : ''}">
          <span class="rank-badge">${isTop ? '★ BEST MATCH (#1)' : `#${idx + 1} RECOMMENDED`}</span>
          <div style="flex: 1; padding-top: 8px;">
            <div style="display:flex; align-items:center; gap: 8px; flex-wrap:wrap; margin-bottom: 4px;">
              <h3 style="margin: 0; font-size: 18px;">${h.name}</h3>
              <span class="distance-tag">${formatDistance(h.distanceKm)}</span>
              <span class="muted">· ETA: ~${approxEtaMins} mins</span>
            </div>
            <p class="muted" style="font-size: 13px; margin-bottom: 8px;">${h.address} · ${h.city}</p>
            <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
              <span style="font-size: 14px; font-weight: 800; color: #10b981;">${keyMetric}</span>
              <span class="freshness-tag freshness-${h.freshness?.level || 'green'}">● ${h.freshness?.label || 'Verified'}</span>
              <span class="muted" style="font-size:12px;">Match Score: ${h.matchScore} pts</span>
            </div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px; flex-shrink: 0;">
            <a href="tel:${h.contacts?.emergency || h.phone}" class="btn btn-emergency">
              📞 Call Triage (${h.contacts?.emergency || h.phone})
            </a>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}" target="_blank" rel="noopener" class="btn btn-outline">
              🧭 Navigate
            </a>
          </div>
        </div>
      `;
    }).join("");

    resultsContainer.scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state"><p class="muted">${err.message}</p></div>`;
  }
}

// ==========================================
// HOSPITAL ADMIN MANAGEMENT PORTAL
// ==========================================
async function populateAdminHospitalDropdown() {
  const select = $("adminHospitalSelect");
  if (!select) return;

  try {
    const res = await fetchApi("/api/hospitals");
    if (res.success && res.data) {
      select.innerHTML = `<option value="">Choose medical facility...</option>` +
        res.data.map(h => `<option value="${h.id}">${h.name} (${h.area}, ${h.city})</option>`).join("");
    }
  } catch (err) {
    console.warn("Could not load hospital list for admin:", err.message);
  }
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const hospitalId = $("adminHospitalSelect").value;
  const pin = $("adminPinInput").value;

  if (!hospitalId || !pin) {
    showToast("Please choose a hospital and enter the security PIN.", "error");
    return;
  }

  try {
    const res = await fetchApi("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ hospitalId, pin })
    });

    if (res.success) {
      state.admin.authenticated = true;
      state.admin.hospital = res.hospital;
      state.admin.pin = pin;

      showToast(`Authenticated as ${res.hospital.name}`, "success");
      enterAdminControlCenter(hospitalId);
    }
  } catch (err) {
    showToast(`Authentication failed: ${err.message}`, "error");
  }
}

async function enterAdminControlCenter(hospitalId) {
  $("adminAuthSection").style.display = "none";
  $("adminControlSection").style.display = "block";

  // Fetch complete details of this hospital to populate edit form
  try {
    const res = await fetchApi(`/api/hospitals/${hospitalId}`);
    if (res.success && res.data) {
      const h = res.data;
      const r = h.resources;

      $("activeHospitalName").textContent = h.name;
      $("activeHospitalCity").textContent = `${h.area}, ${h.city}`;
      $("activeHospitalTrauma").textContent = h.traumaLevel || h.type;
      $("activeHospitalFreshness").textContent = `Last Verified: ${formatTimeAgo(h.lastVerified)}`;

      // Populate Bed Inputs
      $("inGenTotal").value = r.generalBeds?.total || 100;
      $("inGenAvail").value = r.generalBeds?.available || 0;
      $("inEmTotal").value = r.emergencyBeds?.total || 20;
      $("inEmAvail").value = r.emergencyBeds?.available || 0;
      $("inIcuTotal").value = r.icuBeds?.total || 15;
      $("inIcuAvail").value = r.icuBeds?.available || 0;
      $("inVentTotal").value = r.ventilators?.total || 10;
      $("inVentAvail").value = r.ventilators?.available || 0;

      // Oxygen
      $("inOxyBeds").value = r.oxygen?.supportedBeds || 0;
      $("inOxyCylinders").value = r.oxygen?.cylindersAvailable || 0;
      $("inOxyPipeline").value = r.oxygen?.pipelineStatus || "Operational";

      // Blood Units
      const b = r.blood || {};
      $("bld_A_pos").value = b["A+"] || 0;
      $("bld_A_neg").value = b["A-"] || 0;
      $("bld_B_pos").value = b["B+"] || 0;
      $("bld_B_neg").value = b["B-"] || 0;
      $("bld_AB_pos").value = b["AB+"] || 0;
      $("bld_AB_neg").value = b["AB-"] || 0;
      $("bld_O_pos").value = b["O+"] || 0;
      $("bld_O_neg").value = b["O-"] || 0;

      // Ambulances
      const amb = r.ambulances || {};
      $("inAmbBls").value = amb.bls || 0;
      $("inAmbAls").value = amb.als || 0;
      $("inAmbOnDuty").value = amb.onDuty || 0;
      $("inAmbContact").value = amb.dispatchContact || h.phone;

      // Operational Toggle
      $("inEmergencyReady").checked = Boolean(h.emergencyReady);

      // Load Audit Trail for this facility
      loadAdminAuditTrail(hospitalId);
    }
  } catch (err) {
    showToast(`Error loading facility details: ${err.message}`, "error");
  }
}

async function handleAdminPublishUpdate(e) {
  e.preventDefault();
  if (!state.admin.hospital) return;

  const hospitalId = state.admin.hospital.id;
  const pin = state.admin.pin;

  const payload = {
    pin,
    updatedBy: $("inStaffName").value.trim() || "Duty Triage Officer",
    note: $("inUpdateNote").value.trim() || "Resource status verified",
    emergencyReady: $("inEmergencyReady").checked,
    resources: {
      generalBeds: {
        total: parseInt($("inGenTotal").value) || 0,
        available: parseInt($("inGenAvail").value) || 0
      },
      emergencyBeds: {
        total: parseInt($("inEmTotal").value) || 0,
        available: parseInt($("inEmAvail").value) || 0
      },
      icuBeds: {
        total: parseInt($("inIcuTotal").value) || 0,
        available: parseInt($("inIcuAvail").value) || 0
      },
      ventilators: {
        total: parseInt($("inVentTotal").value) || 0,
        available: parseInt($("inVentAvail").value) || 0
      },
      oxygen: {
        supportedBeds: parseInt($("inOxyBeds").value) || 0,
        cylindersAvailable: parseInt($("inOxyCylinders").value) || 0,
        pipelineStatus: $("inOxyPipeline").value
      },
      blood: {
        "A+": parseInt($("bld_A_pos").value) || 0,
        "A-": parseInt($("bld_A_neg").value) || 0,
        "B+": parseInt($("bld_B_pos").value) || 0,
        "B-": parseInt($("bld_B_neg").value) || 0,
        "AB+": parseInt($("bld_AB_pos").value) || 0,
        "AB-": parseInt($("bld_AB_neg").value) || 0,
        "O+": parseInt($("bld_O_pos").value) || 0,
        "O-": parseInt($("bld_O_neg").value) || 0
      },
      ambulances: {
        bls: parseInt($("inAmbBls").value) || 0,
        als: parseInt($("inAmbAls").value) || 0,
        onDuty: parseInt($("inAmbOnDuty").value) || 0,
        dispatchContact: $("inAmbContact").value.trim()
      }
    }
  };

  try {
    const saveBtn = $("saveUpdateBtn");
    saveBtn.disabled = true;
    saveBtn.innerHTML = `Publishing verification...`;

    const res = await fetchApi(`/api/hospitals/${hospitalId}/resources`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });

    if (res.success) {
      showToast("Live verified update published to network!", "success");
      $("activeHospitalFreshness").textContent = "Last Verified: Just Now";

      // Refresh app data in background
      loadStats();
      loadAlerts();
      loadHospitals();
      loadAdminAuditTrail(hospitalId);
    }
  } catch (err) {
    showToast(`Update failed: ${err.message}`, "error");
  } finally {
    const saveBtn = $("saveUpdateBtn");
    saveBtn.disabled = false;
    saveBtn.innerHTML = `
      <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
      Publish Verified Live Update
    `;
  }
}

async function loadAdminAuditTrail(hospitalId) {
  const tableBody = $("adminAuditTableBody");
  if (!tableBody) return;

  try {
    const res = await fetchApi(`/api/audit-logs?hospitalId=${hospitalId}`);
    if (res.success && res.data) {
      if (!res.data.length) {
        tableBody.innerHTML = `<tr><td colspan="4" class="muted">No recent verification logs found.</td></tr>`;
        return;
      }

      tableBody.innerHTML = res.data.map(l => {
        const changesText = Object.keys(l.changes || {}).join(", ") || "General status";
        return `
          <tr>
            <td>${new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${formatTimeAgo(l.timestamp)})</td>
            <td><b>${l.updatedBy}</b></td>
            <td><code style="font-size:11px; color:#38bdf8;">${changesText}</code></td>
            <td>${l.note}</td>
          </tr>
        `;
      }).join("");
    }
  } catch (err) {
    console.warn("Could not load audit trail:", err.message);
  }
}

function handleAdminLogout() {
  state.admin.authenticated = false;
  state.admin.hospital = null;
  state.admin.pin = "";

  $("adminAuthSection").style.display = "block";
  $("adminControlSection").style.display = "none";
  showToast("Logged out of facility portal.", "info");
}

// ==========================================
// NAVIGATION & TABS
// ==========================================
function switchTab(tabId) {
  state.activeTab = tabId;

  // Toggle active views
  $$(".tab-view").forEach(v => {
    v.classList.remove("active");
  });
  const targetView = $(`view-${tabId}`);
  if (targetView) targetView.classList.add("active");

  // Sync Header Tabs
  $$(".nav-tab").forEach(tab => {
    tab.classList.toggle("active", tab.getAttribute("data-tab") === tabId);
  });

  // Sync Mobile Nav
  $$(".mobile-nav-btn").forEach(tab => {
    tab.classList.toggle("active", tab.getAttribute("data-tab") === tabId);
  });

  // Invalidate Map size if switching to directory
  if (tabId === "directory" && state.map) {
    setTimeout(() => state.map.invalidateSize(), 150);
  }

  // Auto load admin hospital dropdown
  if (tabId === "admin" && !state.admin.authenticated) {
    populateAdminHospitalDropdown();
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Reset All Filters
function resetFilters() {
  state.activeFilters = {
    q: "",
    city: "",
    area: "",
    resource: "",
    bloodGroup: "",
    emergencyOnly: false,
    sort: "name"
  };

  if ($("searchInput")) $("searchInput").value = "";
  if ($("clearSearchBtn")) $("clearSearchBtn").classList.add("hidden");
  if ($("citySelect")) $("citySelect").value = "";
  if ($("areaSelect")) {
    $("areaSelect").value = "";
    $("areaSelect").disabled = true;
  }
  if ($("resourceSelect")) $("resourceSelect").value = "";
  if ($("bloodFilterWrapper")) $("bloodFilterWrapper").style.display = "none";
  if ($("emergencyOnlyCheckbox")) $("emergencyOnlyCheckbox").checked = false;
  if ($("sortSelect")) $("sortSelect").value = "name";

  $$("#quickResourceChips .chip-btn").forEach(b => {
    b.classList.toggle("active", b.getAttribute("data-res") === "");
  });

  loadHospitals();
}

// ==========================================
// EVENT LISTENERS INITIALIZATION
// ==========================================
function setupEventListeners() {
  // Navigation tabs (Header)
  $$(".nav-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const tabId = tab.getAttribute("data-tab");
      switchTab(tabId);
    });
  });

  // Mobile bottom nav
  $$(".mobile-nav-btn").forEach(tab => {
    tab.addEventListener("click", () => {
      const tabId = tab.getAttribute("data-tab");
      switchTab(tabId);
    });
  });

  // Search input debounced
  const searchInput = $("searchInput");
  const clearBtn = $("clearSearchBtn");
  if (searchInput) {
    searchInput.addEventListener("input", debounce(e => {
      state.activeFilters.q = e.target.value.trim();
      if (clearBtn) clearBtn.classList.toggle("hidden", !state.activeFilters.q);
      loadHospitals();
    }, 200));

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        searchInput.value = "";
        state.activeFilters.q = "";
        clearBtn.classList.add("hidden");
        loadHospitals();
      });
    }
  }

  // Filter dropdowns
  $("citySelect")?.addEventListener("change", e => {
    state.activeFilters.city = e.target.value;
    state.activeFilters.area = "";
    updateAreaOptions(e.target.value);
    loadHospitals();
  });

  $("areaSelect")?.addEventListener("change", e => {
    state.activeFilters.area = e.target.value;
    loadHospitals();
  });

  $("resourceSelect")?.addEventListener("change", e => {
    const val = e.target.value;
    state.activeFilters.resource = val;
    $("bloodFilterWrapper").style.display = val === "blood" ? "block" : "none";

    // Sync quick chips
    $$("#quickResourceChips .chip-btn").forEach(b => {
      b.classList.toggle("active", b.getAttribute("data-res") === val);
    });
    loadHospitals();
  });

  $("bloodGroupSelect")?.addEventListener("change", e => {
    state.activeFilters.bloodGroup = e.target.value;
    loadHospitals();
  });

  $("sortSelect")?.addEventListener("change", e => {
    state.activeFilters.sort = e.target.value;
    loadHospitals();
  });

  $("emergencyOnlyCheckbox")?.addEventListener("change", e => {
    state.activeFilters.emergencyOnly = e.target.checked;
    loadHospitals();
  });

  // Quick resource pill chips
  $$("#quickResourceChips .chip-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      $$("#quickResourceChips .chip-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const res = btn.getAttribute("data-res");
      state.activeFilters.resource = res;
      if ($("resourceSelect")) $("resourceSelect").value = res;
      $("bloodFilterWrapper").style.display = res === "blood" ? "block" : "none";
      loadHospitals();
    });
  });

  // GPS Locate Button in Header
  $("headerLocateBtn")?.addEventListener("click", () => {
    if (!navigator.geolocation) {
      showToast("Geolocation is not supported by your browser.", "error");
      return;
    }

    $("locateBtnText").textContent = "Locating...";
    navigator.geolocation.getCurrentPosition(
      pos => {
        state.userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        $("locateBtnText").textContent = "GPS Active";
        showToast("GPS coordinates acquired. Sorting facilities by proximity.", "success");
        if ($("sortSelect")) $("sortSelect").value = "distance";
        state.activeFilters.sort = "distance";
        loadHospitals();
      },
      err => {
        $("locateBtnText").textContent = "My Location";
        showToast(`Location access denied or unavailable (${err.message})`, "error");
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  });

  // Recenter Map
  $("recenterMapBtn")?.addEventListener("click", () => {
    if (state.map && state.hospitals.length) {
      const coords = state.hospitals.filter(h => h.lat && h.lng).map(h => [h.lat, h.lng]);
      if (coords.length) state.map.fitBounds(coords, { padding: [30, 30] });
    }
  });

  // Dialog Close Button
  $("closeDialogBtn")?.addEventListener("click", closeHospitalDetail);
  $("hospitalDetailDialog")?.addEventListener("click", (e) => {
    if (e.target.id === "hospitalDetailDialog") closeHospitalDetail();
  });

  // ====================
  // Triage Wizard Events
  // ====================
  $$(".triage-choice").forEach(choice => {
    choice.addEventListener("click", () => {
      $$(".triage-choice").forEach(c => c.classList.remove("active"));
      choice.classList.add("active");
      const need = choice.getAttribute("data-need");
      state.triage.need = need;

      $("triageBloodSubstep").style.display = need === "blood" ? "block" : "none";
    });
  });

  $$("#triageBloodPills .blood-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      $$("#triageBloodPills .blood-pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      state.triage.bloodGroup = pill.getAttribute("data-group");
    });
  });

  $("triageGpsBtn")?.addEventListener("click", () => {
    if (!navigator.geolocation) {
      showToast("Geolocation not available", "error");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        state.triage.coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        $("triageLocationStatus").textContent = `GPS Coordinates locked: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
        showToast("Triage patient location locked to GPS.", "success");
      },
      err => {
        showToast(`Could not acquire GPS: ${err.message}`, "error");
      }
    );
  });

  $("triageCityPreset")?.addEventListener("change", e => {
    const [lat, lng] = e.target.value.split(",").map(Number);
    state.triage.coords = { lat, lng };
    $("triageLocationStatus").textContent = `Reference coordinates set: ${lat}, ${lng}`;
  });

  $("runTriageBtn")?.addEventListener("click", runTriageMatch);

  // ====================
  // Blood Tab Filters
  // ====================
  $$("#bloodGroupFilterTabs .blood-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      $$("#bloodGroupFilterTabs .blood-tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const grp = btn.getAttribute("data-grp");
      renderBloodTable(state.hospitals, grp);
    });
  });

  // ====================
  // Alert Feed Filters
  // ====================
  $$("#alertFilterChips .chip-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      $$("#alertFilterChips .chip-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const sev = btn.getAttribute("data-sev");
      renderAlertsFeed(state.alerts, sev);
    });
  });

  // ====================
  // Admin Portal Events
  // ====================
  $("adminLoginForm")?.addEventListener("submit", handleAdminLogin);
  $("adminUpdateForm")?.addEventListener("submit", handleAdminPublishUpdate);
  $("adminLogoutBtn")?.addEventListener("click", handleAdminLogout);
}

// Global expose for inline HTML event handlers
window.openHospitalDetail = openHospitalDetail;
window.switchTab = switchTab;
window.resetFilters = resetFilters;

// ==========================================
// APPLICATION ENTRY POINT
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
  setupEventListeners();

  // Initial Data Fetch
  await Promise.all([
    loadStats(),
    loadCities(),
    loadAlerts(),
    loadHospitals()
  ]);

  // Set default city selector options after cities are fetched
  updateAreaOptions("");
});
