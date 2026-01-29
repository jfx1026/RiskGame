/**
 * Main entry point for the Risk Game
 * Implements turn-based combat gameplay
 */
import { generateMap } from './mapGenerator.js';
import { renderMap, addClickHandlers, addHoverHandlers, selectTerritory as selectTerritoryVisual, deselectAll, highlightValidTargets, clearHighlights, showCombatAnimation, updateTerritoryDisplay } from './renderer.js';
import { createTeams, assignTerritoriesToTeams, initializeTerritories, startGame, getCurrentTeam, selectTerritory, deselectTerritory, attemptAttack, endTurn, getSelectedTerritoryTargets, calculateResupply } from './game.js';
import { formatCombatResult } from './combat.js';
import { findBestAttack, shouldContinueAttacking } from './ai.js';
// DOM Elements
let svgElement;
let statsElement;
let tooltipElement;
let turnIndicatorElement;
let endTurnButton;
let fastForwardButton;
let surrenderButton;
let combatLogElement;
// Current game state
let currentMap = null;
let gameState = null;
let currentSize = 'medium';
let isComputerPlaying = false; // True when computer is taking its turn
let isFastForward = false; // True when fast forward is enabled
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
    const fastForwardBtn = document.getElementById('fast-forward-btn');
    const surrenderBtn = document.getElementById('surrender-btn');
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
    fastForwardButton = fastForwardBtn || createFastForwardButton();
    surrenderButton = surrenderBtn || createSurrenderButton();
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
    // Set up Fast Forward button
    fastForwardButton.addEventListener('click', toggleFastForward);
    // Set up Surrender button
    surrenderButton.addEventListener('click', handleSurrender);
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
 * Create Fast Forward button if it doesn't exist in DOM
 */
function createFastForwardButton() {
    const button = document.createElement('button');
    button.id = 'fast-forward-btn';
    button.className = 'fast-forward-btn';
    button.textContent = 'Fast Forward';
    const controls = document.querySelector('.controls');
    if (controls) {
        controls.appendChild(button);
    }
    return button;
}
/**
 * Toggle fast forward mode
 */
function toggleFastForward() {
    isFastForward = !isFastForward;
    fastForwardButton.classList.toggle('active', isFastForward);
    fastForwardButton.textContent = isFastForward ? 'Fast Forward ON' : 'Fast Forward';
}
/**
 * Create Surrender button if it doesn't exist in DOM
 */
function createSurrenderButton() {
    const button = document.createElement('button');
    button.id = 'surrender-btn';
    button.className = 'surrender-btn';
    button.textContent = 'Surrender';
    const controls = document.querySelector('.controls');
    if (controls) {
        controls.appendChild(button);
    }
    return button;
}
/**
 * Handle surrender button click - show confirmation modal
 */
function handleSurrender() {
    if (!gameState || gameState.phase === 'gameOver') {
        return;
    }
    // Don't allow surrender during computer's turn
    if (isComputerPlaying) {
        return;
    }
    showSurrenderConfirmation();
}
/**
 * Show surrender confirmation modal
 */
