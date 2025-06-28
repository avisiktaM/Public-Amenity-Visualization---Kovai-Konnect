// Leaflet map initialization
const map = L.map('map').setView([11.0168, 76.9558], 12);

// Base map layers (using lowercase keys to match HTML data-layer attributes)
const baseLayers = {
  "default": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }),
  "satellite": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
  }),
  "terrain": L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
  })
};

// Add default base layer
baseLayers.default.addTo(map);

// Global variables
let coimbatoreBBox = null;
const layers = {};
const counts = {};
let highlightedAmenity = null;
let allAmenitiesLoaded = false;
let amenitiesData = {};
let activeBaseLayer = "default"; 
let isMobile = window.matchMedia("(max-width: 768px)").matches;

// Load Coimbatore boundary
fetch('data/AOI/Coimbatore.geojson')
  .then(res => res.json())
  .then(data => {
    // Add boundary to map
    L.geoJSON(data, {
      style: {
        color: '#333',
        weight: 2,
        fillOpacity: 0.05
      }
    }).addTo(map);

    // Calculate bounding box
    const bounds = L.geoJSON(data).getBounds();
    coimbatoreBBox = {
      minLon: bounds.getWest(),
      minLat: bounds.getSouth(),
      maxLon: bounds.getEast(),
      maxLat: bounds.getNorth()
    };
  });

// Amenity configuration
const amenities = [
  { name: 'Hospitals', file: 'hospital.geojson' },
  { name: 'Schools', file: 'school.geojson' },
  { name: 'Police Stations', file: 'police.geojson' },
  { name: 'Fire Stations', file: 'fire_station.geojson' },
  { name: 'Post Offices', file: 'post_office.geojson' },
  { name: 'Town Halls', file: 'town_hall.geojson' },
  { name: 'Prisons', file: 'prison.geojson' }
];

// Icon Loader
function getIcon(file) {
  return L.icon({
    iconUrl: `data/icons/${file.replace('.geojson', '')}.png`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -25]
  });
}

// Function to generate popup content
function generatePopupContent(props, type) {
  // Start with name and type
  let content = `<div class="popup-header">`;
  content += `<strong>${props.name || 'Unnamed'}</strong>`;
  content += `<div class="popup-type">${type}</div>`;
  content += `</div>`;
  
  // Collect non-null attributes
  const attributes = [];
  for (const key in props) {
    const value = props[key];
    // Skip if value is null/undefined or key is 'name'
    if (value && value !== 'NULL' && key !== 'name') {
      // Format key to be more readable
      const formattedKey = key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
        
      attributes.push({
        key: formattedKey,
        value: value
      });
    }
  }
  
  // Add attributes with scrollable container
  content += `<div class="popup-details ${attributes.length > 3 ? 'scrollable' : ''}">`;
  
  if (attributes.length === 0) {
    content += `<div class="no-details">No additional details available</div>`;
  } else {
    attributes.forEach(attr => {
      content += `<div class="popup-row">
        <span class="popup-key">${attr.key}:</span>
        <span class="popup-value">${attr.value}</span>
      </div>`;
    });
  }
  
  content += `</div>`;
  return content;
}

// Function to clear highlight marker
function clearHighlight() {
  if (highlightedAmenity) {
    map.removeLayer(highlightedAmenity);
    highlightedAmenity = null;
  }
}

// Function to find amenity by name
function findAmenity(query) {
  const lowerQuery = query.toLowerCase().trim();
  
  for (const layerName in amenitiesData) {
    for (const feature of amenitiesData[layerName]) {
      const props = feature.properties;
      if (props.name) {
        // Check for exact match
        if (props.name.toLowerCase() === lowerQuery) {
          return {
            feature,
            latlng: [
              feature.geometry.coordinates[1], 
              feature.geometry.coordinates[0]
            ],
            type: layerName
          };
        }
        
        // Check for partial match
        if (props.name.toLowerCase().includes(lowerQuery)) {
          return {
            feature,
            latlng: [
              feature.geometry.coordinates[1], 
              feature.geometry.coordinates[0]
            ],
            type: layerName
          };
        }
      }
    }
  }
  return null;
}

