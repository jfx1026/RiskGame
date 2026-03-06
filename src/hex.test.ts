import { describe, it, expect } from 'vitest';
import {
    hex,
    hexKey,
    parseHexKey,
    hexEquals,
    hexAdd,
    hexNeighbors,
    hexDistance,
    hexToPixel,
    pixelToHex,
    hexRound,
    hexCorners,
    generateHexGrid,
    getHexBounds,
    HEX_SIZE,
} from './hex.js';

describe('hex', () => {
    it('creates a hex with given coordinates', () => {
        const h = hex(3, -2);
        expect(h.q).toBe(3);
        expect(h.r).toBe(-2);
    });
});

describe('hexKey and parseHexKey', () => {
    it('creates a string key from hex', () => {
        expect(hexKey({ q: 3, r: -2 })).toBe('3,-2');
        expect(hexKey({ q: 0, r: 0 })).toBe('0,0');
    });

    it('parses key back to hex', () => {
        const h = parseHexKey('3,-2');
        expect(h.q).toBe(3);
        expect(h.r).toBe(-2);
    });

    it('round trips correctly', () => {
        const original = { q: 5, r: -3 };
        const parsed = parseHexKey(hexKey(original));
        expect(parsed).toEqual(original);
    });
});

describe('hexEquals', () => {
    it('returns true for equal hexes', () => {
        expect(hexEquals({ q: 1, r: 2 }, { q: 1, r: 2 })).toBe(true);
    });

    it('returns false for different hexes', () => {
        expect(hexEquals({ q: 1, r: 2 }, { q: 1, r: 3 })).toBe(false);
        expect(hexEquals({ q: 1, r: 2 }, { q: 2, r: 2 })).toBe(false);
    });
});

describe('hexAdd', () => {
    it('adds two hex coordinates', () => {
        const result = hexAdd({ q: 1, r: 2 }, { q: 3, r: -1 });
        expect(result).toEqual({ q: 4, r: 1 });
    });

    it('handles negative values', () => {
        const result = hexAdd({ q: -2, r: 3 }, { q: -1, r: -5 });
        expect(result).toEqual({ q: -3, r: -2 });
    });
});

describe('hexNeighbors', () => {
    it('returns exactly 6 neighbors', () => {
        const neighbors = hexNeighbors({ q: 0, r: 0 });
        expect(neighbors).toHaveLength(6);
    });

    it('returns correct neighbors for origin', () => {
        const neighbors = hexNeighbors({ q: 0, r: 0 });
        const neighborKeys = neighbors.map(hexKey).sort();

        expect(neighborKeys).toContain('1,0');   // East
        expect(neighborKeys).toContain('1,-1');  // Northeast
        expect(neighborKeys).toContain('0,-1');  // Northwest
        expect(neighborKeys).toContain('-1,0');  // West
        expect(neighborKeys).toContain('-1,1');  // Southwest
        expect(neighborKeys).toContain('0,1');   // Southeast
    });

    it('neighbors are all distance 1 away', () => {
        const center = { q: 5, r: -3 };
        const neighbors = hexNeighbors(center);

        for (const neighbor of neighbors) {
            expect(hexDistance(center, neighbor)).toBe(1);
        }
    });
});

describe('hexDistance', () => {
    it('returns 0 for same hex', () => {
        expect(hexDistance({ q: 3, r: 2 }, { q: 3, r: 2 })).toBe(0);
    });

    it('returns 1 for adjacent hexes', () => {
        const center = { q: 0, r: 0 };
        expect(hexDistance(center, { q: 1, r: 0 })).toBe(1);
        expect(hexDistance(center, { q: 0, r: 1 })).toBe(1);
        expect(hexDistance(center, { q: -1, r: 1 })).toBe(1);
    });

    it('returns correct distance for farther hexes', () => {
        expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: 0 })).toBe(3);
        expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: 2 })).toBe(4);
    });

    it('is symmetric', () => {
        const a = { q: 3, r: -2 };
        const b = { q: -1, r: 4 };
        expect(hexDistance(a, b)).toBe(hexDistance(b, a));
    });
});

