export function getActiveTrips(tripStops, tripsLookup, nowSecs) {
    const active = [];
    
    for (const [tripId, stopsList] of Object.entries(tripStops)) {
        if (stopsList.length < 2) continue;
        
        const firstTime = stopsList[0].computed_time;
        const lastTime = stopsList[stopsList.length - 1].computed_time;

        if (firstTime && lastTime && nowSecs >= firstTime && nowSecs <= lastTime) {
            for (let i = 0; i < stopsList.length - 1; i++) {
                const tA = stopsList[i].computed_time;
                const tB = stopsList[i + 1].computed_time;
                
                if (tA && tB && nowSecs >= tA && nowSecs <= tB) {
                    const progress = tA === tB ? 0 : (nowSecs - tA) / (tB - tA);
                    
                    active.push({
                        tripId,
                        routeId: tripsLookup[tripId] ? tripsLookup[tripId].route_id : 'Unknown',
                        shapeId: tripsLookup[tripId] ? tripsLookup[tripId].shape_id : null,
                        fromStop: stopsList[i].stop_id,
                        toStop: stopsList[i + 1].stop_id,
                        fromDist: parseFloat(stopsList[i].shape_dist_traveled || 0),
                        toDist: parseFloat(stopsList[i + 1].shape_dist_traveled || 0),
                        progress
                    });
                    break;
                }
            }
        }
    }
    return active;
}