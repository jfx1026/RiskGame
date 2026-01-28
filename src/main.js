/**
 * Main entry point for the Risk Game
 * Implements turn-based combat gameplay
 */
import { generateMap } from './mapGenerator.js';
import { renderMap, addClickHandlers, addHoverHandlers, selectTerritory as selectTerritoryVisual, deselectAll, highlightValidTargets, clearHighlights, showCombatAnimation, updateTerritoryDisplay } from './renderer.js';
import { createTeams, assignTerritoriesToTeams, initializeTerritories, startGame, getCurrentTeam, selectTerritory, deselectTerritory, attemptAttack, endTurn, getSelectedTerritoryTargets, calculateResupply } from './game.js';
import { formatCombatResult } from './combat.js';
// DOM Elements
let svgElement;
let statsElement;
let tooltipElement;
let turnIndicatorElement;
let endTurnButton;
let combatLogElement;
// Current game state
let currentMap = null;
let gameState = null;
let currentSize = 'medium';
const GAME_CONFIGS = {
    small: {
        map: {
            gridWidth: 10,
            gridHeight: 8,
            territoryCount: 18,
            minTerritorySize: 2,
            maxTerritorySize: 5,
            emptyTilePercent: 10,
        },
        teamCount: 4,
        armiesPerTeam: 20,
    },
    medium: {
        map: {
            gridWidth: 18,
            gridHeight: 12,
            territoryCount: 38,
            minTerritorySize: 3,
            maxTerritorySize: 7,
            emptyTilePercent: 10,
        },
        teamCount: 5,
        armiesPerTeam: 35,
    },
    large: {
        map: {
            gridWidth: 26,
            gridHeight: 16,
            territoryCount: 58,
            minTerritorySize: 3,
            maxTerritorySize: 7,
            emptyTilePercent: 10,
        },
        teamCount: 6,
        armiesPerTeam: 50,
    },
};
/**
 * Initialize the application
 */
function init() {
    // Get DOM elements
    const svgEl = document.getElementById('map-svg');
    const smallBtn = document.getElementById('small-map-btn');
    const mediumBtn = document.getElementById('medium-map-btn');
    const largeBtn = document.getElementById('large-map-btn');
    const statsEl = document.getElementById('stats');
    const tooltipEl = document.getElementById('tooltip');
    const turnIndicatorEl = document.getElementById('turn-indicator');
    const endTurnBtn = document.getElementById('end-turn-btn');
    const combatLogEl = document.getElementById('combat-log');
    if (!svgEl || !smallBtn || !mediumBtn || !largeBtn || !statsEl || !tooltipEl) {
        console.error('Required DOM elements not found');
        return;
    }
    svgElement = svgEl;
    statsElement = statsEl;
    tooltipElement = tooltipEl;
    turnIndicatorElement = turnIndicatorEl || createTurnIndicator();
    endTurnButton = endTurnBtn || createEndTurnButton();
    combatLogElement = combatLogEl || createCombatLog();
    // Set up event listeners for size buttons
    smallBtn.addEventListener('click', () => {
        currentSize = 'small';
        updateActiveButton(smallBtn);
        generateAndRenderNewMap();
    });
    mediumBtn.addEventListener('click', () => {
        currentSize = 'medium';
        updateActiveButton(mediumBtn);
        generateAndRenderNewMap();
    });
    largeBtn.addEventListener('click', () => {
        currentSize = 'large';
        updateActiveButton(largeBtn);
        generateAndRenderNewMap();
    });
    // Set up End Turn button
    endTurnButton.addEventListener('click', handleEndTurn);
    // Set initial active button
    updateActiveButton(mediumBtn);
    // Generate initial map
    generateAndRenderNewMap();
    console.log('Risk Game initialized');
}
/**
 * Create turn indicator if it doesn't exist in DOM
 */
function createTurnIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'turn-indicator';
    indicator.className = 'turn-indicator';
    const controls = document.querySelector('.controls');
    if (controls) {
        controls.parentNode?.insertBefore(indicator, controls.nextSibling);
    }
    return indicator;
}
/**
 * Create End Turn button if it doesn't exist in DOM
 */
function createEndTurnButton() {
    const button = document.createElement('button');
    button.id = 'end-turn-btn';
    button.className = 'end-turn-btn';
    button.textContent = 'End Turn';
    const controls = document.querySelector('.controls');
    if (controls) {
        controls.appendChild(button);
    }
    return button;
}
/**
 * Create combat log if it doesn't exist in DOM
 */
function createCombatLog() {
    const log = document.createElement('div');
    log.id = 'combat-log';
    log.className = 'combat-log';
    const container = document.getElementById('map-container');
    if (container) {
        container.parentNode?.insertBefore(log, container.nextSibling);
    }
    return log;
}
/**
 * Update the active button styling
 */
