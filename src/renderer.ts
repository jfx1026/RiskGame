/**
 * SVG Renderer for hexagonal map
 * Renders territories with proper grouping and accessibility features
 */

import { Hex, hexToPixel, hexCorners, cornersToSvgPoints, getHexBounds, HEX_SIZE, parseHexKey, hexKey, hexNeighbors } from './hex.js';
import { Territory, getTerritoryHexes } from './territory.js';
import { GeneratedMap } from './mapGenerator.js';
import { CombatResult } from './combat.js';

interface Point {
    x: number;
    y: number;
}

export interface RenderOptions {
    hexSize: number;
    padding: number;
    showLabels: boolean;
    hexScale: number;  // Scale factor for hex size (1.0 = no gap, 0.95 = small gap)
}

const DEFAULT_OPTIONS: RenderOptions = {
    hexSize: HEX_SIZE,
    padding: 40,
    showLabels: false,
    hexScale: 1.0,  // No gap between hexes in same territory
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
            const emptyHex = renderEmptyHex(hex, hexSize);
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
    group.setAttribute('aria-label', `${territory.name}, ${territory.hexes.size} hexes, ${territory.armies} armies`);

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

    // Draw army dots
    if (territory.armyHex && territory.armies > 0) {
        const armyGroup = renderArmyDots(territory, hexSize);
        group.appendChild(armyGroup);
    }

    return group;
}

/**
 * Render army dots for a territory
 * Shows filled dots for armies and empty (grey) dots for remaining capacity
 * Dots are arranged in rows, centered on the army display hex
 */
function renderArmyDots(territory: Territory, hexSize: number): SVGGElement {
    const group = createSvgElement('g') as SVGGElement;
    group.setAttribute('class', 'army-dots');

    if (!territory.armyHex) return group;

    const hex = parseHexKey(territory.armyHex);
    const center = hexToPixel(hex, hexSize);
    const armies = territory.armies;
    const maxCapacity = territory.type === 'big' ? 10 : 7;

    // Dot configuration
    const dotRadius = hexSize * 0.12;
    const dotSpacing = dotRadius * 2.5;

    // Arrange dots in rows (max 5 per row) - use max capacity for layout
    const dotsPerRow = 5;
    const rows: number[] = [];
    let remaining = maxCapacity;

    while (remaining > 0) {
        const dotsInThisRow = Math.min(remaining, dotsPerRow);
        rows.push(dotsInThisRow);
        remaining -= dotsInThisRow;
    }

    // Calculate total height to center vertically
    const totalHeight = (rows.length - 1) * dotSpacing;
    const startY = center.y - totalHeight / 2;

    // Draw dots - track how many filled dots we've drawn
    let filledCount = 0;

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const dotsInRow = rows[rowIndex];
        const rowWidth = (dotsInRow - 1) * dotSpacing;
        const startX = center.x - rowWidth / 2;
        const y = startY + rowIndex * dotSpacing;

        for (let dotIndex = 0; dotIndex < dotsInRow; dotIndex++) {
            const x = startX + dotIndex * dotSpacing;
            const isFilled = filledCount < armies;

            // Create dot
            const dot = createSvgElement('circle');
            dot.setAttribute('class', isFilled ? 'army-dot' : 'army-dot army-dot-empty');
            dot.setAttribute('cx', String(x));
            dot.setAttribute('cy', String(y));
            dot.setAttribute('r', String(dotRadius));

            if (isFilled) {
                // Filled dots: colors from design tokens (CSS .army-dot)
            } else {
                // Empty dots: handled by CSS (.army-dot-empty)
                dot.setAttribute('fill', 'none');
            }

            group.appendChild(dot);
            filledCount++;
        }
    }

    return group;
}

/**
 * Create a path element for the territory boundary
 * Only draws edges that are NOT shared with another hex in the same territory
 */
function createTerritoryBoundary(
    hexes: Hex[],
    hexKeySet: Set<string>,
    hexSize: number
): SVGPathElement | null {
    const boundaryEdges: [Point, Point][] = [];

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

    if (boundaryEdges.length === 0) return null;

    // Create path data from edges
    const pathData = boundaryEdges
        .map(([p1, p2]) => `M${p1.x.toFixed(2)},${p1.y.toFixed(2)} L${p2.x.toFixed(2)},${p2.y.toFixed(2)}`)
        .join(' ');

    const path = createSvgElement('path') as SVGPathElement;
    path.setAttribute('class', 'territory-border');
    path.setAttribute('d', pathData);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');

    return path;
}

/**
 * Render an empty/impassable hex (fill from CSS token --color-map-empty-hex)
 */
function renderEmptyHex(hex: Hex, hexSize: number): SVGPolygonElement {
    const center = hexToPixel(hex, hexSize);
    const corners = hexCorners(center, hexSize);
    const points = cornersToSvgPoints(corners);

    const polygon = createSvgElement('polygon') as SVGPolygonElement;
    polygon.setAttribute('class', 'hex hex-empty');
    polygon.setAttribute('points', points);
    polygon.setAttribute('data-hex-q', String(hex.q));
    polygon.setAttribute('data-hex-r', String(hex.r));
    polygon.setAttribute('aria-label', `Empty tile at ${hex.q}, ${hex.r}`);

    return polygon;
}

/**
 * Render a single hex as an SVG polygon (fill only, no stroke)
 */