function showSurrenderConfirmation() {
    const overlay = document.createElement('div');
    overlay.className = 'victory-overlay';
    overlay.id = 'surrender-modal';
    overlay.innerHTML = `
        <div class="victory-content">
            <h2 style="color: #ff6b6b">Surrender?</h2>
            <p>Are you sure you want to surrender the game?</p>
            <div class="modal-buttons">
                <button class="cancel-btn" onclick="document.getElementById('surrender-modal').remove()">Cancel</button>
                <button class="confirm-btn" id="confirm-surrender-btn">Surrender</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    // Add event listener for confirm button
    document.getElementById('confirm-surrender-btn')?.addEventListener('click', () => {
        overlay.remove();
        executeSurrender();
    });
}
/**
 * Execute the surrender - show defeat screen
 */
function executeSurrender() {
    if (!gameState)
        return;
    const humanTeam = gameState.teams.find(t => t.isHuman);
    if (!humanTeam)
        return;
    // Set game to over state
    gameState = {
        ...gameState,
        phase: 'gameOver',
    };
    logCombatResult(`${humanTeam.name} has surrendered!`);
    // Show defeat overlay
    const overlay = document.createElement('div');
    overlay.className = 'victory-overlay';
    overlay.innerHTML = `
        <div class="victory-content">
            <h2 style="color: #ff6b6b">Surrendered</h2>
            <p>${humanTeam.name} has surrendered the game</p>
            <button onclick="this.parentElement.parentElement.remove()">Close</button>
        </div>
    `;
    document.body.appendChild(overlay);
    updateTurnIndicator();
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
// Track if SVG event listeners have been added
let svgListenersInitialized = false;
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
    // Add interactivity - renderMap clears the SVG, so we need to re-add handlers
    // But we use a wrapper that checks game state, so handlers don't accumulate badly
    addClickHandlers(svgElement, currentMap.territories, handleHexClick);
    addHoverHandlers(svgElement, currentMap.territories, handleTerritoryHover);
    // Add click handler for empty space deselection - only once
    if (!svgListenersInitialized) {
        svgElement.addEventListener('click', handleSvgBackgroundClick);
        svgListenersInitialized = true;
    }
    // Update UI
    updateTurnIndicator();
    updateStats();
    clearCombatLog();
    // Show game start message with human's team
    const humanTeam = teams.find(t => t.isHuman);
    if (humanTeam) {
        showGameStartMessage(humanTeam);
    }
    console.log(`Started new game with ${currentMap.territories.length} territories for ${teams.length} teams`);
}
/**
 * Show game start message modal
 */
function showGameStartMessage(humanTeam) {
    const overlay = document.createElement('div');
    overlay.className = 'victory-overlay';
    overlay.id = 'game-start-modal';
    overlay.innerHTML = `
        <div class="game-start-content">
            <h2>New Game</h2>
            <p>You are playing as:</p>
            <div class="team-announcement" style="color: ${humanTeam.color}">${humanTeam.name}</div>
            <p>Conquer all territories to win!</p>
            <button id="start-game-btn">Start Game</button>
        </div>
    `;
    document.body.appendChild(overlay);
    // Add event listener for start button
    document.getElementById('start-game-btn')?.addEventListener('click', () => {
        overlay.remove();
        logCombatResult(`You are playing as ${humanTeam.name}`);
        // If first player is computer, run computer turns
        if (gameState) {
            const firstTeam = getCurrentTeam(gameState);
            console.log(`[showGameStartMessage] First team: ${firstTeam.name}, isHuman: ${firstTeam.isHuman}, index: ${gameState.currentTeamIndex}`);
            console.log(`[showGameStartMessage] Human team: ${humanTeam.name}, id: ${humanTeam.id}`);
            if (!firstTeam.isHuman) {
                console.log(`[showGameStartMessage] Starting computer turns...`);
                runComputerTurns();
            }
            else {
                console.log(`[showGameStartMessage] Human goes first, waiting for input`);
            }
        }
    });
}
/**
 * Handle clicks on SVG background/empty tiles to deselect
 */
function handleSvgBackgroundClick(event) {
    const target = event.target;
    if (target === svgElement || target.classList.contains('hex-empty')) {
        if (gameState) {
            gameState = deselectTerritory(gameState);
            deselectAll(svgElement);
            clearHighlights(svgElement);
        }
    }
}
/**
 * Handle hex click - implements selection and attack logic
 */
function handleHexClick(clickedTerritory, hex, event) {
    if (!gameState || gameState.phase === 'gameOver') {
        return;
    }
    // Don't allow clicks during computer's turn
    if (isComputerPlaying) {
        return;
    }
    // Don't allow clicks if it's not a human player's turn
    const currentTeam = getCurrentTeam(gameState);
    if (!currentTeam.isHuman) {
        return;
    }
    // Always get fresh territory data from gameState to ensure we have current ownership
    const territory = gameState.territories.find(t => t.id === clickedTerritory.id);
    if (!territory) {
        console.error('Territory not found:', clickedTerritory.id);
        return;
    }
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
    // Don't allow ending turn during computer's turn
    if (isComputerPlaying) {
        return;
    }
    // Only allow human player to end their turn
    const currentTeam = getCurrentTeam(gameState);
    console.log(`[handleEndTurn] Current team: ${currentTeam.name}, isHuman: ${currentTeam.isHuman}`);
    if (!currentTeam.isHuman) {
        console.warn('[handleEndTurn] Called but current team is not human - ignoring');
        return;
    }
    const previousTeam = currentTeam;
    const resupplyAmount = calculateResupply(gameState);
    // End the turn
    console.log(`[handleEndTurn] Ending turn for ${previousTeam.name}`);
    gameState = endTurn(gameState);
    console.log(`[handleEndTurn] After endTurn, new currentTeamIndex: ${gameState.currentTeamIndex}, team: ${getCurrentTeam(gameState).name}`);
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
        return;
    }
    console.log(`Turn ${gameState.turnNumber}: ${getCurrentTeam(gameState).name}'s turn`);
    // If next player is computer, run computer turns
    const nextTeam = getCurrentTeam(gameState);
    if (!nextTeam.isHuman) {
        runComputerTurns();
    }
}
/**
 * Run computer turns until it's a human player's turn
 */
