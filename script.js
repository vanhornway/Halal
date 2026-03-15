let restaurants = [];
let filteredRestaurants = [];
let map;
let userMarker;
let markersLayer;
let userLocation = null;
let selectedRestaurantName = null;
let sortAscending = true;

const els = {
  searchInput: document.getElementById("searchInput"),
  distanceFilter: document.getElementById("distanceFilter"),
  cityFilter: document.getElementById("cityFilter"),
  cuisineFilter: document.getElementById("cuisineFilter"),
  ratingFilter: document.getElementById("ratingFilter"),
  sortSelect: document.getElementById("sortSelect"),
  sortDirection: document.getElementById("sortDirection"),
  restaurantList: document.getElementById("restaurantList"),
  resultsMeta: document.getElementById("resultsMeta"),
  modal: document.getElementById("modal"),
  modalBackdrop: document.getElementById("modalBackdrop"),
  pickButton: document.getElementById("pickButton"),
  locateButton: document.getElementById("locateButton"),
  clearButton: document.getElementById("clearButton"),
};

fetch("restaurants.json")
  .then((response) => response.json())
  .then((data) => {
    restaurants = data.map((restaurant) => normalizeRestaurant(restaurant));
    populateFilterOptions(restaurants);
    initMap();
    bindEvents();
    applyFilters();
    centerFromGeolocation();
  })
  .catch((error) => {
    console.error("Failed to load restaurants:", error);
    els.resultsMeta.textContent = "Could not load restaurants.";
  });

function normalizeRestaurant(restaurant) {
  const phone = restaurant.phone || "Phone unavailable";
  const rating = Number(restaurant.rating) || 0;
  const reviewCount = Number(restaurant.reviews) || 0;
  const reviewHighlights = Array.isArray(restaurant.reviews_highlight)
    ? restaurant.reviews_highlight.filter(Boolean)
    : [];
  const topDishes = Array.isArray(restaurant.top_dishes)
    ? restaurant.top_dishes.filter(Boolean)
    : [];
  const halal = resolveHalalStatus(restaurant.halal_status);

  return {
    ...restaurant,
    phone,
    rating,
    reviews: reviewCount,
    reviewHighlights,
    topDishes,
    halal,
    distanceMiles: null,
  };
}

function resolveHalalStatus(status) {
  const s = (status || "").trim().toLowerCase();

  if (s === "full halal") {
    return {
      label: "Full Halal",
      className: "halal-full",
      note: "Listed as fully halal in our dataset. Always worth a quick confirmation when you visit.",
    };
  }
  if (s === "partial halal") {
    return {
      label: "Partial Halal",
      className: "halal-partial",
      note: "Some menu items are halal. Confirm specific meats or preparation when ordering.",
    };
  }

  return {
    label: "Ask for options",
    className: "halal-ask",
    note: "Halal status not confirmed in our dataset. Contact the restaurant directly to confirm.",
  };
}

function populateFilterOptions(list) {
  populateSelect(els.cityFilter, list.map((item) => item.city));
  populateSelect(els.cuisineFilter, list.map((item) => item.cuisine));
}

function populateSelect(select, values) {
  const uniqueValues = [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
  uniqueValues.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function bindEvents() {
  [
    els.searchInput,
    els.distanceFilter,
    els.cityFilter,
    els.cuisineFilter,
    els.ratingFilter,
    els.sortSelect,
  ].forEach((element) => {
    element.addEventListener("input", applyFilters);
    element.addEventListener("change", applyFilters);
  });

  els.sortDirection.addEventListener("click", () => {
    sortAscending = !sortAscending;
    els.sortDirection.textContent = sortAscending ? "↑" : "↓";
    applyFilters();
  });

  els.pickButton.addEventListener("click", () => {
    if (!filteredRestaurants.length) return;
    const picked =
      filteredRestaurants[
        Math.floor(Math.random() * filteredRestaurants.length)
      ];
    focusRestaurant(picked, true);
  });

  els.locateButton.addEventListener("click", centerFromGeolocation);

  els.clearButton.addEventListener("click", () => {
    els.searchInput.value = "";
    els.distanceFilter.value = "";
    els.cityFilter.value = "";
    els.cuisineFilter.value = "";
    els.ratingFilter.value = "";
    els.sortSelect.value = "distance";
    sortAscending = true;
    els.sortDirection.textContent = "↑";
    applyFilters();
  });

  els.modalBackdrop.addEventListener("click", (event) => {
    if (event.target === els.modalBackdrop) closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });
}

function initMap() {
  map = L.map("map", {
    zoomControl: true,
    tap: true,
    touchZoom: true,
    scrollWheelZoom: true,
  }).setView([37.5483, -121.9886], 10);

  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      maxZoom: 20,
      attribution: "&copy; OpenStreetMap &copy; CARTO",
    }
  ).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
}

