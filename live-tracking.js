/* ============================================================
   EcoBite — live delivery tracking (Swiggy / Zomato style)

   Renders a Leaflet map with the pickup pin, the drop pin, the
   planned route, the driver's breadcrumb trail, and a driver
   marker that glides between GPS updates instead of jumping.

   Data comes from the FastAPI backend when it is running, and
   falls back to reading Supabase directly (the RLS policies in
   ai-backend-schema.sql already restrict these rows to the
   people on the delivery). Route geometry falls back to the
   public OSRM demo server.

   All name/text matching in here is case-insensitive.
   ============================================================ */

const TRACK_POLL_MS = 7000;      // how often to pull new GPS points
const ETA_REFRESH_MS = 20000;    // how often to re-ask for an ETA
const GLIDE_MS = 1400;           // driver marker animation length
const OSRM = 'https://router.project-osrm.org/route/v1/driving';

const STAGES = [
  { key: 'claimed',     label: 'Driver assigned', line: 'A volunteer has accepted this delivery.' },
  { key: 'in_progress', label: 'Food picked up',  line: 'On the way to the drop-off point.' },
  { key: 'delivered',   label: 'Delivered',       line: 'The food reached the receiver.' }
];

const eq = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const num = value => (value === null || value === undefined ? null : Number(value));

// Metres between two lat/lng pairs.
function haversine(a, b) {
  const R = 6371000;
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function bearing(from, to) {
  const toRad = deg => (deg * Math.PI) / 180;
  const y = Math.sin(toRad(to[1] - from[1])) * Math.cos(toRad(to[0]));
  const x = Math.cos(toRad(from[0])) * Math.sin(toRad(to[0])) -
            Math.sin(toRad(from[0])) * Math.cos(toRad(to[0])) * Math.cos(toRad(to[1] - from[1]));
  return (Math.atan2(y, x) * 180) / Math.PI;
}

const prettyDistance = metres =>
  metres < 950 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1)} km`;

const prettyMinutes = seconds => {
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
};

const timeAgo = iso => {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} h ago`;
};