async function runComputerTurns() {
    if (!gameState || gameState.phase === 'gameOver') {
        return;
    }
    // Prevent concurrent calls
    if (isComputerPlaying) {
        console.warn('[runComputerTurns] Already running, ignoring duplicate call');
        return;
    }
    isComputerPlaying = true;
    endTurnButton.disabled = true;
    console.log(`[runComputerTurns] Starting. Current team index: ${gameState.currentTeamIndex}`);
    // Safety limit to prevent infinite loops
    let iterations = 0;
    const maxIterations = gameState.teams.length * 2;
    // Loop through computer players until we reach a human
    while (gameState && gameState.winner === null && iterations < maxIterations) {
        iterations++;
        const currentTeam = getCurrentTeam(gameState);
        console.log(`[runComputerTurns] Iteration ${iterations}: Team ${currentTeam.name}, isHuman: ${currentTeam.isHuman}, index: ${gameState.currentTeamIndex}`);
        // If current team is human, stop and let them play
        if (currentTeam.isHuman) {
            // Verify human still has territories
            const humanTerritories = gameState.territories.filter(t => t.owner === currentTeam.id);
            console.log(`[runComputerTurns] Human team ${currentTeam.name} has ${humanTerritories.length} territories`);
            if (humanTerritories.length === 0) {
                // Human has been eliminated, show defeat
                showDefeat();
                break;
            }
            console.log(`[runComputerTurns] Breaking loop - human's turn`);
            break;
        }
        // Update UI to show computer is thinking
        updateTurnIndicatorForComputer();
        // Execute computer's turn
        await executeComputerTurn();
        console.log(`[runComputerTurns] After executeComputerTurn, currentTeamIndex: ${gameState.currentTeamIndex}`);
        // Check for game over
        if (gameState.winner !== null) {
            showVictory(gameState.winner);
            break;
        }
    }
    if (iterations >= maxIterations) {
        console.error('[runComputerTurns] Hit max iterations! Something is wrong with turn cycling.');
    }
    isComputerPlaying = false;
    endTurnButton.disabled = false;
    updateTurnIndicator();
    if (gameState) {
        const finalTeam = getCurrentTeam(gameState);
        console.log(`[runComputerTurns] Finished. Now it's ${finalTeam.name}'s turn (isHuman: ${finalTeam.isHuman})`);
        // Safety check: if we finished but it's not a human's turn, something went wrong
        if (!finalTeam.isHuman && gameState.winner === null) {
            console.error('[runComputerTurns] ERROR: Finished but current team is not human!');
        }
    }
}
/**
 * Show defeat message when human player is eliminated
 */
function showDefeat() {
    if (!gameState)
        return;
    const humanTeam = gameState.teams.find(t => t.isHuman);
    if (!humanTeam)
        return;
    logCombatResult(`${humanTeam.name} has been eliminated!`);
    // Create defeat overlay
    const overlay = document.createElement('div');
    overlay.className = 'victory-overlay';
    overlay.innerHTML = `
        <div class="victory-content">
            <h2 style="color: #ff6b6b">Defeat!</h2>
            <p>${humanTeam.name} has been eliminated</p>
            <button onclick="this.parentElement.parentElement.remove()">Close</button>
        </div>
    `;
    document.body.appendChild(overlay);
}
/**
 * Execute a single computer player's turn
 */
