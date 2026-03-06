import { describe, it, expect, vi } from 'vitest';
import {
    rollDice,
    getHighestRoll,
    resolveCombat,
    canAttack,
    getValidAttackTargets,
    formatCombatResult,
    CombatResult,
} from './combat.js';
import { Territory } from './territory.js';

describe('rollDice', () => {
    it('returns the correct number of dice', () => {
        expect(rollDice(1)).toHaveLength(1);
        expect(rollDice(3)).toHaveLength(3);
        expect(rollDice(6)).toHaveLength(6);
    });

    it('returns values between 1 and 6', () => {
        // Roll many dice to check range
        for (let i = 0; i < 100; i++) {
            const rolls = rollDice(5);
            for (const roll of rolls) {
                expect(roll).toBeGreaterThanOrEqual(1);
                expect(roll).toBeLessThanOrEqual(6);
            }
        }
    });

    it('returns integers only', () => {
        for (let i = 0; i < 50; i++) {
            const rolls = rollDice(3);
            for (const roll of rolls) {
                expect(Number.isInteger(roll)).toBe(true);
            }
        }
    });
});

describe('getHighestRoll', () => {
    it('returns the highest value', () => {
        expect(getHighestRoll([1, 2, 3])).toBe(3);
        expect(getHighestRoll([6, 1, 4])).toBe(6);
        expect(getHighestRoll([2, 2, 2])).toBe(2);
    });

    it('handles single die', () => {
        expect(getHighestRoll([5])).toBe(5);
    });
});

describe('resolveCombat', () => {
    it('returns correct structure', () => {
        const result = resolveCombat(3, 2);

        expect(result).toHaveProperty('attackerWins');
        expect(result).toHaveProperty('attackerRolls');
        expect(result).toHaveProperty('defenderRolls');
        expect(result).toHaveProperty('attackerHighest');
        expect(result).toHaveProperty('defenderHighest');
        expect(result).toHaveProperty('attackerLost');
        expect(result).toHaveProperty('defenderLost');
    });

    it('rolls correct number of dice for each side', () => {
        const result = resolveCombat(3, 2);

        expect(result.attackerRolls).toHaveLength(3);
        expect(result.defenderRolls).toHaveLength(2);
    });

    it('compares only as many pairs as minimum army count', () => {
        // With 3 attackers vs 1 defender, only 1 comparison happens
        const result = resolveCombat(3, 1);

        // Total losses should equal number of comparisons (1)
        expect(result.attackerLost + result.defenderLost).toBe(1);
    });

    it('attacker wins when defender loses all armies', () => {
        // Mock Math.random to control dice rolls
        const mockRandom = vi.spyOn(Math, 'random');

        // Attacker rolls 6, defender rolls 1
        mockRandom.mockReturnValueOnce(0.99); // 6
        mockRandom.mockReturnValueOnce(0.01); // 1

        const result = resolveCombat(1, 1);

        expect(result.attackerWins).toBe(true);
        expect(result.defenderLost).toBe(1);
        expect(result.attackerLost).toBe(0);

        mockRandom.mockRestore();
    });

    it('defender wins ties', () => {
        const mockRandom = vi.spyOn(Math, 'random');

        // Both roll 3 (0.33-0.5 range gives 3)
        mockRandom.mockReturnValueOnce(0.4); // 3
        mockRandom.mockReturnValueOnce(0.4); // 3

        const result = resolveCombat(1, 1);

        expect(result.attackerWins).toBe(false);
        expect(result.attackerLost).toBe(1);
        expect(result.defenderLost).toBe(0);

        mockRandom.mockRestore();
    });

    it('handles multiple comparisons correctly', () => {
        const mockRandom = vi.spyOn(Math, 'random');

        // Attacker: 6, 5, 4 | Defender: 3, 2
        // Sorted: Att [6,5,4] vs Def [3,2]
        // Compare: 6>3 (def loses), 5>2 (def loses)
        mockRandom
            .mockReturnValueOnce(0.99) // 6
            .mockReturnValueOnce(0.8)  // 5
            .mockReturnValueOnce(0.6)  // 4
            .mockReturnValueOnce(0.4)  // 3
            .mockReturnValueOnce(0.2); // 2

        const result = resolveCombat(3, 2);

        expect(result.defenderLost).toBe(2);
        expect(result.attackerLost).toBe(0);
        expect(result.attackerWins).toBe(true);

        mockRandom.mockRestore();
    });
});

