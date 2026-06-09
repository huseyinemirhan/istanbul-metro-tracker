let map;
let trainMarkers = {};
let staticLayers = {}; 
export let visibleRoutes = new Set(); 

const ISTANBUL_COLORS = {
    'M1A': '#EE2229', 'M1B': '#EE2229', 'M1': '#EE2229',
    'M2': '#059A4D', 'M3': '#0CA6DF', 'M4': '#E81E77',
    'M5': '#683166', 'M6': '#C9AA79', 'M7': '#F490B3',
    'M8': '#487ABF', 'M9': '#FCD10D', 'M11': '#A1609B',
    'T1': '#004b86', 'T2': '#90aba0', 'T3': '#99562f',
    'T4': '#ff7e42', 'T5': '#7b72b2',
    'F1': '#7A745A', 'F2': '#7A745A', 'F3': '#7A745A', 'F4': '#7A745A',
    'MARMARAY': '#8c8c8c', 'B1': '#8c8c8c' 
};

export function getColor(shortName) {
    const name = String(shortName).toUpperCase().trim();
    if (name.includes('MARMARAY')) return ISTANBUL_COLORS['MARMARAY'];
    if (ISTANBUL_COLORS[name]) return ISTANBUL_COLORS[name];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
    const fallbacks = ['#e6194B', '#3cb44b', '#ffe119', '#4363d8', '#f58231'];
    return fallbacks[hash % fallbacks.length];
}

export function initMap(elementId) {
    map = L.map(elementId, { preferCanvas: true, zoomControl: false }).setView([41.015, 28.979], 11);
    L.control.zoom({ position: 'topright' }).addTo(map);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO'
    }).addTo(map);
}

export function setVisibleRoutes(routeIds) {
    visibleRoutes = new Set(routeIds);
    for (const routeId in staticLayers) {
        if (visibleRoutes.has(routeId)) {
            map.addLayer(staticLayers[routeId]);
        } else {
            map.removeLayer(staticLayers[routeId]);
        }
    }
}

export function drawNetwork(linesData, stopsLookup, routesLookup, routeStops) {
    Object.entries(linesData).forEach(([routeId, shapeArrays]) => {
        if (!staticLayers[routeId]) staticLayers[routeId] = L.layerGroup();
        
        let shortName = routesLookup[routeId] ? (routesLookup[routeId].route_short_name || routeId).toUpperCase().trim() : routeId;
        if (shortName.includes('MARMARAY')) shortName = 'MARMARAY';
        const color = getColor(shortName);

        shapeArrays.forEach(latlngs => {
            const glow = L.polyline(latlngs, { color: color, weight: 12, opacity: 0.15 });
            const core = L.polyline(latlngs, { color: color, weight: 3, opacity: 0.9 })
                          .bindTooltip(shortName, { permanent: false, sticky: true });
            
            staticLayers[routeId].addLayer(glow);
            staticLayers[routeId].addLayer(core);
        });

        const stops = routeStops[routeId] || [];
        stops.forEach(stop => {
            const marker = L.circleMarker([stop.lat, stop.lon], {
                radius: 3, color: '#000', fillColor: '#fff', fillOpacity: 1, weight: 1
            }).bindPopup(`<b>${stop.name}</b>`);
            staticLayers[routeId].addLayer(marker);
        });
    });
}

function getPointOnTrack(shapeId, fromLat, fromLon, toLat, toLon, fromDist, toDist, progress, shapePointsDict) {
    const shape = shapePointsDict[shapeId];
    if (shape && fromDist !== undefined && toDist !== undefined && shape.length > 0) {
        const targetDist = fromDist + (toDist - fromDist) * progress;
        
        for (let i = 0; i < shape.length - 1; i++) {
            if (targetDist >= shape[i].dist && targetDist <= shape[i+1].dist) {
                const segmentProgress = (targetDist - shape[i].dist) / ((shape[i+1].dist - shape[i].dist) || 1);
                return {
                    lat: shape[i].lat + (shape[i+1].lat - shape[i].lat) * segmentProgress,
                    lon: shape[i].lon + (shape[i+1].lon - shape[i].lon) * segmentProgress
                };
            }
        }
    }
    return { lat: fromLat + (toLat - fromLat) * progress, lon: fromLon + (toLon - fromLon) * progress };
}

export function updateTrainMarkers(activeTrips, stopsLookup, routesLookup, shapePointsDict) {
    const visibleTrips = activeTrips.filter(t => visibleRoutes.has(t.routeId));
    const activeTripIds = new Set(visibleTrips.map(t => t.tripId));

    for (const id in trainMarkers) {
        if (!activeTripIds.has(id)) {
            map.removeLayer(trainMarkers[id]);
            delete trainMarkers[id];
        }
    }

    visibleTrips.forEach(trip => {
        const a = stopsLookup[trip.fromStop];
        const b = stopsLookup[trip.toStop];
        if (!a || !b) return;

        const pos = getPointOnTrack(trip.shapeId, a.lat, a.lon, b.lat, b.lon, trip.fromDist, trip.toDist, trip.progress, shapePointsDict);
        
        let shortName = routesLookup[trip.routeId] ? (routesLookup[trip.routeId].route_short_name || trip.routeId).toUpperCase().trim() : trip.routeId;
        if (shortName.includes('MARMARAY')) shortName = 'MARMARAY';
        const color = getColor(shortName);

        if (trainMarkers[trip.tripId]) {
            trainMarkers[trip.tripId].setLatLng([pos.lat, pos.lon]);
        } else {
            trainMarkers[trip.tripId] = L.circleMarker([pos.lat, pos.lon], {
                radius: 6, color: '#fff', fillColor: color, fillOpacity: 1, weight: 2
            }).addTo(map).bindTooltip(`<b>${shortName}</b>`);
        }
    });
}