// Function to highlight an amenity
function highlightAmenity(featureData, latlng, type) {
  // Clear previous highlight
  clearHighlight();
  
  // Ensure layer is visible
  if (!map.hasLayer(layers[type])) {
    map.addLayer(layers[type]);
    document.getElementById(type).checked = true;
    updateChart();
  }

  // Create new highlight marker
  highlightedAmenity = L.marker(latlng, {
    icon: L.divIcon({
      className: 'highlight-marker',
      html: '<div class="pulse-effect"></div>',
      iconSize: [40, 40],
      iconAnchor: [20, 40]
    })
  }).addTo(map);
  
  // Create and open popup with all attributes
  const popupContent = generatePopupContent(featureData.properties, type);
  const popup = L.popup()
    .setLatLng(latlng)
    .setContent(popupContent);
  popup.openOn(map);
  
  // Zoom to feature
  map.setView(latlng, 18);
}

// Nominatim search with bounding box
function searchWithNominatim(query) {
  if (!coimbatoreBBox) {
    alert('Map boundary not loaded yet. Please try again.');
    return;
  }

  const { minLon, minLat, maxLon, maxLat } = coimbatoreBBox;
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&viewbox=${minLon},${maxLat},${maxLon},${minLat}&bounded=1`;

  fetch(url)
    .then(res => res.json())
    .then(data => {
      if (data?.length > 0) {
        const { lat, lon } = data[0];
        clearHighlight();
        map.setView([lat, lon], 16);
      } else {
        alert('Location not found!');
      }
    })
    .catch(() => alert('Error during search'));
}

// Helper function to close the search bar on mobile
function closeSearchBarOnMobile() {
  if (isMobile) {
    searchContainer.classList.add('hidden');
    // Also hide suggestions if visible
    searchSuggestions.classList.add('hidden');
  }
}

// Search Handler
function doSearch() {
  const query = document.getElementById('searchInput').value.trim();
  if (!query) return;

  // Check if amenities are loaded
  if (!allAmenitiesLoaded) {
    alert('Amenity data still loading. Please try again in a moment.');
    return;
  }

  // Amenity type aliases for filtering
  const amenityTypeAliases = {
    'hospital': 'Hospitals',
    'hospitals': 'Hospitals',
    'school': 'Schools',
    'schools': 'Schools',
    'police': 'Police Stations',
    'police station': 'Police Stations',
    'fire station': 'Fire Stations',
    'post office': 'Post Offices',
    'town hall': 'Town Halls',
    'prison': 'Prisons',
    'jail': 'Prisons'
  };

  // Check if query is an amenity type alias
  const normalizedQuery = query.toLowerCase();
  if (amenityTypeAliases[normalizedQuery]) {
    const amenityType = amenityTypeAliases[normalizedQuery];
    
    // Hide all layers
    amenities.forEach(({ name }) => {
      if (map.hasLayer(layers[name])) {
        map.removeLayer(layers[name]);
      }
      // Uncheck legend checkbox
      const checkbox = document.getElementById(name);
      if (checkbox) checkbox.checked = false;
    });
    
    // Show only the requested layer
    map.addLayer(layers[amenityType]);
    
    // Check its legend checkbox
    const typeCheckbox = document.getElementById(amenityType);
    if (typeCheckbox) typeCheckbox.checked = true;
    
    // Update chart
    updateChart();
    
    // Close search bar on mobile
    closeSearchBarOnMobile();
    return;
  }

  // Try to find amenity by name
  const amenity = findAmenity(query);
  if (amenity) {
    highlightAmenity(amenity.feature, amenity.latlng, amenity.type);
    
    // Close search bar on mobile
    closeSearchBarOnMobile();
    return;
  }

  // Fallback to Nominatim search
  searchWithNominatim(query);
  
  // Close search bar on mobile
  closeSearchBarOnMobile();
}

// Updated resetMapView function
function resetMapView() {
  clearHighlight();
  map.setView([11.0168, 76.9558], 12);
  document.getElementById('searchInput').value = '';
  
  // Reset all layers to visible
  amenities.forEach(({ name }) => {
    if (!map.hasLayer(layers[name])) {
      map.addLayer(layers[name]);
    }
    // Check legend checkbox
    const checkbox = document.getElementById(name);
    if (checkbox) checkbox.checked = true;
  });
  
  // Clear any previous Nominatim results
  if (nominatimLayer) {
    map.removeLayer(nominatimLayer);
    nominatimLayer = null;
  }
  
  updateChart();
  closeSearchBarOnMobile();
}

// Load Amenities & Build Layers
let loadedCount = 0;
amenities.forEach(({ name, file }) => {
  fetch(`data/Amenities/${file}`)
    .then(res => res.json())
    .then(data => {
      // Store raw data for searching
      amenitiesData[name] = data.features;
      counts[name] = data.features.length;

      // Create layer with enhanced popups
      const layer = L.geoJSON(data, {
        pointToLayer: (feature, latlng) => {
          return L.marker(latlng, { icon: getIcon(file) });
        },
        onEachFeature: (feature, layerEl) => {
          const popupContent = generatePopupContent(feature.properties, name);
          layerEl.bindPopup(popupContent);
        }
      });

      layers[name] = layer;
      map.addLayer(layer);
      
      // Update loading progress
      loadedCount++;
      if (loadedCount === amenities.length) {
        allAmenitiesLoaded = true;
        console.log('All amenities loaded');
      }
      
      updateLegend();
      updateChart();
    })
    .catch(error => {
      console.error(`Error loading ${file}:`, error);
      loadedCount++;
    });
});

// Legend Panel
function updateLegend() {
  const legend = document.getElementById('legendPanel');
  legend.innerHTML = '';

  amenities.forEach(({ name, file }) => {
    const container = document.createElement('div');
    container.className = 'legend-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = name;
    checkbox.checked = true;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        map.addLayer(layers[name]);
      } else {
        map.removeLayer(layers[name]);
      }
      updateChart();
    });

    const img = document.createElement('img');
    img.src = `data/icons/${file.replace('.geojson', '')}.png`;
    img.alt = name;
    img.width = 20;
    img.height = 20;

    const label = document.createElement('label');
    label.htmlFor = name;
    label.textContent = name;

    container.appendChild(img);
    container.appendChild(checkbox);
    container.appendChild(label);
    legend.appendChild(container);
  });
}

// Chart Setup
let chart;
function updateChart() {
  const selected = amenities.filter(a => document.getElementById(a.name)?.checked);
  const data = selected.map(a => counts[a.name] || 0);
  const labels = selected.map(a => a.name);

  if (chart) chart.destroy();
  
  const ctx = document.getElementById('amenityChart');
  if (!ctx) return;
  
  // Doughnut chart
  chart = new Chart(ctx, {
    type: 'doughnut', 
    data: {
      labels,
      datasets: [{
        label: 'Amenities',
        data,
        backgroundColor: [
            '#2c6fb7', // OSM blue (primary brand color)
  '#5bc0de', // Light blue (complements primary)
  '#5cb85c', // Green (natural, good contrast)
  '#f0ad4e', // Orange (warm, distinct)
  '#d9534f', // Red (alert, good visibility)
  '#8e44ad', // Purple (distinct, color-blind safe)
  '#1abc9c'  // Teal (fresh, unique)
        ]
      }]
    },
    options: {
      cutout: '60%', 
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
        }
      }
    }
  });
  
  // Add scrollable container for legend items on mobile
  if (isMobile) {
    const legendContainer = document.querySelector('#amenityChart').closest('.chart-container');
    if (legendContainer) {
      legendContainer.style.maxHeight = '300px';
      legendContainer.style.overflowY = 'auto';
    }
  }
}

// Sidebar Toggle
const sidebarToggle = document.getElementById('sidebarToggle');
sidebarToggle.addEventListener('click', () => {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('open');
  
  // Invalidate map size after animation completes
  setTimeout(() => {
    map.invalidateSize();
  }, 300);
});

// Expand Button Toggle 
const expandBtn = document.getElementById('expandBtn');
const toolPanel = document.getElementById('toolPanel');
const togglePanelBtn = document.getElementById('togglePanelBtn');

togglePanelBtn.addEventListener('click', () => {
  toolPanel.classList.toggle('collapsed');
  expandBtn.classList.toggle('rotated');
});

// Legend Toggle Button
const legendBtn = document.getElementById('legendBtn');
const legendPanel = document.getElementById('legendPanel');

// Feature Layer Toggle Button
const featureLayerBtn = document.getElementById('featureLayerBtn');
const layerPanel = document.getElementById('layerPanel');

// Function to close all collapsible panels
function closeAllPanels() {
  legendPanel.classList.add('hidden');
  layerPanel.classList.add('hidden');
}

// Toggle legend panel
legendBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = !legendPanel.classList.contains('hidden');
  
  closeAllPanels();
  if (!isOpen) {
    legendPanel.classList.remove('hidden');
  }
});

// Toggle layer panel
featureLayerBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = !layerPanel.classList.contains('hidden');
  
  closeAllPanels();
  if (!isOpen) {
    layerPanel.classList.remove('hidden');
  }
});

// Close panels when clicking outside
document.addEventListener('click', (e) => {
  if (!legendPanel.contains(e.target) && !legendBtn.contains(e.target)) {
    legendPanel.classList.add('hidden');
  }
  
  if (!layerPanel.contains(e.target) && !featureLayerBtn.contains(e.target)) {
    layerPanel.classList.add('hidden');
  }
});

// Set active base layer
function setActiveBaseLayer(layerName) {
  // Remove active class from all items
  const items = document.querySelectorAll('#baseMapList li');
  items.forEach(item => item.classList.remove('active'));
  
  // Add active class to selected item
  const activeItem = document.querySelector(`#baseMapList li[data-layer="${layerName}"]`);
  if (activeItem) {
    activeItem.classList.add('active');
  }
  
  // Switch the base layer
  if (activeBaseLayer !== layerName) {
    // Remove the current base layer
    map.removeLayer(baseLayers[activeBaseLayer]);
    // Add the new base layer
    baseLayers[layerName].addTo(map);
    activeBaseLayer = layerName;
  }
}

