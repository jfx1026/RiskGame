/**
 * Territory data structure and management
 */

import { Hex, hexKey, hexNeighbors, parseHexKey } from './hex.js';

export interface Territory {
    id: number;
    name: string;
    hexes: Set<string>;        // Set of hex keys (q,r format)
    color: string;
    neighbors: Set<number>;    // Adjacent territory IDs
    owner?: number;            // Player ID (for future game logic)
    armies: number;
}

/**
 * Create a new territory
 */
export function createTerritory(id: number, color: string, name?: string): Territory {
    return {
        id,
        name: name ?? `Territory ${id + 1}`,
        hexes: new Set(),
        color,
        neighbors: new Set(),
        owner: undefined,
        armies: 1,
    };
}

/**
 * Add a hex to a territory
 */
export function addHexToTerritory(territory: Territory, hex: Hex): void {
    territory.hexes.add(hexKey(hex));
}

/**
 * Check if a territory contains a hex
 */
export function territoryContainsHex(territory: Territory, hex: Hex): boolean {
    return territory.hexes.has(hexKey(hex));
}

/**
 * Get all hexes in a territory as Hex objects
 */
export function getTerritoryHexes(territory: Territory): Hex[] {
    return Array.from(territory.hexes).map(parseHexKey);
}

/**
 * Get the number of hexes in a territory
 */
export function getTerritorySize(territory: Territory): number {
    return territory.hexes.size;
}

/**
 * Calculate neighboring territories based on hex adjacency
 */
export function calculateTerritoryNeighbors(territories: Territory[]): void {
    // Build a map of hex -> territory ID for fast lookup
    const hexToTerritory = new Map<string, number>();

    for (const territory of territories) {
        for (const hexKeyStr of territory.hexes) {
            hexToTerritory.set(hexKeyStr, territory.id);
        }
    }

    // Clear existing neighbors
    for (const territory of territories) {
        territory.neighbors.clear();
    }

    // Find neighbors by checking each hex's adjacent hexes
    for (const territory of territories) {
        for (const hexKeyStr of territory.hexes) {
            const hex = parseHexKey(hexKeyStr);
            const neighbors = hexNeighbors(hex);

            for (const neighbor of neighbors) {
                const neighborKey = hexKey(neighbor);
                const neighborTerritoryId = hexToTerritory.get(neighborKey);

                if (neighborTerritoryId !== undefined && neighborTerritoryId !== territory.id) {
                    territory.neighbors.add(neighborTerritoryId);
                }
            }
        }
    }
}

/**
 * Find which territory contains a given hex
 */
export function findTerritoryByHex(territories: Territory[], hex: Hex): Territory | undefined {
    const key = hexKey(hex);
    return territories.find(t => t.hexes.has(key));
}

/**
 * Get territory by ID
 */
export function getTerritoryById(territories: Territory[], id: number): Territory | undefined {
    return territories.find(t => t.id === id);
}

/**
 * Check if all territories are connected (no isolated territories)
 */
export function areAllTerritoriesConnected(territories: Territory[]): boolean {
    if (territories.length <= 1) return true;

    const visited = new Set<number>();
    const queue: number[] = [territories[0].id];
    visited.add(territories[0].id);

    while (queue.length > 0) {
        const currentId = queue.shift()!;
        const current = getTerritoryById(territories, currentId);
        if (!current) continue;

        for (const neighborId of current.neighbors) {
            if (!visited.has(neighborId)) {
                visited.add(neighborId);
                queue.push(neighborId);
            }
        }
    }

    return visited.size === territories.length;
}

/**
 * Get statistics about territories
 */
export function getTerritoryStats(territories: Territory[]): {
    count: number;
    totalHexes: number;
    avgSize: number;
    minSize: number;
    maxSize: number;
} {
    if (territories.length === 0) {
        return { count: 0, totalHexes: 0, avgSize: 0, minSize: 0, maxSize: 0 };
    }

    const sizes = territories.map(t => t.hexes.size);
    const totalHexes = sizes.reduce((a, b) => a + b, 0);

    return {
        count: territories.length,
        totalHexes,
        avgSize: totalHexes / territories.length,
        minSize: Math.min(...sizes),
        maxSize: Math.max(...sizes),
    };
}
