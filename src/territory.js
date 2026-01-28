/**
 * Territory data structure and management
 */
import { hexKey, hexNeighbors, parseHexKey } from './hex.js';
/**
 * Create a new territory
 */
export function createTerritory(id, color, name) {
    return {
        id,
        name: name ?? `Territory ${id + 1}`,
        hexes: new Set(),
        color,
        neighbors: new Set(),
        owner: undefined,
        armies: 1,
        type: 'small',
        armyHex: undefined,
    };
}
/**
 * Add a hex to a territory
 */
export function addHexToTerritory(territory, hex) {
    territory.hexes.add(hexKey(hex));
}
/**
 * Check if a territory contains a hex
 */
export function territoryContainsHex(territory, hex) {
    return territory.hexes.has(hexKey(hex));
}
/**
 * Get all hexes in a territory as Hex objects
 */
export function getTerritoryHexes(territory) {
    return Array.from(territory.hexes).map(parseHexKey);
}
/**
 * Get the number of hexes in a territory
 */
export function getTerritorySize(territory) {
    return territory.hexes.size;
}
/**
 * Calculate neighboring territories based on hex adjacency
 */
export function calculateTerritoryNeighbors(territories) {
    // Build a map of hex -> territory ID for fast lookup
    const hexToTerritory = new Map();
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
export function findTerritoryByHex(territories, hex) {
    const key = hexKey(hex);
    return territories.find(t => t.hexes.has(key));
}
/**
 * Get territory by ID
 */
export function getTerritoryById(territories, id) {
    return territories.find(t => t.id === id);
}
/**
 * Check if all territories are connected (no isolated territories)
 */
export function areAllTerritoriesConnected(territories) {
    if (territories.length <= 1)
        return true;
    const visited = new Set();
    const queue = [territories[0].id];
    visited.add(territories[0].id);
    while (queue.length > 0) {
        const currentId = queue.shift();
        const current = getTerritoryById(territories, currentId);
        if (!current)
            continue;
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
export function getTerritoryStats(territories) {
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
//# sourceMappingURL=territory.js.map