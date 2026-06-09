import { processGTFSData } from './js/gtfs_parser.js';
import { getActiveTrips } from './js/schedules.js';
import { initMap, drawNetwork, updateTrainMarkers, setVisibleRoutes, getColor } from './js/map.js';

async function main() {
    try {
        initMap('map');
        
        const sidebar = document.getElementById('sidebar');
        const toggleBtn = document.getElementById('toggle-btn');
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 400);
        });

        const data = await processGTFSData();
        
        const filtersContainer = document.getElementById('route-filters');
        const searchInput = document.getElementById('route-search');
        const validRouteIds = Object.keys(data.linesData);
        
        const routeGroups = {};

        validRouteIds.forEach(routeId => {
            const route = data.routesLookup[routeId];
            if (!route) return;
            
            let shortName = String(route.route_short_name || route.route_id).toUpperCase().trim();

            if (shortName.includes('MARMARAY')) shortName = 'MARMARAY';
            
            if (!routeGroups[shortName]) {
                routeGroups[shortName] = { ids: [], color: getColor(shortName) };
            }
            routeGroups[shortName].ids.push(routeId);
        });

        const sortedShortNames = Object.keys(routeGroups).sort((a, b) => a.localeCompare(b));
        const filterElements = [];

        sortedShortNames.forEach(shortName => {
             const group = routeGroups[shortName];
             
             const div = document.createElement('div');
             div.className = 'filter-item';
             div.setAttribute('data-name', shortName); 
             
             const checkbox = document.createElement('input');
             checkbox.type = 'checkbox';
             checkbox.value = group.ids.join(','); 
             checkbox.checked = false; 
             checkbox.id = `filter-${shortName}`;
             
             checkbox.addEventListener('change', () => {
                 const checkedRouteIds = [];
                 document.querySelectorAll('#route-filters input:checked').forEach(cb => {
                     checkedRouteIds.push(...cb.value.split(','));
                 });
                 setVisibleRoutes(checkedRouteIds);
             });
             
             const label = document.createElement('label');
             label.htmlFor = `filter-${shortName}`;
             label.innerText = shortName;
             label.style.color = group.color; 
             label.style.fontWeight = 'bold';
             label.style.cursor = 'pointer';
             
             div.appendChild(checkbox);
             div.appendChild(label);
             filtersContainer.appendChild(div);
             filterElements.push(div);
        });

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toUpperCase().trim();
                filterElements.forEach(div => {
                    const name = div.getAttribute('data-name');
                    div.style.display = name.includes(term) ? 'flex' : 'none';
                });
            });
        }

        drawNetwork(data.linesData, data.stopsLookup, data.routesLookup, data.routeStops);

        setInterval(() => {
            const d = new Date();
            let h = d.getHours();
            if (h < 4) h += 24; 
            const nowSecs = h * 3600 + d.getMinutes() * 60 + d.getSeconds();

            const activeTrips = getActiveTrips(data.tripStops, data.tripsLookup, nowSecs);

            updateTrainMarkers(activeTrips, data.stopsLookup, data.routesLookup, data.shapePoints);
            
        }, 33); 

    } catch (error) {
        console.error("Failed to initialize the Metro Tracker:", error);
    }
}

main();