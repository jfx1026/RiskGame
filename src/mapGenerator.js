/**
 * Map Generator using organic growth algorithm
 * Creates territories that grow outward from seed points
 */
import { hexKey, hexNeighbors, generateHexGrid, parseHexKey } from './hex.js';
import { createTerritory, addHexToTerritory, calculateTerritoryNeighbors } from './territory.js';
import { shuffleColors, TERRITORY_COLORS } from './colors.js';
const DEFAULT_CONFIG = {
    gridWidth: 18,
    gridHeight: 12,
    territoryCount: 15,
    minTerritorySize: 3,
    maxTerritorySize: 7,
    emptyTilePercent: 10, // 10% empty tiles by default
};
/**
 * Generate a random map using organic growth algorithm
 */
export function generateMap(config = {}) {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    const { gridWidth, gridHeight, territoryCount, minTerritorySize, maxTerritorySize, emptyTilePercent } = finalConfig;
    // Generate the hex grid
    const allHexes = generateHexGrid(gridWidth, gridHeight);
    const allHexKeys = new Set(allHexes.map(hexKey));
    // Calculate and place empty tiles (blocked hexes)
    const emptyHexes = new Set();
    const clampedPercent = Math.max(0, Math.min(50, emptyTilePercent));
    const emptyCount = Math.floor(allHexes.length * clampedPercent / 100);
    if (emptyCount > 0) {
        const shuffledHexes = shuffleArray([...allHexes]);
        for (let i = 0; i < emptyCount && i < shuffledHexes.length; i++) {
            emptyHexes.add(hexKey(shuffledHexes[i]));
        }
    }
    // Track which hexes are unclaimed (excluding empty tiles)
    const unclaimed = new Set();
    for (const key of allHexKeys) {
        if (!emptyHexes.has(key)) {
            unclaimed.add(key);
        }
    }
    // Create territories with shuffled colors
    const colors = shuffleColors(TERRITORY_COLORS);
    const territories = [];
    for (let i = 0; i < territoryCount; i++) {
        territories.push(createTerritory(i, colors[i % colors.length]));
    }
    // Place seed points for each territory (excluding empty tiles)
    const availableForSeeds = allHexes.filter(h => !emptyHexes.has(hexKey(h)));
    const seeds = placeSeedPoints(availableForSeeds, territoryCount);
    for (let i = 0; i < seeds.length; i++) {
        const seedKey = hexKey(seeds[i]);
        addHexToTerritory(territories[i], seeds[i]);
        unclaimed.delete(seedKey);
    }
    // Track frontier hexes for each territory (hexes adjacent to territory)
    const frontiers = territories.map(() => new Set());
    // Valid hexes for frontier expansion (excluding empty tiles)
    const validHexKeys = new Set();
    for (const key of allHexKeys) {
        if (!emptyHexes.has(key)) {
            validHexKeys.add(key);
        }
    }
    // Initialize frontiers
    for (let i = 0; i < territories.length; i++) {
        updateFrontier(territories[i], frontiers[i], unclaimed, validHexKeys);
    }
    // Grow territories organically
    let iterations = 0;
    const maxIterations = gridWidth * gridHeight * 2;
    while (unclaimed.size > 0 && iterations < maxIterations) {
        iterations++;
        // Each territory tries to claim one hex per round
        // Randomize order to prevent bias toward lower-numbered territories
        const order = shuffleArray([...Array(territories.length).keys()]);
        for (const i of order) {
            // Skip if territory has reached max size
            if (territories[i].hexes.size >= maxTerritorySize)
                continue;
            if (frontiers[i].size === 0)
                continue;
            // Pick a random hex from the frontier
            const frontierArray = Array.from(frontiers[i]);
            const randomIndex = Math.floor(Math.random() * frontierArray.length);
            const chosenKey = frontierArray[randomIndex];
            // Check if still unclaimed (another territory might have claimed it)
            if (!unclaimed.has(chosenKey)) {
                frontiers[i].delete(chosenKey);
                continue;
            }
            // Claim the hex
            const chosenHex = parseHexKey(chosenKey);
            addHexToTerritory(territories[i], chosenHex);
            unclaimed.delete(chosenKey);
            frontiers[i].delete(chosenKey);
            // Update frontier with new adjacent unclaimed hexes
            updateFrontier(territories[i], frontiers[i], unclaimed, validHexKeys);
        }
        // Check if all territories have reached max size
        const allMaxed = territories.every(t => t.hexes.size >= maxTerritorySize);
        if (allMaxed)
            break;
    }
    // Assign any remaining unclaimed hexes to neighbors or make them empty
    assignUnclaimedHexes(territories, unclaimed, emptyHexes, maxTerritorySize);
    // Clean up: merge small territories into neighbors
    cleanupTerritories(territories, minTerritorySize, maxTerritorySize);
    // Remove isolated territories (not connected to main landmass)
    removeIsolatedTerritories(territories, emptyHexes);
    // Calculate territory neighbors
    calculateTerritoryNeighbors(territories);
    return {
        territories,
        allHexes,
        emptyHexes,
        config: finalConfig,
    };
}
/**
 * Place seed points with good spacing
 */