async function executeComputerTurn() {
    if (!gameState)
        return;
    const currentTeam = getCurrentTeam(gameState);
    console.log(`Computer turn: ${currentTeam.name}`);
    // Add a small delay before starting attacks
    await delay(500);
    let attacksThisTurn = 0;
    // Attack loop
    while (shouldContinueAttacking(gameState, attacksThisTurn)) {
        const attack = findBestAttack(gameState);
        if (!attack)
            break;
        const source = gameState.territories.find(t => t.id === attack.sourceId);
        const target = gameState.territories.find(t => t.id === attack.targetId);
        if (!source || !target)
            break;
        // Visual feedback - highlight attacking territories
        selectTerritoryVisual(svgElement, source.id);
        highlightValidTargets(svgElement, [target.id]);
        // Small delay to show selection
        await delay(300);
        // Select the source territory in game state (required for attemptAttack)
        gameState = selectTerritory(gameState, source.id);
        // Execute the attack
        gameState = attemptAttack(gameState, target.id);
        attacksThisTurn++;
        // Show combat result
        if (gameState.lastCombatResult) {
            const result = gameState.lastCombatResult;
            logCombatResult(formatCombatResult(result, source.name, target.name));
            console.log(`Computer attack: ${source.name} vs ${target.name}`);
            console.log(`Result: ${result.attackerWins ? 'Victory!' : 'Defended'}`);
            // Show combat animation
            await showCombatAnimation(svgElement, result, source.id, target.id);
            // Update territory displays
            const updatedSource = gameState.territories.find(t => t.id === source.id);
            const updatedTarget = gameState.territories.find(t => t.id === target.id);
            if (updatedSource)
                updateTerritoryDisplay(svgElement, updatedSource);
            if (updatedTarget)
                updateTerritoryDisplay(svgElement, updatedTarget);
        }
        // Clear selection
        deselectAll(svgElement);
        clearHighlights(svgElement);
        // Update stats
        updateStats();
        // Check for game over
        if (gameState.winner !== null) {
            return;
        }
        // Delay between attacks for visibility
        await delay(400);
    }
    // End computer's turn
    const previousTeam = getCurrentTeam(gameState);
    const resupplyAmount = calculateResupply(gameState);
    gameState = endTurn(gameState);
    // Log resupply
    logCombatResult(`${previousTeam.name} received ${resupplyAmount} reinforcements`);
    // Re-render all territories
    if (currentMap) {
        for (const territory of gameState.territories) {
            updateTerritoryDisplay(svgElement, territory);
        }
    }
    // Update stats
    updateStats();
    console.log(`Computer ${previousTeam.name} ended turn`);
    // Small delay before next player
    await delay(300);
}
/**
 * Update turn indicator to show computer is playing
 */
function updateTurnIndicatorForComputer() {
    if (!gameState)
        return;
    const currentTeam = getCurrentTeam(gameState);
    turnIndicatorElement.innerHTML = `
        <span class="turn-number">Turn ${gameState.turnNumber}</span>
        <span class="team-name" style="color: ${currentTeam.color}">${currentTeam.name}</span>
        <span class="phase-info">Computer thinking...</span>
    `;
    turnIndicatorElement.style.borderColor = currentTeam.color;
}
/**
 * Utility function for delays
 * When fast forward is enabled, delays are reduced to minimum
 */
function delay(ms) {
    const actualDelay = isFastForward ? Math.min(ms, 50) : ms;
    return new Promise(resolve => setTimeout(resolve, actualDelay));
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
        const phaseInfo = currentTeam.isHuman
            ? 'Your turn - Select a territory to attack from'
            : 'Computer thinking...';
        turnIndicatorElement.innerHTML = `
            <span class="turn-number">Turn ${gameState.turnNumber}</span>
            <span class="team-name" style="color: ${currentTeam.color}">${currentTeam.name}</span>
            <span class="phase-info">${phaseInfo}</span>
        `;
        turnIndicatorElement.style.borderColor = currentTeam.color;
        endTurnButton.disabled = !currentTeam.isHuman || isComputerPlaying;
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
        // Bold the human team's name
        const teamName = t.isHuman
            ? `<strong>${t.name.split(' ')[0]} (You)</strong>`
            : t.name.split(' ')[0];
        return `<span style="color: ${t.color}">${teamName}: ${territoryCount} (${totalArmies})</span>`;
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