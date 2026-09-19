/* ============================================================
   EcoBite — phone number field
   Country code comes from a dropdown; the box itself accepts
   digits only. Anything pasted in (spaces, dashes, brackets,
   letters) is stripped as it is typed.

   Usage:
     setupPhoneInput(document.querySelector('input[name="phone"]'));

   The visible box keeps the digits. A hidden input carries the
   original field name and holds the full number, e.g. "+91 9876543210",
   so existing FormData / Supabase code keeps working unchanged.
   ============================================================ */

// dial: dialling prefix · len: national number length (max, for validation)
const PHONE_COUNTRIES = [
  { iso: 'IN', name: 'India',            dial: '+91',   flag: '🇮🇳', len: 10 },
  { iso: 'AF', name: 'Afghanistan',      dial: '+93',   flag: '🇦🇫', len: 9 },
  { iso: 'AL', name: 'Albania',          dial: '+355',  flag: '🇦🇱', len: 9 },
  { iso: 'DZ', name: 'Algeria',          dial: '+213',  flag: '🇩🇿', len: 9 },
  { iso: 'AR', name: 'Argentina',        dial: '+54',   flag: '🇦🇷', len: 11 },
  { iso: 'AM', name: 'Armenia',          dial: '+374',  flag: '🇦🇲', len: 8 },
  { iso: 'AU', name: 'Australia',        dial: '+61',   flag: '🇦🇺', len: 9 },
  { iso: 'AT', name: 'Austria',          dial: '+43',   flag: '🇦🇹', len: 13 },
  { iso: 'AZ', name: 'Azerbaijan',       dial: '+994',  flag: '🇦🇿', len: 9 },
  { iso: 'BH', name: 'Bahrain',          dial: '+973',  flag: '🇧🇭', len: 8 },
  { iso: 'BD', name: 'Bangladesh',       dial: '+880',  flag: '🇧🇩', len: 10 },
  { iso: 'BY', name: 'Belarus',          dial: '+375',  flag: '🇧🇾', len: 9 },
  { iso: 'BE', name: 'Belgium',          dial: '+32',   flag: '🇧🇪', len: 9 },
  { iso: 'BT', name: 'Bhutan',           dial: '+975',  flag: '🇧🇹', len: 8 },
  { iso: 'BO', name: 'Bolivia',          dial: '+591',  flag: '🇧🇴', len: 8 },
  { iso: 'BA', name: 'Bosnia & Herz.',   dial: '+387',  flag: '🇧🇦', len: 8 },
  { iso: 'BW', name: 'Botswana',         dial: '+267',  flag: '🇧🇼', len: 8 },
  { iso: 'BR', name: 'Brazil',           dial: '+55',   flag: '🇧🇷', len: 11 },
  { iso: 'BN', name: 'Brunei',           dial: '+673',  flag: '🇧🇳', len: 7 },
  { iso: 'BG', name: 'Bulgaria',         dial: '+359',  flag: '🇧🇬', len: 9 },
  { iso: 'KH', name: 'Cambodia',         dial: '+855',  flag: '🇰🇭', len: 9 },
  { iso: 'CM', name: 'Cameroon',         dial: '+237',  flag: '🇨🇲', len: 9 },
  { iso: 'CA', name: 'Canada',           dial: '+1',    flag: '🇨🇦', len: 10 },
  { iso: 'CL', name: 'Chile',            dial: '+56',   flag: '🇨🇱', len: 9 },
  { iso: 'CN', name: 'China',            dial: '+86',   flag: '🇨🇳', len: 11 },
  { iso: 'CO', name: 'Colombia',         dial: '+57',   flag: '🇨🇴', len: 10 },
  { iso: 'CR', name: 'Costa Rica',       dial: '+506',  flag: '🇨🇷', len: 8 },
  { iso: 'HR', name: 'Croatia',          dial: '+385',  flag: '🇭🇷', len: 9 },
  { iso: 'CY', name: 'Cyprus',           dial: '+357',  flag: '🇨🇾', len: 8 },
  { iso: 'CZ', name: 'Czechia',          dial: '+420',  flag: '🇨🇿', len: 9 },
  { iso: 'DK', name: 'Denmark',          dial: '+45',   flag: '🇩🇰', len: 8 },
  { iso: 'EC', name: 'Ecuador',          dial: '+593',  flag: '🇪🇨', len: 9 },
  { iso: 'EG', name: 'Egypt',            dial: '+20',   flag: '🇪🇬', len: 10 },
  { iso: 'EE', name: 'Estonia',          dial: '+372',  flag: '🇪🇪', len: 8 },
  { iso: 'ET', name: 'Ethiopia',         dial: '+251',  flag: '🇪🇹', len: 9 },
  { iso: 'FI', name: 'Finland',          dial: '+358',  flag: '🇫🇮', len: 10 },
  { iso: 'FR', name: 'France',           dial: '+33',   flag: '🇫🇷', len: 9 },
  { iso: 'GE', name: 'Georgia',          dial: '+995',  flag: '🇬🇪', len: 9 },
  { iso: 'DE', name: 'Germany',          dial: '+49',   flag: '🇩🇪', len: 11 },
  { iso: 'GH', name: 'Ghana',            dial: '+233',  flag: '🇬🇭', len: 9 },
  { iso: 'GR', name: 'Greece',           dial: '+30',   flag: '🇬🇷', len: 10 },
  { iso: 'GT', name: 'Guatemala',        dial: '+502',  flag: '🇬🇹', len: 8 },
  { iso: 'HK', name: 'Hong Kong',        dial: '+852',  flag: '🇭🇰', len: 8 },
  { iso: 'HU', name: 'Hungary',          dial: '+36',   flag: '🇭🇺', len: 9 },
  { iso: 'IS', name: 'Iceland',          dial: '+354',  flag: '🇮🇸', len: 7 },
  { iso: 'ID', name: 'Indonesia',        dial: '+62',   flag: '🇮🇩', len: 12 },
  { iso: 'IR', name: 'Iran',             dial: '+98',   flag: '🇮🇷', len: 10 },
  { iso: 'IQ', name: 'Iraq',             dial: '+964',  flag: '🇮🇶', len: 10 },
  { iso: 'IE', name: 'Ireland',          dial: '+353',  flag: '🇮🇪', len: 9 },
  { iso: 'IL', name: 'Israel',           dial: '+972',  flag: '🇮🇱', len: 9 },
  { iso: 'IT', name: 'Italy',            dial: '+39',   flag: '🇮🇹', len: 10 },
  { iso: 'JM', name: 'Jamaica',          dial: '+1876', flag: '🇯🇲', len: 7 },
  { iso: 'JP', name: 'Japan',            dial: '+81',   flag: '🇯🇵', len: 10 },
  { iso: 'JO', name: 'Jordan',           dial: '+962',  flag: '🇯🇴', len: 9 },
  { iso: 'KZ', name: 'Kazakhstan',       dial: '+7',    flag: '🇰🇿', len: 10 },
  { iso: 'KE', name: 'Kenya',            dial: '+254',  flag: '🇰🇪', len: 9 },
  { iso: 'KW', name: 'Kuwait',           dial: '+965',  flag: '🇰🇼', len: 8 },
  { iso: 'KG', name: 'Kyrgyzstan',       dial: '+996',  flag: '🇰🇬', len: 9 },
  { iso: 'LA', name: 'Laos',             dial: '+856',  flag: '🇱🇦', len: 9 },
  { iso: 'LV', name: 'Latvia',           dial: '+371',  flag: '🇱🇻', len: 8 },
  { iso: 'LB', name: 'Lebanon',          dial: '+961',  flag: '🇱🇧', len: 8 },
  { iso: 'LT', name: 'Lithuania',        dial: '+370',  flag: '🇱🇹', len: 8 },
  { iso: 'LU', name: 'Luxembourg',       dial: '+352',  flag: '🇱🇺', len: 9 },
  { iso: 'MY', name: 'Malaysia',         dial: '+60',   flag: '🇲🇾', len: 10 },
  { iso: 'MV', name: 'Maldives',         dial: '+960',  flag: '🇲🇻', len: 7 },
  { iso: 'MT', name: 'Malta',            dial: '+356',  flag: '🇲🇹', len: 8 },
  { iso: 'MU', name: 'Mauritius',        dial: '+230',  flag: '🇲🇺', len: 8 },
  { iso: 'MX', name: 'Mexico',           dial: '+52',   flag: '🇲🇽', len: 10 },
  { iso: 'MD', name: 'Moldova',          dial: '+373',  flag: '🇲🇩', len: 8 },
  { iso: 'MN', name: 'Mongolia',         dial: '+976',  flag: '🇲🇳', len: 8 },
  { iso: 'ME', name: 'Montenegro',       dial: '+382',  flag: '🇲🇪', len: 8 },
  { iso: 'MA', name: 'Morocco',          dial: '+212',  flag: '🇲🇦', len: 9 },
  { iso: 'MM', name: 'Myanmar',          dial: '+95',   flag: '🇲🇲', len: 10 },
  { iso: 'NP', name: 'Nepal',            dial: '+977',  flag: '🇳🇵', len: 10 },
  { iso: 'NL', name: 'Netherlands',      dial: '+31',   flag: '🇳🇱', len: 9 },
  { iso: 'NZ', name: 'New Zealand',      dial: '+64',   flag: '🇳🇿', len: 10 },
  { iso: 'NG', name: 'Nigeria',          dial: '+234',  flag: '🇳🇬', len: 10 },
  { iso: 'NO', name: 'Norway',           dial: '+47',   flag: '🇳🇴', len: 8 },
  { iso: 'OM', name: 'Oman',             dial: '+968',  flag: '🇴🇲', len: 8 },
  { iso: 'PK', name: 'Pakistan',         dial: '+92',   flag: '🇵🇰', len: 10 },
  { iso: 'PS', name: 'Palestine',        dial: '+970',  flag: '🇵🇸', len: 9 },
  { iso: 'PA', name: 'Panama',           dial: '+507',  flag: '🇵🇦', len: 8 },
  { iso: 'PY', name: 'Paraguay',         dial: '+595',  flag: '🇵🇾', len: 9 },
  { iso: 'PE', name: 'Peru',             dial: '+51',   flag: '🇵🇪', len: 9 },
  { iso: 'PH', name: 'Philippines',      dial: '+63',   flag: '🇵🇭', len: 10 },
  { iso: 'PL', name: 'Poland',           dial: '+48',   flag: '🇵🇱', len: 9 },
  { iso: 'PT', name: 'Portugal',         dial: '+351',  flag: '🇵🇹', len: 9 },
  { iso: 'QA', name: 'Qatar',            dial: '+974',  flag: '🇶🇦', len: 8 },
  { iso: 'RO', name: 'Romania',          dial: '+40',   flag: '🇷🇴', len: 9 },
  { iso: 'RU', name: 'Russia',           dial: '+7',    flag: '🇷🇺', len: 10 },
  { iso: 'RW', name: 'Rwanda',           dial: '+250',  flag: '🇷🇼', len: 9 },
  { iso: 'SA', name: 'Saudi Arabia',     dial: '+966',  flag: '🇸🇦', len: 9 },
  { iso: 'SN', name: 'Senegal',          dial: '+221',  flag: '🇸🇳', len: 9 },
  { iso: 'RS', name: 'Serbia',           dial: '+381',  flag: '🇷🇸', len: 9 },
  { iso: 'SG', name: 'Singapore',        dial: '+65',   flag: '🇸🇬', len: 8 },
  { iso: 'SK', name: 'Slovakia',         dial: '+421',  flag: '🇸🇰', len: 9 },
  { iso: 'SI', name: 'Slovenia',         dial: '+386',  flag: '🇸🇮', len: 8 },
  { iso: 'ZA', name: 'South Africa',     dial: '+27',   flag: '🇿🇦', len: 9 },
  { iso: 'KR', name: 'South Korea',      dial: '+82',   flag: '🇰🇷', len: 10 },
  { iso: 'ES', name: 'Spain',            dial: '+34',   flag: '🇪🇸', len: 9 },
  { iso: 'LK', name: 'Sri Lanka',        dial: '+94',   flag: '🇱🇰', len: 9 },
  { iso: 'SE', name: 'Sweden',           dial: '+46',   flag: '🇸🇪', len: 9 },
  { iso: 'CH', name: 'Switzerland',      dial: '+41',   flag: '🇨🇭', len: 9 },
  { iso: 'TW', name: 'Taiwan',           dial: '+886',  flag: '🇹🇼', len: 9 },
  { iso: 'TZ', name: 'Tanzania',         dial: '+255',  flag: '🇹🇿', len: 9 },
  { iso: 'TH', name: 'Thailand',         dial: '+66',   flag: '🇹🇭', len: 9 },
  { iso: 'TN', name: 'Tunisia',          dial: '+216',  flag: '🇹🇳', len: 8 },
  { iso: 'TR', name: 'Türkiye',          dial: '+90',   flag: '🇹🇷', len: 10 },
  { iso: 'UG', name: 'Uganda',           dial: '+256',  flag: '🇺🇬', len: 9 },
  { iso: 'UA', name: 'Ukraine',          dial: '+380',  flag: '🇺🇦', len: 9 },
  { iso: 'AE', name: 'United Arab Em.',  dial: '+971',  flag: '🇦🇪', len: 9 },
  { iso: 'GB', name: 'United Kingdom',   dial: '+44',   flag: '🇬🇧', len: 10 },
  { iso: 'US', name: 'United States',    dial: '+1',    flag: '🇺🇸', len: 10 },
  { iso: 'UY', name: 'Uruguay',          dial: '+598',  flag: '🇺🇾', len: 8 },
  { iso: 'UZ', name: 'Uzbekistan',       dial: '+998',  flag: '🇺🇿', len: 9 },
  { iso: 'VE', name: 'Venezuela',        dial: '+58',   flag: '🇻🇪', len: 10 },
  { iso: 'VN', name: 'Vietnam',          dial: '+84',   flag: '🇻🇳', len: 9 },
  { iso: 'YE', name: 'Yemen',            dial: '+967',  flag: '🇾🇪', len: 9 },
  { iso: 'ZM', name: 'Zambia',           dial: '+260',  flag: '🇿🇲', len: 9 },
  { iso: 'ZW', name: 'Zimbabwe',         dial: '+263',  flag: '🇿🇼', len: 9 }
];

