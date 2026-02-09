/**
 * SVG Renderer for hexagonal map
 * Renders territories with proper grouping and accessibility features
 */

import { Hex, hexToPixel, hexCorners, cornersToSvgPoints, getHexBounds, HEX_SIZE, parseHexKey, hexKey, hexNeighbors } from './hex.js';
import { Territory, getTerritoryHexes } from './territory.js';
import { GeneratedMap } from './mapGenerator.js';
import { BASE_TILE, OVER_CONNECTORS, UNDER_CONNECTORS, STROKE_CONNECTORS, TILE_VIEWBOX_SIZE, DIRECTION_NAMES, Direction } from './tilePaths.js';
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
 * Calculate the scale factor to map tile viewBox to hex size
 */
function getTileScale(hexSize: number): number {
    // The tile viewBox is 118.58, and the hex inside spans roughly 72 units wide
    // For a pointy-top hex, width = sqrt(3) * size ≈ 1.732 * size
    // We want the tile hex to match our hex size
    const tileHexWidth = 72; // approximate width of hex in tile viewBox
    const targetHexWidth = Math.sqrt(3) * hexSize;
    return targetHexWidth / tileHexWidth;
}

/**
 * Create a path element with color replacement
 */
function createColoredPath(
    pathData: string,
    fillColor: string,
    className: string
): SVGPathElement {
    const path = createSvgElement('path') as SVGPathElement;
    path.setAttribute('d', pathData);
    path.setAttribute('fill', fillColor);
    path.setAttribute('class', className);
    return path;
}

/**
 * Render a single territory as an SVG group using tile-based approach
 */