// Initialize base map layer list
function initBaseMapList() {
  const baseMapList = document.getElementById('baseMapList');
  
  // Add event listeners to list items
  baseMapList.querySelectorAll('li').forEach(item => {
    item.addEventListener('click', () => {
      const layerName = item.getAttribute('data-layer');
      setActiveBaseLayer(layerName);
    });
  });
  
  // Set initial active layer
  setActiveBaseLayer(activeBaseLayer);
}

// Toggle Search Bar visibility
const searchBtn = document.getElementById('searchBtn');
const searchContainer = document.getElementById('searchContainer');
searchBtn.addEventListener('click', () => {
  searchContainer.classList.toggle('hidden');
  
  // Close other panels when search is opened
  if (!searchContainer.classList.contains('hidden')) {
    closeAllPanels();
  }
});

// Reset View
function resetMapView() {
  clearHighlight();
  map.setView([11.0168, 76.9558], 12);
  document.getElementById('searchInput').value = '';
  
  // Reset all layers to visible
  amenities.forEach(({ name }) => {
    if (!map.hasLayer(layers[name])) {
      map.addLayer(layers[name]);
    }
    // Check legend checkbox
    const checkbox = document.getElementById(name);
    if (checkbox) checkbox.checked = true;
  });
  
  // Update chart
  updateChart();
}