// ---- marker icons ---------------------------------------------------------
const pinIcon = (emoji, tone) => L.divIcon({
  className: 'eco-pin-wrap',
  html: `<span class="eco-pin eco-pin-${tone}">${emoji}</span>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17]
});

const driverIcon = heading => L.divIcon({
  className: 'eco-driver-wrap',
  html: `<span class="eco-driver"><b class="eco-driver-pulse"></b><b class="eco-driver-body" style="transform:rotate(${heading || 0}deg)">🛵</b></span>`,
  iconSize: [44, 44],
  iconAnchor: [22, 22]
});

// ---- the tracker ----------------------------------------------------------
class DeliveryTracker {
  constructor(options) {
    Object.assign(this, options);           // {sb, ecoApi, session, profile, jobId, els}
    this.map = null;
    this.job = null;
    this.trail = [];
    this.driverMarker = null;
    this.trailLine = null;
    this.routeLine = null;
    this.glide = null;
    this.timers = [];
    this.channel = null;
    this.lastEtaAt = 0;
    this.stopped = false;
  }

  // ---- data -------------------------------------------------------------
  async fetchJob() {
    try {
      const data = await this.ecoApi(`/v1/deliveries/${this.jobId}`);
      return data.delivery || data;
    } catch (err) {
      const { data, error } = await this.sb
        .from('delivery_jobs').select('*').eq('id', this.jobId).maybeSingle();
      if (error || !data) throw new Error('This delivery is not visible to your account.');
      return data;
    }
  }

  async fetchTrail() {
    try {
      const data = await this.ecoApi(`/v1/deliveries/${this.jobId}/tracking`);
      return (data.points || []).map(point => ({
        at: [num(point.latitude), num(point.longitude)],
        heading: num(point.heading),
        recorded_at: point.recorded_at
      }));
    } catch (err) {
      const { data } = await this.sb
        .from('delivery_location_events')
        .select('latitude,longitude,heading,recorded_at')
        .eq('job_id', this.jobId)
        .order('recorded_at', { ascending: true })
        .limit(300);
      return (data || []).map(point => ({
        at: [num(point.latitude), num(point.longitude)],
        heading: num(point.heading),
        recorded_at: point.recorded_at
      }));
    }
  }

  // Returns {coordinates:[[lat,lng]…], duration, distance} or null.
  async fetchRoute(from, to) {
    const direct = async () => {
      const url = `${OSRM}/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
      const response = await fetch(url);
      const payload = await response.json();
      const route = payload.routes?.[0];
      if (!route) throw new Error('No route');
      return {
        coordinates: route.geometry.coordinates.map(pair => [pair[1], pair[0]]),
        duration: route.duration,
        distance: route.distance
      };
    };
    try {
      const data = await this.ecoApi(`/v1/deliveries/${this.jobId}/route`);
      const route = data.routes?.[0];
      if (!route) return await direct();
      return {
        coordinates: route.geometry.coordinates.map(pair => [pair[1], pair[0]]),
        duration: route.duration,
        distance: route.distance
      };
    } catch (err) {
      try { return await direct(); } catch (_) { return null; }
    }
  }

  // ---- rendering --------------------------------------------------------
  get pickup() { return [num(this.job.pickup_latitude), num(this.job.pickup_longitude)]; }
  get dropoff() { return [num(this.job.dropoff_latitude), num(this.job.dropoff_longitude)]; }

  buildMap() {
    if (this.map) this.map.remove();
    this.map = L.map(this.els.map, { zoomControl: true, scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(this.map);

    L.marker(this.pickup, { icon: pinIcon('🍲', 'pickup') })
      .addTo(this.map).bindPopup('Pickup');
    L.marker(this.dropoff, { icon: pinIcon('🏠', 'drop') })
      .addTo(this.map).bindPopup('Drop-off');

    this.map.fitBounds([this.pickup, this.dropoff], { padding: [40, 40] });
    // Leaflet needs a nudge when it is created inside a panel that was hidden.
    window.setTimeout(() => this.map.invalidateSize(), 120);
  }

  drawRoute(route) {
    if (!route) return;
    if (this.routeLine) this.routeLine.remove();
    this.routeLine = L.polyline(route.coordinates, {
      color: '#4F9A52', weight: 6, opacity: .85, lineJoin: 'round'
    }).addTo(this.map);
    this.routeLine.bringToBack();
  }

  drawTrail() {
    const points = this.trail.map(point => point.at);
    if (points.length < 2) return;
    if (this.trailLine) this.trailLine.remove();
    this.trailLine = L.polyline(points, {
      color: '#F2994A', weight: 4, opacity: .9, dashArray: '2 9', lineCap: 'round'
    }).addTo(this.map);
  }

  // Slides the driver marker from where it is to the new point.
  moveDriver(to, heading) {
    if (!this.driverMarker) {
      this.driverMarker = L.marker(to, { icon: driverIcon(heading), zIndexOffset: 700 }).addTo(this.map);
      return;
    }
    const from = [this.driverMarker.getLatLng().lat, this.driverMarker.getLatLng().lng];
    const facing = heading ?? bearing(from, to);
    this.driverMarker.setIcon(driverIcon(facing));
    if (haversine(from, to) < 2) { this.driverMarker.setLatLng(to); return; }

    if (this.glide) window.cancelAnimationFrame(this.glide);
    const started = performance.now();
    const step = now => {
      const t = Math.min(1, (now - started) / GLIDE_MS);
      const ease = t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      this.driverMarker.setLatLng([
        from[0] + (to[0] - from[0]) * ease,
        from[1] + (to[1] - from[1]) * ease
      ]);
      if (t < 1 && !this.stopped) this.glide = window.requestAnimationFrame(step);
    };
    this.glide = window.requestAnimationFrame(step);
  }

  renderStages() {
    const status = String(this.job.status || '').toLowerCase();
    const reached = status === 'delivered' ? 3 : status === 'in_progress' ? 2 : status === 'claimed' ? 1 : 0;
    this.els.stages.innerHTML = STAGES.map((stage, index) => {
      const state = index < reached ? 'done' : index === reached ? 'live' : '';
      return `<li class="track-stage ${state}"><i></i><span><strong>${stage.label}</strong><span>${stage.line}</span></span></li>`;
    }).join('');
  }

  renderHeadline({ etaSeconds, remaining, lastPoint }) {
    const status = String(this.job.status || '').toLowerCase();
    if (status === 'delivered') {
      this.els.eta.innerHTML = `<strong>Delivered</strong><span>This run is complete. Thank you.</span>`;
      return;
    }
    if (status === 'cancelled') {
      this.els.eta.innerHTML = `<strong>Cancelled</strong><span>This delivery was called off.</span>`;
      return;
    }
    if (!lastPoint) {
      this.els.eta.innerHTML = `<strong>Waiting for the driver</strong><span>Live location appears here once the driver starts sharing GPS.</span>`;
      return;
    }
    const heading = status === 'in_progress' ? 'Arriving in' : 'Reaching pickup in';
    this.els.eta.innerHTML =
      `<strong>${heading} ${etaSeconds ? prettyMinutes(etaSeconds) : '—'}</strong>` +
      `<span>${remaining ? prettyDistance(remaining) + ' away' : 'Distance updating'} · updated ${timeAgo(lastPoint.recorded_at)}</span>`;
  }

  async refreshEta(lastPoint) {
    const target = String(this.job.status).toLowerCase() === 'in_progress' ? this.dropoff : this.pickup;
    const straight = haversine(lastPoint.at, target);
    // Only ask OSRM occasionally; between calls, estimate at ~22 km/h city pace.
    if (Date.now() - this.lastEtaAt > ETA_REFRESH_MS) {
      this.lastEtaAt = Date.now();
      const leg = await this.fetchRoute(lastPoint.at, target);
      if (leg) {
        this.drawRoute(leg);
        return { etaSeconds: leg.duration, remaining: leg.distance };
      }
    }
    return { etaSeconds: (straight / 1000) / 22 * 3600, remaining: straight };
  }

  async tick(first) {
    if (this.stopped) return;
    try {
      if (!first) this.job = await this.fetchJob();
      this.trail = await this.fetchTrail();
      const lastPoint = this.trail[this.trail.length - 1] || null;

      this.renderStages();
      this.drawTrail();

      let summary = { etaSeconds: null, remaining: null, lastPoint };
      if (lastPoint) {
        this.moveDriver(lastPoint.at, lastPoint.heading);
        const eta = await this.refreshEta(lastPoint);
        summary = { ...eta, lastPoint };
        if (!this.userMovedMap) {
          const target = String(this.job.status).toLowerCase() === 'in_progress' ? this.dropoff : this.pickup;
          this.map.fitBounds([lastPoint.at, target], { padding: [50, 50], maxZoom: 16 });
        }
      }
      this.renderHeadline(summary);

      if (['delivered', 'cancelled'].includes(String(this.job.status).toLowerCase())) this.stop(true);
    } catch (error) {
      this.els.eta.innerHTML = `<strong>Tracking paused</strong><span>${error.message}</span>`;
    }
  }

  async start() {
    this.els.eta.innerHTML = '<strong>Loading this delivery…</strong><span>Fetching route and driver position.</span>';
    this.job = await this.fetchJob();
    this.buildMap();
    this.map.on('dragstart zoomstart', () => { this.userMovedMap = true; });

    const base = await this.fetchRoute(this.pickup, this.dropoff);
    this.drawRoute(base);
    if (base) this.els.meta.textContent =
      `Planned run: ${prettyDistance(base.distance)} · about ${prettyMinutes(base.duration)} of driving.`;

    await this.tick(true);
    this.timers.push(window.setInterval(() => void this.tick(), TRACK_POLL_MS));

    // Supabase realtime pushes new GPS rows the moment they land, so the
    // marker usually moves well before the next poll.
    try {
      this.channel = this.sb
        .channel(`delivery-${this.jobId}`)
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'delivery_location_events', filter: `job_id=eq.${this.jobId}` },
          () => void this.tick())
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'delivery_jobs', filter: `id=eq.${this.jobId}` },
          () => void this.tick())
        .subscribe();
    } catch (err) {
      // Realtime is optional — polling already covers it.
    }
  }

  stop(keepMap) {
    this.stopped = true;
    this.timers.forEach(window.clearInterval);
    this.timers = [];
    if (this.glide) window.cancelAnimationFrame(this.glide);
    if (this.channel) { try { this.sb.removeChannel(this.channel); } catch (_) {} this.channel = null; }
    if (!keepMap && this.map) { this.map.remove(); this.map = null; }
  }
}

