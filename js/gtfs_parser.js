async function loadCSV(path) {
    try {
        const response = await fetch(path);
        if (!response.ok) return [];
        const text = await response.text();
        return Papa.parse(text, { header: true, skipEmptyLines: true }).data;
    } catch (e) {
        return [];
    }
}

function parseCoord(val) { return parseFloat(val); }

function parseTime(t) {
    if (!t) return null;
    const [h, m, s] = t.split(':').map(Number);
    return h * 3600 + m * 60 + s;
}

export async function processGTFSData() {
    const [rawRoutes, rawTrips, rawStops, rawStopTimes, rawShapes, rawFrequencies] = await Promise.all([
        loadCSV('./data/routes.csv'),
        loadCSV('./data/trips.csv'),
        loadCSV('./data/stops.csv'),
        loadCSV('./data/stop_times.csv'),
        loadCSV('./data/shapes.csv'),
        loadCSV('./data/frequencies.csv') 
    ]);

    const railRegex = /^(M\d+[A-Z]?|T\d+|F\d+|B\d+|MARMARAY.*)$/i;
    
    const routes = rawRoutes.filter(r => railRegex.test(String(r.route_short_name || '').toUpperCase().trim()));
    const validRouteIds = new Set(routes.map(r => r.route_id));
    const routesLookup = {};
    routes.forEach(r => routesLookup[r.route_id] = r);

    const trips = rawTrips.filter(t => validRouteIds.has(t.route_id));
    const validTripIds = new Set(trips.map(t => t.trip_id));
    const tripsLookup = {};
    trips.forEach(trip => tripsLookup[trip.trip_id] = trip);

    const tripStops = {};
    const validStopIds = new Set();
    rawStopTimes.forEach(st => {
        if (validTripIds.has(st.trip_id)) {
            if (!tripStops[st.trip_id]) tripStops[st.trip_id] = [];
            tripStops[st.trip_id].push(st);
            validStopIds.add(st.stop_id);
        }
    });

    const stopsLookup = {};
    rawStops.forEach(stop => {
        if (validStopIds.has(stop.stop_id)) {
            stopsLookup[stop.stop_id] = {
                id: stop.stop_id, name: stop.stop_name,
                lat: parseCoord(stop.stop_lat), lon: parseCoord(stop.stop_lon)
            };
        }
    });

    const shapePoints = {};
    if (rawShapes) {
        rawShapes.forEach(pt => {
            const sid = pt.shape_id;
            if (!shapePoints[sid]) shapePoints[sid] = [];
            shapePoints[sid].push({
                seq: +pt.shape_pt_sequence,
                lat: parseCoord(pt.shape_pt_lat),
                lon: parseCoord(pt.shape_pt_lon),
                dist: parseFloat(pt.shape_dist_traveled || 0) 
            });
        });
        for (const sid in shapePoints) shapePoints[sid].sort((a, b) => a.seq - b.seq);
    }

    for (const [tripId, stopsList] of Object.entries(tripStops)) {
        stopsList.sort((a, b) => +a.stop_sequence - +b.stop_sequence);
        let lastIdx = 0;
        for (let i = 0; i < stopsList.length; i++) {
            if (stopsList[i].arrival_time) {
                if (i > lastIdx && stopsList[lastIdx].arrival_time) {
                    const t1 = parseTime(stopsList[lastIdx].departure_time || stopsList[lastIdx].arrival_time);
                    const t2 = parseTime(stopsList[i].arrival_time);
                    const diff = (t2 - t1) / (i - lastIdx);
                    for (let j = lastIdx + 1; j < i; j++) {
                        stopsList[j].computed_time = t1 + diff * (j - lastIdx);
                    }
                }
                stopsList[i].computed_time = parseTime(stopsList[i].arrival_time);
                lastIdx = i;
            }
        }
    }

    if (rawFrequencies && rawFrequencies.length > 0) {
        rawFrequencies.forEach(freq => {
            const tripId = freq.trip_id;
            const templateStops = tripStops[tripId];
            if (!templateStops || templateStops.length === 0) return;

            const startSecs = parseTime(freq.start_time);
            const endSecs = parseTime(freq.end_time);
            const headway = parseInt(freq.headway_secs);

            if (!headway || !startSecs || !endSecs) return;

            const templateStart = templateStops[0].computed_time;
            let currentStart = startSecs;
            let instance = 1;

            while (currentStart < endSecs) {
                const offset = currentStart - templateStart;
                
                if (Math.abs(offset) > 1) {
                    const virtualTripId = `${tripId}_freq_${instance}`;
                    
                    tripStops[virtualTripId] = templateStops.map(st => ({
                        ...st,
                        trip_id: virtualTripId,
                        computed_time: st.computed_time + offset
                    }));
                    
                    if (tripsLookup[tripId]) {
                        tripsLookup[virtualTripId] = { ...tripsLookup[tripId], trip_id: virtualTripId };
                    }
                }
                currentStart += headway;
                instance++;
            }
        });
    }

    const linesData = {};
    const routeStops = {};

    for (const [tripId, stopsList] of Object.entries(tripStops)) {
        const trip = tripsLookup[tripId];
        if (trip) {
            const routeId = trip.route_id;
            const shapeId = trip.shape_id;
            
            if (!linesData[routeId]) linesData[routeId] = {};
            
            if (shapeId && shapePoints[shapeId]) {
                const shapeArr = shapePoints[shapeId].map(p => [p.lat, p.lon]);
                
                const lastStop = stopsList[stopsList.length - 1];
                const lastStopData = stopsLookup[lastStop.stop_id];
                const maxShapeDist = shapePoints[shapeId][shapePoints[shapeId].length - 1].dist;
                

                if (lastStopData && parseFloat(lastStop.shape_dist_traveled || 0) > maxShapeDist + 10) {
                     shapeArr.push([lastStopData.lat, lastStopData.lon]);
                }
                
                linesData[routeId][shapeId] = shapeArr;
            } else {
                linesData[routeId]['fallback'] = stopsList.map(st => {
                    const s = stopsLookup[st.stop_id];
                    return s && s.lat ? [s.lat, s.lon] : null;
                }).filter(Boolean);
            }

            if (!routeStops[routeId]) routeStops[routeId] = new Set();
            stopsList.forEach(st => routeStops[routeId].add(st.stop_id));
        }
    }

    for (const routeId in linesData) linesData[routeId] = Object.values(linesData[routeId]);
    for (const routeId in routeStops) {
        routeStops[routeId] = Array.from(routeStops[routeId]).map(id => stopsLookup[id]).filter(Boolean);
    }

    return { stopsLookup, tripsLookup, tripStops, linesData, routesLookup, routeStops, shapePoints };
}