function placeSeedPoints(hexes, count) {
    // Simple approach: shuffle hexes and pick first N with some spacing
    const shuffled = shuffleArray([...hexes]);
    const seeds = [];
    const usedKeys = new Set();
    // Minimum spacing between seeds (in hex distance)
    const minSpacing = 2;
    for (const hex of shuffled) {
        if (seeds.length >= count)
            break;
        // Check spacing from existing seeds
        let tooClose = false;
        for (const seed of seeds) {
            const dx = Math.abs(hex.q - seed.q);
            const dy = Math.abs(hex.r - seed.r);
            if (dx + dy < minSpacing * 2) {
                tooClose = true;
                break;
            }
        }
        if (!tooClose) {
            seeds.push(hex);
            usedKeys.add(hexKey(hex));
        }
    }
    // If we couldn't place enough seeds with spacing, just fill in
    if (seeds.length < count) {
        for (const hex of shuffled) {
            if (seeds.length >= count)
                break;
            if (!usedKeys.has(hexKey(hex))) {
                seeds.push(hex);
                usedKeys.add(hexKey(hex));
            }
        }
    }
    return seeds;
}
/**
 * Update a territory's frontier with new adjacent unclaimed hexes
 */
function updateFrontier(territory, frontier, unclaimed, validHexes) {
    for (const hexKeyStr of territory.hexes) {
        const hex = parseHexKey(hexKeyStr);
        const neighbors = hexNeighbors(hex);
        for (const neighbor of neighbors) {
            const neighborKey = hexKey(neighbor);
            if (unclaimed.has(neighborKey) && validHexes.has(neighborKey)) {
                frontier.add(neighborKey);
            }
        }
    }
    // Remove any hexes that are no longer unclaimed
    for (const key of frontier) {
        if (!unclaimed.has(key)) {
            frontier.delete(key);
        }
    }
}
/**
 * Assign unclaimed hexes to neighboring territories or convert to empty
 */
function assignUnclaimedHexes(territories, unclaimed, emptyHexes, maxSize) {
    if (unclaimed.size === 0)
        return;
    // Build hex -> territory map
    const hexToTerritory = new Map();
    for (const territory of territories) {
        for (const hexKeyStr of territory.hexes) {
            hexToTerritory.set(hexKeyStr, territory);
        }
    }
    // Try to assign each unclaimed hex to a neighbor
    for (const hexKeyStr of unclaimed) {
        const hex = parseHexKey(hexKeyStr);
        const neighbors = hexNeighbors(hex);
        // Find neighboring territories that can accept more hexes
        const eligibleTerritories = [];
        for (const neighbor of neighbors) {
            const neighborKey = hexKey(neighbor);
            const territory = hexToTerritory.get(neighborKey);
            if (territory && territory.hexes.size < maxSize) {
                eligibleTerritories.push(territory);
            }
        }
        if (eligibleTerritories.length > 0) {
            // Assign to the smallest eligible neighbor for balance
            const smallest = eligibleTerritories.reduce((a, b) => a.hexes.size <= b.hexes.size ? a : b);
            smallest.hexes.add(hexKeyStr);
            hexToTerritory.set(hexKeyStr, smallest);
        }
        else {
            // No eligible neighbor, convert to empty tile
            emptyHexes.add(hexKeyStr);
        }
    }
}
/**
 * Clean up territories: merge small ones into neighbors
 */