// ---- driver side: share live GPS -----------------------------------------
const sharing = { watchId: null, jobId: null };

function shareLocation({ sb, ecoApi, session, jobId, onUpdate, onError }) {
  if (sharing.watchId !== null) {
    navigator.geolocation.clearWatch(sharing.watchId);
    sharing.watchId = null;
    sharing.jobId = null;
    onUpdate?.(false);
    return false;
  }
  if (!navigator.geolocation) { onError?.('This browser cannot share GPS.'); return false; }

  sharing.jobId = jobId;
  sharing.watchId = navigator.geolocation.watchPosition(async position => {
    const point = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy_m: position.coords.accuracy,
      heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null
    };
    try {
      await ecoApi(`/v1/deliveries/${jobId}/location`, { method: 'POST', body: JSON.stringify(point) });
    } catch (err) {
      // Backend down: write straight to Supabase (RLS still checks the driver).
      await sb.from('delivery_location_events').insert({ job_id: jobId, driver_id: session.user.id, ...point });
      await sb.from('driver_live_locations').upsert({
        driver_id: session.user.id,
        latitude: point.latitude,
        longitude: point.longitude,
        updated_at: new Date().toISOString()
      });
    }
    onUpdate?.(true);
  }, () => onError?.('Location permission was not granted.'),
     { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });

  return true;
}

window.EcoTracking = { DeliveryTracker, shareLocation, sharing, eq, prettyDistance, prettyMinutes };