function renderTerritory(territory: Territory, hexSize: number): SVGGElement {
    const group = createSvgElement('g') as SVGGElement;
    group.setAttribute('class', 'territory-group');
    group.setAttribute('data-territory-id', String(territory.id));
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', `${territory.name}, ${territory.hexes.size} hexes, ${territory.armies} armies`);

    const hexes = getTerritoryHexes(territory);
    const hexKeySet = new Set(Array.from(territory.hexes));

    // Calculate scale and offset for tiles
    const scale = getTileScale(hexSize);
    const tileCenter = TILE_VIEWBOX_SIZE / 2;

    // Colors
    const fillColor = territory.color;
    const strokeColor = lightenColor(territory.color, 0.4);

    // Layer 1: UNDER connectors (per hex, for each direction with same-territory neighbor)
    for (const hex of hexes) {
        const center = hexToPixel(hex, hexSize);
        const neighbors = hexNeighbors(hex);

        for (let i = 0; i < 6; i++) {
            const neighborKey = hexKey(neighbors[i]);
            // Draw under connector if neighbor is in same territory
            if (hexKeySet.has(neighborKey)) {
                const direction = DIRECTION_NAMES[i];
                const underPaths = UNDER_CONNECTORS[direction];
                if (underPaths) {
                    const connectorGroup = createSvgElement('g');
                    connectorGroup.setAttribute('transform',
                        `translate(${center.x}, ${center.y}) scale(${scale}) translate(${-tileCenter}, ${-tileCenter})`);

                    for (const pathData of underPaths) {
                        const path = createColoredPath(pathData, fillColor, 'tile-under');
                        connectorGroup.appendChild(path);
                    }
                    group.appendChild(connectorGroup);
                }
            }
        }
    }

    // Layer 2: BASE tiles (for each hex)
    for (const hex of hexes) {
        const center = hexToPixel(hex, hexSize);
        const neighbors = hexNeighbors(hex);

        // Check if this hex is on the boundary
        let isBoundaryHex = false;
        for (let i = 0; i < 6; i++) {
            if (!hexKeySet.has(hexKey(neighbors[i]))) {
                isBoundaryHex = true;
                break;
            }
        }

        const tileGroup = createSvgElement('g');
        tileGroup.setAttribute('transform',
            `translate(${center.x}, ${center.y}) scale(${scale}) translate(${-tileCenter}, ${-tileCenter})`);

        // Base fill
        const fillPath = createColoredPath(BASE_TILE.fill, fillColor, 'hex tile-base');
        fillPath.setAttribute('data-territory-id', String(territory.id));
        fillPath.setAttribute('data-hex-q', String(hex.q));
        fillPath.setAttribute('data-hex-r', String(hex.r));
        fillPath.setAttribute('tabindex', '0');
        fillPath.setAttribute('role', 'button');
        fillPath.setAttribute('aria-label', `Hex in ${territory.name}`);
        tileGroup.appendChild(fillPath);

        // Inner stroke ring - only for boundary hexes
        if (isBoundaryHex) {
            const strokePath = createColoredPath(BASE_TILE.stroke, strokeColor, 'tile-stroke');
            strokePath.setAttribute('pointer-events', 'none');
            tileGroup.appendChild(strokePath);
        }

        group.appendChild(tileGroup);
    }

    // Layer 3: OVER connectors (per hex, for each direction with same-territory neighbor)
    for (const hex of hexes) {
        const center = hexToPixel(hex, hexSize);
        const neighbors = hexNeighbors(hex);

        for (let i = 0; i < 6; i++) {
            const neighborKey = hexKey(neighbors[i]);
            // Draw over connector if neighbor is in same territory
            if (hexKeySet.has(neighborKey)) {
                const direction = DIRECTION_NAMES[i];
                const overPath = OVER_CONNECTORS[direction];
                if (overPath) {
                    const connectorGroup = createSvgElement('g');
                    connectorGroup.setAttribute('transform',
                        `translate(${center.x}, ${center.y}) scale(${scale}) translate(${-tileCenter}, ${-tileCenter})`);

                    const path = createColoredPath(overPath, fillColor, 'tile-over');
                    connectorGroup.appendChild(path);
                    group.appendChild(connectorGroup);
                }
            }
        }
    }

    // Layer 4: STROKE connectors (only at outer corners where territory meets empty space)
    // Each STROKE_CONNECTORS[direction] has 2 paths: [0] for prev corner, [1] for next corner
    // Draw path[0] only if prev direction (i-1) is empty
    // Draw path[1] only if next direction (i+1) is empty
    for (const hex of hexes) {
        const center = hexToPixel(hex, hexSize);
        const neighbors = hexNeighbors(hex);

        for (let i = 0; i < 6; i++) {
            const neighborKey = hexKey(neighbors[i]);
            // Must have a same-territory neighbor in this direction
            if (!hexKeySet.has(neighborKey)) continue;

            // Check adjacent directions for empty space
            const prevDir = (i + 5) % 6; // i - 1, wrapping
            const nextDir = (i + 1) % 6;
            const prevNeighborInTerritory = hexKeySet.has(hexKey(neighbors[prevDir]));
            const nextNeighborInTerritory = hexKeySet.has(hexKey(neighbors[nextDir]));

            const direction = DIRECTION_NAMES[i];
            const strokePaths = STROKE_CONNECTORS[direction];
            if (!strokePaths || strokePaths.length < 2) continue;

            const connectorGroup = createSvgElement('g');
            connectorGroup.setAttribute('transform',
                `translate(${center.x}, ${center.y}) scale(${scale}) translate(${-tileCenter}, ${-tileCenter})`);

            let hasPath = false;

            // Draw first path only if next direction is empty (outer corner on that side)
            if (!nextNeighborInTerritory) {
                const path = createColoredPath(strokePaths[0], strokeColor, 'tile-connector-stroke');
                path.setAttribute('pointer-events', 'none');
                connectorGroup.appendChild(path);
                hasPath = true;
            }

            // Draw second path only if prev direction is empty (outer corner on that side)
            if (!prevNeighborInTerritory) {
                const path = createColoredPath(strokePaths[1], strokeColor, 'tile-connector-stroke');
                path.setAttribute('pointer-events', 'none');
                connectorGroup.appendChild(path);
                hasPath = true;
            }

            if (hasPath) {
                group.appendChild(connectorGroup);
            }
        }
    }

    // Layer 5: Army dots
    if (territory.armyHex && territory.armies > 0) {
        const armyHex = parseHexKey(territory.armyHex);
        const armyCenter = hexToPixel(armyHex, hexSize);
        const armyGroup = renderArmyDotsAtPoint(territory, armyCenter, hexSize);
        group.appendChild(armyGroup);
    }

    return group;
}

