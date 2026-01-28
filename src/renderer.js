/**
 * SVG Renderer for hexagonal map
 * Renders territories with proper grouping and accessibility features
 */
import { hexToPixel, hexCorners, cornersToSvgPoints, getHexBounds, HEX_SIZE, parseHexKey, hexKey, hexNeighbors } from './hex.js';
import { getTerritoryHexes } from './territory.js';
const DEFAULT_OPTIONS = {
    hexSize: HEX_SIZE,
    padding: 40,
    showLabels: false,
    emptyTileColor: '#0f0f1a', // Match background for invisible empty tiles
    hexScale: 1.0, // No gap between hexes in same territory
};
/**
 * Render the map to an SVG element
 */
export function renderMap(svgElement, map, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const { hexSize, padding } = opts;
    // Clear existing content
    svgElement.innerHTML = '';
    // Calculate bounds for all hexes
    const bounds = getHexBounds(map.allHexes, hexSize);
    // Set SVG viewBox with padding
    const viewBoxWidth = bounds.width + padding * 2;
    const viewBoxHeight = bounds.height + padding * 2;
    const offsetX = -bounds.minX + padding;
    const offsetY = -bounds.minY + padding;
    svgElement.setAttribute('viewBox', `0 0 ${viewBoxWidth} ${viewBoxHeight}`);
    svgElement.setAttribute('width', String(Math.min(viewBoxWidth, 900)));
    svgElement.setAttribute('height', String(Math.min(viewBoxHeight, 600)));
    // Create defs for any gradients/filters
    const defs = createSvgElement('defs');
    svgElement.appendChild(defs);
    // Add drop shadow filter
    const filter = createSvgElement('filter');
    filter.setAttribute('id', 'hex-shadow');
    filter.innerHTML = `
        <feDropShadow dx="1" dy="1" stdDeviation="1" flood-opacity="0.3"/>
    `;
    defs.appendChild(filter);
    // Create main group with offset transform
    const mainGroup = createSvgElement('g');
    mainGroup.setAttribute('transform', `translate(${offsetX}, ${offsetY})`);
    svgElement.appendChild(mainGroup);
    // Render empty tiles first (behind territories)
    if (map.emptyHexes && map.emptyHexes.size > 0) {
        const emptyGroup = createSvgElement('g');
        emptyGroup.setAttribute('class', 'empty-tiles');
        emptyGroup.setAttribute('aria-label', 'Empty tiles');
        for (const hexKeyStr of map.emptyHexes) {
            const hex = parseHexKey(hexKeyStr);
            const emptyHex = renderEmptyHex(hex, hexSize, opts.emptyTileColor);
            emptyGroup.appendChild(emptyHex);
        }
        mainGroup.appendChild(emptyGroup);
    }
    // Render each territory as a group
    for (const territory of map.territories) {
        const territoryGroup = renderTerritory(territory, hexSize);
        mainGroup.appendChild(territoryGroup);
    }
}
/**
 * Render a single territory as an SVG group
 */
function renderTerritory(territory, hexSize) {
    const group = createSvgElement('g');
    group.setAttribute('class', 'territory-group');
    group.setAttribute('data-territory-id', String(territory.id));
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', `${territory.name}, ${territory.hexes.size} hexes`);
    const hexes = getTerritoryHexes(territory);
    const hexKeySet = new Set(Array.from(territory.hexes));
    // Draw filled hexes (no stroke)
    for (const hex of hexes) {
        const hexElement = renderHex(hex, territory, hexSize);
        group.appendChild(hexElement);
    }
    // Draw territory boundary
    const boundaryPath = createTerritoryBoundary(hexes, hexKeySet, hexSize);
    if (boundaryPath) {
        group.appendChild(boundaryPath);
    }
    return group;
}
/**
 * Create a path element for the territory boundary
 * Only draws edges that are NOT shared with another hex in the same territory
 */
function createTerritoryBoundary(hexes, hexKeySet, hexSize) {
    const boundaryEdges = [];
    // Mapping from edge index to neighbor direction index
    // For pointy-top hexes:
    // - Edge 0 (corners 0→1, right side) → Neighbor direction 0 (East)
    // - Edge 1 (corners 1→2, bottom-right) → Neighbor direction 5 (Southeast)
    // - Edge 2 (corners 2→3, bottom-left) → Neighbor direction 4 (Southwest)
    // - Edge 3 (corners 3→4, left side) → Neighbor direction 3 (West)
    // - Edge 4 (corners 4→5, top-left) → Neighbor direction 2 (Northwest)
    // - Edge 5 (corners 5→0, top-right) → Neighbor direction 1 (Northeast)
    const edgeToNeighbor = [0, 5, 4, 3, 2, 1];
    // For each hex, check which edges are on the boundary
    for (const hex of hexes) {
        const center = hexToPixel(hex, hexSize);
        const corners = hexCorners(center, hexSize);
        const neighbors = hexNeighbors(hex);
        // Check each of the 6 edges
        for (let edgeIndex = 0; edgeIndex < 6; edgeIndex++) {
            const neighborDirIndex = edgeToNeighbor[edgeIndex];
            const neighborKey = hexKey(neighbors[neighborDirIndex]);
            // If neighbor is not in this territory, this edge is a boundary
            if (!hexKeySet.has(neighborKey)) {
                const p1 = corners[edgeIndex];
                const p2 = corners[(edgeIndex + 1) % 6];
                boundaryEdges.push([p1, p2]);
            }
        }
    }
    if (boundaryEdges.length === 0)
        return null;
    // Create path data from edges
    const pathData = boundaryEdges
        .map(([p1, p2]) => `M${p1.x.toFixed(2)},${p1.y.toFixed(2)} L${p2.x.toFixed(2)},${p2.y.toFixed(2)}`)
        .join(' ');
    const path = createSvgElement('path');
    path.setAttribute('class', 'territory-border');
    path.setAttribute('d', pathData);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#1a1a2e');
    path.setAttribute('stroke-width', '3');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    return path;
}
/**
 * Render an empty/impassable hex
 */
