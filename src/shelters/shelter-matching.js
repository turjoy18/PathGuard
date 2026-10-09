import { DEMO_SHELTERS, DEFAULT_USER_PROFILE, rankShelters, formatShelterInfo } from './shelter-data.js';

export function renderShelterMatching(container, userProfile = DEFAULT_USER_PROFILE, userLocation = null) {
  const rankedShelters = rankShelters(DEMO_SHELTERS, userProfile, userLocation);
  
  container.innerHTML = `
    <div class="shelter-matching">
      <div class="matching-header">
        <h2>Shelter Recommendations</h2>
        <div class="demo-banner">
          <span class="demo-icon" aria-hidden="true">⚠</span>
          <span>Using demo shelter data. Features and locations are simulated.</span>
        </div>
      </div>
      
      <div class="profile-summary">
        <h3>Your Accessibility Profile</h3>
        <div class="profile-tags">
          ${renderProfileTags(userProfile)}
        </div>
      </div>
      
      <div class="shelter-results">
        <h3>Recommended Shelters</h3>
        ${rankedShelters.length > 0 
          ? renderShelterList(rankedShelters) 
          : renderNoSheltersMessage(userProfile)}
      </div>
      
      <div class="matching-explanation">
        <details>
          <summary>How shelter matching works</summary>
          <div class="details-content">
            <p>Shelters are matched using:</p>
            <ul>
              <li><strong>Hard filters:</strong> Remove shelters that don't meet your essential accessibility needs</li>
              <li><strong>Soft scoring:</strong> Rank remaining shelters based on capacity, facilities, and accessibility fit</li>
              <li><strong>Capacity awareness:</strong> Prefer shelters with more available space</li>
              <li><strong>Facility matching:</strong> Bonus points for shelters with your required facilities</li>
            </ul>
            <p class="demo-note">⚠️ <strong>Note:</strong> This demo uses simulated data. In a real emergency, shelters would be matched using official, verified data.</p>
          </div>
        </details>
      </div>
    </div>
  `;
  
  // Add event listeners for shelter selection
  container.querySelectorAll('.shelter-card').forEach(card => {
    card.addEventListener('click', () => {
      const shelterId = card.dataset.shelterId;
      showShelterDetails(container, shelterId, userProfile);
    });
  });
}

function renderProfileTags(profile) {
  const tags = [];
  
  // Mobility tags
  if (profile.mobility.wheelchairType !== 'none') {
    tags.push(`Wheelchair (${profile.mobility.wheelchairType})`);
  }
  if (!profile.mobility.canUseStairs) {
    tags.push('No stairs');
  }
  if (profile.mobility.assistanceNeeded) {
    tags.push('Assistance needed');
  }
  
  // Sensory tags
  if (profile.sensory.hearing === 'deaf') {
    tags.push('Deaf');
  } else if (profile.sensory.hearing === 'hard_of_hearing') {
    tags.push('Hard of hearing');
  }
  
  if (profile.sensory.vision === 'blind') {
    tags.push('Blind');
  } else if (profile.sensory.vision === 'low_vision') {
    tags.push('Low vision');
  }
  
  // Cognitive tags
  if (profile.cognitive.simplifiedInstructions) {
    tags.push('Simplified instructions');
  }
  if (profile.cognitive.largeText) {
    tags.push('Large text');
  }
  
  // Facility tags
  if (profile.facilities.accessibleToilet) {
    tags.push('Accessible toilet');
  }
  if (profile.facilities.powerForMedicalDevice) {
    tags.push('Medical power');
  }
  if (profile.facilities.quietSpace) {
    tags.push('Quiet space');
  }
  if (profile.facilities.medicationRefrigeration) {
    tags.push('Medication refrigeration');
  }
  if (profile.facilities.assistanceAnimal) {
    tags.push('Assistance animal');
  }
  
  if (tags.length === 0) {
    return '<span class="profile-tag">Standard accessibility</span>';
  }
  
  return tags.map(tag => `<span class="profile-tag">${tag}</span>`).join('');
}

function renderShelterList(rankedShelters) {
  return `
    <div class="shelter-list">
      ${rankedShelters.map((result, index) => renderShelterCard(result, index + 1)).join('')}
    </div>
    <p class="results-count">Showing ${rankedShelters.length} matching shelter${rankedShelters.length !== 1 ? 's' : ''}</p>
  `;
}