function filterLayersByType(type) {
  // Hide all layers except the specified type
  amenities.forEach(({ name }) => {
    if (name === type) {
      if (!map.hasLayer(layers[name])) {
        map.addLayer(layers[name]);
      }
    } else {
      if (map.hasLayer(layers[name])) {
        map.removeLayer(layers[name]);
      }
    }
  });
  
  // Update checkboxes
  amenities.forEach(({ name }) => {
    const checkbox = document.getElementById(name);
    if (checkbox) checkbox.checked = (name === type);
  });
  
  // Update chart
  updateChart();
}

// Update event listeners
document.getElementById('searchSubmit').addEventListener('click', doSearch);
document.getElementById('resetView').addEventListener('click', resetMapView);
document.getElementById('searchInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doSearch();
});

// Search suggestions
const searchInput = document.getElementById('searchInput');
const searchSuggestions = document.getElementById('searchSuggestions');

searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimeout);
  
  const query = searchInput.value.trim();
  if (!query) {
    searchSuggestions.classList.add('hidden');
    return;
  }

  // Show loading state
  searchSuggestions.innerHTML = '<li class="search-loading">Searching...</li>';
  searchSuggestions.classList.remove('hidden');

  debounceTimeout = setTimeout(() => {
    if (!allAmenitiesLoaded || !coimbatoreBBox) {
      searchSuggestions.classList.add('hidden');
      return;
    }

    const { minLon, minLat, maxLon, maxLat } = coimbatoreBBox;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5&viewbox=${minLon},${maxLat},${maxLon},${minLat}&bounded=1`;

    fetch(url)
      .then(res => res.json())
      .then(results => {
        searchSuggestions.innerHTML = '';
        if (!results.length) {
          searchSuggestions.innerHTML = '<li class="no-results">No results found</li>';
          return;
        }

        results.forEach(place => {
          const li = document.createElement('li');
          li.textContent = place.display_name;
          li.addEventListener('click', () => {
            map.setView([place.lat, place.lon], 16);
            searchInput.value = place.display_name;
            searchSuggestions.classList.add('hidden');
          });
          searchSuggestions.appendChild(li);
        });
      })
      .catch(() => {
        searchSuggestions.innerHTML = '';
        searchSuggestions.classList.add('hidden');
      });
  }, 300); // 300ms debounce delay
});

// Hide suggestions on outside click
document.addEventListener('click', (e) => {
  if (!searchContainer.contains(e.target)) {
    searchSuggestions.classList.add('hidden');
  }
});

// Mobile Sidebar Toggle
const mobileSidebarToggle = document.querySelector('.mobile-sidebar-toggle');
if (mobileSidebarToggle) {
  mobileSidebarToggle.addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
    
    // Invalidate map size after animation completes
    setTimeout(() => {
      map.invalidateSize();
    }, 300);
  });
}

// Initialize the base map list
document.addEventListener('DOMContentLoaded', () => {
  initBaseMapList();
  
  // Detect mobile and adjust UI
  if (isMobile) {
    document.body.classList.add('mobile');
    
    // Set topbar height CSS variable
    const topbar = document.getElementById('topbar');
    if (topbar) {
      document.documentElement.style.setProperty(
        '--topbar-height', 
        `${topbar.offsetHeight}px`
      );
    }
    
    // Close tool panel by default on mobile
    toolPanel.classList.add('collapsed');
    
    // Close sidebar by default
    document.getElementById('sidebar').classList.remove('open');
    
    // Set dynamic height for chart container on mobile
    const chartContainer = document.querySelector('.chart-container');
    if (chartContainer) {
      const visibleHeight = window.innerHeight * 0.4;
      chartContainer.style.maxHeight = `${visibleHeight}px`;
      chartContainer.style.overflowY = 'auto';
    }
  }
  
  // Prevent double-tap zoom on mobile
  document.addEventListener('dblclick', function(e) {
    if (isMobile) {
      e.preventDefault();
    }
  }, { passive: false });
  
  // Specifically for map to prevent zoom on double-tap
  map.getContainer().addEventListener('dblclick', function(e) {
    if (isMobile) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, { passive: false });
});

// Handle window resize for responsive adjustments
window.addEventListener('resize', () => {
  // Update mobile detection
  isMobile = window.matchMedia("(max-width: 768px)").matches;
  
  // Set topbar height CSS variable
  if (isMobile) {
    const topbar = document.getElementById('topbar');
    if (topbar) {
      document.documentElement.style.setProperty(
        '--topbar-height', 
        `${topbar.offsetHeight}px`
      );
    }
  }
  
  // Close all panels when switching between mobile/desktop
  closeAllPanels();
  
  // Update chart container height on mobile
  if (isMobile) {
    const chartContainer = document.querySelector('.chart-container');
    if (chartContainer) {
      const visibleHeight = window.innerHeight * 0.4;
      chartContainer.style.maxHeight = `${visibleHeight}px`;
      chartContainer.style.overflowY = 'auto';
    }
  }
  
  // Update chart legend for responsive behavior
  if (chart) {
    const isMobileNow = window.matchMedia("(max-width: 768px)").matches;
    chart.options.plugins.legend.labels = {
      boxWidth: isMobileNow ? 10 : 12,
      padding: isMobileNow ? 8 : 10,
      font: {
        size: isMobileNow ? 10 : 12
      }
    };
    chart.update();
  }
  
  // Invalidate map size
  setTimeout(() => {
    map.invalidateSize();
  }, 100);
});

// Chart Legend Resize Helper
function updateChartForResize() {
  if (!chart) return;
  const isMobile = window.matchMedia("(max-width: 768px)").matches;
  chart.options.plugins.legend.labels = {
    boxWidth: isMobile ? 10 : 12,
    padding: isMobile ? 8 : 10,
    font: {
      size: isMobile ? 10 : 12
    }
  };
  chart.update();
}