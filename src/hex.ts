/**
 * Hex coordinate system using axial coordinates (q, r)
 * Based on Red Blob Games' excellent hex grid reference
 * Using pointy-top hexagon orientation
 */

export interface Hex {
    q: number;  // Column (axial coordinate)
    r: number;  // Row (axial coordinate)
}

export interface Point {
    x: number;
    y: number;
}

// Hex size (radius from center to corner)
export const HEX_SIZE = 30;

// Direction vectors for the 6 neighbors of a pointy-top hex
const DIRECTIONS: Hex[] = [
    { q: 1, r: 0 },   // East
    { q: 1, r: -1 },  // Northeast
    { q: 0, r: -1 },  // Northwest
    { q: -1, r: 0 },  // West
    { q: -1, r: 1 },  // Southwest
    { q: 0, r: 1 },   // Southeast
];

/**
 * Create a hex coordinate
 */
export function hex(q: number, r: number): Hex {
    return { q, r };
}

/**
 * Create a unique string key for a hex (for use in Maps/Sets)
 */
export function hexKey(h: Hex): string {
    return `${h.q},${h.r}`;
}

/**
 * Parse a hex key back into a Hex object
 */
export function parseHexKey(key: string): Hex {
    const [q, r] = key.split(',').map(Number);
    return { q, r };
}

/**
 * Check if two hexes are equal
 */
export function hexEquals(a: Hex, b: Hex): boolean {
    return a.q === b.q && a.r === b.r;
}

/**
 * Add two hex coordinates
 */
export function hexAdd(a: Hex, b: Hex): Hex {
    return { q: a.q + b.q, r: a.r + b.r };
}

/**
 * Get the 6 neighboring hexes
 */
export function hexNeighbors(h: Hex): Hex[] {
    return DIRECTIONS.map(dir => hexAdd(h, dir));
}

/**
 * Get the third axial coordinate (s) for cube coordinate calculations
 * In cube coordinates: q + r + s = 0
 */
function hexS(h: Hex): number {
    return -h.q - h.r;
}

/**
 * Calculate Manhattan distance between two hexes (in hex steps)
 */
export function hexDistance(a: Hex, b: Hex): number {
    return (
        Math.abs(a.q - b.q) +
        Math.abs(a.r - b.r) +
        Math.abs(hexS(a) - hexS(b))
    ) / 2;
}

/**
 * Convert hex coordinates to pixel position (center of hex)
 * Using pointy-top orientation
 */
export function hexToPixel(h: Hex, size: number = HEX_SIZE): Point {
    const x = size * (Math.sqrt(3) * h.q + Math.sqrt(3) / 2 * h.r);
    const y = size * (3 / 2 * h.r);
    return { x, y };
}

/**
 * Convert pixel position to hex coordinates
 * Returns fractional hex, use hexRound to get integer coordinates
 */
export function pixelToHex(point: Point, size: number = HEX_SIZE): Hex {
    const q = (Math.sqrt(3) / 3 * point.x - 1 / 3 * point.y) / size;
    const r = (2 / 3 * point.y) / size;
    return hexRound({ q, r });
}

/**
 * Round fractional hex coordinates to nearest integer hex
 * Uses cube coordinate rounding for accuracy
 */
export function hexRound(h: Hex): Hex {
    let q = Math.round(h.q);
    let r = Math.round(h.r);
    let s = Math.round(hexS(h));

    const qDiff = Math.abs(q - h.q);
    const rDiff = Math.abs(r - h.r);
    const sDiff = Math.abs(s - hexS(h));

    // Reset the component with largest diff to maintain q + r + s = 0
    if (qDiff > rDiff && qDiff > sDiff) {
        q = -r - s;
    } else if (rDiff > sDiff) {
        r = -q - s;
    }
    // s is implicit, no need to recalculate

    return { q, r };
}

/**
 * Get corner vertices of a hex for rendering
 * Returns 6 points for a pointy-top hexagon
 */
export function hexCorners(center: Point, size: number = HEX_SIZE): Point[] {
    const corners: Point[] = [];
    for (let i = 0; i < 6; i++) {
        // Pointy-top: first corner at 30 degrees (π/6)
        const angle = (2 * Math.PI * i) / 6 - Math.PI / 6;
        corners.push({
            x: center.x + size * Math.cos(angle),
            y: center.y + size * Math.sin(angle),
        });
    }
    return corners;
}

/**
 * Convert corners to SVG polygon points string
 */
export function cornersToSvgPoints(corners: Point[]): string {
    return corners.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}

/**
 * Generate a rectangular hex grid
 * Uses offset coordinates internally, converts to axial
 */
export function generateHexGrid(width: number, height: number): Hex[] {
    const hexes: Hex[] = [];

    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            // Convert offset (col, row) to axial (q, r)
            // Using odd-r offset (odd rows shifted right)
            const q = col - Math.floor(row / 2);
            const r = row;
            hexes.push({ q, r });
        }
    }

    return hexes;
}

/**
 * Get bounding box for a set of hexes
 */
export function getHexBounds(hexes: Hex[], size: number = HEX_SIZE): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
} {
    if (hexes.length === 0) {
        return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    }

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const h of hexes) {
        const center = hexToPixel(h, size);
        const corners = hexCorners(center, size);

        for (const corner of corners) {
            minX = Math.min(minX, corner.x);
            minY = Math.min(minY, corner.y);
            maxX = Math.max(maxX, corner.x);
            maxY = Math.max(maxY, corner.y);
        }
    }

    return {
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX,
        height: maxY - minY,
    };
}