/**
 * Render army dots at a specific center point
 * Shows filled dots for armies and empty (grey) dots for remaining capacity
 * Dots are arranged in 2 columns (compact 2x3 grid)
 * Uses 3D shadow effect for visual depth
 */
function renderArmyDotsAtPoint(territory: Territory, center: Point, hexSize: number): SVGGElement {
    const group = createSvgElement('g') as SVGGElement;
    group.setAttribute('class', 'army-dots');

    const armies = territory.armies;
    const maxCapacity = territory.type === 'big' ? 10 : 7;

    // Dot configuration - 2 columns (compact grid)
    const dotRadius = hexSize * 0.14;
    const dotSpacingX = dotRadius * 2.6;
    const dotSpacingY = dotRadius * 2.2;

    // Calculate grid: 2 columns, fill row by row
    const cols = 2;
    const totalDots = maxCapacity;
    const fullRows = Math.floor(totalDots / cols);
    const lastRowDots = totalDots % cols;
    const totalRows = fullRows + (lastRowDots > 0 ? 1 : 0);

    // Calculate total height to center vertically
    const totalHeight = (totalRows - 1) * dotSpacingY;
    const startY = center.y - totalHeight / 2;

    // Draw dots
    let dotIndex = 0;

    for (let row = 0; row < totalRows; row++) {
        const dotsInThisRow = (row < fullRows) ? cols : lastRowDots;
        const rowWidth = (dotsInThisRow - 1) * dotSpacingX;
        const startX = center.x - rowWidth / 2;
        const y = startY + row * dotSpacingY;

        for (let col = 0; col < dotsInThisRow; col++) {
            const x = startX + col * dotSpacingX;
            const isFilled = dotIndex < armies;

            if (isFilled) {
                // Create shadow (offset dark circle)
                const shadow = createSvgElement('circle');
                shadow.setAttribute('class', 'army-dot-shadow');
                shadow.setAttribute('cx', String(x + dotRadius * 0.15));
                shadow.setAttribute('cy', String(y + dotRadius * 0.25));
                shadow.setAttribute('r', String(dotRadius));
                shadow.setAttribute('fill', 'rgba(0, 0, 0, 0.4)');
                group.appendChild(shadow);
            }

            // Create main dot
            const dot = createSvgElement('circle');
            dot.setAttribute('class', isFilled ? 'army-dot' : 'army-dot army-dot-empty');
            dot.setAttribute('cx', String(x));
            dot.setAttribute('cy', String(y));
            dot.setAttribute('r', String(dotRadius));

            if (!isFilled) {
                dot.setAttribute('fill', 'none');
            }

            group.appendChild(dot);
            dotIndex++;
        }
    }

    return group;
}

/**
 * Render army dots for a territory at its designated armyHex position
 * Used by updateTerritoryDisplay for re-rendering after combat
 */
function renderArmyDots(territory: Territory, hexSize: number): SVGGElement {
    if (!territory.armyHex) {
        const group = createSvgElement('g') as SVGGElement;
        group.setAttribute('class', 'army-dots');
        return group;
    }

    const armyHex = parseHexKey(territory.armyHex);
    const center = hexToPixel(armyHex, hexSize);
    return renderArmyDotsAtPoint(territory, center, hexSize);
}

/**
 * Order boundary edges into a closed contour path
 * Chains disconnected edges by matching endpoints to form continuous loops
 */
