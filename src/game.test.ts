import { describe, it, expect } from 'vitest';
import {
    createTeams,
    findLargestContiguousGroup,
    calculateResupply,
    checkVictory,
    getCurrentTeam,
    GameState,
    Team,
} from './game.js';
import { Territory } from './territory.js';

// Helper to create a minimal territory
function createTerritory(
    id: number,
    owner: number,
    neighbors: number[] = []
): Territory {
    return {
        id,
        name: `Territory ${id}`,
        hexes: new Set(['0,0']),
        neighbors: new Set(neighbors),
        armies: 2,
        owner,
        color: '#ff0000',
        type: 'small',
    };
}

// Helper to create a minimal game state
function createGameState(
    territories: Territory[],
    teams: Team[],
    overrides: Partial<GameState> = {}
): GameState {
    return {
        teams,
        territories,
        currentTeamIndex: 0,
        selectedTerritory: null,
        phase: 'select',
        turnNumber: 1,
        lastCombatResult: null,
        winner: null,
        capturedThisTurn: false,
        eliminationsThisTurn: 0,
        ...overrides,
    };
}

describe('createTeams', () => {
    it('creates the requested number of teams', () => {
        expect(createTeams(4)).toHaveLength(4);
        expect(createTeams(6)).toHaveLength(6);
    });

    it('assigns exactly one human player', () => {
        const teams = createTeams(5);
        const humanCount = teams.filter(t => t.isHuman).length;
        expect(humanCount).toBe(1);
    });

    it('assigns unique IDs to each team', () => {
        const teams = createTeams(6);
        const ids = new Set(teams.map(t => t.id));
        expect(ids.size).toBe(6);
    });

    it('assigns colors to all teams', () => {
        const teams = createTeams(6);
        for (const team of teams) {
            expect(team.color).toBeTruthy();
            expect(team.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
        }
    });
});

describe('findLargestContiguousGroup', () => {
    it('returns 0 when team has no territories', () => {
        const territories = [
            createTerritory(1, 0, [2]),
            createTerritory(2, 0, [1]),
        ];

        expect(findLargestContiguousGroup(territories, 1)).toBe(0);
    });

    it('returns 1 for a single isolated territory', () => {
        const territories = [
            createTerritory(1, 0, []),
            createTerritory(2, 1, []),
        ];

        expect(findLargestContiguousGroup(territories, 0)).toBe(1);
    });

    it('counts connected territories', () => {
        // Team 0 owns territories 1, 2, 3 which are all connected
        const territories = [
            createTerritory(1, 0, [2]),
            createTerritory(2, 0, [1, 3]),
            createTerritory(3, 0, [2]),
        ];

        expect(findLargestContiguousGroup(territories, 0)).toBe(3);
    });

    it('finds the largest group when multiple groups exist', () => {
        // Team 0 has two groups: (1,2) and (3,4,5)
        const territories = [
            createTerritory(1, 0, [2]),      // Group A
            createTerritory(2, 0, [1]),      // Group A
            createTerritory(3, 0, [4, 5]),   // Group B
            createTerritory(4, 0, [3, 5]),   // Group B
            createTerritory(5, 0, [3, 4]),   // Group B
            createTerritory(6, 1, [1, 3]),   // Enemy separating the groups
        ];

        expect(findLargestContiguousGroup(territories, 0)).toBe(3);
    });

    it('does not count enemy territories as connected', () => {
        // Territories 1 and 3 are owned by team 0 but separated by team 1
        const territories = [
            createTerritory(1, 0, [2]),
            createTerritory(2, 1, [1, 3]),  // Enemy in between
            createTerritory(3, 0, [2]),
        ];

        expect(findLargestContiguousGroup(territories, 0)).toBe(1);
    });
});

describe('calculateResupply', () => {
    it('returns 0 when team has no territories', () => {
        const teams: Team[] = [
            { id: 0, name: 'Team 0', color: '#ff0000', territories: [], isHuman: true },
        ];
        const territories: Territory[] = [];
        const state = createGameState(territories, teams);

        expect(calculateResupply(state)).toBe(0);
    });

    it('returns at least 1 when team has territories', () => {
        const teams: Team[] = [
            { id: 0, name: 'Team 0', color: '#ff0000', territories: [1], isHuman: true },
        ];
        const territories = [createTerritory(1, 0, [])];
        const state = createGameState(territories, teams);

        expect(calculateResupply(state)).toBeGreaterThanOrEqual(1);
    });

    it('gives bonus for capturing territory this turn', () => {
        const teams: Team[] = [
            { id: 0, name: 'Team 0', color: '#ff0000', territories: [1, 2, 3, 4], isHuman: true },
        ];
        const territories = [
            createTerritory(1, 0, [2]),
            createTerritory(2, 0, [1, 3]),
            createTerritory(3, 0, [2, 4]),
            createTerritory(4, 0, [3]),
        ];

        const withoutCapture = createGameState(territories, teams, { capturedThisTurn: false });
        const withCapture = createGameState(territories, teams, { capturedThisTurn: true });

        expect(calculateResupply(withCapture)).toBeGreaterThan(calculateResupply(withoutCapture));
    });

    it('gives bonus for eliminating players', () => {
        const teams: Team[] = [
            { id: 0, name: 'Team 0', color: '#ff0000', territories: [1, 2, 3, 4], isHuman: true },
        ];
        const territories = [
            createTerritory(1, 0, [2]),
            createTerritory(2, 0, [1, 3]),
            createTerritory(3, 0, [2, 4]),
            createTerritory(4, 0, [3]),
        ];

        const noElimination = createGameState(territories, teams, {
            capturedThisTurn: true,
            eliminationsThisTurn: 0,
        });
        const oneElimination = createGameState(territories, teams, {
            capturedThisTurn: true,
            eliminationsThisTurn: 1,
        });

        expect(calculateResupply(oneElimination)).toBe(calculateResupply(noElimination) + 3);
    });

    it('caps reinforcements at maximum', () => {
        const teams: Team[] = [
            { id: 0, name: 'Team 0', color: '#ff0000', territories: Array.from({ length: 50 }, (_, i) => i + 1), isHuman: true },
        ];

        // Create a huge connected empire
        const territories: Territory[] = [];
        for (let i = 1; i <= 50; i++) {
            const neighbors = [];
            if (i > 1) neighbors.push(i - 1);
            if (i < 50) neighbors.push(i + 1);
            territories.push(createTerritory(i, 0, neighbors));
        }

        const state = createGameState(territories, teams, {
            capturedThisTurn: true,
            eliminationsThisTurn: 5, // Many eliminations
        });

        // Should be capped at 12
        expect(calculateResupply(state)).toBe(12);
    });
});

describe('checkVictory', () => {
    it('returns null when multiple teams have territories', () => {
        const teams: Team[] = [
            { id: 0, name: 'Team 0', color: '#ff0000', territories: [1], isHuman: true },
            { id: 1, name: 'Team 1', color: '#00ff00', territories: [2], isHuman: false },
        ];
        const territories = [
            createTerritory(1, 0, [2]),
            createTerritory(2, 1, [1]),
        ];
        const state = createGameState(territories, teams);

        expect(checkVictory(state)).toBeNull();
    });

    it('returns winner ID when one team owns all territories', () => {
        const teams: Team[] = [
            { id: 0, name: 'Team 0', color: '#ff0000', territories: [1, 2], isHuman: true },
            { id: 1, name: 'Team 1', color: '#00ff00', territories: [], isHuman: false },
        ];
        const territories = [
            createTerritory(1, 0, [2]),
            createTerritory(2, 0, [1]),
        ];
        const state = createGameState(territories, teams);

        expect(checkVictory(state)).toBe(0);
    });

    it('handles victory by team other than team 0', () => {
        const teams: Team[] = [
            { id: 0, name: 'Team 0', color: '#ff0000', territories: [], isHuman: true },
            { id: 1, name: 'Team 1', color: '#00ff00', territories: [], isHuman: false },
            { id: 2, name: 'Team 2', color: '#0000ff', territories: [1, 2, 3], isHuman: false },
        ];
        const territories = [
            createTerritory(1, 2, [2]),
            createTerritory(2, 2, [1, 3]),
            createTerritory(3, 2, [2]),
        ];
        const state = createGameState(territories, teams);

        expect(checkVictory(state)).toBe(2);
    });
});

describe('getCurrentTeam', () => {
    it('returns the team at currentTeamIndex', () => {
        const teams: Team[] = [
            { id: 0, name: 'Team 0', color: '#ff0000', territories: [], isHuman: true },
            { id: 1, name: 'Team 1', color: '#00ff00', territories: [], isHuman: false },
            { id: 2, name: 'Team 2', color: '#0000ff', territories: [], isHuman: false },
        ];
        const state = createGameState([], teams, { currentTeamIndex: 1 });

        expect(getCurrentTeam(state)).toBe(teams[1]);
    });
});
