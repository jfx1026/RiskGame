/**
 * Main entry point for the Risk Game
 * Implements turn-based combat gameplay
 */
import { generateMap } from './mapGenerator.js';
import { renderMap, addClickHandlers, addHoverHandlers, selectTerritory as selectTerritoryVisual, deselectAll, highlightValidTargets, clearHighlights, showCombatAnimation, updateTerritoryDisplay } from './renderer.js';
import { createTeams, assignTerritoriesToTeams, initializeTerritories, startGame, beginGame, getCurrentTeam, selectTerritory, deselectTerritory, attemptAttack, endTurn, getSelectedTerritoryTargets, calculateResupply } from './game.js';
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
let teamStatsElement;
let backButton;
let startScreen;
let gameScreen;
let resumeButton;
// Current game state
let currentMap = null;
let gameState = null;
let currentSize = 'medium';
let isComputerPlaying = false; // True when computer is taking its turn
let isFastForward = false; // True when fast forward is enabled
let gameGeneration = 0; // Incremented each new game to invalidate stale async ops
let gameStarted = false; // True only after user clicks "Start Game"
let confettiIntervalId = null; // Track confetti interval for cleanup
let confettiTimeoutIds = []; // Track confetti burst timeouts for cleanup
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
            emptyTilePercent: 15,
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
    const statsEl = document.getElementById('stats');
    const tooltipEl = document.getElementById('tooltip');
    const turnIndicatorEl = document.getElementById('turn-indicator');
    const endTurnBtn = document.getElementById('end-turn-btn');
    const fastForwardBtn = document.getElementById('fast-forward-btn');
    const surrenderBtn = document.getElementById('surrender-btn');
    const combatLogEl = document.getElementById('combat-log');
    const teamStatsEl = document.getElementById('team-stats');
    const backBtn = document.getElementById('back-btn');
    const startScreenEl = document.getElementById('start-screen');
    const gameScreenEl = document.getElementById('game-screen');
    const resumeBtn = document.getElementById('resume-btn');
    if (!svgEl || !tooltipEl || !startScreenEl || !gameScreenEl || !resumeBtn) {
        console.error('Required DOM elements not found');
        return;
    }
    svgElement = svgEl;
    statsElement = statsEl || document.createElement('div');
    tooltipElement = tooltipEl;
    turnIndicatorElement = turnIndicatorEl || document.createElement('div');
    endTurnButton = endTurnBtn || createEndTurnButton();
    fastForwardButton = fastForwardBtn || createFastForwardButton();
    surrenderButton = surrenderBtn || createSurrenderButton();
    combatLogElement = combatLogEl || document.createElement('div');
    teamStatsElement = teamStatsEl || document.createElement('div');
    backButton = backBtn || document.createElement('button');
    startScreen = startScreenEl;
    gameScreen = gameScreenEl;
    resumeButton = resumeBtn;
    // Set up End Turn button
    endTurnButton.addEventListener('click', handleEndTurn);
    // Set up Fast Forward button
    fastForwardButton.addEventListener('click', toggleFastForward);
    // Set up Surrender button
    surrenderButton.addEventListener('click', handleSurrender);
    // Set up Back button - returns to start screen
    backButton.addEventListener('click', handleBack);
    // Set up size buttons on start screen
    const sizeButtons = document.querySelectorAll('.size-btn');
    sizeButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const size = e.target.dataset.size;
            if (size) {
                handleSizeButtonClick(size);
            }
        });
    });
    // Set up resume button
    resumeButton.addEventListener('click', resumeGame);
    // Show start screen initially
    showStartScreen();
    console.log('Risk Game initialized');
}
/**
 * Handle back button - returns to start screen
 */
function handleBack() {
    stopConfetti();
    showStartScreen();
}
/**
 * Stop any running confetti animation and clean up
 */
function stopConfetti() {
    // Clear all pending burst timeouts
    confettiTimeoutIds.forEach(id => clearTimeout(id));
    confettiTimeoutIds = [];
    // Clear any confetti interval (stored globally when victory screen is shown)
    if (confettiIntervalId !== null) {
        clearInterval(confettiIntervalId);
        confettiIntervalId = null;
    }
    document.getElementById('confetti-container')?.remove();
}
/**
 * Show the start screen and hide the game
 */