function orderBoundaryEdges(edges: [Point, Point][]): Point[][] {
    if (edges.length === 0) return [];

    // Snap coordinates to whole numbers for robust matching
    const snap = (n: number) => Math.round(n);
    const snapPoint = (p: Point): Point => ({ x: snap(p.x), y: snap(p.y) });
    const pointKey = (p: Point) => `${p.x},${p.y}`;

    // Pre-snap all edge coordinates
    const snappedEdges: [Point, Point][] = edges.map(([p1, p2]) => [snapPoint(p1), snapPoint(p2)]);

    // Build adjacency map: point → list of edges containing that point
    const adjacency = new Map<string, { edge: [Point, Point]; used: boolean }[]>();

    for (const edge of snappedEdges) {
        const key1 = pointKey(edge[0]);
        const key2 = pointKey(edge[1]);

        const entry = { edge, used: false };

        if (!adjacency.has(key1)) adjacency.set(key1, []);
        if (!adjacency.has(key2)) adjacency.set(key2, []);

        adjacency.get(key1)!.push(entry);
        adjacency.get(key2)!.push(entry);
    }

    const contours: Point[][] = [];
    const edgeEntries = Array.from(adjacency.values()).flat();
    const allEntries = new Set(edgeEntries);

    // Walk edges to form closed contours
    while (true) {
        // Find an unused edge to start a new contour
        let startEntry: { edge: [Point, Point]; used: boolean } | undefined;
        for (const entry of allEntries) {
            if (!entry.used) {
                startEntry = entry;
                break;
            }
        }

        if (!startEntry) break;

        startEntry.used = true;
        const contour: Point[] = [startEntry.edge[0], startEntry.edge[1]];
        let currentKey = pointKey(startEntry.edge[1]);

        // Walk until we return to start or can't continue
        while (true) {
            const neighbors = adjacency.get(currentKey);
            if (!neighbors) break;

            let nextEntry: { edge: [Point, Point]; used: boolean } | undefined;
            for (const entry of neighbors) {
                if (!entry.used) {
                    nextEntry = entry;
                    break;
                }
            }

            if (!nextEntry) break;

            nextEntry.used = true;

            // Determine which endpoint is new
            const key0 = pointKey(nextEntry.edge[0]);
            const key1 = pointKey(nextEntry.edge[1]);

            if (key0 === currentKey) {
                contour.push(nextEntry.edge[1]);
                currentKey = key1;
            } else {
                contour.push(nextEntry.edge[0]);
                currentKey = key0;
            }

            // Check if we've closed the loop
            if (currentKey === pointKey(contour[0])) {
                break;
            }
        }

        if (contour.length >= 3) {
            contours.push(contour);
        }
    }

    return contours;
}

/**
 * Create a smooth contour path from ordered vertices using Bezier curves
 */
function createSmoothContourPath(vertices: Point[], cornerRadius: number): string {
    if (vertices.length < 3) return '';

    const n = vertices.length;
    let path = '';

    for (let i = 0; i < n; i++) {
        const curr = vertices[i];
        const next = vertices[(i + 1) % n];
        const prev = vertices[(i - 1 + n) % n];

        // Vector from current vertex to previous and next
        const toPrev = { x: prev.x - curr.x, y: prev.y - curr.y };
        const toNext = { x: next.x - curr.x, y: next.y - curr.y };

        // Normalize and scale by radius
        const lenPrev = Math.sqrt(toPrev.x * toPrev.x + toPrev.y * toPrev.y);
        const lenNext = Math.sqrt(toNext.x * toNext.x + toNext.y * toNext.y);

        // Clamp radius to not exceed half the edge length
        const effectiveRadius = Math.min(cornerRadius, lenPrev / 2, lenNext / 2);

        const startPoint = {
            x: curr.x + (toPrev.x / lenPrev) * effectiveRadius,
            y: curr.y + (toPrev.y / lenPrev) * effectiveRadius
        };
        const endPoint = {
            x: curr.x + (toNext.x / lenNext) * effectiveRadius,
            y: curr.y + (toNext.y / lenNext) * effectiveRadius
        };

        if (i === 0) {
            path = `M ${startPoint.x.toFixed(2)} ${startPoint.y.toFixed(2)}`;
        } else {
            path += ` L ${startPoint.x.toFixed(2)} ${startPoint.y.toFixed(2)}`;
        }

        // Quadratic bezier curve through the corner
        path += ` Q ${curr.x.toFixed(2)} ${curr.y.toFixed(2)} ${endPoint.x.toFixed(2)} ${endPoint.y.toFixed(2)}`;
    }

    path += ' Z';
    return path;
}

