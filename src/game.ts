/**
 * Game state and team management
 */

import { Territory, TerritoryType } from './territory.js';
import { TERRITORY_COLORS } from './colors.js';
import { GeneratedMap } from './mapGenerator.js';
import { CombatResult, executeAttack, canAttack, getValidAttackTargets } from './combat.js';

export interface Team {
    id: number;
    name: string;
    color: string;
    territories: number[];  // Territory IDs owned by this team
    isHuman: boolean;  // True if controlled by human player
}

export type GamePhase = 'select' | 'attack' | 'resupply' | 'gameOver';

export interface GameState {
    teams: Team[];
    territories: Territory[];
    currentTeamIndex: number;
    selectedTerritory: number | null;  // Source territory for attack
    phase: GamePhase;
    turnNumber: number;
    lastCombatResult: CombatResult | null;
    winner: number | null;  // Team ID of winner, if game is over
    capturedThisTurn: boolean;  // True if current team captured a territory this turn
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
 * One team is randomly assigned as human, rest are computer-controlled
 */
export function createTeams(teamCount: number): Team[] {
    const teams: Team[] = [];

    // Randomly select which team will be human
    const humanTeamIndex = Math.floor(Math.random() * teamCount);

    for (let i = 0; i < teamCount; i++) {
        teams.push({
            id: i,
            name: TEAM_NAMES[i] || `Team ${i + 1}`,
            color: TEAM_COLORS[i] || TERRITORY_COLORS[i],
            territories: [],
            isHuman: i === humanTeamIndex,
        });
    }

    console.log(`Human player: ${teams[humanTeamIndex].name}`);

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

// ============================================================
// TURN-BASED GAME STATE MANAGEMENT
// ============================================================

/**
 * Start a new game with the given map and teams
 */
export function startGame(map: GeneratedMap, teams: Team[]): GameState {
    return {
        teams,
        territories: map.territories,
        currentTeamIndex: 0,
        selectedTerritory: null,
        phase: 'select',
        turnNumber: 1,
        lastCombatResult: null,
        winner: null,
        capturedThisTurn: false,
    };
}

/**
 * Get the current team
 */
export function getCurrentTeam(state: GameState): Team {
    return state.teams[state.currentTeamIndex];
}

/**
 * Check if a territory is owned by the current team
 */
export function isOwnedByCurrentTeam(state: GameState, territoryId: number): boolean {
    const territory = state.territories.find(t => t.id === territoryId);
    return territory?.owner === state.currentTeamIndex;
}

/**
 * Select a territory as source for attack
 * Returns new state with the selection
 */
export function selectTerritory(state: GameState, territoryId: number): GameState {
    // Can only select during 'select' or 'attack' phase (allow switching selection)
    if (state.phase !== 'select' && state.phase !== 'attack') {
        return state;
    }

    const territory = state.territories.find(t => t.id === territoryId);
    if (!territory) {
        return state;
    }

    // Must be owned by current team
    if (territory.owner !== state.currentTeamIndex) {
        return state;
    }

    // Must have valid attack targets
    const validTargets = getValidAttackTargets(territory, state.territories);
    if (validTargets.length === 0) {
        // Territory can't attack anyone - just select for visual feedback
        return {
            ...state,
            selectedTerritory: territoryId,
        };
    }

    return {
        ...state,
        selectedTerritory: territoryId,
        phase: 'attack',
    };
}

/**
 * Deselect the current territory
 */
export function deselectTerritory(state: GameState): GameState {
    return {
        ...state,
        selectedTerritory: null,
        phase: 'select',
    };
}

/**
 * Attempt an attack from the selected territory to the target
 * Returns the new game state after combat
 */
export function attemptAttack(state: GameState, targetId: number): GameState {
    // Must have a selected territory
    if (state.selectedTerritory === null) {
        return state;
    }

    const source = state.territories.find(t => t.id === state.selectedTerritory);
    const target = state.territories.find(t => t.id === targetId);

    if (!source || !target) {
        return state;
    }

    // Validate the attack
    if (!canAttack(source, target)) {
        return state;
    }

    // Execute the attack
    const combatResult = executeAttack(source, target, state.teams);

    // Check for victory
    const winner = checkVictory(state);

    // Track if territory was captured this turn
    const captured = state.capturedThisTurn || combatResult.attackerWins;

    // Return to select phase after attack
    return {
        ...state,
        selectedTerritory: null,
        phase: winner !== null ? 'gameOver' : 'select',
        lastCombatResult: combatResult,
        winner,
        capturedThisTurn: captured,
    };
}

/**
 * End the current player's turn
 * Applies resupply and moves to next player
 */
export function endTurn(state: GameState): GameState {
    // Skip if game is over
    if (state.phase === 'gameOver') {
        return state;
    }

    // Apply resupply
    let newState = applyResupply(state);

    // Move to next team that still has territories
    let nextTeamIndex = (state.currentTeamIndex + 1) % state.teams.length;
    let attempts = 0;

    while (attempts < state.teams.length) {
        if (state.teams[nextTeamIndex].territories.length > 0) {
            break;
        }
        nextTeamIndex = (nextTeamIndex + 1) % state.teams.length;
        attempts++;
    }

    // Check if only one team remains
    const winner = checkVictory(newState);

    return {
        ...newState,
        currentTeamIndex: nextTeamIndex,
        selectedTerritory: null,
        phase: winner !== null ? 'gameOver' : 'select',
        turnNumber: state.turnNumber + 1,
        lastCombatResult: null,
        winner,
        capturedThisTurn: false,  // Reset for next player's turn
    };
}

/**
 * Calculate resupply amount for the current team
 * Formula: (Largest contiguous group) + (Total territories / 4)
 * Penalty: If no territories captured this turn, get half (rounded down)
 */
export function calculateResupply(state: GameState): number {
    const currentTeam = getCurrentTeam(state);
    const totalTerritories = state.territories.filter(t => t.owner === currentTeam.id).length;
    const largestGroup = findLargestContiguousGroup(state.territories, currentTeam.id);

    // Base reinforcements: largest group + total/4
    let reinforcements = largestGroup + Math.floor(totalTerritories / 4);

    // Penalty for not capturing any territory: half reinforcements
    if (!state.capturedThisTurn) {
        reinforcements = Math.floor(reinforcements / 2);
    }

    // Minimum of 1 reinforcement (if they have any territories)
    return totalTerritories > 0 ? Math.max(1, reinforcements) : 0;
}

/**
 * Find the size of the largest contiguous group of territories for a team
 * Uses BFS to find connected components
 */
export function findLargestContiguousGroup(territories: Territory[], teamId: number): number {
    const teamTerritories = territories.filter(t => t.owner === teamId);
    const visited = new Set<number>();
    let largestGroup = 0;

    for (const territory of teamTerritories) {
        if (visited.has(territory.id)) continue;

        // BFS to find the size of this connected component
        const queue: number[] = [territory.id];
        let groupSize = 0;

        while (queue.length > 0) {
            const currentId = queue.shift()!;
            if (visited.has(currentId)) continue;
            visited.add(currentId);

            const current = territories.find(t => t.id === currentId);
            if (!current || current.owner !== teamId) continue;

            groupSize++;

            // Add unvisited neighbors owned by same team
            for (const neighborId of current.neighbors) {
                if (!visited.has(neighborId)) {
                    const neighbor = territories.find(t => t.id === neighborId);
                    if (neighbor && neighbor.owner === teamId) {
                        queue.push(neighborId);
                    }
                }
            }
        }

        if (groupSize > largestGroup) {
            largestGroup = groupSize;
        }
    }

    return largestGroup;
}

/**
 * Apply resupply to the current team
 * New armies are distributed randomly across owned territories
 */
export function applyResupply(state: GameState): GameState {
    const resupplyAmount = calculateResupply(state);
    const currentTeam = getCurrentTeam(state);
    const teamTerritories = state.territories.filter(t => t.owner === currentTeam.id);

    if (teamTerritories.length === 0 || resupplyAmount === 0) {
        return state;
    }

    // Create a copy of territories to modify
    const newTerritories = state.territories.map(t => ({ ...t }));
    const teamTerritoryIds = new Set(currentTeam.territories);

    let remaining = resupplyAmount;
    while (remaining > 0) {
        // Get eligible territories (can accept more armies)
        const eligible = newTerritories.filter(t => {
            if (!teamTerritoryIds.has(t.id)) return false;
            const maxArmies = t.type === 'big' ? 10 : 7;
            return t.armies < maxArmies;
        });

        if (eligible.length === 0) break;

        // Distribute to a random eligible territory
        const randomIndex = Math.floor(Math.random() * eligible.length);
        eligible[randomIndex].armies++;
        remaining--;
    }

    return {
        ...state,
        territories: newTerritories,
    };
}

/**
 * Check if a team has won (owns all territories)
 * Returns the winning team ID, or null if no winner yet
 */
export function checkVictory(state: GameState): number | null {
    // Count territories per team
    const territoryCounts = new Map<number, number>();

    for (const territory of state.territories) {
        if (territory.owner !== undefined) {
            const count = territoryCounts.get(territory.owner) || 0;
            territoryCounts.set(territory.owner, count + 1);
        }
    }

    // Check if only one team has territories
    const teamsWithTerritories = Array.from(territoryCounts.entries())
        .filter(([_, count]) => count > 0);

    if (teamsWithTerritories.length === 1) {
        return teamsWithTerritories[0][0];
    }

    return null;
}

/**
 * Get valid attack targets for the currently selected territory
 */
export function getSelectedTerritoryTargets(state: GameState): Territory[] {
    if (state.selectedTerritory === null) {
        return [];
    }

    const source = state.territories.find(t => t.id === state.selectedTerritory);
    if (!source) {
        return [];
    }

    return getValidAttackTargets(source, state.territories);
}
