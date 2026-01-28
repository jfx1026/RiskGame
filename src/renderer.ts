/**
 * SVG Renderer for hexagonal map
 * Renders territories with proper grouping and accessibility features
 */

import { Hex, hexToPixel, hexCorners, cornersToSvgPoints, getHexBounds, HEX_SIZE, parseHexKey } from './hex.js';
import { Territory, getTerritoryHexes } from './territory.js';
import { GeneratedMap } from './mapGenerator.js';

export interface RenderOptions {
    hexSize: number;
    padding: number;
    showLabels: boolean;
    emptyTileColor: string;
}

const DEFAULT_OPTIONS: RenderOptions = {
    hexSize: HEX_SIZE,
    padding: 40,
    showLabels: false,
    emptyTileColor: '#2a3a4a',  // Dark blue-gray for empty/water tiles
};

export type HexClickHandler = (territory: Territory, hex: Hex, event: MouseEvent) => void;
export type TerritoryHoverHandler = (territory: Territory | null, event: MouseEvent) => void;

/**
 * Render the map to an SVG element
 */
export function renderMap(
    svgElement: SVGSVGElement,
    map: GeneratedMap,
    options: Partial<RenderOptions> = {}
): void {
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
function renderTerritory(territory: Territory, hexSize: number): SVGGElement {
    const group = createSvgElement('g') as SVGGElement;
    group.setAttribute('class', 'territory-group');
    group.setAttribute('data-territory-id', String(territory.id));
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', `${territory.name}, ${territory.hexes.size} hexes`);

    const hexes = getTerritoryHexes(territory);

    for (const hex of hexes) {
        const hexElement = renderHex(hex, territory, hexSize);
        group.appendChild(hexElement);
    }

    return group;
}

/**
 * Render an empty/impassable hex
 */
function renderEmptyHex(hex: Hex, hexSize: number, color: string): SVGPolygonElement {
    const center = hexToPixel(hex, hexSize);
    const corners = hexCorners(center, hexSize * 0.95);
    const points = cornersToSvgPoints(corners);

    const polygon = createSvgElement('polygon') as SVGPolygonElement;
    polygon.setAttribute('class', 'hex hex-empty');
    polygon.setAttribute('points', points);
    polygon.setAttribute('fill', color);
    polygon.setAttribute('data-hex-q', String(hex.q));
    polygon.setAttribute('data-hex-r', String(hex.r));
    polygon.setAttribute('aria-label', `Empty tile at ${hex.q}, ${hex.r}`);

    return polygon;
}

/**
 * Render a single hex as an SVG polygon
 */
function renderHex(hex: Hex, territory: Territory, hexSize: number): SVGPolygonElement {
    const center = hexToPixel(hex, hexSize);
    const corners = hexCorners(center, hexSize * 0.95); // Slight gap between hexes
    const points = cornersToSvgPoints(corners);

    const polygon = createSvgElement('polygon') as SVGPolygonElement;
    polygon.setAttribute('class', 'hex');
    polygon.setAttribute('points', points);
    polygon.setAttribute('fill', territory.color);
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
 * Add click handlers to hexes
 */
export function addClickHandlers(
    svgElement: SVGSVGElement,
    territories: Territory[],
    handler: HexClickHandler
): void {
    const hexes = svgElement.querySelectorAll('.hex');

    hexes.forEach(hexElement => {
        const handleEvent = (event: Event) => {
            const polygon = event.target as SVGPolygonElement;
            const q = parseInt(polygon.getAttribute('data-hex-q') || '0', 10);
            const r = parseInt(polygon.getAttribute('data-hex-r') || '0', 10);
            const territoryId = parseInt(polygon.getAttribute('data-territory-id') || '0', 10);

            const territory = territories.find(t => t.id === territoryId);
            if (territory) {
                handler(territory, { q, r }, event as MouseEvent);
            }
        };

        hexElement.addEventListener('click', handleEvent);
        hexElement.addEventListener('keydown', (event: Event) => {
            const keyEvent = event as KeyboardEvent;
            if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                keyEvent.preventDefault();
                handleEvent(event);
            }
        });
    });
}

/**
 * Add hover handlers to territories
 */
export function addHoverHandlers(
    svgElement: SVGSVGElement,
    territories: Territory[],
    handler: TerritoryHoverHandler
): void {
    const hexes = svgElement.querySelectorAll('.hex');
    let currentTerritoryId: number | null = null;

    hexes.forEach(hexElement => {
        hexElement.addEventListener('mouseenter', (event) => {
            const polygon = event.target as SVGPolygonElement;
            const territoryId = parseInt(polygon.getAttribute('data-territory-id') || '0', 10);

            if (territoryId !== currentTerritoryId) {
                currentTerritoryId = territoryId;
                const territory = territories.find(t => t.id === territoryId);
                if (territory) {
                    handler(territory, event as MouseEvent);
                }
            }
        });
    });

    svgElement.addEventListener('mouseleave', (event) => {
        currentTerritoryId = null;
        handler(null, event as MouseEvent);
    });
}

/**
 * Highlight a territory
 */
export function highlightTerritory(
    svgElement: SVGSVGElement,
    territoryId: number | null
): void {
    // Remove existing highlights
    const groups = svgElement.querySelectorAll('.territory-group');
    groups.forEach(group => {
        group.classList.remove('highlighted');
    });

    if (territoryId !== null) {
        const targetGroup = svgElement.querySelector(
            `.territory-group[data-territory-id="${territoryId}"]`
        );
        if (targetGroup) {
            targetGroup.classList.add('highlighted');
        }
    }
}

/**
 * Helper to create SVG elements with proper namespace
 */
function createSvgElement(tagName: string): SVGElement {
    return document.createElementNS('http://www.w3.org/2000/svg', tagName);
}