/**
 * Create an inset contour path (for inner highlight stroke)
 */
function createInsetContourPath(vertices: Point[], insetAmount: number, cornerRadius: number): string {
    if (vertices.length < 3) return '';

    // Calculate the centroid
    let cx = 0, cy = 0;
    for (const v of vertices) {
        cx += v.x;
        cy += v.y;
    }
    cx /= vertices.length;
    cy /= vertices.length;

    // Create inset vertices by moving each vertex toward centroid
    const insetVertices: Point[] = vertices.map(v => {
        const dx = v.x - cx;
        const dy = v.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const scale = (dist - insetAmount) / dist;
        return {
            x: cx + dx * scale,
            y: cy + dy * scale
        };
    });

    return createSmoothContourPath(insetVertices, cornerRadius);
}

/**
 * Get boundary edges for a territory
 * Returns edges that are NOT shared with another hex in the same territory
 */
function getTerritoryBoundaryEdges(
    hexes: Hex[],
    hexKeySet: Set<string>,
    hexSize: number
): [Point, Point][] {
    const boundaryEdges: [Point, Point][] = [];

    // Mapping from edge index to neighbor direction index
    const edgeToNeighbor = [0, 5, 4, 3, 2, 1];

    for (const hex of hexes) {
        const center = hexToPixel(hex, hexSize);
        const corners = hexCorners(center, hexSize);
        const neighbors = hexNeighbors(hex);

        for (let edgeIndex = 0; edgeIndex < 6; edgeIndex++) {
            const neighborDirIndex = edgeToNeighbor[edgeIndex];
            const neighborKey = hexKey(neighbors[neighborDirIndex]);

            if (!hexKeySet.has(neighborKey)) {
                const p1 = corners[edgeIndex];
                const p2 = corners[(edgeIndex + 1) % 6];
                boundaryEdges.push([p1, p2]);
            }
        }
    }

    return boundaryEdges;
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
 * Create a rounded hex path data string
 * Uses quadratic bezier curves at corners for smooth rounding
 */
function createRoundedHexPath(center: Point, hexSize: number, cornerRadius: number = 0.15): string {
    const corners = hexCorners(center, hexSize);

    // Corner radius as a fraction of the edge length
    const edgeLength = hexSize; // Approximate edge length
    const radius = edgeLength * cornerRadius;

    let path = '';

    for (let i = 0; i < 6; i++) {
        const curr = corners[i];
        const next = corners[(i + 1) % 6];
        const prev = corners[(i + 5) % 6];

        // Vector from current corner to previous and next
        const toPrev = { x: prev.x - curr.x, y: prev.y - curr.y };
        const toNext = { x: next.x - curr.x, y: next.y - curr.y };

        // Normalize and scale by radius
        const lenPrev = Math.sqrt(toPrev.x * toPrev.x + toPrev.y * toPrev.y);
        const lenNext = Math.sqrt(toNext.x * toNext.x + toNext.y * toNext.y);

        const startPoint = {
            x: curr.x + (toPrev.x / lenPrev) * radius,
            y: curr.y + (toPrev.y / lenPrev) * radius
        };
        const endPoint = {
            x: curr.x + (toNext.x / lenNext) * radius,
            y: curr.y + (toNext.y / lenNext) * radius
        };

        if (i === 0) {
            path = `M ${startPoint.x.toFixed(2)} ${startPoint.y.toFixed(2)}`;
        } else {
            path += ` L ${startPoint.x.toFixed(2)} ${startPoint.y.toFixed(2)}`;
        }

        // Quadratic bezier curve through the corner
        path += ` Q ${curr.x.toFixed(2)} ${curr.y.toFixed(2)} ${endPoint.x.toFixed(2)} ${endPoint.y.toFixed(2)}`;
    }

    path += ' Z';
    return path;
}

/**
 * Render an empty/impassable hex (fill from CSS token --color-map-empty-hex)
 */
function renderEmptyHex(hex: Hex, hexSize: number): SVGGElement {
    const center = hexToPixel(hex, hexSize);

    const group = createSvgElement('g') as SVGGElement;

    // Main hex shape with rounded corners
    const hexPath = createSvgElement('path') as SVGPathElement;
    hexPath.setAttribute('class', 'hex hex-empty');
    hexPath.setAttribute('d', createRoundedHexPath(center, hexSize));
    hexPath.setAttribute('data-hex-q', String(hex.q));
    hexPath.setAttribute('data-hex-r', String(hex.r));
    hexPath.setAttribute('aria-label', `Empty tile at ${hex.q}, ${hex.r}`);

    group.appendChild(hexPath);

    return group;
}

/**
 * Lighten a hex color by a percentage
 */
function lightenColor(hexColor: string, percent: number): string {
    // Remove # if present
    const hex = hexColor.replace('#', '');

    // Parse RGB values
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);

    // Lighten
    r = Math.min(255, Math.floor(r + (255 - r) * percent));
    g = Math.min(255, Math.floor(g + (255 - g) * percent));
    b = Math.min(255, Math.floor(b + (255 - b) * percent));

    // Convert back to hex
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Render a single hex as an SVG group with rounded corners and inner stroke
 */
function renderHex(hex: Hex, territory: Territory, hexSize: number): SVGGElement {
    const center = hexToPixel(hex, hexSize);

    const group = createSvgElement('g') as SVGGElement;

    // Main hex shape with rounded corners
    const hexPath = createSvgElement('path') as SVGPathElement;
    hexPath.setAttribute('class', 'hex');
    hexPath.setAttribute('d', createRoundedHexPath(center, hexSize));
    hexPath.setAttribute('fill', territory.color);
    hexPath.setAttribute('stroke', 'none');
    hexPath.setAttribute('data-hex-q', String(hex.q));
    hexPath.setAttribute('data-hex-r', String(hex.r));
    hexPath.setAttribute('data-territory-id', String(territory.id));

    // Accessibility
    hexPath.setAttribute('tabindex', '0');
    hexPath.setAttribute('role', 'button');
    hexPath.setAttribute('aria-label', `Hex at ${hex.q}, ${hex.r} in ${territory.name}`);

    group.appendChild(hexPath);

    // Inner stroke effect (slightly smaller hex with lighter color stroke)
    const innerHexPath = createSvgElement('path') as SVGPathElement;
    innerHexPath.setAttribute('class', 'hex-inner-stroke');
    innerHexPath.setAttribute('d', createRoundedHexPath(center, hexSize * 0.88, 0.12));
    innerHexPath.setAttribute('fill', 'none');
    innerHexPath.setAttribute('stroke', lightenColor(territory.color, 0.3));
    innerHexPath.setAttribute('stroke-width', '2');
    innerHexPath.setAttribute('pointer-events', 'none');

    group.appendChild(innerHexPath);

    return group;
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

    const fillColor = territory.color;
    const strokeColor = lightenColor(territory.color, 0.4);

    // Update all fill elements (tile-base, tile-under, tile-over)
    const fillElements = group.querySelectorAll('.tile-base, .tile-under, .tile-over, .hex');
    fillElements.forEach(el => {
        el.setAttribute('fill', fillColor);
    });

    // Update all stroke elements (tile-stroke, tile-connector-stroke)
    const strokeElements = group.querySelectorAll('.tile-stroke, .tile-connector-stroke');
    strokeElements.forEach(el => {
        el.setAttribute('fill', strokeColor);
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