function renderShelterCard(result, rank) {
  const { shelter, score } = result;
  const info = formatShelterInfo(shelter);
  
  return `
    <div class="shelter-card" data-shelter-id="${shelter.id}" tabindex="0" role="button" aria-label="Select ${shelter.name}, score ${score} out of 100">
      <div class="shelter-card-header">
        <div class="shelter-rank">#${rank}</div>
        <div class="shelter-score">
          <span class="score-value">${score}</span>
          <span class="score-label">match score</span>
        </div>
      </div>
      
      <div class="shelter-card-body">
        <h4 class="shelter-name">${shelter.name}</h4>
        <p class="shelter-address">${shelter.address}</p>
        
        <div class="shelter-stats">
          <div class="stat">
            <span class="stat-label">Capacity</span>
            <span class="stat-value ${shelter.currentOccupancy / shelter.capacity > 0.8 ? 'stat-warning' : ''}">
              ${shelter.currentOccupancy}/${shelter.capacity}
            </span>
          </div>
          <div class="stat">
            <span class="stat-label">Status</span>
            <span class="stat-value stat-${shelter.status}">${shelter.status}</span>
          </div>
        </div>
        
        <div class="shelter-features">
          <div class="feature accessibility-features">
            <span class="feature-label">Accessibility:</span>
            <span class="feature-value">${info.accessibilitySummary}</span>
          </div>
          <div class="feature facility-features">
            <span class="feature-label">Facilities:</span>
            <span class="feature-value">${info.facilitiesSummary}</span>
          </div>
        </div>
        
        ${info.isDemoData ? '<div class="demo-indicator">DEMO DATA</div>' : ''}
      </div>
      
      <div class="shelter-card-footer">
        <button class="button button-secondary" type="button" data-action="view-details">View details</button>
        <button class="button button-primary" type="button" data-action="select-shelter">Select this shelter</button>
      </div>
    </div>
  `;
}

function renderNoSheltersMessage(profile) {
  return `
    <div class="no-shelters-message">
      <div class="message-icon" aria-hidden="true">⚠</div>
      <h4>No shelters match your accessibility needs</h4>
      <p>Based on your profile, no shelters in the demo dataset meet all your requirements.</p>
      <div class="suggestions">
        <p><strong>Suggestions:</strong></p>
        <ul>
          <li>Check if any requirements can be adjusted</li>
          <li>Contact emergency services for assistance</li>
          <li>Consider sheltering in place if safe to do so</li>
        </ul>
      </div>
      <button class="button button-secondary" type="button" data-action="adjust-profile">Adjust profile</button>
      <button class="button button-primary" type="button" data-action="request-help">Request emergency assistance</button>
    </div>
  `;
}

