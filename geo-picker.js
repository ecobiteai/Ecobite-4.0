/* ============================================================
   EcoBite — cascading Country → State → District picker
   Data comes from CountriesNow (https://countriesnow.space):
   free, no API key, CORS enabled.

   Every level falls back to a plain text box if the service is
   unreachable or the place is not in the dataset, so sign-up is
   never blocked by a failed lookup.
   ============================================================ */

const GEO_BASE = 'https://countriesnow.space/api/v0.1/countries';
const GEO_OTHER = '__other__';
const geoCache = new Map();

const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });

// The dataset keys are case-sensitive but people are not: anything typed by
// hand gets normalised before it is sent or compared, and every cache key is
// lower-cased so "india", "India" and "INDIA" are the same lookup.
const geoKey = value => String(value || '').trim().toLowerCase();
const titleCase = value => String(value || '').trim().replace(/\s+/g, ' ')
  .replace(/[\p{L}][\p{L}'’-]*/gu, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());

async function geoCached(key, run) {
  if (geoCache.has(key)) return geoCache.get(key);
  const value = await run();
  geoCache.set(key, value);
  return value;
}

async function geoPost(path, body) {
  const response = await fetch(GEO_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({ error: true }));
  if (!response.ok || payload.error) throw new Error(payload.msg || 'Location lookup failed.');
  return payload.data;
}

const geoCountries = () => geoCached('countries', async () => {
  const response = await fetch(GEO_BASE + '/positions');
  const payload = await response.json().catch(() => ({ error: true }));
  if (!response.ok || payload.error) throw new Error('Location lookup failed.');
  return payload.data.map(row => row.name).sort(byName);
});

const geoStates = country => geoCached('state:' + geoKey(country), async () => {
  const data = await geoPost('/states', { country });
  return (data.states || []).map(row => row.name).filter(Boolean).sort(byName);
});

const geoDistricts = (country, state) => geoCached(`district:${geoKey(country)}|${geoKey(state)}`, async () => {
  const data = await geoPost('/state/cities', { country, state });
  return (Array.isArray(data) ? data : []).filter(Boolean).sort(byName);
});

/**
 * Wires up the three selects inside `root`.
 * Expected markup per level (see signup.html):
 *   <label class="field geo-field" data-geo="country">
 *     <span>Country</span>
 *     <select> ... </select>
 *     <input class="geo-manual" hidden>
 *     <em class="geo-note"></em>
 *     <em class="error">…</em>
 *   </label>
 */
function setupGeoPicker(root) {
  const LEVELS = ['country', 'state', 'district'];
  const LABELS = { country: 'country', state: 'state', district: 'district' };
  const parts = {};

  LEVELS.forEach(level => {
    const field = root.querySelector(`[data-geo="${level}"]`);
    parts[level] = {
      field,
      select: field.querySelector('select'),
      manual: field.querySelector('.geo-manual'),
      note: field.querySelector('.geo-note')
    };
  });

  const setNote = (level, text, warn) => {
    const note = parts[level].note;
    if (!note) return;
    note.textContent = text || '';
    note.classList.toggle('warn', !!warn);
  };

  const setManual = (level, on) => {
    const { select, manual } = parts[level];
    manual.hidden = !on;
    select.hidden = !!on;
    if (!on) manual.value = '';
  };

  const fill = (level, items, placeholder) => {
    const { select } = parts[level];
    select.innerHTML =
      `<option value="">${placeholder}</option>` +
      items.map(item => `<option value="${item.replace(/"/g, '&quot;')}">${item}</option>`).join('') +
      `<option value="${GEO_OTHER}">Not listed — type it in</option>`;
    select.disabled = false;
    setManual(level, false);
  };

  const clear = (level, placeholder) => {
    const { select } = parts[level];
    select.innerHTML = `<option value="">${placeholder}</option>`;
    select.disabled = true;
    setManual(level, false);
    setNote(level, '');
  };

  const failTo = (level, message) => {
    parts[level].select.innerHTML = '<option value=""></option>';
    parts[level].select.disabled = true;
    setManual(level, true);
    setNote(level, message, true);
  };

  const valueOf = level => {
    const { select, manual } = parts[level];
    if (!manual.hidden) return manual.value.trim();
    return select.value === GEO_OTHER ? '' : select.value.trim();
  };

  // ---- loaders -------------------------------------------------
  let stateToken = 0;
  let districtToken = 0;

  async function loadStates(country, preselect) {
    const token = ++stateToken;
    clear('state', 'Loading states…');
    clear('district', 'Choose a state first');
    if (!country) { clear('state', 'Choose a country first'); return; }
    try {
      const states = await geoStates(country);
      if (token !== stateToken) return;
      if (!states.length) {
        failTo('state', `No states listed for ${country} — type yours in.`);
        setManual('district', false);
        clear('district', 'Type your state first');
        return;
      }
      fill('state', states, 'Select your state');
      if (preselect) selectValue('state', preselect);
      if (parts.state.select.value && parts.state.select.value !== GEO_OTHER) {
        await loadDistricts(country, parts.state.select.value);
      }
    } catch (err) {
      if (token !== stateToken) return;
      failTo('state', 'Could not load states — type yours in.');
      clear('district', 'Type your state first');
    }
  }

  async function loadDistricts(country, state, preselect) {
    const token = ++districtToken;
    clear('district', 'Loading districts…');
    if (!country || !state) { clear('district', 'Choose a state first'); return; }
    try {
      const districts = await geoDistricts(country, state);
      if (token !== districtToken) return;
      if (!districts.length) {
        failTo('district', `No districts listed for ${state} — type yours in.`);
        return;
      }
      fill('district', districts, 'Select your district');
      if (preselect) selectValue('district', preselect);
    } catch (err) {
      if (token !== districtToken) return;
      failTo('district', 'Could not load districts — type yours in.');
    }
  }

  // Selects `value` if present; adds it to the list when the dataset
  // spells it differently (PIN lookups often do).
  function selectValue(level, value) {
    const { select } = parts[level];
    const wanted = String(value || '').trim();
    if (!wanted) return false;
    const loose = text => String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    const options = [...select.options];
    const match = options.find(option => loose(option.value) === loose(wanted))
      // "Kakinada District", "Vishakhapatnam" vs "Visakhapatnam" — accept a
      // containment match before giving up and adding a new option.
      || options.find(option => option.value && option.value !== GEO_OTHER && loose(option.value).length > 3 &&
           (loose(option.value).includes(loose(wanted)) || loose(wanted).includes(loose(option.value))));
    if (match) { select.value = match.value; return true; }
    if (select.disabled || !select.options.length) {
      setManual(level, true);
      parts[level].manual.value = wanted;
      return true;
    }
    const option = document.createElement('option');
    option.value = wanted;
    option.textContent = wanted;
    select.insertBefore(option, select.options[select.options.length - 1]);
    select.value = wanted;
    return true;
  }

  // ---- events --------------------------------------------------
  parts.country.select.addEventListener('change', () => {
    const country = parts.country.select.value;
    if (country === GEO_OTHER) {
      setManual('country', true);
      clear('state', 'Type your country first');
      clear('district', 'Choose a state first');
      parts.country.manual.focus();
      return;
    }
    void loadStates(country);
  });

  parts.country.manual.addEventListener('change', () => {
    parts.country.manual.value = titleCase(parts.country.manual.value);
    void loadStates(parts.country.manual.value);
  });

  parts.state.select.addEventListener('change', () => {
    const state = parts.state.select.value;
    if (state === GEO_OTHER) {
      setManual('state', true);
      clear('district', 'Type your state first');
      parts.state.manual.focus();
      return;
    }
    void loadDistricts(valueOf('country'), state);
  });

  parts.state.manual.addEventListener('change', () => {
    parts.state.manual.value = titleCase(parts.state.manual.value);
    void loadDistricts(valueOf('country'), parts.state.manual.value);
  });

  parts.district.manual.addEventListener('change', () => {
    parts.district.manual.value = titleCase(parts.district.manual.value);
  });

  parts.district.select.addEventListener('change', () => {
    if (parts.district.select.value === GEO_OTHER) {
      setManual('district', true);
      parts.district.manual.focus();
    }
  });

  LEVELS.forEach(level => {
    const clearInvalid = () => parts[level].field.classList.remove('invalid');
    parts[level].select.addEventListener('change', clearInvalid);
    parts[level].manual.addEventListener('input', clearInvalid);
  });

  // ---- boot ----------------------------------------------------
  clear('state', 'Choose a country first');
  clear('district', 'Choose a state first');
  parts.country.select.disabled = true;
  parts.country.select.innerHTML = '<option value="">Loading countries…</option>';

  const ready = geoCountries()
    .then(countries => {
      fill('country', countries, 'Select your country');
      return true;
    })
    .catch(() => {
      failTo('country', 'Could not load the country list — type yours in.');
      clear('state', 'Type your country first');
      return false;
    });

  return {
    ready,
    value: () => ({
      country: valueOf('country'),
      state: valueOf('state'),
      district: valueOf('district')
    }),
    // Returns the first level left blank, or null when all three are set.
    firstMissing: () => {
      for (const level of LEVELS) {
        if (!valueOf(level)) return { level, label: LABELS[level], field: parts[level].field };
      }
      return null;
    },
    flag: level => parts[level].field.classList.add('invalid'),
    focus: level => (parts[level].manual.hidden ? parts[level].select : parts[level].manual).focus({ preventScroll: true }),
    // Used by the PIN-code lookup: fills the chain top-down.
    async setLocation({ country, state, district }) {
      await ready;
      if (country && !selectValue('country', country)) return;
      if (country) await loadStates(valueOf('country'), state);
      if (state) selectValue('state', state);
      if (state) await loadDistricts(valueOf('country'), valueOf('state'), district);
      if (district) selectValue('district', district);
    }
  };
}
