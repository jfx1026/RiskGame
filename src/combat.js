/**
 * Combat system for Risk Game
 * Implements Strategery-style dice-based combat
 */
/**
 * Roll a specified number of six-sided dice
 */
export function rollDice(count) {
    const rolls = [];
    for (let i = 0; i < count; i++) {
        rolls.push(Math.floor(Math.random() * 6) + 1);
    }
    return rolls;
}
/**
 * Get the highest value from an array of dice rolls
 */
export function getHighestRoll(rolls) {
    return Math.max(...rolls);
}
/**
 * Resolve combat between attacker and defender
 * Each army = 1 die, highest single die wins, ties go to defender
 */
export function resolveCombat(attackerArmies, defenderArmies) {
    const attackerRolls = rollDice(attackerArmies);
    const defenderRolls = rollDice(defenderArmies);
    const attackerHighest = getHighestRoll(attackerRolls);
    const defenderHighest = getHighestRoll(defenderRolls);
    // Attacker must roll strictly higher to win (ties go to defender)
    const attackerWins = attackerHighest > defenderHighest;
    return {
        attackerWins,
        attackerRolls,
        defenderRolls,
        attackerHighest,
        defenderHighest,
        attackerArmies,
        defenderArmies,
        attackerLost: 0, // Will be set by executeAttack
        defenderLost: 0, // Will be set by executeAttack
    };
}
/**
 * Execute an attack from source territory to target territory
 * Returns the combat result and modifies territories accordingly
 */
export function executeAttack(source, target, teams) {
    const result = resolveCombat(source.armies, target.armies);
    let attackerLost = 0;
    let defenderLost = 0;
    if (result.attackerWins) {
        // Attacker wins - defender loses all armies
        // Attacker moves all but 1 army into captured territory
        defenderLost = target.armies;
        const movingArmies = source.armies - 1;
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
        target.armies = movingArmies;
        source.armies = 1;
    }
    else {
        // Defender wins - both sides take casualties (attrition)
        // Attacker loses armies equal to defender's army count (max)
        // Defender loses armies equal to attacker's attacking force - 1
        // This allows "gang up" strategy to chip away at strong positions
        // Attacker loses: up to defender's army count, but keeps at least 1
        attackerLost = Math.min(target.armies, source.armies - 1);
        source.armies -= attackerLost;
        // Defender loses: up to (attacker's armies - 1), but keeps at least 1
        // The -1 represents the army that stays behind
        const attackingForce = result.attackerArmies - 1;
        defenderLost = Math.min(attackingForce, target.armies - 1);
        target.armies -= defenderLost;
    }
    return {
        ...result,
        attackerLost,
        defenderLost,
    };
}
/**
 * Check if a territory can attack another territory
 * Requirements:
 * - Source must have more than 1 army
 * - Target must be a neighbor
 * - Target must be owned by a different team
 */
export function canAttack(source, target) {
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
export function getValidAttackTargets(source, territories) {
    if (source.armies <= 1) {
        console.log(`[getValidAttackTargets] ${source.name} has only ${source.armies} army, can't attack`);
        return [];
    }
    const neighborIds = Array.from(source.neighbors);
    console.log(`[getValidAttackTargets] ${source.name} (owner: ${source.owner}, armies: ${source.armies})`);
    console.log(`[getValidAttackTargets] Neighbors: ${neighborIds.join(', ')}`);
    const validTargets = territories.filter(t => {
        const isNeighbor = source.neighbors.has(t.id);
        const isDifferentOwner = t.owner !== source.owner;
        if (isNeighbor) {
            console.log(`[getValidAttackTargets] - ${t.name} (id: ${t.id}, owner: ${t.owner}): neighbor=${isNeighbor}, diffOwner=${isDifferentOwner}`);
        }
        return isNeighbor && isDifferentOwner;
    });
    console.log(`[getValidAttackTargets] Valid targets: ${validTargets.map(t => t.name).join(', ') || 'none'}`);
    return validTargets;
}
/**
 * Format combat result for display
 */
export function formatCombatResult(result, attackerName, defenderName) {
    const attackerRollsStr = result.attackerRolls.sort((a, b) => b - a).join(', ');
    const defenderRollsStr = result.defenderRolls.sort((a, b) => b - a).join(', ');
    if (result.attackerWins) {
        return `${attackerName} [${attackerRollsStr}] conquers ${defenderName} [${defenderRollsStr}]!`;
    }
    else {
        // Show both sides' losses in defense
        return `${defenderName} [${defenderRollsStr}] defends vs ${attackerName} [${attackerRollsStr}]! (-${result.attackerLost} att, -${result.defenderLost} def)`;
    }
}
//# sourceMappingURL=combat.js.map