function showShelterDetails(container, shelterId, userProfile) {
  const shelter = DEMO_SHELTERS.find(s => s.id === shelterId);
  if (!shelter) return;
  
  const info = formatShelterInfo(shelter);
  
  container.innerHTML = `
    <div class="shelter-details-view">
      <button class="back-button" type="button" data-action="back-to-list">
        <span aria-hidden="true">←</span> Back to recommendations
      </button>
      
      <div class="shelter-details">
        <div class="shelter-details-header">
          <h2>${shelter.name}</h2>
          ${info.isDemoData ? '<div class="demo-banner">⚠️ DEMO DATA: Simulated shelter information</div>' : ''}
        </div>
        
        <div class="details-grid">
          <div class="detail-section">
            <h3>Location & Contact</h3>
            <div class="detail-item">
              <strong>Address:</strong> ${shelter.address}
            </div>
            <div class="detail-item">
              <strong>Contact:</strong> ${shelter.contact}
            </div>
            <div class="detail-item">
              <strong>Hours:</strong> ${shelter.openingHours}
            </div>
          </div>
          
          <div class="detail-section">
            <h3>Capacity</h3>
            <div class="capacity-meter">
              <div class="meter-bar" style="width: ${(shelter.currentOccupancy / shelter.capacity) * 100}%"></div>
            </div>
            <div class="detail-item">
              <strong>Current:</strong> ${shelter.currentOccupancy} people
            </div>
            <div class="detail-item">
              <strong>Total capacity:</strong> ${shelter.capacity} people
            </div>
            <div class="detail-item">
              <strong>Available:</strong> ${shelter.capacity - shelter.currentOccupancy} spaces
            </div>
          </div>
          
          <div class="detail-section">
            <h3>Accessibility Features</h3>
            <ul class="feature-list">
              <li class="${shelter.accessibility.stepFreeEntry ? 'feature-available' : 'feature-unavailable'}">
                Step-free entrance: ${shelter.accessibility.stepFreeEntry ? 'Yes' : 'No (has stairs)'}
              </li>
              <li class="${shelter.accessibility.liftAvailable ? 'feature-available' : 'feature-unavailable'}">
                Lift available: ${shelter.accessibility.liftAvailable ? 'Yes' : 'No'}
              </li>
              <li class="${shelter.accessibility.accessibleToilets > 0 ? 'feature-available' : 'feature-unavailable'}">
                Accessible toilets: ${shelter.accessibility.accessibleToilets}
              </li>
              <li class="${shelter.accessibility.powerOutlets ? 'feature-available' : 'feature-unavailable'}">
                Power outlets: ${shelter.accessibility.powerOutlets ? 'Yes' : 'No'}
              </li>
              <li class="${shelter.accessibility.quietSpace ? 'feature-available' : 'feature-unavailable'}">
                Quiet space: ${shelter.accessibility.quietSpace ? 'Yes' : 'No'}
              </li>
              <li class="${shelter.accessibility.medicalRefrigeration ? 'feature-available' : 'feature-unavailable'}">
                Medical refrigeration: ${shelter.accessibility.medicalRefrigeration ? 'Yes' : 'No'}
              </li>
              <li class="${shelter.accessibility.assistanceAnimalFriendly ? 'feature-available' : 'feature-unavailable'}">
                Assistance animal friendly: ${shelter.accessibility.assistanceAnimalFriendly ? 'Yes' : 'No'}
              </li>
              <li>Path width: ${shelter.accessibility.wheelchairWidth} cm</li>
              <li>Maximum slope: ${shelter.accessibility.maxSlope}%</li>
              <li>Maximum kerb height: ${shelter.accessibility.maxKerbHeight} cm</li>
            </ul>
          </div>
          
          <div class="detail-section">
            <h3>Facilities</h3>
            <ul class="feature-list">
              <li class="${shelter.facilities.toilets ? 'feature-available' : 'feature-unavailable'}">
                Toilets: ${shelter.facilities.toilets ? 'Yes' : 'No'}
              </li>
              <li class="${shelter.facilities.drinkingWater ? 'feature-available' : 'feature-unavailable'}">
                Drinking water: ${shelter.facilities.drinkingWater ? 'Yes' : 'No'}
              </li>
              <li class="${shelter.facilities.chargingStations ? 'feature-available' : 'feature-unavailable'}">
                Charging stations: ${shelter.facilities.chargingStations ? 'Yes' : 'No'}
              </li>
              <li class="${shelter.facilities.seating ? 'feature-available' : 'feature-unavailable'}">
                Seating: ${shelter.facilities.seating ? 'Yes' : 'No'}
              </li>
              <li class="${shelter.facilities.bedding ? 'feature-available' : 'feature-unavailable'}">
                Bedding: ${shelter.facilities.bedding ? 'Yes' : 'No'}
              </li>
              <li class="${shelter.facilities.meals ? 'feature-available' : 'feature-unavailable'}">
                Meals: ${shelter.facilities.meals ? 'Yes' : 'No'}
              </li>
              <li class="${shelter.facilities.medicalFirstAid ? 'feature-available' : 'feature-unavailable'}">
                Medical first aid: ${shelter.facilities.medicalFirstAid ? 'Yes' : 'No'}
              </li>
            </ul>
          </div>
        </div>
        
        <div class="details-actions">
          <button class="button button-secondary" type="button" data-action="view-on-map">View on map</button>
          <button class="button button-primary" type="button" data-action="get-directions">Get directions to this shelter</button>
        </div>
        
        <div class="last-updated">
          <small>Last verified: ${info.lastUpdated}</small>
        </div>
      </div>
    </div>
  `;
  
  // Add back button listener
  container.querySelector('.back-button').addEventListener('click', () => {
    renderShelterMatching(container, userProfile);
  });
}

export function initializeShelterMatching(container) {
  // Load user profile from localStorage or use default
  let userProfile;
  try {
    const savedProfile = localStorage.getItem('pathguard_user_profile');
    userProfile = savedProfile ? JSON.parse(savedProfile) : DEFAULT_USER_PROFILE;
  } catch {
    userProfile = DEFAULT_USER_PROFILE;
  }
  
  renderShelterMatching(container, userProfile);
  
  // Handle dynamic updates
  container.addEventListener('click', (event) => {
    const action = event.target.dataset?.action;
    
    if (action === 'adjust-profile') {
      // In a real app, this would open profile editor
      alert('Profile adjustment would open here. In this demo, using default profile.');
    }
    
    if (action === 'request-help') {
      alert('Emergency assistance request would be sent here. In this demo, this is simulated.');
    }
    
    if (action === 'select-shelter') {
      const shelterCard = event.target.closest('.shelter-card');
      const shelterId = shelterCard?.dataset?.shelterId;
      if (shelterId) {
        showShelterDetails(container, shelterId, userProfile);
      }
    }
  });
}