describe('hexToPixel and pixelToHex', () => {
    it('converts origin hex to origin pixel', () => {
        const pixel = hexToPixel({ q: 0, r: 0 });
        expect(pixel.x).toBeCloseTo(0);
        expect(pixel.y).toBeCloseTo(0);
    });

    it('round trips correctly', () => {
        const original = { q: 3, r: -2 };
        const pixel = hexToPixel(original);
        const recovered = pixelToHex(pixel);

        expect(recovered.q).toBe(original.q);
        expect(recovered.r).toBe(original.r);
    });

    it('round trips for various hexes', () => {
        const hexes = [
            { q: 0, r: 0 },
            { q: 1, r: 0 },
            { q: 0, r: 1 },
            { q: -1, r: 1 },
            { q: 5, r: -3 },
            { q: -4, r: 7 },
        ];

        for (const h of hexes) {
            const pixel = hexToPixel(h);
            const recovered = pixelToHex(pixel);
            // Adding 0 normalizes -0 to 0 for comparison
            expect(recovered.q + 0).toBe(h.q + 0);
            expect(recovered.r + 0).toBe(h.r + 0);
        }
    });

    it('respects custom size', () => {
        const size = 50;
        const h = { q: 1, r: 0 };

        const defaultPixel = hexToPixel(h, HEX_SIZE);
        const customPixel = hexToPixel(h, size);

        // Custom size should scale the position
        const ratio = size / HEX_SIZE;
        expect(customPixel.x).toBeCloseTo(defaultPixel.x * ratio);
        expect(customPixel.y).toBeCloseTo(defaultPixel.y * ratio);
    });
});

describe('hexRound', () => {
    it('rounds to nearest hex', () => {
        // Fractional hex that should round to (1, 0)
        const rounded = hexRound({ q: 0.9, r: 0.1 });
        expect(rounded).toEqual({ q: 1, r: 0 });
    });

    it('handles exact integers', () => {
        const rounded = hexRound({ q: 3, r: -2 });
        expect(rounded).toEqual({ q: 3, r: -2 });
    });
});

describe('hexCorners', () => {
    it('returns 6 corners', () => {
        const corners = hexCorners({ x: 0, y: 0 });
        expect(corners).toHaveLength(6);
    });

    it('corners are equidistant from center', () => {
        const center = { x: 100, y: 100 };
        const size = 30;
        const corners = hexCorners(center, size);

        for (const corner of corners) {
            const distance = Math.sqrt(
                Math.pow(corner.x - center.x, 2) +
                Math.pow(corner.y - center.y, 2)
            );
            expect(distance).toBeCloseTo(size);
        }
    });
});

describe('generateHexGrid', () => {
    it('generates correct number of hexes', () => {
        const grid = generateHexGrid(5, 4);
        expect(grid).toHaveLength(5 * 4);
    });

    it('generates unique hexes', () => {
        const grid = generateHexGrid(6, 6);
        const keys = new Set(grid.map(hexKey));
        expect(keys.size).toBe(grid.length);
    });
});

describe('getHexBounds', () => {
    it('returns zero bounds for empty array', () => {
        const bounds = getHexBounds([]);
        expect(bounds.width).toBe(0);
        expect(bounds.height).toBe(0);
    });

    it('calculates bounds that include all hexes', () => {
        const hexes = [
            { q: 0, r: 0 },
            { q: 2, r: 0 },
            { q: 1, r: 2 },
        ];
        const bounds = getHexBounds(hexes);

        // All hex corners should be within bounds
        for (const h of hexes) {
            const pixel = hexToPixel(h);
            const corners = hexCorners(pixel);

            for (const corner of corners) {
                expect(corner.x).toBeGreaterThanOrEqual(bounds.minX);
                expect(corner.x).toBeLessThanOrEqual(bounds.maxX);
                expect(corner.y).toBeGreaterThanOrEqual(bounds.minY);
                expect(corner.y).toBeLessThanOrEqual(bounds.maxY);
            }
        }
    });

    it('width and height are consistent with min/max', () => {
        const hexes = generateHexGrid(5, 5);
        const bounds = getHexBounds(hexes);

        expect(bounds.width).toBeCloseTo(bounds.maxX - bounds.minX);
        expect(bounds.height).toBeCloseTo(bounds.maxY - bounds.minY);
    });
});
