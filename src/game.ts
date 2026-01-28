/**
 * Game state and team management
 */

import { Territory, TerritoryType } from './territory.js';
import { TERRITORY_COLORS } from './colors.js';

export interface Team {
    id: number;
    name: string;
    color: string;
    territories: number[];  // Territory IDs owned by this team
}

export interface GameState {
    teams: Team[];
    territories: Territory[];
    currentTeamIndex: number;
}

// Custom colorblind-friendly palette
const TEAM_COLORS = [
    '#EF476F',  // Bubblegum Pink
    '#F78C6B',  // Coral Glow
    '#FFD166',  // Royal Gold
    '#06D6A0',  // Emerald
    '#118AB2',  // Ocean Blue
    '#864E14',  // Bronze
];

const TEAM_NAMES = [
    'Pink Army',
    'Coral Legion',
    'Gold Empire',
    'Emerald Horde',
    'Ocean Alliance',
    'Bronze Dynasty',
];

/**
 * Create teams for a game
 */
export function createTeams(teamCount: number): Team[] {
    const teams: Team[] = [];

    for (let i = 0; i < teamCount; i++) {
        teams.push({
            id: i,
            name: TEAM_NAMES[i] || `Team ${i + 1}`,
            color: TEAM_COLORS[i] || TERRITORY_COLORS[i],
            territories: [],
        });
    }

    return teams;
}

/**
 * Randomly assign territories to teams
 * Distributes as evenly as possible
 */
export function assignTerritoriesToTeams(
    territories: Territory[],
    teams: Team[]
): void {
    // Clear existing assignments
    for (const team of teams) {
        team.territories = [];
    }

    // Shuffle territories for random assignment
    const shuffled = shuffleArray([...territories]);

    // Assign territories round-robin style for even distribution
    for (let i = 0; i < shuffled.length; i++) {
        const teamIndex = i % teams.length;
        const territory = shuffled[i];

        // Assign territory to team
        teams[teamIndex].territories.push(territory.id);
        territory.owner = teamIndex;
        territory.color = teams[teamIndex].color;
    }
}

/**
 * Get team by ID
 */
export function getTeamById(teams: Team[], id: number): Team | undefined {
    return teams.find(t => t.id === id);
}

/**
 * Get territories owned by a team
 */
export function getTeamTerritories(
    team: Team,
    territories: Territory[]
): Territory[] {
    return territories.filter(t => t.owner === team.id);
}

/**
 * Get territory count per team
 */
export function getTerritoryCounts(teams: Team[]): Map<number, number> {
    const counts = new Map<number, number>();
    for (const team of teams) {
        counts.set(team.id, team.territories.length);
    }
    return counts;
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

/**
 * Assign territory types (big/small) to all territories
 * About 25% will be big, with some randomness (20-30%)
 */
export function assignTerritoryTypes(territories: Territory[]): void {
    // Random percentage between 20% and 30%
    const bigPercent = 0.20 + Math.random() * 0.10;
    const bigCount = Math.round(territories.length * bigPercent);

    // Shuffle and pick first N to be big
    const shuffled = shuffleArray([...territories]);

    for (let i = 0; i < shuffled.length; i++) {
        shuffled[i].type = i < bigCount ? 'big' : 'small';
    }
}

/**
 * Assign initial armies to territories for each team
 * Each team gets the same total, randomly distributed across their territories
 * Respects territory type limits (small: max 7, big: max 10)
 */
export function assignInitialArmies(
    territories: Territory[],
    teams: Team[],
    armiesPerTeam: number
): void {
    // Group territories by team
    for (const team of teams) {
        const teamTerritories = territories.filter(t => t.owner === team.id);
        if (teamTerritories.length === 0) continue;

        // Start each territory with 1 army
        for (const territory of teamTerritories) {
            territory.armies = 1;
        }

        // Distribute remaining armies randomly
        let remaining = armiesPerTeam - teamTerritories.length;

        while (remaining > 0) {
            // Pick a random territory that can accept more armies
            const eligible = teamTerritories.filter(t => {
                const maxArmies = t.type === 'big' ? 10 : 7;
                return t.armies < maxArmies;
            });

            if (eligible.length === 0) break;

            const randomIndex = Math.floor(Math.random() * eligible.length);
            eligible[randomIndex].armies++;
            remaining--;
        }
    }
}

/**
 * Pick a random hex in each territory to display armies
 */
export function assignArmyDisplayHexes(territories: Territory[]): void {
    for (const territory of territories) {
        const hexes = Array.from(territory.hexes);
        if (hexes.length > 0) {
            const randomIndex = Math.floor(Math.random() * hexes.length);
            territory.armyHex = hexes[randomIndex];
        }
    }
}

/**
 * Initialize all game setup for territories
 * Call this after territories are assigned to teams
 */
export function initializeTerritories(
    territories: Territory[],
    teams: Team[],
    armiesPerTeam: number
): void {
    assignTerritoryTypes(territories);
    assignInitialArmies(territories, teams, armiesPerTeam);
    assignArmyDisplayHexes(territories);
}