function renderHex(hex: Hex, territory: Territory, hexSize: number): SVGPolygonElement {
    const center = hexToPixel(hex, hexSize);
    const corners = hexCorners(center, hexSize);
    const points = cornersToSvgPoints(corners);

    const polygon = createSvgElement('polygon') as SVGPolygonElement;
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
export function addClickHandlers(
    svgElement: SVGSVGElement,
    territories: Territory[],
    handler: HexClickHandler
): void {
    const hexes = svgElement.querySelectorAll('.hex:not(.hex-empty)');

    hexes.forEach(hexElement => {
        const handleEvent = (event: Event) => {
            const polygon = event.target as SVGPolygonElement;
            const q = parseInt(polygon.getAttribute('data-hex-q') || '0', 10);
            const r = parseInt(polygon.getAttribute('data-hex-r') || '0', 10);
            const territoryId = parseInt(polygon.getAttribute('data-territory-id') || '0', 10);

            const territory = territories.find(t => t.id === territoryId);
            if (territory) {
                // Select this territory
                selectTerritory(svgElement, territoryId);
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
    // Note: Background click handling for deselection is handled by main.ts
    // to avoid listener accumulation when new maps are generated
}

/**
 * Select a territory - adds 'selected' class and brings to top
 */
export function selectTerritory(svgElement: SVGSVGElement, territoryId: number): void {
    // Remove selection from all territories
    deselectAll(svgElement);

    // Find and select the target territory
    const group = svgElement.querySelector(
        `.territory-group[data-territory-id="${territoryId}"]`
    );
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
export function deselectAll(svgElement: SVGSVGElement): void {
    const groups = svgElement.querySelectorAll('.territory-group');
    groups.forEach(group => {
        group.classList.remove('selected');
    });
}

/**
 * Add hover handlers to territories (for tooltip display)
 */
export function addHoverHandlers(
    svgElement: SVGSVGElement,
    territories: Territory[],
    handler: TerritoryHoverHandler
): void {
    const hexes = svgElement.querySelectorAll('.hex:not(.hex-empty)');
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

// ============================================================
// COMBAT SYSTEM RENDERING
// ============================================================

/**
 * Highlight valid attack targets for a selected territory
 */
export function highlightValidTargets(
    svgElement: SVGSVGElement,
    targetIds: number[]
): void {
    // First clear any existing highlights
    clearHighlights(svgElement);

    // Add 'valid-target' class to target territories
    for (const targetId of targetIds) {
        const group = svgElement.querySelector(
            `.territory-group[data-territory-id="${targetId}"]`
        );
        if (group) {
            group.classList.add('valid-target');
        }
    }
}

/**
 * Clear all target highlights
 */
export function clearHighlights(svgElement: SVGSVGElement): void {
    const groups = svgElement.querySelectorAll('.territory-group');
    groups.forEach(group => {
        group.classList.remove('valid-target');
        group.classList.remove('combat-flash');
    });
}

/**
 * Show combat animation on territories
 * Returns a promise that resolves when the animation is complete
 */
export function showCombatAnimation(
    svgElement: SVGSVGElement,
    result: CombatResult,
    sourceId: number,
    targetId: number
): Promise<void> {
    return new Promise(resolve => {
        const sourceGroup = svgElement.querySelector(
            `.territory-group[data-territory-id="${sourceId}"]`
        );
        const targetGroup = svgElement.querySelector(
            `.territory-group[data-territory-id="${targetId}"]`
        );

        // Add combat animation class
        if (sourceGroup) {
            sourceGroup.classList.add('combat-flash');
        }
        if (targetGroup) {
            targetGroup.classList.add('combat-flash');
        }

        // Remove classes after animation
        setTimeout(() => {
            if (sourceGroup) {
                sourceGroup.classList.remove('combat-flash');
            }
            if (targetGroup) {
                targetGroup.classList.remove('combat-flash');
            }
            resolve();
        }, 500);
    });
}

/**
 * Update the display of a single territory (army count, color)
 * Used after combat to reflect changes
 */
export function updateTerritoryDisplay(
    svgElement: SVGSVGElement,
    territory: Territory,
    hexSize: number = HEX_SIZE
): void {
    const group = svgElement.querySelector(
        `.territory-group[data-territory-id="${territory.id}"]`
    ) as SVGGElement | null;

    if (!group) return;

    // Update hex colors
    const hexElements = group.querySelectorAll('.hex');
    hexElements.forEach(hex => {
        hex.setAttribute('fill', territory.color);
    });

    // Update army dots
    const existingArmyGroup = group.querySelector('.army-dots');
    if (existingArmyGroup) {
        group.removeChild(existingArmyGroup);
    }

    // Re-render army dots
    if (territory.armyHex && territory.armies > 0) {
        const armyGroup = renderArmyDots(territory, hexSize);
        group.appendChild(armyGroup);
    }

    // Update ARIA label
    group.setAttribute('aria-label', `${territory.name}, ${territory.hexes.size} hexes, ${territory.armies} armies`);
}

/**
 * Mark a territory as belonging to the current player (visual indicator)
 */
export function markCurrentPlayerTerritories(
    svgElement: SVGSVGElement,
    territoryIds: number[]
): void {
    // Remove existing current-player markers
    const groups = svgElement.querySelectorAll('.territory-group');
    groups.forEach(group => {
        group.classList.remove('current-player');
    });

    // Add current-player class to the current player's territories
    for (const id of territoryIds) {
        const group = svgElement.querySelector(
            `.territory-group[data-territory-id="${id}"]`
        );
        if (group) {
            group.classList.add('current-player');
        }
    }
}