function renderEmptyHex(hex, hexSize, color) {
    const center = hexToPixel(hex, hexSize);
    const corners = hexCorners(center, hexSize);
    const points = cornersToSvgPoints(corners);
    const polygon = createSvgElement('polygon');
    polygon.setAttribute('class', 'hex hex-empty');
    polygon.setAttribute('points', points);
    polygon.setAttribute('fill', color);
    polygon.setAttribute('data-hex-q', String(hex.q));
    polygon.setAttribute('data-hex-r', String(hex.r));
    polygon.setAttribute('aria-label', `Empty tile at ${hex.q}, ${hex.r}`);
    return polygon;
}
/**
 * Render a single hex as an SVG polygon (fill only, no stroke)
 */
function renderHex(hex, territory, hexSize) {
    const center = hexToPixel(hex, hexSize);
    const corners = hexCorners(center, hexSize);
    const points = cornersToSvgPoints(corners);
    const polygon = createSvgElement('polygon');
    polygon.setAttribute('class', 'hex');
    polygon.setAttribute('points', points);
    polygon.setAttribute('fill', territory.color);
    polygon.setAttribute('stroke', 'none');
    polygon.setAttribute('data-hex-q', String(hex.q));
    polygon.setAttribute('data-hex-r', String(hex.r));
    polygon.setAttribute('data-territory-id', String(territory.id));
    // Accessibility
    polygon.setAttribute('tabindex', '0');
    polygon.setAttribute('role', 'button');
    polygon.setAttribute('aria-label', `Hex at ${hex.q}, ${hex.r} in ${territory.name}`);
    return polygon;
}
/**
 * Add click handlers to hexes with selection support
 */
export function addClickHandlers(svgElement, territories, handler) {
    const hexes = svgElement.querySelectorAll('.hex:not(.hex-empty)');
    hexes.forEach(hexElement => {
        const handleEvent = (event) => {
            const polygon = event.target;
            const q = parseInt(polygon.getAttribute('data-hex-q') || '0', 10);
            const r = parseInt(polygon.getAttribute('data-hex-r') || '0', 10);
            const territoryId = parseInt(polygon.getAttribute('data-territory-id') || '0', 10);
            const territory = territories.find(t => t.id === territoryId);
            if (territory) {
                // Select this territory
                selectTerritory(svgElement, territoryId);
                handler(territory, { q, r }, event);
            }
        };
        hexElement.addEventListener('click', handleEvent);
        hexElement.addEventListener('keydown', (event) => {
            const keyEvent = event;
            if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                keyEvent.preventDefault();
                handleEvent(event);
            }
        });
    });
    // Click on empty space or empty hex deselects
    svgElement.addEventListener('click', (event) => {
        const target = event.target;
        if (target === svgElement || target.classList.contains('hex-empty')) {
            deselectAll(svgElement);
        }
    });
}
/**
 * Select a territory - adds 'selected' class and brings to top
 */
export function selectTerritory(svgElement, territoryId) {
    // Remove selection from all territories
    deselectAll(svgElement);
    // Find and select the target territory
    const group = svgElement.querySelector(`.territory-group[data-territory-id="${territoryId}"]`);
    if (group) {
        group.classList.add('selected');
        // Bring to top
        if (group.parentNode) {
            group.parentNode.appendChild(group);
        }
    }
}
/**
 * Deselect all territories
 */
export function deselectAll(svgElement) {
    const groups = svgElement.querySelectorAll('.territory-group');
    groups.forEach(group => {
        group.classList.remove('selected');
    });
}
/**
 * Add hover handlers to territories (for tooltip display)
 */
export function addHoverHandlers(svgElement, territories, handler) {
    const hexes = svgElement.querySelectorAll('.hex:not(.hex-empty)');
    let currentTerritoryId = null;
    hexes.forEach(hexElement => {
        hexElement.addEventListener('mouseenter', (event) => {
            const polygon = event.target;
            const territoryId = parseInt(polygon.getAttribute('data-territory-id') || '0', 10);
            if (territoryId !== currentTerritoryId) {
                currentTerritoryId = territoryId;
                const territory = territories.find(t => t.id === territoryId);
                if (territory) {
                    handler(territory, event);
                }
            }
        });
    });
    svgElement.addEventListener('mouseleave', (event) => {
        currentTerritoryId = null;
        handler(null, event);
    });
}
/**
 * Highlight a territory
 */
export function highlightTerritory(svgElement, territoryId) {
    // Remove existing highlights
    const groups = svgElement.querySelectorAll('.territory-group');
    groups.forEach(group => {
        group.classList.remove('highlighted');
    });
    if (territoryId !== null) {
        const targetGroup = svgElement.querySelector(`.territory-group[data-territory-id="${territoryId}"]`);
        if (targetGroup) {
            targetGroup.classList.add('highlighted');
        }
    }
}
/**
 * Helper to create SVG elements with proper namespace
 */
function createSvgElement(tagName) {
    return document.createElementNS('http://www.w3.org/2000/svg', tagName);
}
//# sourceMappingURL=renderer.js.map