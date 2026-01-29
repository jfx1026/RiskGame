/**
 * AI module for computer-controlled players
 * Implements simple but effective attack strategy
 */
import { getCurrentTeam } from './game.js';
import { getValidAttackTargets } from './combat.js';
/**
 * Find all possible attacks for the current team
 * Returns attacks sorted by score (best first)
 */
export function findAllAttacks(state) {
    const currentTeam = getCurrentTeam(state);
    const attacks = [];
    // Find all territories owned by current team that can attack
    const ownedTerritories = state.territories.filter(t => t.owner === currentTeam.id);
    for (const source of ownedTerritories) {
        // Skip if territory can't attack (needs more than 1 army)
        if (source.armies <= 1)
            continue;
        const targets = getValidAttackTargets(source, state.territories);
        for (const target of targets) {
            // Calculate attack score
            // Higher source armies and lower target armies = better score
            const score = calculateAttackScore(source, target);
            attacks.push({
                sourceId: source.id,
                targetId: target.id,
                score,
            });
        }
    }
    // Sort by score descending (best attacks first)
    attacks.sort((a, b) => b.score - a.score);
    return attacks;
}
/**
 * Calculate attack score based on army advantage
 * Higher score = better attack opportunity
 */
function calculateAttackScore(source, target) {
    // Base score is the ratio of source to target armies
    const ratio = source.armies / target.armies;
    // Bonus for having overwhelming force (more dice = better odds)
    const armyAdvantage = source.armies - target.armies;
    // Slight bonus for attacking weaker targets (easier to conquer)
    const weakTargetBonus = 10 - target.armies;
    // Combined score
    return ratio * 10 + armyAdvantage * 2 + weakTargetBonus;
}
/**
 * Find the best attack for the current team
 * Returns null if no good attacks are available
 */
export function findBestAttack(state) {
    const attacks = findAllAttacks(state);
    if (attacks.length === 0) {
        return null;
    }
    const bestAttack = attacks[0];
    // Balanced aggression - attack when odds are reasonable
    // Score examples:
    //   3v2: ratio=1.5 -> 15 + 2 + 8 = 25 (good)
    //   2v2: ratio=1.0 -> 10 + 0 + 8 = 18 (decent)
    //   2v3: ratio=0.67 -> 6.7 - 2 + 7 = 11.7 (acceptable)
    //   2v4: ratio=0.5 -> 5 - 4 + 6 = 7 (risky but ok)
    //   2v5: ratio=0.4 -> 4 - 6 + 5 = 3 (too risky)
    if (bestAttack.score >= 5) {
        return bestAttack;
    }
    // If no good attacks, return null
    return null;
}
/**
 * Check if the computer should continue attacking
 * Returns false if turn should end
 */
export function shouldContinueAttacking(state, attacksThisTurn) {
    // Limit attacks per turn to prevent infinite loops and give human time to see
    const MAX_ATTACKS_PER_TURN = 15;
    if (attacksThisTurn >= MAX_ATTACKS_PER_TURN) {
        return false;
    }
    // Check if there are any valid attacks left
    const bestAttack = findBestAttack(state);
    return bestAttack !== null;
}
//# sourceMappingURL=ai.js.map