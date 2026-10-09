import './profile.css';

const PROFILE_STORAGE_KEY = 'pathguard-accessibility-profile';
const CAREGIVER_STORAGE_KEY = 'pathguard-caregiver-settings';

const defaultProfile = {
  mobility: 'manual_wheelchair',
  avoidStairs: true,
  maxSlope: 8,
  minWidth: 90,
  hearing: 'deaf',
  vision: 'low_vision',
  simplified: true,
  textScale: 125,
  language: 'en',
  facilities: ['accessible_toilet', 'power'],
  alertChannels: ['visual', 'vibration', 'speech'],
  consents: { profile: true, location: false, caregiver: true },
  escalation: { reAlert: 3, caregiver: 5, operator: 8, secondary: false },
};

const defaultCaregiver = {
  name: 'Grace Chen',
  email: 'grace.chen@example.com',
  relationship: 'Primary caregiver',
  verified: true,
  status: 'Connected',
  permissions: ['status'],
  paused: true,
  lastCheckIn: '8 minutes ago',
};

function loadState(key, fallback) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    return saved ? { ...fallback, ...saved } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

function saveState(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Preferences remain usable for this session when storage is unavailable.
  }
}

function escapeHTML(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getProfile() {
  const saved = loadState(PROFILE_STORAGE_KEY, defaultProfile);
  return {
    ...defaultProfile,
    ...saved,
    consents: { ...defaultProfile.consents, ...(saved.consents ?? {}) },
    escalation: { ...defaultProfile.escalation, ...(saved.escalation ?? {}) },
    facilities: saved.facilities ?? defaultProfile.facilities,
    alertChannels: saved.alertChannels ?? defaultProfile.alertChannels,
  };
}

function getCaregiver() {
  const saved = loadState(CAREGIVER_STORAGE_KEY, defaultCaregiver);
  return { ...defaultCaregiver, ...saved, permissions: saved.permissions ?? defaultCaregiver.permissions };
}

function completeness(profile, caregiver) {
  const checks = [
    ['Mobility needs', Boolean(profile.mobility)],
    ['Sensory needs', Boolean(profile.hearing && profile.vision)],
    ['Alert channels', profile.alertChannels.length > 0],
    ['Language and text size', Boolean(profile.language && profile.textScale)],
    ['Privacy choices', Boolean(profile.consents.profile)],
    ['Caregiver verification', caregiver.verified],
  ];
  const complete = checks.filter(([, value]) => value).length;
  return { checks, complete, total: checks.length, percent: Math.round((complete / checks.length) * 100) };
}

function checked(list, value) {
  return list.includes(value) ? ' checked' : '';
}

function selected(current, value) {
  return current === value ? ' selected' : '';
}

function checkedValue(current, value) {
  return current === value ? ' checked' : '';
}

function renderProfile(target, announce) {
  const profile = getProfile();
  const caregiver = getCaregiver();
  const progress = completeness(profile, caregiver);
  const missing = progress.checks.filter(([, value]) => !value).map(([label]) => label);

  target.innerHTML = `
    <div class="profile-page">
      <section class="profile-heading" aria-labelledby="profile-title">
        <div>
          <span class="eyebrow">Your setup · quick start</span>
          <h1 id="profile-title">Personalise how PathGuard alerts you</h1>
          <p class="page-intro">Choose the ways you receive and understand official updates. You can change these choices at any time.</p>
        </div>
        <span class="profile-safety-badge"><span aria-hidden="true">✓</span> Saved on this device</span>
      </section>

      <aside class="profile-boundary" aria-label="Important product limitation">
        <span class="profile-boundary-icon" aria-hidden="true">i</span>
        <p><strong>What these preferences do:</strong> they personalise alert presentation and escalation. They do not promise accessible routing, shelter matching, shelter availability, or emergency-service dispatch.</p>
      </aside>

      <section class="profile-completeness profile-card" aria-labelledby="completeness-title">
        <div class="profile-card-heading">
          <div><span class="eyebrow">Quick-start checklist</span><h2 id="completeness-title">Profile completeness</h2></div>
          <strong class="completion-number">${progress.percent}%</strong>
        </div>
        <div class="profile-progress" role="progressbar" aria-label="Profile completeness" aria-valuenow="${progress.percent}" aria-valuemin="0" aria-valuemax="100"><span style="width: ${progress.percent}%"></span></div>
        <p class="profile-help">Complete the choices that matter to you. Optional details can be left blank.</p>
        <ul class="completion-list">
          ${progress.checks.map(([label, done]) => `<li class="${done ? 'is-complete' : 'is-missing'}"><span aria-hidden="true">${done ? '✓' : '!'}</span><span>${escapeHTML(label)}</span><strong>${done ? 'Complete' : 'Needs review'}</strong></li>`).join('')}
        </ul>
        ${missing.length ? `<p class="profile-attention" role="status"><strong>Next step:</strong> review ${escapeHTML(missing[0].toLowerCase())} below.</p>` : '<p class="profile-success" role="status"><strong>Your quick start is complete.</strong> Review your choices whenever your needs change.</p>'}
      </section>

      <form id="accessibility-profile-form" class="profile-form" novalidate>
        <section class="profile-card" aria-labelledby="mobility-title">
          <div class="profile-card-heading"><div><span class="eyebrow">1 of 5 · movement</span><h2 id="mobility-title">Mobility needs</h2><p class="profile-help">This helps PathGuard present relevant information. It does not create an accessible route.</p></div></div>
          <fieldset class="profile-fieldset">
            <legend>Which best describes your mobility today?</legend>
            <div class="profile-choice-grid">
              <label class="profile-choice"><input type="radio" name="mobility" value="none"${checkedValue(profile.mobility, 'none')}><span><strong>No mobility support</strong><small>I do not need mobility information.</small></span></label>
              <label class="profile-choice"><input type="radio" name="mobility" value="manual_wheelchair"${checkedValue(profile.mobility, 'manual_wheelchair')}><span><strong>Manual wheelchair</strong><small>I use a manual wheelchair.</small></span></label>
              <label class="profile-choice"><input type="radio" name="mobility" value="power_wheelchair"${checkedValue(profile.mobility, 'power_wheelchair')}><span><strong>Power wheelchair</strong><small>I use a powered wheelchair.</small></span></label>
              <label class="profile-choice"><input type="radio" name="mobility" value="walker_cane"${checkedValue(profile.mobility, 'walker_cane')}><span><strong>Walker or cane</strong><small>I use a walking aid.</small></span></label>
            </div>
            <label class="profile-check"><input type="checkbox" name="avoidStairs"${profile.avoidStairs ? ' checked' : ''}><span><strong>I cannot use stairs</strong><small>Keep this as a preference, not a promise of a stair-free route.</small></span></label>
            <div class="profile-two-column">
              <label class="profile-label" for="max-slope">Maximum slope I prefer <span>(percent)</span><input id="max-slope" class="profile-input" type="number" name="maxSlope" min="0" max="30" step="1" value="${profile.maxSlope}" aria-describedby="mobility-help"></label>
              <label class="profile-label" for="min-width">Minimum path width I prefer <span>(cm)</span><input id="min-width" class="profile-input" type="number" name="minWidth" min="40" max="200" step="5" value="${profile.minWidth}" aria-describedby="mobility-help"></label>
            </div>
            <p id="mobility-help" class="profile-help">These are personal preferences. PathGuard may not have the data needed to check them.</p>
          </fieldset>
        </section>

        <section class="profile-card" aria-labelledby="sensory-title">
          <div class="profile-card-heading"><div><span class="eyebrow">2 of 5 · perception</span><h2 id="sensory-title">Sensory needs</h2><p class="profile-help">Your alert will not rely on one channel alone.</p></div></div>
          <div class="profile-two-column">
            <fieldset class="profile-fieldset"><legend>Hearing</legend><label class="profile-label" for="hearing">Choose one<select id="hearing" class="profile-input" name="hearing"><option value="none"${selected(profile.hearing, 'none')}>No hearing preference</option><option value="hard_of_hearing"${selected(profile.hearing, 'hard_of_hearing')}>Hard of hearing</option><option value="deaf"${selected(profile.hearing, 'deaf')}>Deaf</option></select></label></fieldset>
            <fieldset class="profile-fieldset"><legend>Vision</legend><label class="profile-label" for="vision">Choose one<select id="vision" class="profile-input" name="vision"><option value="none"${selected(profile.vision, 'none')}>No vision preference</option><option value="low_vision"${selected(profile.vision, 'low_vision')}>Low vision</option><option value="blind"${selected(profile.vision, 'blind')}>Blind</option></select></label></fieldset>
          </div>
        </section>

        <section class="profile-card" aria-labelledby="understanding-title">
          <div class="profile-card-heading"><div><span class="eyebrow">3 of 5 · understanding</span><h2 id="understanding-title">Language and reading preferences</h2><p class="profile-help">These settings shorten and enlarge text where supported.</p></div></div>
          <div class="profile-two-column">
            <label class="profile-label" for="language">Preferred language<select id="language" class="profile-input" name="language"><option value="en"${selected(profile.language, 'en')}>English</option><option value="zh-Hant"${selected(profile.language, 'zh-Hant')}>繁體中文 (Traditional Chinese)</option></select></label>
            <label class="profile-label" for="text-scale">Text size <output id="text-scale-value" class="profile-output" for="text-scale">${profile.textScale}%</output><input id="text-scale" class="profile-range" type="range" name="textScale" min="100" max="200" step="25" value="${profile.textScale}" aria-describedby="text-size-help"></label>
          </div>
          <label class="profile-check"><input type="checkbox" name="simplified"${profile.simplified ? ' checked' : ''}><span><strong>Use simplified instructions</strong><small>Prefer short sentences with one action at a time.</small></span></label>
          <p id="text-size-help" class="profile-help">Large text may reflow the page. PathGuard will still show the original official wording when it is available.</p>
        </section>

        <section class="profile-card" aria-labelledby="channels-title">
          <div class="profile-card-heading"><div><span class="eyebrow">4 of 5 · delivery</span><h2 id="channels-title">Preferred alert channels</h2><p class="profile-help">Keep at least one visual or text option selected. Browser and device support varies.</p></div></div>
          <fieldset class="profile-fieldset"><legend>Send alerts through</legend><div class="profile-choice-grid profile-channel-grid">
            <label class="profile-choice"><input type="checkbox" name="alertChannel" value="visual"${checked(profile.alertChannels, 'visual')}><span><strong>Visual banner</strong><small>High-contrast text and icon.</small></span></label>
            <label class="profile-choice"><input type="checkbox" name="alertChannel" value="vibration"${checked(profile.alertChannels, 'vibration')}><span><strong>Vibration</strong><small>Only where your browser supports it.</small></span></label>
            <label class="profile-choice"><input type="checkbox" name="alertChannel" value="sound"${checked(profile.alertChannels, 'sound')}><span><strong>Sound</strong><small>Optional tone for supported devices.</small></span></label>
            <label class="profile-choice"><input type="checkbox" name="alertChannel" value="speech"${checked(profile.alertChannels, 'speech')}><span><strong>Read aloud</strong><small>Speech starts when requested or supported.</small></span></label>
          </div></fieldset>
          <button class="button button-secondary profile-test-button" type="button" data-profile-action="test-alert">Test my selected alert channels</button>
          <p id="profile-feedback" class="profile-feedback" role="status" aria-live="polite"></p>
        </section>

        <section class="profile-card" aria-labelledby="facilities-title">
          <div class="profile-card-heading"><div><span class="eyebrow">Optional · comfort and equipment</span><h2 id="facilities-title">Things that may matter to me</h2><p class="profile-help">These choices are saved as preferences. Current PathGuard data may not include facilities or shelter matching.</p></div></div>
          <fieldset class="profile-fieldset"><legend>Choose any that apply</legend><div class="profile-choice-grid">
            <label class="profile-choice"><input type="checkbox" name="facility" value="accessible_toilet"${checked(profile.facilities, 'accessible_toilet')}><span><strong>Accessible toilet</strong></span></label>
            <label class="profile-choice"><input type="checkbox" name="facility" value="power"${checked(profile.facilities, 'power')}><span><strong>Power for a medical device</strong></span></label>
            <label class="profile-choice"><input type="checkbox" name="facility" value="quiet_space"${checked(profile.facilities, 'quiet_space')}><span><strong>Quiet space</strong></span></label>
            <label class="profile-choice"><input type="checkbox" name="facility" value="medication_refrigeration"${checked(profile.facilities, 'medication_refrigeration')}><span><strong>Medication refrigeration</strong></span></label>
            <label class="profile-choice"><input type="checkbox" name="facility" value="assistance_animal"${checked(profile.facilities, 'assistance_animal')}><span><strong>Assistance animal space</strong></span></label>
          </div></fieldset>
        </section>

        <section class="profile-card" aria-labelledby="privacy-title">
          <div class="profile-card-heading"><div><span class="eyebrow">5 of 5 · privacy</span><h2 id="privacy-title">Consent and privacy choices</h2><p class="profile-help">Your accessibility information is sensitive. Choose what PathGuard may store and share.</p></div></div>
          <div class="privacy-notice"><strong>Data minimisation</strong><p>These demo preferences stay in this browser. A production service must explain retention, access, deletion, and the legal basis before storing sensitive information.</p></div>
          <fieldset class="profile-fieldset"><legend>Permission choices</legend>
            <label class="profile-check"><input type="checkbox" name="consentProfile"${profile.consents.profile ? ' checked' : ''}><span><strong>Save my accessibility profile</strong><small>Required to personalise alerts after I leave this page.</small></span></label>
            <label class="profile-check"><input type="checkbox" name="consentLocation"${profile.consents.location ? ' checked' : ''}><span><strong>Share my location during an active incident</strong><small>Off by default. Sharing stops when I pause it or the incident ends.</small></span></label>
            <label class="profile-check"><input type="checkbox" name="consentCaregiver"${profile.consents.caregiver ? ' checked' : ''}><span><strong>Allow my verified caregiver to receive agreed updates</strong><small>Permissions are selected separately below and can be paused immediately.</small></span></label>
          </fieldset>
        </section>

        <section class="profile-card" aria-labelledby="escalation-title">
          <div class="profile-card-heading"><div><span class="eyebrow">Emergency response</span><h2 id="escalation-title">If I do not respond</h2><p class="profile-help">This ladder only uses the contacts and channels you have verified. It does not contact emergency services.</p></div></div>
          <div class="profile-escalation-grid">
            <label class="profile-label" for="re-alert-delay">Remind me after<select id="re-alert-delay" class="profile-input" name="reAlert"><option value="1"${selected(String(profile.escalation.reAlert), '1')}>1 minute</option><option value="3"${selected(String(profile.escalation.reAlert), '3')}>3 minutes</option><option value="5"${selected(String(profile.escalation.reAlert), '5')}>5 minutes</option></select></label>
            <label class="profile-label" for="caregiver-delay">Notify caregiver after<select id="caregiver-delay" class="profile-input" name="caregiverDelay"><option value="3"${selected(String(profile.escalation.caregiver), '3')}>3 minutes</option><option value="5"${selected(String(profile.escalation.caregiver), '5')}>5 minutes</option><option value="10"${selected(String(profile.escalation.caregiver), '10')}>10 minutes</option></select></label>
            <label class="profile-label" for="operator-delay">Flag for operator after<select id="operator-delay" class="profile-input" name="operator"><option value="5"${selected(String(profile.escalation.operator), '5')}>5 minutes</option><option value="8"${selected(String(profile.escalation.operator), '8')}>8 minutes</option><option value="15"${selected(String(profile.escalation.operator), '15')}>15 minutes</option></select></label>
          </div>
          <label class="profile-check"><input type="checkbox" name="secondary"${profile.escalation.secondary ? ' checked' : ''}><span><strong>Notify my secondary caregiver next</strong><small>Only after the primary caregiver has been verified and the delay has passed.</small></span></label>
          <p class="profile-help">You can always use “I need help” in an alert for an immediate request to your configured support network.</p>
        </section>

        <div class="profile-form-actions"><button class="button button-primary" type="submit">Save profile preferences</button><button class="button button-quiet" type="button" data-profile-action="reset">Restore demo choices</button></div>
      </form>
    </div>
  `;

  const form = target.querySelector('#accessibility-profile-form');
  const range = target.querySelector('#text-scale');
  const output = target.querySelector('#text-scale-value');
  range.addEventListener('input', () => { output.value = `${range.value}%`; output.textContent = `${range.value}%`; });
  target.querySelector('[data-profile-action="test-alert"]').addEventListener('click', () => {
    const feedback = target.querySelector('#profile-feedback');
    feedback.textContent = 'Test ready: visual banner and selected channels would be used. Vibration and speech depend on device support.';
    announce('Alert channel test ready. Check the visual message and your selected device channels.');
  });
  target.querySelector('[data-profile-action="reset"]').addEventListener('click', () => {
    saveState(PROFILE_STORAGE_KEY, defaultProfile);
    renderProfile(target, announce);
    announce('Demo profile choices restored.');
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const alertChannels = formData.getAll('alertChannel');
    const feedback = target.querySelector('#profile-feedback');
    if (!alertChannels.length) {
      feedback.textContent = 'Select at least one alert channel before saving.';
      target.querySelector('[name="alertChannel"]').focus();
      return;
    }
    const nextProfile = {
      mobility: formData.get('mobility'),
      avoidStairs: formData.has('avoidStairs'),
      maxSlope: Number(formData.get('maxSlope')),
      minWidth: Number(formData.get('minWidth')),
      hearing: formData.get('hearing'),
      vision: formData.get('vision'),
      simplified: formData.has('simplified'),
      textScale: Number(formData.get('textScale')),
      language: formData.get('language'),
      facilities: formData.getAll('facility'),
      alertChannels,
      consents: { profile: formData.has('consentProfile'), location: formData.has('consentLocation'), caregiver: formData.has('consentCaregiver') },
      escalation: { reAlert: Number(formData.get('reAlert')), caregiver: Number(formData.get('caregiverDelay')), operator: Number(formData.get('operator')), secondary: formData.has('secondary') },
    };
    saveState(PROFILE_STORAGE_KEY, nextProfile);
    renderProfile(target, announce);
    announce('Your profile preferences were saved.');
  });
}

function renderCaregiver(target, announce) {
  const caregiver = getCaregiver();
  const profile = getProfile();
  target.innerHTML = `
    <div class="profile-page caregiver-page">
      <section class="profile-heading" aria-labelledby="caregiver-page-title">
        <div><span class="eyebrow">Support network · consent first</span><h1 id="caregiver-page-title">Caregiver connection</h1><p class="page-intro">Connect a trusted person, verify their contact, and choose exactly what they can see.</p></div>
        <span class="profile-safety-badge"><span aria-hidden="true">✓</span> You control sharing</span>
      </section>
      <aside class="profile-boundary" aria-label="Caregiver privacy notice"><span class="profile-boundary-icon" aria-hidden="true">i</span><p><strong>Privacy cue:</strong> a caregiver cannot receive escalation notices until their contact is verified. Location sharing is currently paused and can be resumed here.</p></aside>

      <section class="profile-card" aria-labelledby="connection-title">
        <div class="profile-card-heading"><div><span class="eyebrow">Primary connection</span><h2 id="connection-title">${escapeHTML(caregiver.name)}</h2><p class="profile-help">${escapeHTML(caregiver.relationship)} · ${escapeHTML(caregiver.email)}</p></div><span class="connection-status ${caregiver.verified ? 'verified' : 'pending'}"><span aria-hidden="true">${caregiver.verified ? '✓' : '!'}</span>${caregiver.verified ? 'Verified' : 'Verification pending'}</span></div>
        <div class="caregiver-connection-grid">
          <div class="caregiver-person"><span class="caregiver-large-avatar" aria-hidden="true">GC</span><div><strong>${escapeHTML(caregiver.status)}</strong><span>Last check-in ${escapeHTML(caregiver.lastCheckIn)}</span><span>Verification is required before notification.</span></div></div>
          <div class="permission-summary"><strong>Allowed updates</strong><ul>${caregiver.permissions.includes('status') ? '<li>Status and acknowledgement</li>' : ''}${caregiver.permissions.includes('location') ? '<li>Coarse location while active</li>' : ''}${caregiver.permissions.includes('route') ? '<li>Route progress</li>' : ''}${!caregiver.permissions.length ? '<li>No updates selected</li>' : ''}</ul></div>
        </div>
        <div class="caregiver-actions"><button class="button button-secondary" type="button" data-caregiver-action="verify">${caregiver.verified ? 'Send a new verification check' : 'Resend verification request'}</button><button class="button button-quiet" type="button" data-caregiver-action="remove">Remove connection</button></div>
        <p id="caregiver-feedback" class="profile-feedback" role="status" aria-live="polite"></p>
      </section>

      <section class="profile-card" aria-labelledby="permissions-title">
        <div class="profile-card-heading"><div><span class="eyebrow">Consent scope</span><h2 id="permissions-title">What ${escapeHTML(caregiver.name)} can see</h2><p class="profile-help">Status is the least-sharing option. Choose additional access only if it helps you.</p></div></div>
        <fieldset class="profile-fieldset"><legend>Share these updates with my verified caregiver</legend>
          <label class="profile-check"><input type="checkbox" name="permission" value="status"${checked(caregiver.permissions, 'status')}><span><strong>Status and acknowledgement</strong><small>Whether you have acknowledged an alert or asked for help.</small></span></label>
          <label class="profile-check"><input type="checkbox" name="permission" value="location"${checked(caregiver.permissions, 'location')}><span><strong>Coarse location during an active incident</strong><small>Approximate area only. Never shared while paused.</small></span></label>
          <label class="profile-check"><input type="checkbox" name="permission" value="route"${checked(caregiver.permissions, 'route')}><span><strong>Route progress</strong><small>Progress on an active plan, if one exists. PathGuard does not promise an accessible route.</small></span></label>
        </fieldset>
        <div class="pause-sharing ${caregiver.paused ? 'paused' : ''}"><div><strong>${caregiver.paused ? 'Sharing is paused' : 'Sharing is active for selected updates'}</strong><p>${caregiver.paused ? 'Your caregiver sees that sharing is paused. No location updates are sent.' : 'Pause sharing immediately if you no longer want updates sent.'}</p></div><button class="button ${caregiver.paused ? 'button-primary' : 'button-secondary'}" type="button" data-caregiver-action="pause">${caregiver.paused ? 'Resume selected sharing' : 'Pause sharing now'}</button></div>
        <button class="button button-primary" type="button" data-caregiver-action="save-permissions">Save sharing choices</button>
      </section>

      <section class="profile-card" aria-labelledby="invite-title">
        <div class="profile-card-heading"><div><span class="eyebrow">Add support</span><h2 id="invite-title">Connect another caregiver</h2><p class="profile-help">They will receive a verification request. No alert is sent before they accept and you grant permission.</p></div></div>
        <form id="caregiver-invite-form" class="caregiver-invite-form">
          <label class="profile-label" for="caregiver-name">Name<input id="caregiver-name" class="profile-input" name="name" required autocomplete="name"></label>
          <label class="profile-label" for="caregiver-email">Email<input id="caregiver-email" class="profile-input" name="email" type="email" required autocomplete="email"></label>
          <label class="profile-label" for="caregiver-relationship">Relationship<input id="caregiver-relationship" class="profile-input" name="relationship" placeholder="For example, family member"></label>
          <button class="button button-secondary" type="submit">Send verification request</button>
        </form>
        <p id="invite-feedback" class="profile-feedback" role="status" aria-live="polite"></p>
      </section>

      <section class="profile-card escalation-summary-card" aria-labelledby="escalation-summary-title">
        <div class="profile-card-heading"><div><span class="eyebrow">Emergency escalation</span><h2 id="escalation-summary-title">Your current ladder</h2><p class="profile-help">Change timing and secondary-caregiver choices in your profile preferences.</p></div></div>
        <ol class="escalation-ladder"><li><span>1</span><div><strong>Re-alert you</strong><small>After ${profile.escalation.reAlert} minutes without acknowledgement</small></div></li><li><span>2</span><div><strong>Notify ${escapeHTML(caregiver.name)} if verified</strong><small>After ${profile.escalation.caregiver} minutes · only with your consent</small></div></li><li><span>3</span><div><strong>Flag for operator review</strong><small>After ${profile.escalation.operator} minutes · no emergency dispatch</small></div></li></ol>
        <a class="text-link profile-inline-link" href="#settings" data-view="settings">Edit escalation preferences <span aria-hidden="true">→</span></a>
      </section>
    </div>
  `;

  const feedback = target.querySelector('#caregiver-feedback');
  target.querySelector('[data-caregiver-action="verify"]').addEventListener('click', () => {
    feedback.textContent = 'Verification request sent. Notifications stay off until the caregiver accepts.';
    announce('Verification request sent.');
  });
  target.querySelector('[data-caregiver-action="remove"]').addEventListener('click', () => {
    saveState(CAREGIVER_STORAGE_KEY, { ...caregiver, status: 'Not connected', verified: false, permissions: [], paused: true });
    renderCaregiver(target, announce);
    announce('Caregiver connection removed.');
  });
  target.querySelector('[data-caregiver-action="pause"]').addEventListener('click', () => {
    saveState(CAREGIVER_STORAGE_KEY, { ...caregiver, paused: !caregiver.paused });
    renderCaregiver(target, announce);
    announce(caregiver.paused ? 'Selected caregiver sharing resumed.' : 'Caregiver sharing paused.');
  });
  target.querySelector('[data-caregiver-action="save-permissions"]').addEventListener('click', () => {
    const permissions = [...target.querySelectorAll('input[name="permission"]:checked')].map((input) => input.value);
    saveState(CAREGIVER_STORAGE_KEY, { ...caregiver, permissions });
    renderCaregiver(target, announce);
    announce('Caregiver sharing choices saved.');
  });
  target.querySelector('#caregiver-invite-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get('name')).trim();
    const email = String(formData.get('email')).trim();
    const relationship = String(formData.get('relationship')).trim() || 'Caregiver';
    saveState(CAREGIVER_STORAGE_KEY, { ...caregiver, name, email, relationship, verified: false, status: 'Verification pending', permissions: [], paused: true });
    renderCaregiver(target, announce);
    announce(`Verification request sent to ${name}.`);
  });
}

export { renderCaregiver, renderProfile };