describe('canAttack', () => {
    const createTerritory = (overrides: Partial<Territory> = {}): Territory => ({
        id: 1,
        name: 'Test',
        hexes: new Set(['0,0']),
        neighbors: new Set<number>(),
        armies: 2,
        owner: 0,
        color: '#ff0000',
        type: 'small',
        ...overrides,
    });

    it('returns false when source has only 1 army', () => {
        const source = createTerritory({ armies: 1, neighbors: new Set([2]) });
        const target = createTerritory({ id: 2, owner: 1 });

        expect(canAttack(source, target)).toBe(false);
    });

    it('returns false when target is not a neighbor', () => {
        const source = createTerritory({ armies: 3, neighbors: new Set([3]) });
        const target = createTerritory({ id: 2, owner: 1 });

        expect(canAttack(source, target)).toBe(false);
    });

    it('returns false when target has same owner', () => {
        const source = createTerritory({ armies: 3, neighbors: new Set([2]), owner: 0 });
        const target = createTerritory({ id: 2, owner: 0 });

        expect(canAttack(source, target)).toBe(false);
    });

    it('returns true when all conditions are met', () => {
        const source = createTerritory({ armies: 3, neighbors: new Set([2]), owner: 0 });
        const target = createTerritory({ id: 2, owner: 1 });

        expect(canAttack(source, target)).toBe(true);
    });
});

describe('getValidAttackTargets', () => {
    const createTerritory = (id: number, owner: number, armies: number, neighbors: number[]): Territory => ({
        id,
        name: `Territory ${id}`,
        hexes: new Set(['0,0']),
        neighbors: new Set(neighbors),
        armies,
        owner,
        color: '#ff0000',
        type: 'small',
    });

    it('returns empty array when source has 1 or fewer armies', () => {
        const source = createTerritory(1, 0, 1, [2, 3]);
        const territories = [
            source,
            createTerritory(2, 1, 2, [1]),
            createTerritory(3, 1, 2, [1]),
        ];

        expect(getValidAttackTargets(source, territories)).toHaveLength(0);
    });

    it('returns only enemy neighbors', () => {
        const source = createTerritory(1, 0, 5, [2, 3, 4]);
        const territories = [
            source,
            createTerritory(2, 1, 2, [1]), // Enemy neighbor - valid
            createTerritory(3, 0, 2, [1]), // Friendly neighbor - invalid
            createTerritory(4, 2, 2, [1]), // Enemy neighbor - valid
            createTerritory(5, 1, 2, []),  // Enemy non-neighbor - invalid
        ];

        const targets = getValidAttackTargets(source, territories);

        expect(targets).toHaveLength(2);
        expect(targets.map(t => t.id)).toContain(2);
        expect(targets.map(t => t.id)).toContain(4);
    });
});

describe('formatCombatResult', () => {
    it('formats victory message correctly', () => {
        const result: CombatResult = {
            attackerWins: true,
            attackerRolls: [6, 4],
            defenderRolls: [3, 2],
            attackerHighest: 6,
            defenderHighest: 3,
            attackerArmies: 2,
            defenderArmies: 2,
            attackerLost: 0,
            defenderLost: 2,
        };

        const formatted = formatCombatResult(result, 'Attacker', 'Defender');

        expect(formatted).toContain('conquers');
        expect(formatted).toContain('Attacker');
        expect(formatted).toContain('Defender');
    });

    it('formats defeat message with casualties', () => {
        const result: CombatResult = {
            attackerWins: false,
            attackerRolls: [3, 2],
            defenderRolls: [5, 4],
            attackerHighest: 3,
            defenderHighest: 5,
            attackerArmies: 2,
            defenderArmies: 2,
            attackerLost: 2,
            defenderLost: 0,
        };

        const formatted = formatCombatResult(result, 'Attacker', 'Defender');

        expect(formatted).not.toContain('conquers');
        expect(formatted).toContain('-2 att');
        expect(formatted).toContain('-0 def');
    });
});