function showStartScreen() {
    startScreen.classList.remove('hidden');
    gameScreen.classList.add('hidden');
    // Show resume button if there's an active game
    const hasActiveGame = gameState !== null && gameState.phase !== 'gameOver';
    resumeButton.classList.toggle('hidden', !hasActiveGame);
    // Sync size button selected state with currentSize
    document.querySelectorAll('.size-btn').forEach(btn => {
        const size = btn.dataset.size;
        btn.classList.toggle('selected', size === currentSize);
    });
}
/**
 * Show the game screen and hide the start screen
 */
function showGameScreen() {
    startScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
}
/**
 * Start a new game with the specified size
 */
function startGameWithSize(size) {
    // Clean up any running confetti from previous game
    stopConfetti();
    // Reset game state for new game
    gameState = null;
    currentMap = null;
    gameStarted = false;
    isComputerPlaying = false;
    isFastForward = false;
    fastForwardButton.classList.remove('active');
    currentSize = size;
    showGameScreen();
    generateAndRenderNewMap();
}
/**
 * Handle size button click - check for active game first
 */
function handleSizeButtonClick(size) {
    const hasActiveGame = gameState !== null && gameState.phase !== 'gameOver';
    if (hasActiveGame) {
        showNewGameConfirmation(size);
    }
    else {
        startGameWithSize(size);
    }
}
/**
 * Show confirmation modal when starting new game with active game
 */
function showNewGameConfirmation(size) {
    const overlay = document.createElement('div');
    overlay.className = 'victory-overlay';
    overlay.id = 'new-game-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'new-game-modal-title');
    overlay.innerHTML = `
        <div class="victory-content">
            <h2 class="text-danger" id="new-game-modal-title">Abandon Game?</h2>
            <p>Starting a new game will surrender your current game.</p>
            <div class="modal-buttons">
                <button class="cancel-btn" id="cancel-new-game-btn">Cancel</button>
                <button class="confirm-btn" id="confirm-new-game-btn">Start New Game</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    // Use event delegation for proper cleanup
    const handleClick = (e) => {
        const target = e.target;
        if (target.id === 'cancel-new-game-btn') {
            overlay.removeEventListener('click', handleClick);
            overlay.remove();
        }
        else if (target.id === 'confirm-new-game-btn') {
            overlay.removeEventListener('click', handleClick);
            overlay.remove();
            startGameWithSize(size);
        }
    };
    overlay.addEventListener('click', handleClick);
}
/**
 * Resume the current game in progress
 */
function resumeGame() {
    if (gameState && gameState.phase !== 'gameOver') {
        showGameScreen();
    }
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
    showSurrenderConfirmation();
}
/**
 * Show surrender confirmation modal
 */
function showSurrenderConfirmation() {
    const overlay = document.createElement('div');
    overlay.className = 'victory-overlay';
    overlay.id = 'surrender-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'surrender-modal-title');
    overlay.innerHTML = `
        <div class="victory-content">
            <h2 class="text-danger" id="surrender-modal-title">Surrender?</h2>
            <p>Are you sure you want to surrender the game?</p>
            <div class="modal-buttons">
                <button class="cancel-btn" id="cancel-surrender-btn">Cancel</button>
                <button class="confirm-btn" id="confirm-surrender-btn">Surrender</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    // Use event delegation for proper cleanup
    const handleClick = (e) => {
        const target = e.target;
        if (target.id === 'cancel-surrender-btn') {
            overlay.removeEventListener('click', handleClick);
            overlay.remove();
        }
        else if (target.id === 'confirm-surrender-btn') {
            overlay.removeEventListener('click', handleClick);
            overlay.remove();
            executeSurrender();
        }
    };
    overlay.addEventListener('click', handleClick);
}
/**
 * Execute the surrender - show defeat screen and return to menu
 */