function centerFromGeolocation() {
  if (!navigator.geolocation) {
    updateMetaText();
    return;
  }

  els.locateButton.textContent = "Locating…";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      userLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };

      if (!userMarker) {
        userMarker = L.circleMarker([userLocation.lat, userLocation.lng], {
          radius: 10,
          weight: 3,
          color: "#0f766e",
          fillColor: "#ffffff",
          fillOpacity: 1,
        }).addTo(map);
      } else {
        userMarker.setLatLng([userLocation.lat, userLocation.lng]);
      }

      userMarker.bindPopup("You are here");
      map.setView([userLocation.lat, userLocation.lng], 11, { animate: true });
      els.locateButton.textContent = "Using My Location";
      applyFilters();
    },
    () => {
      els.locateButton.textContent = "Use My Location";
      updateMetaText("Location blocked — showing all Bay Area restaurants.");
      applyFilters();
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
  );
}

function applyFilters() {
  const search = els.searchInput.value.trim().toLowerCase();
  const maxDistance = Number(els.distanceFilter.value) || null;
  const city = els.cityFilter.value;
  const cuisine = els.cuisineFilter.value;
  const minRating = Number(els.ratingFilter.value) || null;
  const sortBy = els.sortSelect.value;

  filteredRestaurants = restaurants
    .map((restaurant) => ({
      ...restaurant,
      distanceMiles:
        userLocation && hasCoordinates(restaurant)
          ? haversineMiles(
              userLocation.lat,
              userLocation.lng,
              restaurant.lat,
              restaurant.lng
            )
          : null,
    }))
    .filter((restaurant) => {
      if (
        maxDistance !== null &&
        (restaurant.distanceMiles === null ||
          restaurant.distanceMiles > maxDistance)
      )
        return false;
      if (city && restaurant.city !== city) return false;
      if (cuisine && restaurant.cuisine !== cuisine) return false;
      if (minRating !== null && restaurant.rating < minRating) return false;
      if (search) {
        const haystack = [
          restaurant.name,
          restaurant.city,
          restaurant.cuisine,
          restaurant.address,
          ...(restaurant.topDishes || []),
          ...(restaurant.reviewHighlights || []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    })
    .sort((a, b) => sortRestaurants(a, b, sortBy, sortAscending));

  renderRestaurants(filteredRestaurants);
  renderMapMarkers(filteredRestaurants);
  updateMetaText();
}

function sortRestaurants(a, b, sortBy, ascending) {
  let comparison = 0;

  switch (sortBy) {
    case "rating":
      comparison = b.rating - a.rating;
      break;
    case "reviews":
      comparison = b.reviews - a.reviews;
      break;
    case "name":
      comparison = a.name.localeCompare(b.name);
      break;
    case "city":
      comparison = a.city.localeCompare(b.city);
      break;
    case "distance":
    default: {
      const aDistance = a.distanceMiles ?? Number.POSITIVE_INFINITY;
      const bDistance = b.distanceMiles ?? Number.POSITIVE_INFINITY;
      comparison = aDistance - bDistance;
      if (!Number.isFinite(comparison) || comparison === 0) {
        comparison = b.rating - a.rating;
      }
      break;
    }
  }

  return ascending ? comparison : comparison * -1;
}

function renderRestaurants(list) {
  els.restaurantList.innerHTML = "";

  if (!list.length) {
    els.restaurantList.innerHTML = `
      <div class="empty-state">
        <h3>No restaurants match these filters.</h3>
        <p>Try widening the distance, lowering the rating, or clearing the search.</p>
      </div>
    `;
    return;
  }

  list.forEach((restaurant) => {
    const card = document.createElement("article");
    card.className = `card ${
      selectedRestaurantName === restaurant.name ? "active" : ""
    }`;
    card.innerHTML = `
      <div class="card-top">
        <div>
          <h3>${escapeHtml(restaurant.name)}</h3>
          <p class="card-subtitle">${escapeHtml(
            restaurant.cuisine || "Cuisine unavailable"
          )} • ${escapeHtml(restaurant.city || "City unavailable")}</p>
        </div>
        <div class="badge-row">
          <span class="badge">⭐ ${
            restaurant.rating ? restaurant.rating.toFixed(1) : "N/A"
          }</span>
          <span class="badge ${restaurant.halal.className}">${
      restaurant.halal.label
    }</span>
        </div>
      </div>

      <div class="card-meta">
        <span class="badge">${
          restaurant.distanceMiles !== null
            ? `${restaurant.distanceMiles.toFixed(1)} mi away`
            : "Distance after GPS"
        }</span>
        <span class="badge">${restaurant.reviews} reviews</span>
        <span class="badge">📞 ${escapeHtml(restaurant.phone)}</span>
      </div>

      <p class="card-text">${escapeHtml(
        firstMeaningfulLine(restaurant.topDishes[0]) || restaurant.halal.note
      )}</p>

      <div class="card-bottom">
        <a class="card-link" href="${
          restaurant.maps || mapsDirectionsUrl(restaurant)
        }" target="_blank" rel="noopener noreferrer">Start directions</a>
        <span class="muted">Tap for comments, dishes, and details</span>
      </div>
    `;

    card.addEventListener("click", () => focusRestaurant(restaurant, true));
    els.restaurantList.appendChild(card);
  });
}

function renderMapMarkers(list) {
  markersLayer.clearLayers();

  const bounds = [];

  list.forEach((restaurant) => {
    if (!hasCoordinates(restaurant)) return;

    const marker = L.marker([restaurant.lat, restaurant.lng]).addTo(
      markersLayer
    );
    marker.bindPopup(`
      <div class="map-popup">
        <h4>${escapeHtml(restaurant.name)}</h4>
        <p>${escapeHtml(restaurant.cuisine || "Cuisine unavailable")} • ${escapeHtml(
      restaurant.city || ""
    )}</p>
        <p>⭐ ${
          restaurant.rating ? restaurant.rating.toFixed(1) : "N/A"
        } • ${restaurant.halal.label}</p>
        <a class="card-link" href="${
          restaurant.maps || mapsDirectionsUrl(restaurant)
        }" target="_blank" rel="noopener noreferrer">Directions</a>
      </div>
    `);

    marker.on("click", () => focusRestaurant(restaurant, false));
    bounds.push([restaurant.lat, restaurant.lng]);
  });

  if (userLocation) bounds.push([userLocation.lat, userLocation.lng]);

  if (bounds.length) {
    map.fitBounds(bounds, {
      padding: [34, 34],
      maxZoom: userLocation ? 13 : 11,
    });
  }
}

function focusRestaurant(restaurant, openDetails) {
  selectedRestaurantName = restaurant.name;
  renderRestaurants(filteredRestaurants);

  if (hasCoordinates(restaurant)) {
    map.setView(
      [restaurant.lat, restaurant.lng],
      Math.max(map.getZoom(), 14),
      { animate: true }
    );
  }

  const activeCard = [...document.querySelectorAll(".card")].find(
    (card) => card.querySelector("h3")?.textContent === restaurant.name
  );
  activeCard?.scrollIntoView({ behavior: "smooth", block: "nearest" });

  if (openDetails) openModal(restaurant);
}

function openModal(restaurant) {
  const topComments = restaurant.reviewHighlights.length
    ? restaurant.reviewHighlights
        .slice(0, 4)
        .map(
          (review) => `<li>${escapeHtml(trimLongText(review, 240))}</li>`
        )
        .join("")
    : "<li>No review highlights yet.</li>";

  const topDishes = restaurant.topDishes.length
    ? restaurant.topDishes
        .slice(0, 4)
        .map(
          (dish) =>
            `<li>${escapeHtml(
              firstMeaningfulLine(trimLongText(dish, 180))
            )}</li>`
        )
        .join("")
    : "<li>No dish highlights yet.</li>";

  const hoursHtml = restaurant.opening_hours
    ? `<p><strong>Hours:</strong><br>${escapeHtml(restaurant.opening_hours).replace(/\\n/g, "<br>")}</p>`
    : "";

  els.modal.innerHTML = `
    <button class="modal-close" type="button" aria-label="Close">✕</button>
    <p class="eyebrow">Restaurant details</p>
    <h2 id="modalTitle">${escapeHtml(restaurant.name)}</h2>
    <div class="badge-row">
      <span class="badge">⭐ Google ${
        restaurant.rating ? restaurant.rating.toFixed(1) : "N/A"
      }</span>
      <span class="badge">${restaurant.reviews} reviews</span>
      <span class="badge ${restaurant.halal.className}">${
    restaurant.halal.label
  }</span>
      <span class="badge">${
        restaurant.distanceMiles !== null
          ? `${restaurant.distanceMiles.toFixed(1)} mi away`
          : "Distance after GPS"
      }</span>
    </div>

    <div class="action-row">
      <a class="primary-button" href="${mapsDirectionsUrl(
        restaurant
      )}" target="_blank" rel="noopener noreferrer">Start directions</a>
      <a class="link-button" href="${
        restaurant.maps || mapsDirectionsUrl(restaurant)
      }" target="_blank" rel="noopener noreferrer">Open Google Maps</a>
      ${
        restaurant.website
          ? `<a class="link-button" href="${restaurant.website}" target="_blank" rel="noopener noreferrer">Website</a>`
          : ""
      }
    </div>

    <div class="modal-grid">
      <section class="section-card">
        <h3>Quick info</h3>
        <p><strong>Phone:</strong> ${escapeHtml(restaurant.phone)}</p>
        <p><strong>Address:</strong> ${escapeHtml(
          restaurant.address || "Address unavailable"
        )}</p>
        <p><strong>Cuisine:</strong> ${escapeHtml(
          restaurant.cuisine || "Unknown"
        )}</p>
        <p><strong>Halal status:</strong> <span class="badge ${
          restaurant.halal.className
        }">${restaurant.halal.label}</span></p>
        <p class="muted">${escapeHtml(restaurant.halal.note)}</p>
        ${hoursHtml}
      </section>

      <section class="section-card">
        <h3>Top dishes</h3>
        <ul>${topDishes}</ul>
      </section>

      <section class="section-card">
        <h3>Top comments</h3>
        <ul>${topComments}</ul>
      </section>

      <section class="section-card">
        <h3>Why this one stands out</h3>
        <p>${escapeHtml(
          firstMeaningfulLine(restaurant.topDishes[0]) ||
            "Worth a look based on your current filters."
        )}</p>
        <p class="muted">Ratings and comments here come from the dataset currently bundled with the app.</p>
      </section>
    </div>
  `;

  els.modal.querySelector(".modal-close").addEventListener("click", closeModal);
  els.modalBackdrop.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  els.modalBackdrop.classList.add("hidden");
  document.body.style.overflow = "";
}

function updateMetaText(prefix) {
  const count = filteredRestaurants.length;
  const locationText = userLocation
    ? "sorted from your location"
    : "showing all Bay Area restaurants";
  els.resultsMeta.textContent =
    prefix || `${count} restaurant${count === 1 ? "" : "s"} • ${locationText}`;
}

function hasCoordinates(restaurant) {
  return (
    Number.isFinite(restaurant.lat) && Number.isFinite(restaurant.lng)
  );
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
}

function mapsDirectionsUrl(restaurant) {
  if (restaurant.maps) return restaurant.maps;
  if (hasCoordinates(restaurant)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${restaurant.lat},${restaurant.lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    restaurant.name || restaurant.address || "restaurant"
  )}`;
}

function firstMeaningfulLine(text) {
  if (!text) return "";
  return (
    text
      .split(/\n|\|/)
      .map((part) => part.trim())
      .filter(Boolean)[0] || text.trim()
  );
}

function trimLongText(text, maxLength) {
  if (!text) return "";
  return text.length > maxLength
    ? `${text.slice(0, maxLength).trim()}…`
    : text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
