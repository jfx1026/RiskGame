/**
 * Combat system for Risk Game
 * Implements traditional Risk-style dice combat with pair comparisons
 */

import { Territory } from './territory.js';
import { Team } from './game.js';

export interface CombatResult {
    attackerWins: boolean;
    attackerRolls: number[];
    defenderRolls: number[];
    attackerHighest: number;
    defenderHighest: number;
    attackerArmies: number;
    defenderArmies: number;
    attackerLost: number;
    defenderLost: number;
}

/**
 * Roll a specified number of six-sided dice
 */
export function rollDice(count: number): number[] {
    const rolls: number[] = [];
    for (let i = 0; i < count; i++) {
        rolls.push(Math.floor(Math.random() * 6) + 1);
    }
    return rolls;
}

/**
 * Get the highest value from an array of dice rolls
 */
export function getHighestRoll(rolls: number[]): number {
    return Math.max(...rolls);
}

/**
 * Resolve combat between attacker and defender using traditional Risk-style pair comparisons
 * Each army = 1 die, dice are sorted and compared in pairs (highest vs highest, etc.)
 * Ties go to defender
 */
export function resolveCombat(attackerArmies: number, defenderArmies: number): CombatResult {
    const attackerRolls = rollDice(attackerArmies);
    const defenderRolls = rollDice(defenderArmies);

    // Sort both in descending order for pair comparison
    const sortedAttacker = [...attackerRolls].sort((a, b) => b - a);
    const sortedDefender = [...defenderRolls].sort((a, b) => b - a);

    // Compare as many pairs as the minimum of both counts
    const comparisons = Math.min(attackerArmies, defenderArmies);

    let attackerLost = 0;
    let defenderLost = 0;

    for (let i = 0; i < comparisons; i++) {
        if (sortedAttacker[i] > sortedDefender[i]) {
            // Attacker wins this comparison - defender loses 1 army
            defenderLost++;
        } else {
            // Defender wins (ties go to defender) - attacker loses 1 army
            attackerLost++;
        }
    }

    // Attacker conquers the territory if defender loses all armies
    const attackerWins = defenderLost >= defenderArmies;

    return {
        attackerWins,
        attackerRolls,
        defenderRolls,
        attackerHighest: sortedAttacker[0],
        defenderHighest: sortedDefender[0],
        attackerArmies,
        defenderArmies,
        attackerLost,
        defenderLost,
    };
}

/**
 * Execute an attack from source territory to target territory
 * Returns the combat result and modifies territories accordingly
 */
export function executeAttack(
    source: Territory,
    target: Territory,
    teams: Team[]
): CombatResult {
    // Attacker must leave 1 army behind, so only (armies - 1) can attack
    const attackingArmies = source.armies - 1;
    const result = resolveCombat(attackingArmies, target.armies);

    // Apply losses from pair comparisons
    source.armies -= result.attackerLost;
    target.armies -= result.defenderLost;

    if (result.attackerWins) {
        // Attacker conquers - defender lost all armies
        // Surviving attackers move to conquered territory, capped by territory capacity
        const survivingAttackers = result.attackerArmies - result.attackerLost;
        const targetCapacity = target.hexes.size;
        const movingArmies = Math.min(survivingAttackers, targetCapacity);

        // Update territory ownership
        const previousOwner = target.owner;
        const newOwner = source.owner;

        // Remove territory from previous owner's list
        if (previousOwner !== undefined && teams[previousOwner]) {
            const index = teams[previousOwner].territories.indexOf(target.id);
            if (index > -1) {
                teams[previousOwner].territories.splice(index, 1);
            }
        }

        // Add territory to new owner's list
        if (newOwner !== undefined && teams[newOwner]) {
            teams[newOwner].territories.push(target.id);
        }

        // Update territory properties
        target.owner = newOwner;
        target.color = source.color;
        target.armies = Math.max(1, movingArmies);  // At least 1 army in conquered territory
        source.armies -= movingArmies;  // Remaining armies stay behind
    }

    return result;
}

/**
 * Check if a territory can attack another territory
 * Requirements:
 * - Source must have more than 1 army
 * - Target must be a neighbor
 * - Target must be owned by a different team
 */
export function canAttack(source: Territory, target: Territory): boolean {
    // Must have more than 1 army to attack
    if (source.armies <= 1) {
        return false;
    }

    // Target must be a neighbor
    if (!source.neighbors.has(target.id)) {
        return false;
    }

    // Target must be owned by a different team
    if (source.owner === target.owner) {
        return false;
    }

    return true;
}

/**
 * Get all valid attack targets for a territory
 */
export function getValidAttackTargets(
    source: Territory,
    territories: Territory[]
): Territory[] {
    if (source.armies <= 1) {
        return [];
    }

    return territories.filter(t => {
        const isNeighbor = source.neighbors.has(t.id);
        const isDifferentOwner = t.owner !== source.owner;
        return isNeighbor && isDifferentOwner;
    });
}

/**
 * Format combat result for display
 */
export function formatCombatResult(result: CombatResult, attackerName: string, defenderName: string): string {
    const attackerRollsStr = [...result.attackerRolls].sort((a, b) => b - a).join(', ');
    const defenderRollsStr = [...result.defenderRolls].sort((a, b) => b - a).join(', ');

    if (result.attackerWins) {
        const casualtyInfo = result.attackerLost > 0 ? ` (-${result.attackerLost} att)` : '';
        return `${attackerName} [${attackerRollsStr}] conquers ${defenderName} [${defenderRollsStr}]!${casualtyInfo}`;
    } else {
        return `${attackerName} [${attackerRollsStr}] vs ${defenderName} [${defenderRollsStr}] (-${result.attackerLost} att, -${result.defenderLost} def)`;
    }
}