function executeSurrender() {
    // Guard against calling when game is already over
    if (!gameState || gameState.phase === 'gameOver')
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
    // Show defeat overlay with menu button
    const overlay = document.createElement('div');
    overlay.className = 'victory-overlay';
    overlay.id = 'defeat-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'defeat-overlay-title');
    overlay.innerHTML = `
        <div class="victory-content">
            <h2 class="text-danger" id="defeat-overlay-title">Surrendered</h2>
            <p>${humanTeam.name} has surrendered the game</p>
            <div class="modal-buttons">
                <button class="primary-btn" id="return-to-menu-btn">New Game</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    // Use event delegation for proper cleanup
    const handleClick = (e) => {
        const target = e.target;
        if (target.id === 'return-to-menu-btn') {
            overlay.removeEventListener('click', handleClick);
            overlay.remove();
            showStartScreen();
        }
    };
    overlay.addEventListener('click', handleClick);
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
// Track if SVG event listeners have been added
let svgListenersInitialized = false;
/**
 * Generate and render a new map, starting a new game
 */
function generateAndRenderNewMap() {
    // Increment game generation to invalidate any pending async operations
    gameGeneration++;
    // Reset game state flags
    isComputerPlaying = false;
    isFastForward = false;
    gameStarted = false; // Game hasn't started until user clicks "Start Game"
    // Remove any existing game modals (by specific ID for completeness)
    const modalIds = ['game-start-modal', 'defeat-overlay', 'victory-overlay', 'new-game-modal', 'surrender-modal'];
    modalIds.forEach(id => document.getElementById(id)?.remove());
    // Fallback: remove any remaining overlay-class elements
    document.querySelectorAll('.victory-overlay').forEach(el => el.remove());
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
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'game-start-modal-title');
    overlay.innerHTML = `
        <div class="game-start-content">
            <h2 id="game-start-modal-title">New Game</h2>
            <p>You are playing as:</p>
            <div class="team-announcement" style="color: ${humanTeam.color}">${humanTeam.name}</div>
            <p>Conquer all territories to win!</p>
            <button id="start-game-btn">Start Game</button>
        </div>
    `;
    document.body.appendChild(overlay);
    // Use event delegation for proper cleanup
    const handleClick = (e) => {
        const target = e.target;
        if (target.id === 'start-game-btn') {
            overlay.removeEventListener('click', handleClick);
            overlay.remove();
            if (!gameState)
                return;
            // NOW the game officially starts
            gameStarted = true;
            // Randomly select who goes first
            gameState = beginGame(gameState);
            logCombatResult(`You are playing as ${humanTeam.name}`);
            // Check who goes first
            const firstTeam = getCurrentTeam(gameState);
            // Set state flags based on who goes first
            if (firstTeam.isHuman) {
                isComputerPlaying = false;
                endTurnButton.disabled = false;
            }
            else {
                // Computer goes first - set flag BEFORE calling async function
                isComputerPlaying = true;
                endTurnButton.disabled = true;
            }
            // Update UI to show who's going first
            updateTurnIndicator();
            updateStats();
            // If first player is computer, run computer turns
            if (!firstTeam.isHuman) {
                runComputerTurns();
            }
        }
    };
    overlay.addEventListener('click', handleClick);
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
    // Don't allow clicks until game has started
    if (!gameStarted) {
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
                // Capture game generation to detect if game changes during animation
                const currentGeneration = gameGeneration;
                // Animate combat
                showCombatAnimation(svgElement, result, sourceTerritory.id, territory.id).then(() => {
                    // Only update if this is still the same game
                    if (gameGeneration !== currentGeneration || !gameState) {
                        return;
                    }
                    // Update territory displays after animation (with null safety)
                    const updatedSource = gameState.territories.find(t => t.id === sourceTerritory.id);
                    const updatedTarget = gameState.territories.find(t => t.id === territory.id);
                    if (updatedSource)
                        updateTerritoryDisplay(svgElement, updatedSource);
                    if (updatedTarget)
                        updateTerritoryDisplay(svgElement, updatedTarget);
                    // Update selection and highlights after animation completes
                    deselectAll(svgElement);
                    clearHighlights(svgElement);
                    // If a territory is still selected after the attack, show it
                    if (gameState.selectedTerritory !== null) {
                        selectTerritoryVisual(svgElement, gameState.selectedTerritory);
                        const newTargets = getSelectedTerritoryTargets(gameState);
                        if (newTargets.length > 0) {
                            highlightValidTargets(svgElement, newTargets.map(t => t.id));
                        }
                    }
                });
            }
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
    // Don't allow ending turn until game has started
    if (!gameStarted) {
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
        // Set flag BEFORE calling async function to prevent race condition
        isComputerPlaying = true;
        endTurnButton.disabled = true;
        runComputerTurns();
    }
}
/**
 * Run computer turns until it's a human player's turn
 * NOTE: Caller should set isComputerPlaying = true before calling this function
 */
async function runComputerTurns() {
    if (!gameState || gameState.phase === 'gameOver') {
        isComputerPlaying = false;
        return;
    }
    // Don't run until game has started
    if (!gameStarted) {
        isComputerPlaying = false;
        return;
    }
    // Capture current game generation to detect if game changes mid-execution
    const thisGameGeneration = gameGeneration;
    // Ensure flags are set (should already be set by caller, but ensure consistency)
    isComputerPlaying = true;
    endTurnButton.disabled = true;
    // Safety limit to prevent infinite loops
    let iterations = 0;
    const maxIterations = gameState.teams.length * 2;
    // Loop through computer players until we reach a human
    while (gameState && gameState.winner === null && iterations < maxIterations) {
        // Check if a new game was started
        if (gameGeneration !== thisGameGeneration) {
            return;
        }
        iterations++;
        const currentTeam = getCurrentTeam(gameState);
        // If current team is human, stop and let them play
        if (currentTeam.isHuman) {
            // Verify human still has territories
            const humanTerritories = gameState.territories.filter(t => t.owner === currentTeam.id);
            if (humanTerritories.length === 0) {
                // Human has been eliminated, show defeat
                showDefeat();
                break;
            }
            break;
        }
        // Update UI to show computer is thinking
        updateTurnIndicatorForComputer();
        // Execute computer's turn
        await executeComputerTurn();
        // Check again if game changed during async execution
        if (gameGeneration !== thisGameGeneration) {
            return;
        }
        // Check for game over
        if (gameState.winner !== null) {
            showVictory(gameState.winner);
            break;
        }
    }
    // Only update state if this is still the current game
    if (gameGeneration === thisGameGeneration) {
        isComputerPlaying = false;
        endTurnButton.disabled = false;
        updateTurnIndicator();
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
    overlay.id = 'defeat-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'defeat-overlay-title');
    overlay.innerHTML = `
        <div class="victory-content">
            <h2 class="text-danger" id="defeat-overlay-title">Defeat!</h2>
            <p>${humanTeam.name} has been eliminated</p>
            <div class="modal-buttons">
                <button class="primary-btn" id="defeat-menu-btn">New Game</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    // Use event delegation for proper cleanup
    const handleClick = (e) => {
        const target = e.target;
        if (target.id === 'defeat-menu-btn') {
            overlay.removeEventListener('click', handleClick);
            overlay.remove();
            showStartScreen();
        }
    };
    overlay.addEventListener('click', handleClick);
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
    // Update sidebar to highlight current team
    updateTeamStatsSidebar();
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
                attackInfo = '<br><span class="text-danger">Click to attack!</span>';
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
 * Now uses the sidebar to show current turn instead of a separate indicator
 */
function updateTurnIndicator() {
    if (!gameState)
        return;
    const currentTeam = getCurrentTeam(gameState);
    if (gameState.phase === 'gameOver') {
        endTurnButton.disabled = true;
    }
    else {
        endTurnButton.disabled = !currentTeam.isHuman || isComputerPlaying;
    }
    // Update sidebar to highlight current team
    updateTeamStatsSidebar();
}
/**
 * Update the stats display
 */
function updateStats() {
    if (!gameState)
        return;
    // Update sidebar team stats
    updateTeamStatsSidebar();
}
/**
 * Update the team stats sidebar with hexagon indicators
 */
function updateTeamStatsSidebar() {
    if (!gameState || !teamStatsElement)
        return;
    const currentTeam = getCurrentTeam(gameState);
    const teamRows = gameState.teams
        .map(t => {
        const territoryCount = gameState.territories.filter(ter => ter.owner === t.id).length;
        const totalArmies = gameState.territories
            .filter(ter => ter.owner === t.id)
            .reduce((sum, ter) => sum + ter.armies, 0);
        const isCurrentTurn = t.id === currentTeam.id && gameStarted;
        const isEliminated = territoryCount === 0;
        // Create hexagon SVG
        const hexSvg = `
                <svg viewBox="0 0 28 32" fill="${isEliminated ? '#333' : t.color}">
                    <polygon points="14,0 28,8 28,24 14,32 0,24 0,8"/>
                </svg>
            `;
        // Human indicator (person icon)
        const humanIndicator = t.isHuman
            ? `<span class="human-indicator"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></span>`
            : '';
        return `
                <div class="team-stat-row ${isCurrentTurn ? 'current-turn' : ''}" data-team-id="${t.id}">
                    <div class="team-hex-icon">
                        ${hexSvg}
                        ${humanIndicator}
                    </div>
                    <div class="team-numbers">
                        <span class="territories">${territoryCount}</span>
                        <span class="separator"> : </span>
                        <span class="armies">${totalArmies}</span>
                    </div>
                </div>
            `;
    })
        .join('');
    teamStatsElement.innerHTML = teamRows;
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
    const isHumanWinner = winner.isHuman;
    const title = isHumanWinner ? 'Victory!' : 'Defeat';
    const titleClass = isHumanWinner ? '' : 'text-danger';
    const contentClass = isHumanWinner ? 'victory-content celebration' : 'victory-content';
    // Create victory/defeat overlay
    const overlay = document.createElement('div');
    overlay.className = 'victory-overlay';
    overlay.id = 'victory-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'victory-overlay-title');
    overlay.innerHTML = `
        <div class="${contentClass}">
            <h2 class="${titleClass}" id="victory-overlay-title" style="color: ${isHumanWinner ? winner.color : ''}">${title}</h2>
            <p>${winner.name} conquered all territories in ${gameState.turnNumber} turns</p>
            <div class="modal-buttons">
                <button class="primary-btn" id="victory-menu-btn">New Game</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    // Spawn confetti celebration for human winner
    if (isHumanWinner) {
        confettiIntervalId = spawnConfetti(winner.color);
    }
    // Use event delegation for proper cleanup
    const handleClick = (e) => {
        const target = e.target;
        if (target.id === 'victory-menu-btn') {
            overlay.removeEventListener('click', handleClick);
            stopConfetti();
            overlay.remove();
            showStartScreen();
        }
    };
    overlay.addEventListener('click', handleClick);
}
/**
 * Spawn confetti particles for celebration (runs continuously)
 * Returns the interval ID so it can be stopped later
 */
function spawnConfetti(teamColor) {
    const container = document.createElement('div');
    container.className = 'confetti-container';
    container.id = 'confetti-container';
    document.body.appendChild(container);
    const colors = [
        teamColor,
        '#FFD700', // Gold
        '#FF6B6B', // Coral
        '#4ECDC4', // Teal
        '#A8E6CF', // Mint
        '#FFE66D', // Yellow
        '#FF8C42', // Orange
        '#ffffff', // White
    ];
    const shapes = ['square', 'circle', 'ribbon'];
    // Clear any existing timeout IDs and start fresh
    confettiTimeoutIds = [];
    // Initial burst of confetti
    for (let i = 0; i < 50; i++) {
        const timeoutId = window.setTimeout(() => {
            createConfettiPiece(container, colors, shapes);
        }, i * 30);
        confettiTimeoutIds.push(timeoutId);
    }
    // Continuous confetti stream
    const intervalId = window.setInterval(() => {
        createConfettiPiece(container, colors, shapes);
    }, 100);
    return intervalId;
}
/**
 * Create a single confetti piece
 */
function createConfettiPiece(container, colors, shapes) {
    const confetti = document.createElement('div');
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const left = Math.random() * 100;
    const duration = 2 + Math.random() * 2;
    const delay = Math.random() * 0.5;
    const size = 8 + Math.random() * 8;
    confetti.className = `confetti ${shape}`;
    confetti.style.cssText = `
        left: ${left}%;
        background-color: ${color};
        width: ${shape === 'ribbon' ? size * 0.6 : size}px;
        height: ${shape === 'ribbon' ? size * 2 : size}px;
        animation-duration: ${duration}s;
        animation-delay: ${delay}s;
    `;
    container.appendChild(confetti);
    // Remove confetti piece after animation
    setTimeout(() => {
        confetti.remove();
    }, (duration + delay) * 1000);
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