function updateActiveButton(activeBtn) {
    document.querySelectorAll('.size-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    activeBtn.classList.add('active');
}
/**
 * Generate and render a new map, starting a new game
 */
function generateAndRenderNewMap() {
    // Get config for current size
    const gameConfig = GAME_CONFIGS[currentSize];
    // Generate new map
    currentMap = generateMap(gameConfig.map);
    // Create teams and assign territories
    const teams = createTeams(gameConfig.teamCount);
    assignTerritoriesToTeams(currentMap.territories, teams);
    // Initialize territory types and armies
    initializeTerritories(currentMap.territories, teams, gameConfig.armiesPerTeam);
    // Start the game
    gameState = startGame(currentMap, teams);
    // Render to SVG
    renderMap(svgElement, currentMap);
    // Add interactivity
    addClickHandlers(svgElement, currentMap.territories, handleHexClick);
    addHoverHandlers(svgElement, currentMap.territories, handleTerritoryHover);
    // Handle clicks on empty space to deselect
    svgElement.addEventListener('click', (event) => {
        const target = event.target;
        if (target === svgElement || target.classList.contains('hex-empty')) {
            if (gameState) {
                gameState = deselectTerritory(gameState);
            }
        }
    });
    // Update UI
    updateTurnIndicator();
    updateStats();
    clearCombatLog();
    console.log(`Started new game with ${currentMap.territories.length} territories for ${teams.length} teams`);
}
/**
 * Handle hex click - implements selection and attack logic
 */
function handleHexClick(clickedTerritory, hex, event) {
    if (!gameState || gameState.phase === 'gameOver') {
        return;
    }
    // Always get fresh territory data from gameState to ensure we have current ownership
    const territory = gameState.territories.find(t => t.id === clickedTerritory.id);
    if (!territory) {
        console.error('Territory not found:', clickedTerritory.id);
        return;
    }
    const currentTeam = getCurrentTeam(gameState);
    // If clicking on own territory
    if (territory.owner === gameState.currentTeamIndex) {
        // If we already have this territory selected, deselect it
        if (gameState.selectedTerritory === territory.id) {
            gameState = deselectTerritory(gameState);
            deselectAll(svgElement);
            clearHighlights(svgElement);
            return;
        }
        // Clear previous selection and highlights first
        clearHighlights(svgElement);
        // Select this territory
        gameState = selectTerritory(gameState, territory.id);
        // Update visual selection
        selectTerritoryVisual(svgElement, territory.id);
        // Highlight valid targets
        const targets = getSelectedTerritoryTargets(gameState);
        if (targets.length > 0) {
            highlightValidTargets(svgElement, targets.map(t => t.id));
        }
        console.log(`Selected: ${territory.name} (${territory.armies} armies, owner: ${territory.owner})`);
    }
    // If clicking on enemy territory while we have a selection
    else if (gameState.selectedTerritory !== null) {
        // Check if this is a valid target
        const targets = getSelectedTerritoryTargets(gameState);
        const isValidTarget = targets.some(t => t.id === territory.id);
        if (isValidTarget) {
            // Execute attack
            const sourceTerritory = gameState.territories.find(t => t.id === gameState.selectedTerritory);
            const oldState = gameState;
            gameState = attemptAttack(gameState, territory.id);
            // Show combat result
            if (gameState.lastCombatResult && sourceTerritory) {
                const sourceName = sourceTerritory.name;
                const targetName = territory.name;
                const result = gameState.lastCombatResult;
                // Log combat result
                logCombatResult(formatCombatResult(result, sourceName, targetName));
                console.log(`Combat: ${sourceName} vs ${targetName}`);
                console.log(`Attacker rolls: ${result.attackerRolls.join(', ')} (highest: ${result.attackerHighest})`);
                console.log(`Defender rolls: ${result.defenderRolls.join(', ')} (highest: ${result.defenderHighest})`);
                console.log(`Result: ${result.attackerWins ? 'Attacker wins!' : 'Defender wins!'}`);
                // Animate combat
                showCombatAnimation(svgElement, result, sourceTerritory.id, territory.id).then(() => {
                    // Update territory displays after animation
                    updateTerritoryDisplay(svgElement, gameState.territories.find(t => t.id === sourceTerritory.id));
                    updateTerritoryDisplay(svgElement, gameState.territories.find(t => t.id === territory.id));
                });
            }
            // Clear selection and highlights
            deselectAll(svgElement);
            clearHighlights(svgElement);
            // Check for game over
            if (gameState.phase === 'gameOver' && gameState.winner !== null) {
                showVictory(gameState.winner);
            }
            // Update stats
            updateStats();
        }
    }
}
/**
 * Handle End Turn button click
 */
function handleEndTurn() {
    if (!gameState || gameState.phase === 'gameOver') {
        return;
    }
    const previousTeam = getCurrentTeam(gameState);
    const resupplyAmount = calculateResupply(gameState);
    // End the turn
    gameState = endTurn(gameState);
    // Log resupply
    logCombatResult(`${previousTeam.name} received ${resupplyAmount} reinforcements`);
    // Clear selection and highlights
    deselectAll(svgElement);
    clearHighlights(svgElement);
    // Re-render all territories to show updated army counts
    if (currentMap) {
        for (const territory of gameState.territories) {
            updateTerritoryDisplay(svgElement, territory);
        }
    }
    // Update UI
    updateTurnIndicator();
    updateStats();
    // Check for game over
    if (gameState.phase === 'gameOver' && gameState.winner !== null) {
        showVictory(gameState.winner);
    }
    console.log(`Turn ${gameState.turnNumber}: ${getCurrentTeam(gameState).name}'s turn`);
}
/**
 * Handle territory hover
 */
function handleTerritoryHover(territory, event) {
    if (territory && gameState) {
        // Show tooltip with team info
        const neighborCount = territory.neighbors.size;
        const hexCount = territory.hexes.size;
        const team = territory.owner !== undefined ? gameState.teams[territory.owner] : null;
        const teamName = team ? team.name : 'Unowned';
        const typeLabel = territory.type === 'big' ? 'Large' : 'Small';
        // Check if this is a valid attack target
        let attackInfo = '';
        if (gameState.selectedTerritory !== null) {
            const targets = getSelectedTerritoryTargets(gameState);
            if (targets.some(t => t.id === territory.id)) {
                attackInfo = '<br><span style="color: #ff6b6b;">Click to attack!</span>';
            }
        }
        tooltipElement.innerHTML = `
            <strong>${territory.name}</strong> (${typeLabel})<br>
            Team: ${teamName}<br>
            Armies: ${territory.armies}<br>
            Neighbors: ${neighborCount}${attackInfo}
        `;
        tooltipElement.classList.add('visible');
        // Position tooltip near cursor
        updateTooltipPosition(event);
    }
    else {
        // Hide tooltip
        tooltipElement.classList.remove('visible');
    }
}
/**
 * Update tooltip position based on mouse position
 */
function updateTooltipPosition(event) {
    const offset = 15;
    let x = event.clientX + offset;
    let y = event.clientY + offset;
    // Keep tooltip in viewport
    const tooltipRect = tooltipElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    if (x + tooltipRect.width > viewportWidth - 10) {
        x = event.clientX - tooltipRect.width - offset;
    }
    if (y + tooltipRect.height > viewportHeight - 10) {
        y = event.clientY - tooltipRect.height - offset;
    }
    tooltipElement.style.left = `${x}px`;
    tooltipElement.style.top = `${y}px`;
}
/**
 * Update the turn indicator display
 */
function updateTurnIndicator() {
    if (!gameState)
        return;
    const currentTeam = getCurrentTeam(gameState);
    if (gameState.phase === 'gameOver') {
        turnIndicatorElement.innerHTML = `<span class="game-over">Game Over!</span>`;
        turnIndicatorElement.style.borderColor = '#888';
        endTurnButton.disabled = true;
    }
    else {
        turnIndicatorElement.innerHTML = `
            <span class="turn-number">Turn ${gameState.turnNumber}</span>
            <span class="team-name" style="color: ${currentTeam.color}">${currentTeam.name}</span>
            <span class="phase-info">Select a territory to attack from</span>
        `;
        turnIndicatorElement.style.borderColor = currentTeam.color;
        endTurnButton.disabled = false;
    }
}
/**
 * Update the stats display
 */
function updateStats() {
    if (!gameState)
        return;
    const teamStats = gameState.teams
        .map(t => {
        const territoryCount = gameState.territories.filter(ter => ter.owner === t.id).length;
        const totalArmies = gameState.territories
            .filter(ter => ter.owner === t.id)
            .reduce((sum, ter) => sum + ter.armies, 0);
        return `<span style="color: ${t.color}">${t.name.split(' ')[0]}: ${territoryCount} (${totalArmies})</span>`;
    })
        .join(' | ');
    statsElement.innerHTML = teamStats;
}
/**
 * Log a combat result to the combat log
 */
function logCombatResult(message) {
    const entry = document.createElement('div');
    entry.className = 'combat-log-entry';
    entry.textContent = message;
    // Add to top of log
    combatLogElement.insertBefore(entry, combatLogElement.firstChild);
    // Limit log entries
    while (combatLogElement.children.length > 10) {
        combatLogElement.removeChild(combatLogElement.lastChild);
    }
}
/**
 * Clear the combat log
 */
function clearCombatLog() {
    combatLogElement.innerHTML = '';
}
/**
 * Show victory message
 */
function showVictory(winnerId) {
    if (!gameState)
        return;
    const winner = gameState.teams.find(t => t.id === winnerId);
    if (!winner)
        return;
    logCombatResult(`${winner.name} has conquered the world!`);
    // Create victory overlay
    const overlay = document.createElement('div');
    overlay.className = 'victory-overlay';
    overlay.innerHTML = `
        <div class="victory-content">
            <h2 style="color: ${winner.color}">${winner.name} Wins!</h2>
            <p>Conquered all territories in ${gameState.turnNumber} turns</p>
            <button onclick="this.parentElement.parentElement.remove()">Close</button>
        </div>
    `;
    document.body.appendChild(overlay);
}
// Track mouse movement for tooltip positioning
document.addEventListener('mousemove', (event) => {
    if (tooltipElement && tooltipElement.classList.contains('visible')) {
        updateTooltipPosition(event);
    }
});
// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
}
else {
    init();
}
//# sourceMappingURL=main.js.map