const PHONE_DEFAULT_DIAL = '+91';

// Longest dial prefix wins, so "+1876" beats "+1".
function splitPhoneValue(raw) {
  const text = String(raw || '').trim();
  if (!text) return { dial: PHONE_DEFAULT_DIAL, digits: '' };
  const compact = text.replace(/[^\d+]/g, '');
  if (compact.startsWith('+')) {
    const match = [...PHONE_COUNTRIES]
      .sort((a, b) => b.dial.length - a.dial.length)
      .find(country => compact.startsWith(country.dial));
    if (match) return { dial: match.dial, digits: compact.slice(match.dial.length) };
  }
  return { dial: PHONE_DEFAULT_DIAL, digits: compact.replace(/\D/g, '') };
}

/**
 * Turns a plain <input name="phone"> into a country-code + digits field.
 * Returns { dial(), digits(), value(), isValid(), focus() } or null.
 */
function setupPhoneInput(input, options = {}) {
  if (!input || input.dataset.phoneReady === '1') return input?.ecoPhone || null;
  input.dataset.phoneReady = '1';

  const fieldName = input.getAttribute('name') || 'phone';
  const required = input.hasAttribute('required');
  const start = splitPhoneValue(options.value ?? input.value);

  const wrap = document.createElement('div');
  wrap.className = 'phone-field';
  input.parentNode.insertBefore(wrap, input);

  const select = document.createElement('select');
  select.className = 'phone-code';
  select.setAttribute('aria-label', 'Country code');
  select.innerHTML = PHONE_COUNTRIES
    .map(country => `<option value="${country.dial}" data-len="${country.len}">${country.flag} ${country.dial} · ${country.name}</option>`)
    .join('');
  // Several countries share +1 / +7 — keep the first entry that matches.
  select.value = start.dial;
  if (!select.value) select.value = PHONE_DEFAULT_DIAL;

  // The visible box holds digits only; the hidden one keeps the field name so
  // FormData still returns the complete "+91 9876543210" string.
  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.name = fieldName;

  input.removeAttribute('name');
  input.removeAttribute('required');
  input.type = 'tel';
  input.inputMode = 'numeric';
  input.autocomplete = 'tel-national';
  input.classList.add('phone-number');
  input.setAttribute('aria-label', 'Phone number, digits only');

  wrap.appendChild(select);
  wrap.appendChild(input);
  wrap.appendChild(hidden);

  const hint = document.createElement('small');
  hint.className = 'help phone-hint';
  wrap.insertAdjacentElement('afterend', hint);

  const maxLen = () => Number(select.selectedOptions[0]?.dataset.len || 15);

  const sync = () => {
    // Everything that is not 0-9 is dropped, including anything pasted in.
    input.value = input.value.replace(/\D/g, '').slice(0, maxLen());
    input.maxLength = maxLen();
    input.placeholder = `${maxLen()} digits`;
    hidden.value = input.value ? `${select.value} ${input.value}` : '';
    hint.textContent = input.value.length
      ? `Saved as ${select.value} ${input.value}`
      : `Digits only — ${maxLen()} expected after ${select.value}.`;
    hint.classList.remove('warn');
    input.closest('.field')?.classList.remove('invalid');
  };

  // A half-typed number is only called out once the person leaves the box.
  const checkOnBlur = () => {
    const short = input.value.length > 0 && input.value.length < Math.min(maxLen(), 7);
    hint.classList.toggle('warn', short);
    input.closest('.field')?.classList.toggle('invalid', short);
    if (short) hint.textContent = `That looks short — ${maxLen()} digits expected after ${select.value}.`;
  };

  input.value = start.digits;
  input.addEventListener('input', sync);
  input.addEventListener('paste', () => window.setTimeout(sync, 0));
  input.addEventListener('keydown', event => {
    const allowed = ['Backspace', 'Delete', 'Tab', 'Enter', 'Home', 'End', 'ArrowLeft', 'ArrowRight'];
    if (event.ctrlKey || event.metaKey || allowed.includes(event.key)) return;
    if (!/^\d$/.test(event.key)) event.preventDefault();   // block letters and symbols outright
  });
  input.addEventListener('blur', checkOnBlur);
  select.addEventListener('change', sync);
  sync();

  const api = {
    dial: () => select.value,
    digits: () => input.value,
    value: () => hidden.value,
    isValid: () => (required ? input.value.length >= 6 : !input.value.length || input.value.length >= 6),
    focus: () => input.focus({ preventScroll: true })
  };
  input.ecoPhone = api;
  return api;
}

// Upgrades every phone box inside `root` that has not been done yet.
function setupPhoneFields(root = document) {
  root.querySelectorAll('input[type="tel"]:not([data-phone-ready]), input[data-phone]:not([data-phone-ready])')
    .forEach(input => setupPhoneInput(input));
}

window.EcoPhone = { PHONE_COUNTRIES, setupPhoneInput, setupPhoneFields, splitPhoneValue };
