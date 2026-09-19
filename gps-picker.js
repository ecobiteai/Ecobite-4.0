/* ============================================================
   EcoBite — exact location picker (device GPS + live map)

   Takes the real coordinates from the browser's Geolocation API,
   shows them on a Leaflet map with an accuracy circle, and keeps
   following the device while "Live GPS" is on. The marker can be
   dragged to correct the pin by hand when GPS is coarse indoors.

   Markup it expects (see home.html):
     <div class="gps-picker" data-gps="pickup"
          data-lat-name="pickup_latitude"
          data-lng-name="pickup_longitude"
          data-acc-name="location_accuracy_m"
          data-label="Pickup point"></div>

   setupGpsPickers(root) upgrades every such block on the page.
   Requires Leaflet (already loaded by home.html).
   ============================================================ */

const GPS_OPTIONS = { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 };
const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse';

const gpsRound = value => Number(value).toFixed(6);
const gpsAccuracy = metres =>
  metres == null ? 'accuracy unknown'
  : metres < 1000 ? `±${Math.round(metres)} m accurate`
  : `±${(metres / 1000).toFixed(1)} km accurate`;

// Best-effort street name for the pin. Silent when it fails.
async function gpsReverseGeocode(lat, lng) {
  try {
    const response = await fetch(`${NOMINATIM}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17`, {
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) return '';
    const payload = await response.json();
    return payload.display_name || '';
  } catch (error) {
    return '';
  }
}

function setupGpsPicker(root) {
  if (!root || root.dataset.gpsReady === '1') return root?.ecoGps || null;
  root.dataset.gpsReady = '1';

  const label = root.dataset.label || 'Exact location';
  const latName = root.dataset.latName || 'latitude';
  const lngName = root.dataset.lngName || 'longitude';
  const accName = root.dataset.accName || '';
  const addressName = root.dataset.addressName || '';
  const mapId = `gpsMap-${Math.random().toString(36).slice(2, 9)}`;

  root.innerHTML = `
    <div class="gps-head">
      <span class="gps-title">${label}</span>
      <span class="gps-state" data-gps-state>Location not captured yet</span>
    </div>
    <div class="gps-actions">
      <button type="button" class="btn btn-leaf btn-sm" data-gps-locate>📍 Use my exact location</button>
      <button type="button" class="btn btn-outline btn-sm" data-gps-live hidden>🛰️ Start live GPS</button>
      <button type="button" class="btn btn-ghost btn-sm" data-gps-clear hidden>Clear</button>
    </div>
    <div class="gps-map-wrap" data-gps-mapwrap hidden>
      <div class="gps-map" id="${mapId}"></div>
      <span class="gps-live-badge" data-gps-badge hidden><i></i>Live GPS</span>
    </div>
    <div class="gps-readout" data-gps-readout hidden>
      <span class="gps-coord"><small>Latitude</small><strong data-gps-lat>—</strong></span>
      <span class="gps-coord"><small>Longitude</small><strong data-gps-lng>—</strong></span>
      <span class="gps-coord"><small>Accuracy</small><strong data-gps-acc>—</strong></span>
    </div>
    <p class="gps-address" data-gps-address hidden></p>
    <p class="gps-note" data-gps-note>The pin is taken from your device GPS. Drag it on the map if it needs a nudge.</p>
    <input type="hidden" name="${latName}" data-gps-lat-input>
    <input type="hidden" name="${lngName}" data-gps-lng-input>
    ${accName ? `<input type="hidden" name="${accName}" data-gps-acc-input>` : ''}
    ${addressName ? `<input type="hidden" name="${addressName}" data-gps-address-input>` : ''}`;

  const el = selector => root.querySelector(selector);
  const stateEl = el('[data-gps-state]');
  const noteEl = el('[data-gps-note]');
  const mapWrap = el('[data-gps-mapwrap]');
  const badge = el('[data-gps-badge]');
  const readout = el('[data-gps-readout]');
  const addressEl = el('[data-gps-address]');
  const locateBtn = el('[data-gps-locate]');
  const liveBtn = el('[data-gps-live]');
  const clearBtn = el('[data-gps-clear]');
  const latInput = el('[data-gps-lat-input]');
  const lngInput = el('[data-gps-lng-input]');
  const accInput = el('[data-gps-acc-input]');
  const addressInput = el('[data-gps-address-input]');

  let map = null, marker = null, ring = null, trail = null;
  let point = null;          // {lat, lng, accuracy}
  let watchId = null;
  let addressToken = 0;

  const setNote = (text, warn) => { noteEl.textContent = text; noteEl.classList.toggle('warn', !!warn); };

  const buildMap = () => {
    if (map || !window.L) return;
    mapWrap.hidden = false;
    map = L.map(document.getElementById(mapId), { zoomControl: true, scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19
    }).addTo(map);
    marker = L.marker([0, 0], {
      draggable: true,
      icon: L.divIcon({
        className: 'eco-pin-wrap',
        html: '<span class="eco-pin eco-pin-pickup">📍</span>',
        iconSize: [34, 34], iconAnchor: [17, 17]
      })
    }).addTo(map);
    ring = L.circle([0, 0], { radius: 0, color: '#4F9A52', weight: 1, fillColor: '#72AA3F', fillOpacity: .12 }).addTo(map);
    trail = L.polyline([], { color: '#F2994A', weight: 3, opacity: .8, dashArray: '3 8' }).addTo(map);
    marker.on('dragend', () => {
      const position = marker.getLatLng();
      // A hand-placed pin is exact by definition, so the accuracy ring goes.
      apply({ lat: position.lat, lng: position.lng, accuracy: null }, 'Pin placed by hand.');
    });
    window.setTimeout(() => map.invalidateSize(), 140);
  };

  const apply = (next, message) => {
    point = next;
    buildMap();
    const here = [next.lat, next.lng];
    marker.setLatLng(here);
    ring.setLatLng(here).setRadius(next.accuracy || 0);
    if (watchId !== null) trail.addLatLng(here);
    map.setView(here, next.accuracy && next.accuracy > 200 ? 15 : 17);
    window.setTimeout(() => map.invalidateSize(), 120);

    latInput.value = gpsRound(next.lat);
    lngInput.value = gpsRound(next.lng);
    if (accInput) accInput.value = next.accuracy != null ? Math.round(next.accuracy) : '';

    readout.hidden = false;
    el('[data-gps-lat]').textContent = gpsRound(next.lat);
    el('[data-gps-lng]').textContent = gpsRound(next.lng);
    el('[data-gps-acc]').textContent = gpsAccuracy(next.accuracy);
    stateEl.textContent = 'Coordinates captured';
    stateEl.classList.add('ok');
    liveBtn.hidden = false;
    clearBtn.hidden = false;
    locateBtn.textContent = '📍 Update my location';
    if (message) setNote(message);

    const token = ++addressToken;
    void gpsReverseGeocode(gpsRound(next.lat), gpsRound(next.lng)).then(address => {
      if (token !== addressToken || !address) return;
      addressEl.hidden = false;
      addressEl.textContent = address;
      if (addressInput) addressInput.value = address;
    });

    root.dispatchEvent(new CustomEvent('gps:change', { detail: next, bubbles: true }));
  };

  const failure = error => {
    const reason = error?.code === 1 ? 'Location permission was blocked. Allow it in your browser, then try again.'
      : error?.code === 3 ? 'The GPS fix timed out. Step near a window or try once more.'
      : 'Your device could not provide a location just now.';
    setNote(reason, true);
    stateEl.textContent = 'Location unavailable';
    stateEl.classList.remove('ok');
  };

  locateBtn.addEventListener('click', () => {
    if (!navigator.geolocation) { setNote('This browser cannot read GPS.', true); return; }
    if (window.location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      setNote('Browsers only release GPS over https (or localhost). Open the deployed site to capture coordinates.', true);
      return;
    }
    locateBtn.disabled = true;
    stateEl.textContent = 'Reading your GPS…';
    setNote('Hold still for a moment while the device gets a fix.');
    navigator.geolocation.getCurrentPosition(position => {
      locateBtn.disabled = false;
      apply({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
      }, 'Exact coordinates captured from your device.');
    }, error => { locateBtn.disabled = false; failure(error); }, GPS_OPTIONS);
  });

  const stopLive = () => {
    if (watchId === null) return;
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    badge.hidden = true;
    liveBtn.textContent = '🛰️ Start live GPS';
    liveBtn.classList.remove('btn-leaf');
    liveBtn.classList.add('btn-outline');
    setNote('Live GPS stopped. The last pin stays saved.');
  };

  liveBtn.addEventListener('click', () => {
    if (watchId !== null) { stopLive(); return; }
    if (!navigator.geolocation) { setNote('This browser cannot read GPS.', true); return; }
    badge.hidden = false;
    liveBtn.textContent = '⏹ Stop live GPS';
    liveBtn.classList.add('btn-leaf');
    liveBtn.classList.remove('btn-outline');
    setNote('Following your device — the pin moves as you do.');
    watchId = navigator.geolocation.watchPosition(position => {
      apply({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
      }, null);
    }, error => { stopLive(); failure(error); }, GPS_OPTIONS);
  });

  clearBtn.addEventListener('click', () => {
    stopLive();
    point = null;
    latInput.value = ''; lngInput.value = '';
    if (accInput) accInput.value = '';
    if (addressInput) addressInput.value = '';
    readout.hidden = true; mapWrap.hidden = true; addressEl.hidden = true;
    clearBtn.hidden = true; liveBtn.hidden = true;
    stateEl.textContent = 'Location not captured yet';
    stateEl.classList.remove('ok');
    locateBtn.textContent = '📍 Use my exact location';
    setNote('The pin is taken from your device GPS. Drag it on the map if it needs a nudge.');
    if (map) { map.remove(); map = null; marker = null; ring = null; trail = null; }
  });

  const api = {
    value: () => (point ? { latitude: Number(gpsRound(point.lat)), longitude: Number(gpsRound(point.lng)), accuracy_m: point.accuracy ?? null } : null),
    has: () => !!point,
    set: (lat, lng, accuracy) => apply({ lat: Number(lat), lng: Number(lng), accuracy: accuracy ?? null }, 'Loaded from your saved location.'),
    stop: () => { stopLive(); if (map) { map.remove(); map = null; } },
    flag: () => { root.classList.add('invalid'); setNote('Capture the exact location before continuing.', true); },
    focus: () => locateBtn.focus({ preventScroll: true })
  };
  root.ecoGps = api;

  const preLat = root.dataset.lat, preLng = root.dataset.lng;
  if (preLat && preLng) api.set(preLat, preLng, root.dataset.accuracy || null);

  return api;
}

function setupGpsPickers(root = document) {
  return [...root.querySelectorAll('[data-gps]:not([data-gps-ready])')].map(setupGpsPicker);
}

window.EcoGps = { setupGpsPicker, setupGpsPickers, gpsAccuracy };
