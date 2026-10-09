(() => {
  'use strict';

  const shelters = [
    { id: 'shelter-aberdeen', name: 'Aberdeen Typhoon Shelter', source: 'Marine Department', version: '2025-06-24', updated: '24 Jun 2025, 14:20 HKT' },
    { id: 'shelter-causeway-bay', name: 'Causeway Bay Typhoon Shelter', source: 'Marine Department', version: '2025-06-24', updated: '24 Jun 2025, 14:20 HKT' },
    { id: 'shelter-kwun-tong', name: 'Kwun Tong Typhoon Shelter', source: 'Marine Department', version: '2025-06-24', updated: '24 Jun 2025, 14:20 HKT' },
    { id: 'shelter-yau-ma-tei', name: 'Yau Ma Tei Typhoon Shelter', source: 'Marine Department', version: '2025-06-24', updated: '24 Jun 2025, 14:20 HKT' }
  ];

  const stations = [
    { id: 'station-north-point', name: 'North Point', wind: 'ENE · 28 km/h', rain: '4 mm', age: '10 min ago' },
    { id: 'station-cheung-chau', name: 'Cheung Chau', wind: 'E · 19 km/h', rain: '1 mm', age: '10 min ago' },
    { id: 'station-kings-park', name: "King's Park", wind: 'ENE · 22 km/h', rain: '2 mm', age: '10 min ago' }
  ];

  const advisories = [
    { id: 'advisory-west', title: 'Strong gusts reported', detail: 'App report near the western waterfront. Advisory only; verify locally.', age: 'Reported 12 min ago', tone: '' },
    { id: 'advisory-east', title: 'Slippery deck reported', detail: 'App report near the eastern waterfront. This view has no pedestrian route.', age: 'Reported 34 min ago', tone: 'teal' }
  ];

  const liveRegion = document.getElementById('live-region');
  const selectedContent = document.getElementById('selected-content');
  const selectedTitle = document.getElementById('selected-title');
  const mapPanel = document.getElementById('map-panel');
  const mapList = document.getElementById('map-list');
  const selectedShelter = shelters[0];

  function announce(message) {
    if (!liveRegion) return;
    liveRegion.textContent = '';
    window.setTimeout(() => { liveRegion.textContent = message; }, 30);
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) {
      announce('Read aloud is not supported in this browser. The details are already visible on screen.');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = .92;
    window.speechSynthesis.speak(utterance);
    announce('Reading aloud.');
  }

  function setSelectedMarker(id) {
    document.querySelectorAll('.map-marker').forEach((marker) => {
      const isSelected = marker.dataset.id === id;
      marker.classList.toggle('selected', isSelected);
      marker.setAttribute('aria-current', isSelected ? 'true' : 'false');
    });
  }

  function renderShelterDetail(shelter) {
    const marineLabel = 'Shelter for boats (Marine Department)';
    selectedTitle.textContent = shelter.name;
    selectedContent.innerHTML = `
      <div class="selected-heading"><span class="large-marker shelter-marker" aria-hidden="true">◆</span><div><p class="source-label">${shelter.source}</p><h2 id="selected-title">${shelter.name}</h2></div></div>
      <p class="plain-tag">${marineLabel}</p>
      <p class="muted-copy">A designated marine shelter area for vessels. This marker is not a place for people to evacuate to.</p>
      <dl class="detail-list"><div><dt>Layer</dt><dd>Marine context</dd></div><div><dt>Source version</dt><dd>${shelter.version}</dd></div><div><dt>Imported</dt><dd>${shelter.updated}</dd></div><div><dt>Record status</dt><dd><span class="inline-status"><span class="status-dot"></span>Current</span></dd></div></dl>
      <div class="selected-actions"><button class="button button-primary" type="button" id="focus-shelter">Focus on map</button><button class="button button-quiet" type="button" id="shelter-narrate">Read details</button></div>`;
    selectedTitle.setAttribute('id', 'selected-title');
    document.getElementById('focus-shelter').addEventListener('click', () => focusMarker(shelter.id));
    document.getElementById('shelter-narrate').addEventListener('click', () => speak(`${shelter.name}. ${marineLabel}. ${shelter.updated}. This is not a destination for people.`));
  }

  function focusMarker(id) {
    const marker = document.querySelector(`[data-id="${id}"]`);
    if (!marker) return;
    setSelectedMarker(id);
    marker.focus({ preventScroll: true });
    announce(`${marker.getAttribute('aria-label')}`);
  }

  function selectMarker(id) {
    const shelter = shelters.find((item) => item.id === id);
    if (shelter) {
      renderShelterDetail(shelter);
      setSelectedMarker(id);
      announce(`${shelter.name} selected. Shelter for boats, Marine Department. Not a destination for people.`);
      return;
    }
    const station = stations.find((item) => item.id === id);
    if (station) announce(`HKO station ${station.name}: wind ${station.wind}; rainfall ${station.rain} in the past hour; observation ${station.age}.`);
  }

  document.querySelectorAll('.map-marker').forEach((marker) => {
    marker.addEventListener('click', () => selectMarker(marker.dataset.id));
    marker.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectMarker(marker.dataset.id);
      }
    });
  });

  function renderCards() {
    const observationTarget = document.getElementById('observation-cards');
    const advisoryTarget = document.getElementById('advisory-cards');
    observationTarget.innerHTML = stations.map((station) => `
      <button class="observation-card" type="button" data-observation-id="${station.id}">
        <span class="station-icon" aria-hidden="true">＋</span><span><strong>${station.name}</strong><span>Wind ${station.wind}</span></span><span class="observation-value">${station.rain}<small>rain / past hour</small></span>
      </button>`).join('');
    advisoryTarget.innerHTML = advisories.map((item) => `
      <article class="advisory-card ${item.tone}"><strong>${item.title}</strong><p>${item.detail}</p><div class="advisory-meta"><span>${item.age}</span><span>Advisory only</span></div></article>`).join('');
    observationTarget.querySelectorAll('[data-observation-id]').forEach((card) => card.addEventListener('click', () => {
      const station = stations.find((item) => item.id === card.dataset.observationId);
      const marker = document.querySelector(`[data-id="${station.id}"]`);
      marker?.focus({ preventScroll: true });
      announce(`Selected HKO station ${station.name}. Wind ${station.wind}; rainfall ${station.rain} in the past hour.`);
    }));
  }

  function renderList() {
    const shelterList = document.getElementById('shelter-list');
    const stationList = document.getElementById('station-list');
    const advisoryList = document.getElementById('advisory-list');
    shelterList.innerHTML = shelters.map((item) => `<button class="list-item" type="button" data-list-id="${item.id}"><span><strong>${item.name}</strong><span>Shelter for boats · Marine Department · ${item.version}</span></span><span aria-hidden="true">›</span></button>`).join('');
    stationList.innerHTML = stations.map((item) => `<button class="list-item" type="button" data-list-id="${item.id}"><span><strong>${item.name}</strong><span>Wind ${item.wind} · ${item.age}</span></span><span aria-hidden="true">›</span></button>`).join('');
    advisoryList.innerHTML = advisories.map((item) => `<div class="list-item"><span><strong>${item.title}</strong><span>${item.detail}</span></span></div>`).join('');
    document.querySelectorAll('[data-list-id]').forEach((item) => item.addEventListener('click', () => {
      const id = item.dataset.listId;
      selectMarker(id);
      if (id.startsWith('shelter-')) mapList.hidden = true;
      document.querySelector('[data-view="map"]').click();
      window.setTimeout(() => focusMarker(id), 0);
    }));
  }

  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      const listMode = button.dataset.view === 'list';
      document.querySelectorAll('[data-view]').forEach((item) => {
        const selected = item === button;
        item.classList.toggle('is-selected', selected);
        item.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
      mapList.hidden = !listMode;
      mapPanel.hidden = listMode;
      announce(listMode ? 'List view selected. Map markers are now available as a text alternative.' : 'Map view selected. Use Tab to move between markers.');
    });
  });

  document.querySelectorAll('[data-layer]').forEach((button) => {
    button.addEventListener('click', () => {
      const layer = button.dataset.layer;
      const active = button.classList.toggle('is-on');
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      document.querySelectorAll(`[data-layer-group="${layer}"]`).forEach((group) => { group.hidden = !active; });
      announce(`${layer === 'shelters' ? 'Boat shelters' : layer === 'observations' ? 'HKO observations' : 'Advisories'} layer ${active ? 'shown' : 'hidden'}.`);
    });
  });

  document.getElementById('read-page').addEventListener('click', () => speak('Marine context. This view shows shelters for boats from the Marine Department, H K O station observations, and app-generated advisory reports. Boat shelters are not destinations for people. Human shelters and accessibility-aware pedestrian routing are deferred because the approved data does not provide them.'));
  document.querySelector('.menu-button').addEventListener('click', (event) => {
    const button = event.currentTarget;
    const nav = document.querySelector('.primary-nav');
    const open = nav.classList.toggle('is-open');
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    button.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  });

  renderCards();
  renderList();
  renderShelterDetail(selectedShelter);
})();
