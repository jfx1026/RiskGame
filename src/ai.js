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
    // Only attack if we have a reasonable advantage
    // Score of 10 means equal armies (ratio of 1.0 * 10)
    const bestAttack = attacks[0];
    // Be somewhat aggressive - attack if we have at least equal or better odds
    // A score of 10 means 1:1 ratio, which gives decent chances
    if (bestAttack.score >= 8) {
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
    const MAX_ATTACKS_PER_TURN = 10;
    if (attacksThisTurn >= MAX_ATTACKS_PER_TURN) {
        return false;
    }
    // Check if there are any valid attacks left
    const bestAttack = findBestAttack(state);
    return bestAttack !== null;
}
//# sourceMappingURL=ai.js.map