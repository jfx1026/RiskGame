/**
 * AI module for computer-controlled players
 * Each team has a distinct personality that affects their strategy
 */
import { getCurrentTeam } from './game.js';
import { getValidAttackTargets } from './combat.js';
/**
 * Map team IDs to their personalities
 */
const TEAM_PERSONALITIES = [
    'aggressive', // 0: Pink
    'strategic', // 1: Coral
    'positional', // 2: Gold
    'longterm', // 3: Emerald
    'connector', // 4: Ocean
    'erratic', // 5: Bronze
];
/**
 * Get the personality for a team
 */
export function getTeamPersonality(teamId) {
    return TEAM_PERSONALITIES[teamId] || 'strategic';
}
/**
 * Find all possible attacks for the current team
 * Returns attacks sorted by score (best first), adjusted for personality
 */
export function findAllAttacks(state) {
    const currentTeam = getCurrentTeam(state);
    const personality = getTeamPersonality(currentTeam.id);
    const attacks = [];
    // Find all territories owned by current team that can attack
    const ownedTerritories = state.territories.filter(t => t.owner === currentTeam.id);
    for (const source of ownedTerritories) {
        // Skip if territory can't attack (needs more than 1 army)
        if (source.armies <= 1)
            continue;
        const targets = getValidAttackTargets(source, state.territories);
        for (const target of targets) {
            // Calculate attack score based on personality
            const score = calculateAttackScore(source, target, personality, state, currentTeam.id);
            attacks.push({
                sourceId: source.id,
                targetId: target.id,
                score,
            });
        }
    }
    // Sort by score descending (best attacks first)
    attacks.sort((a, b) => b.score - a.score);
    // For erratic personality, occasionally shuffle the order
    if (personality === 'erratic' && Math.random() < 0.4) {
        shuffleArray(attacks);
    }
    return attacks;
}
/**
 * Calculate attack score based on army advantage and personality
 */
function calculateAttackScore(source, target, personality, state, teamId) {
    // Base score components
    const ratio = source.armies / target.armies;
    const armyAdvantage = source.armies - target.armies;
    const weakTargetBonus = 10 - target.armies;
    // Base score
    let score = ratio * 10 + armyAdvantage * 2 + weakTargetBonus;
    // Apply personality modifiers
    switch (personality) {
        case 'aggressive':
            // Pink: Boost all attack scores, loves to attack
            score += 10;
            // Extra bonus for attacking strong targets (glory!)
            if (target.armies >= 4)
                score += 5;
            break;
        case 'strategic':
            // Coral: Only values attacks with clear advantage
            if (ratio < 1.0)
                score -= 10; // Penalize disadvantaged attacks
            if (ratio >= 1.5)
                score += 5; // Bonus for strong advantage
            break;
        case 'positional':
            // Gold: Values territories with many neighbors (key positions)
            const targetNeighborCount = target.neighbors.size;
            score += targetNeighborCount * 3; // More neighbors = more valuable
            // Bonus for territories that border multiple enemies
            const enemyNeighbors = countEnemyNeighbors(target, state.territories, teamId);
            score += enemyNeighbors * 2;
            break;
        case 'longterm':
            // Emerald: Conservative, only attacks when very strong
            if (ratio < 1.2)
                score -= 15; // Strong penalty for risky attacks
            if (source.armies >= 5)
                score += 8; // Bonus when attacking from strength
            // Prefer to keep armies for defense
            if (source.armies <= 3)
                score -= 10;
            break;
        case 'connector':
            // Ocean: Prioritizes attacks that would connect territory groups
            if (wouldConnectTerritories(target, state.territories, teamId)) {
                score += 20; // Big bonus for connecting territories
            }
            break;
        case 'erratic':
            // Bronze: Add randomness to scores
            score += (Math.random() - 0.5) * 20;
            break;
    }
    return score;
}
/**
 * Count how many enemy territories neighbor this target
 */
function countEnemyNeighbors(target, territories, teamId) {
    let count = 0;
    for (const neighborId of target.neighbors) {
        const neighbor = territories.find(t => t.id === neighborId);
        if (neighbor && neighbor.owner !== teamId && neighbor.owner !== target.owner) {
            count++;
        }
    }
    return count;
}
/**
 * Check if capturing this territory would connect two groups of our territories
 */
function wouldConnectTerritories(target, territories, teamId) {
    // Count how many of our territory groups this target neighbors
    const ourNeighboringTerritories = [];
    for (const neighborId of target.neighbors) {
        const neighbor = territories.find(t => t.id === neighborId);
        if (neighbor && neighbor.owner === teamId) {
            ourNeighboringTerritories.push(neighborId);
        }
    }
    // If we have 2+ neighboring territories, check if they're in different groups
    if (ourNeighboringTerritories.length < 2)
        return false;
    // Simple check: if any two neighbors aren't directly connected, this would bridge them
    for (let i = 0; i < ourNeighboringTerritories.length; i++) {
        for (let j = i + 1; j < ourNeighboringTerritories.length; j++) {
            const t1 = territories.find(t => t.id === ourNeighboringTerritories[i]);
            const t2 = territories.find(t => t.id === ourNeighboringTerritories[j]);
            if (t1 && t2 && !t1.neighbors.has(t2.id)) {
                return true; // These two aren't directly connected, capturing target would bridge them
            }
        }
    }
    return false;
}
/**
 * Get the minimum score threshold for attacking based on personality
 */
function getAttackThreshold(personality) {
    switch (personality) {
        case 'aggressive':
            return -5; // Will attack even at a disadvantage
        case 'strategic':
            return 12; // Only attacks with clear advantage
        case 'positional':
            return 5; // Moderate threshold
        case 'longterm':
            return 15; // Very conservative
        case 'connector':
            return 3; // Will take risks to connect
        case 'erratic':
            return Math.random() * 20 - 5; // Random threshold each time
        default:
            return 5;
    }
}
/**
 * Get max attacks per turn based on personality
 */
function getMaxAttacks(personality) {
    switch (personality) {
        case 'aggressive':
            return 20; // Loves to attack
        case 'strategic':
            return 10; // Measured approach
        case 'positional':
            return 12; // Moderate
        case 'longterm':
            return 6; // Few but calculated attacks
        case 'connector':
            return 15; // Will attack to connect
        case 'erratic':
            return Math.floor(Math.random() * 15) + 5; // Random each turn
        default:
            return 12;
    }
}
/**
 * Find the best attack for the current team
 * Returns null if no good attacks are available
 */
export function findBestAttack(state) {
    const currentTeam = getCurrentTeam(state);
    const personality = getTeamPersonality(currentTeam.id);
    const attacks = findAllAttacks(state);
    if (attacks.length === 0) {
        return null;
    }
    const bestAttack = attacks[0];
    const threshold = getAttackThreshold(personality);
    if (bestAttack.score >= threshold) {
        return bestAttack;
    }
    return null;
}
/**
 * Check if the computer should continue attacking
 * Returns false if turn should end
 */
export function shouldContinueAttacking(state, attacksThisTurn) {
    const currentTeam = getCurrentTeam(state);
    const personality = getTeamPersonality(currentTeam.id);
    const maxAttacks = getMaxAttacks(personality);
    if (attacksThisTurn >= maxAttacks) {
        return false;
    }
    // Check if there are any valid attacks left
    const bestAttack = findBestAttack(state);
    return bestAttack !== null;
}
/**
 * Fisher-Yates shuffle for erratic personality
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}
//# sourceMappingURL=ai.js.map