function cleanupTerritories(territories, minSize, maxSize) {
    // Calculate neighbors first
    calculateTerritoryNeighbors(territories);
    // Find small territories and merge them
    for (const territory of territories) {
        if (territory.hexes.size < minSize && territory.hexes.size > 0) {
            // Find a neighbor to merge into (that won't exceed max)
            const neighborIds = Array.from(territory.neighbors);
            if (neighborIds.length > 0) {
                const neighbors = neighborIds
                    .map(id => territories.find(t => t.id === id))
                    .filter((t) => t !== undefined)
                    .filter(t => t.hexes.size + territory.hexes.size <= maxSize);
                if (neighbors.length > 0) {
                    // Merge into the smallest eligible neighbor for balance
                    const smallest = neighbors.reduce((a, b) => a.hexes.size <= b.hexes.size ? a : b);
                    // Transfer hexes
                    for (const hexKeyStr of territory.hexes) {
                        smallest.hexes.add(hexKeyStr);
                    }
                    territory.hexes.clear();
                }
            }
        }
    }
    // Remove empty territories
    const nonEmpty = territories.filter(t => t.hexes.size > 0);
    territories.length = 0;
    territories.push(...nonEmpty);
    // Renumber territories
    for (let i = 0; i < territories.length; i++) {
        territories[i].id = i;
        territories[i].name = `Territory ${i + 1}`;
    }
    // Recalculate neighbors
    calculateTerritoryNeighbors(territories);
}
/**
 * Remove territories that are isolated (not connected to the main landmass)
 * Uses hex adjacency to find connected components
 */
function removeIsolatedTerritories(territories, emptyHexes) {
    if (territories.length <= 1)
        return;
    // Build a set of all territory hexes for quick lookup
    const allTerritoryHexes = new Set();
    for (const territory of territories) {
        for (const hexKeyStr of territory.hexes) {
            allTerritoryHexes.add(hexKeyStr);
        }
    }
    // Find connected components using BFS on hex adjacency
    const visited = new Set();
    const components = [];
    for (const startHex of allTerritoryHexes) {
        if (visited.has(startHex))
            continue;
        // BFS to find all connected hexes
        const component = new Set();
        const queue = [startHex];
        visited.add(startHex);
        while (queue.length > 0) {
            const currentKey = queue.shift();
            component.add(currentKey);
            const current = parseHexKey(currentKey);
            const neighbors = hexNeighbors(current);
            for (const neighbor of neighbors) {
                const neighborKey = hexKey(neighbor);
                if (!visited.has(neighborKey) && allTerritoryHexes.has(neighborKey)) {
                    visited.add(neighborKey);
                    queue.push(neighborKey);
                }
            }
        }
        components.push(component);
    }
    // Find the largest component (main landmass)
    if (components.length <= 1)
        return;
    const largestComponent = components.reduce((a, b) => a.size >= b.size ? a : b);
    // Convert hexes not in the largest component to empty tiles
    for (const territory of territories) {
        const hexesToRemove = [];
        for (const hexKeyStr of territory.hexes) {
            if (!largestComponent.has(hexKeyStr)) {
                hexesToRemove.push(hexKeyStr);
            }
        }
        for (const hexKeyStr of hexesToRemove) {
            territory.hexes.delete(hexKeyStr);
            emptyHexes.add(hexKeyStr);
        }
    }
    // Remove empty territories
    const nonEmpty = territories.filter(t => t.hexes.size > 0);
    territories.length = 0;
    territories.push(...nonEmpty);
    // Renumber territories
    for (let i = 0; i < territories.length; i++) {
        territories[i].id = i;
        territories[i].name = `Territory ${i + 1}`;
    }
}
/**
 * Fisher-Yates shuffle
 */
function shuffleArray(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}
//# sourceMappingURL=mapGenerator.js.map