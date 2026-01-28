/**
 * Map Generator using organic growth algorithm
 * Creates territories that grow outward from seed points
 */

import { Hex, hexKey, hexNeighbors, generateHexGrid, parseHexKey } from './hex.js';
import { Territory, createTerritory, addHexToTerritory, calculateTerritoryNeighbors } from './territory.js';
import { shuffleColors, TERRITORY_COLORS } from './colors.js';

export interface MapGeneratorConfig {
    gridWidth: number;
    gridHeight: number;
    territoryCount: number;
    minTerritorySize: number;
    maxTerritorySize: number;
    emptyTilePercent: number;  // Percentage of tiles to leave empty (0-50)
}

export interface GeneratedMap {
    territories: Territory[];
    allHexes: Hex[];
    emptyHexes: Set<string>;   // Hex keys for empty/impassable tiles
    config: MapGeneratorConfig;
}

const DEFAULT_CONFIG: MapGeneratorConfig = {
    gridWidth: 18,
    gridHeight: 12,
    territoryCount: 15,
    minTerritorySize: 3,
    maxTerritorySize: 7,
    emptyTilePercent: 10,      // 10% empty tiles by default
};

/**
 * Generate a random map using organic growth algorithm
 */
export function generateMap(config: Partial<MapGeneratorConfig> = {}): GeneratedMap {
    const finalConfig: MapGeneratorConfig = { ...DEFAULT_CONFIG, ...config };
    const { gridWidth, gridHeight, territoryCount, minTerritorySize, maxTerritorySize, emptyTilePercent } = finalConfig;

    // Generate the hex grid
    const allHexes = generateHexGrid(gridWidth, gridHeight);
    const allHexKeys = new Set(allHexes.map(hexKey));

    // Calculate and place empty tiles (blocked hexes)
    const emptyHexes = new Set<string>();
    const clampedPercent = Math.max(0, Math.min(50, emptyTilePercent));
    const emptyCount = Math.floor(allHexes.length * clampedPercent / 100);

    if (emptyCount > 0) {
        const shuffledHexes = shuffleArray([...allHexes]);
        for (let i = 0; i < emptyCount && i < shuffledHexes.length; i++) {
            emptyHexes.add(hexKey(shuffledHexes[i]));
        }
    }

    // Track which hexes are unclaimed (excluding empty tiles)
    const unclaimed = new Set<string>();
    for (const key of allHexKeys) {
        if (!emptyHexes.has(key)) {
            unclaimed.add(key);
        }
    }

    // Create territories with shuffled colors
    const colors = shuffleColors(TERRITORY_COLORS);
    const territories: Territory[] = [];

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
    const frontiers: Set<string>[] = territories.map(() => new Set<string>());

    // Valid hexes for frontier expansion (excluding empty tiles)
    const validHexKeys = new Set<string>();
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
            if (territories[i].hexes.size >= maxTerritorySize) continue;
            if (frontiers[i].size === 0) continue;

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
        if (allMaxed) break;
    }

    // Assign any remaining unclaimed hexes to neighbors or make them empty
    assignUnclaimedHexes(territories, unclaimed, emptyHexes, maxTerritorySize);

    // Clean up: merge small territories into neighbors
    cleanupTerritories(territories, minTerritorySize, maxTerritorySize);

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
function placeSeedPoints(hexes: Hex[], count: number): Hex[] {
    // Simple approach: shuffle hexes and pick first N with some spacing
    const shuffled = shuffleArray([...hexes]);
    const seeds: Hex[] = [];
    const usedKeys = new Set<string>();

    // Minimum spacing between seeds (in hex distance)
    const minSpacing = 2;

    for (const hex of shuffled) {
        if (seeds.length >= count) break;

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
            if (seeds.length >= count) break;
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
function updateFrontier(
    territory: Territory,
    frontier: Set<string>,
    unclaimed: Set<string>,
    validHexes: Set<string>
): void {
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
function assignUnclaimedHexes(
    territories: Territory[],
    unclaimed: Set<string>,
    emptyHexes: Set<string>,
    maxSize: number
): void {
    if (unclaimed.size === 0) return;

    // Build hex -> territory map
    const hexToTerritory = new Map<string, Territory>();
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
        const eligibleTerritories: Territory[] = [];
        for (const neighbor of neighbors) {
            const neighborKey = hexKey(neighbor);
            const territory = hexToTerritory.get(neighborKey);
            if (territory && territory.hexes.size < maxSize) {
                eligibleTerritories.push(territory);
            }
        }

        if (eligibleTerritories.length > 0) {
            // Assign to the smallest eligible neighbor for balance
            const smallest = eligibleTerritories.reduce((a, b) =>
                a.hexes.size <= b.hexes.size ? a : b
            );
            smallest.hexes.add(hexKeyStr);
            hexToTerritory.set(hexKeyStr, smallest);
        } else {
            // No eligible neighbor, convert to empty tile
            emptyHexes.add(hexKeyStr);
        }
    }
}

/**
 * Clean up territories: merge small ones into neighbors
 */
function cleanupTerritories(
    territories: Territory[],
    minSize: number,
    maxSize: number
): void {
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
                    .filter((t): t is Territory => t !== undefined)
                    .filter(t => t.hexes.size + territory.hexes.size <= maxSize);

                if (neighbors.length > 0) {
                    // Merge into the smallest eligible neighbor for balance
                    const smallest = neighbors.reduce((a, b) =>
                        a.hexes.size <= b.hexes.size ? a : b
                    );

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
 * Fisher-Yates shuffle
 */
function shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}
