/**
 * Main entry point for the Risk Game
 * Implements turn-based combat gameplay
 */

import { StatusBar } from '@capacitor/status-bar';
import { generateMap, GeneratedMap, MapGeneratorConfig } from './mapGenerator.js';
import { saveGame, loadGame, clearSavedGame, hasSavedGame } from './persistence.js';
import {
    renderMap,
    addClickHandlers,
    addHoverHandlers,
    selectTerritory as selectTerritoryVisual,
    deselectAll,
    highlightValidTargets,
    clearHighlights,
    showCombatAnimation,
    showDiceAnimation,
    cancelDiceAnimation,
    showDicePreview,
    hideDicePreview,
    updateTerritoryDisplay,
    markCurrentPlayerTerritories
} from './renderer.js';
import { getTerritoryStats, Territory } from './territory.js';
import { Hex } from './hex.js';
import {
    Team,
    GameState,
    createTeams,
    assignTerritoriesToTeams,
    initializeTerritories,
    startGame,
    beginGame,
    getCurrentTeam,
    selectTerritory,
    deselectTerritory,
    attemptAttack,
    endTurn,
    getSelectedTerritoryTargets,
    calculateResupply
} from './game.js';
import { formatCombatResult } from './combat.js';
import { findBestAttack, shouldContinueAttacking, Difficulty } from './ai.js';

// DOM Elements
let svgElement: SVGSVGElement;
let statsElement: HTMLElement;
let tooltipElement: HTMLElement;
let turnIndicatorElement: HTMLElement;
let endTurnButton: HTMLButtonElement;
let fastForwardButton: HTMLButtonElement;
let surrenderButton: HTMLButtonElement;
let combatLogElement: HTMLElement;
let teamStatsElement: HTMLElement;
let backButton: HTMLButtonElement;
let startScreen: HTMLElement;
let gameScreen: HTMLElement;
let resumeButton: HTMLButtonElement;

// Current game state
let currentMap: GeneratedMap | null = null;
let gameState: GameState | null = null;
let currentSize: 'small' | 'medium' | 'large' = 'medium';
let currentDifficulty: Difficulty = 'medium';  // AI difficulty level
let isComputerPlaying = false;  // True when computer is taking its turn
let isFastForward = false;  // True when fast forward is enabled
let gameGeneration = 0;  // Incremented each new game to invalidate stale async ops
let gameStarted = false;  // True only after user clicks "Start Game"
let confettiIntervalId: number | null = null;  // Track confetti interval for cleanup
let confettiTimeoutIds: number[] = [];  // Track confetti burst timeouts for cleanup

/**
 * Save the current game state to persistent storage
 * Call this after any state change that should survive app termination
 */
function saveGameState(): void {
    if (gameState && gameStarted) {
        saveGame(gameState, currentSize, currentDifficulty, gameStarted);
    }
}

// Game configuration for each map size
interface GameConfig {
    map: Partial<MapGeneratorConfig>;
    teamCount: number;
    armiesPerTeam: number;
}

const GAME_CONFIGS: Record<string, GameConfig> = {
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
 * Show title screen for 2 seconds then fade to start screen
 */
function showTitleScreen(): void {
    const titleScreen = document.getElementById('title-screen');
    if (!titleScreen) return;

    // After 2 seconds, fade out
    setTimeout(() => {
        titleScreen.classList.add('fade-out');

        // After fade completes, hide completely
        setTimeout(() => {
            titleScreen.classList.add('hidden');
        }, 500);
    }, 2000);
}

/**
 * Initialize the application
 */
async function init(): Promise<void> {
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
        return;
    }

    svgElement = svgEl as unknown as SVGSVGElement;
    statsElement = statsEl || document.createElement('div');
    tooltipElement = tooltipEl;
    turnIndicatorElement = turnIndicatorEl || document.createElement('div');
    endTurnButton = (endTurnBtn as HTMLButtonElement) || createEndTurnButton();
    fastForwardButton = (fastForwardBtn as HTMLButtonElement) || createFastForwardButton();
    surrenderButton = (surrenderBtn as HTMLButtonElement) || createSurrenderButton();
    combatLogElement = combatLogEl || document.createElement('div');
    teamStatsElement = teamStatsEl || document.createElement('div');
    backButton = (backBtn as HTMLButtonElement) || document.createElement('button');
    startScreen = startScreenEl;
    gameScreen = gameScreenEl;
    resumeButton = resumeBtn as HTMLButtonElement;

    // Set up End Turn button (click and touch)
    endTurnButton.addEventListener('click', handleEndTurn);
    endTurnButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        handleEndTurn();
    }, { passive: false });

    // Set up Fast Forward button (click and touch)
    fastForwardButton.addEventListener('click', toggleFastForward);
    fastForwardButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        toggleFastForward();
    }, { passive: false });

    // Set up Zoom button (click and touch)
    const zoomBtn = document.getElementById('zoom-btn');
    if (zoomBtn) {
        zoomBtn.addEventListener('click', toggleZoom);
        zoomBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            toggleZoom();
        }, { passive: false });
    }

    // Set up Surrender button (click and touch)
    surrenderButton.addEventListener('click', handleSurrender);
    surrenderButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        handleSurrender();
    }, { passive: false });

    // Set up Back button - returns to start screen (click and touch)
    backButton.addEventListener('click', handleBack);
    backButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        handleBack();
    }, { passive: false });

    // Set up size buttons on start screen (click and touch)
    const sizeButtons = document.querySelectorAll('.size-btn');
    sizeButtons.forEach(btn => {
        const handleSizeClick = (e: Event) => {
            const size = (e.currentTarget as HTMLElement).dataset.size as 'small' | 'medium' | 'large';
            if (size) {
                handleSizeButtonClick(size);
            }
        };
        btn.addEventListener('click', handleSizeClick);
        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            handleSizeClick(e);
        }, { passive: false });
    });

    // Set up difficulty buttons on start screen (click and touch)
    const difficultyButtons = document.querySelectorAll('.difficulty-btn');
    difficultyButtons.forEach(btn => {
        const handleDifficultyClick = (e: Event) => {
            const difficulty = (e.currentTarget as HTMLElement).dataset.difficulty as Difficulty;
            if (difficulty) {
                currentDifficulty = difficulty;
                // Update selected state
                difficultyButtons.forEach(b => b.classList.remove('selected'));
                (e.currentTarget as HTMLElement).classList.add('selected');
            }
        };
        btn.addEventListener('click', handleDifficultyClick);
        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            handleDifficultyClick(e);
        }, { passive: false });
    });

    // Set up resume button (click and touch)
    resumeButton.addEventListener('click', resumeGame);
    resumeButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        resumeGame();
    }, { passive: false });

    // Set up instructions link (click and touch)
    const instructionsLink = document.getElementById('instructions-link');
    const instructionsScreen = document.getElementById('instructions-screen');
    const instructionsBackBtn = document.getElementById('instructions-back-btn');

    if (instructionsLink && instructionsScreen && instructionsBackBtn) {
        const showInstructions = () => {
            instructionsScreen.classList.remove('hidden');
        };
        const hideInstructions = () => {
            instructionsScreen.classList.add('hidden');
        };

        instructionsLink.addEventListener('click', showInstructions);
        instructionsLink.addEventListener('touchend', (e) => {
            e.preventDefault();
            showInstructions();
        }, { passive: false });

        instructionsBackBtn.addEventListener('click', hideInstructions);
        instructionsBackBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            hideInstructions();
        }, { passive: false });
    }

    // Initialize map zoom/pan for touch devices
    initMapZoom();

    // Try to load a saved game
    const savedGame = await loadGame();

    if (savedGame && savedGame.gameStarted && savedGame.gameState.phase !== 'gameOver') {
        gameState = savedGame.gameState;
        currentSize = savedGame.currentSize;
        currentDifficulty = savedGame.currentDifficulty;
        gameStarted = savedGame.gameStarted;

        // Validate the loaded game has territories (basic sanity check)
        const hasValidGame = gameState.territories && gameState.territories.length > 0;
        resumeButton.classList.toggle('hidden', !hasValidGame);

        // If invalid, clear the bad save
        if (!hasValidGame) {
            gameState = null;
            gameStarted = false;
            clearSavedGame();
        }
    } else {
        // No saved game or invalid - hide Resume button and clear any stale data
        resumeButton.classList.add('hidden');
        if (savedGame) {
            // There was saved data but it's not resumable, clear it
            clearSavedGame();
        }
    }

    // Show title screen first, then start screen
    showTitleScreen();
}

/**
 * Handle back button - returns to start screen
 */
function handleBack(): void {
    // Stop any running game logic
    gameGeneration++;
    isComputerPlaying = false;
    gameStarted = false;

    // Cancel any pending dice animations
    cancelDiceAnimation();

    stopConfetti();
    showStartScreen();
}

/**
 * Stop any running confetti animation and clean up
 */
function stopConfetti(): void {
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
function showStartScreen(): void {
    startScreen.classList.remove('hidden');
    gameScreen.classList.add('hidden');

    // Show resume button if there's a valid, active game that has actually started
    const hasActiveGame = gameState !== null &&
                          gameState.phase !== 'gameOver' &&
                          gameStarted &&
                          gameState.territories.length > 0;
    resumeButton.classList.toggle('hidden', !hasActiveGame);

    // Sync size button selected state with currentSize
    document.querySelectorAll('.size-btn').forEach(btn => {
        const size = (btn as HTMLElement).dataset.size;
        btn.classList.toggle('selected', size === currentSize);
    });

    // Sync difficulty button selected state with currentDifficulty
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        const difficulty = (btn as HTMLElement).dataset.difficulty;
        btn.classList.toggle('selected', difficulty === currentDifficulty);
    });
}

/**
 * Show the game screen and hide the start screen
 */
function showGameScreen(): void {
    startScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
}

/**
 * Start a new game with the specified size
 */
function startGameWithSize(size: 'small' | 'medium' | 'large'): void {
    // Clean up any running confetti from previous game
    stopConfetti();

    // Clear any existing saved game
    clearSavedGame();

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
function handleSizeButtonClick(size: 'small' | 'medium' | 'large'): void {
    const hasActiveGame = gameState !== null && gameState.phase !== 'gameOver';

    if (hasActiveGame) {
        showNewGameConfirmation(size);
    } else {
        startGameWithSize(size);
    }
}

/**
 * Show confirmation modal when starting new game with active game
 */
function showNewGameConfirmation(size: 'small' | 'medium' | 'large'): void {
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
    const handleClick = (e: Event) => {
        const target = e.target as HTMLElement;
        if (target.id === 'cancel-new-game-btn') {
            overlay.removeEventListener('click', handleClick);
            overlay.remove();
            // Ensure Resume button is visible since there's an active game
            resumeButton.classList.remove('hidden');
        } else if (target.id === 'confirm-new-game-btn') {
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
function resumeGame(): void {
    // Validate we have everything needed to resume
    if (!gameState || !gameStarted || gameState.phase === 'gameOver') {
        return;
    }

    if (!gameState.territories || gameState.territories.length === 0) {
        return;
    }

    if (!svgElement) {
        return;
    }

    // Reset map zoom/pan
    resetMapTransform();

    // Rebuild the map structure from saved territories
    // We need to reconstruct allHexes from the territory data
    const allHexes: Hex[] = [];
    const seenHexKeys = new Set<string>();

    for (const territory of gameState.territories) {
        for (const hexKey of territory.hexes) {
            if (!seenHexKeys.has(hexKey)) {
                seenHexKeys.add(hexKey);
                // Parse "q,r" format back to Hex object
                const [q, r] = hexKey.split(',').map(Number);
                allHexes.push({ q, r });
            }
        }
    }

    currentMap = {
        territories: gameState.territories,
        allHexes,
        emptyHexes: new Set<string>(),  // Empty tiles aren't critical for gameplay
        config: GAME_CONFIGS[currentSize].map as MapGeneratorConfig,
    };

    // Render the map
    renderMap(svgElement, currentMap);

    // Re-add interactivity handlers
    addClickHandlers(svgElement, currentMap.territories, handleHexClick);
    addHoverHandlers(svgElement, currentMap.territories, handleTerritoryHover);

    // Update UI
    updateTurnIndicator();
    updateStats();
    clearCombatLog();

    // Log that game was resumed
    const humanTeam = gameState.teams.find(t => t.isHuman);
    if (humanTeam) {
        logCombatResult(`Game resumed - You are ${humanTeam.name}`);
    }

    // Show the game screen
    showGameScreen();

    // If it's a computer's turn, run computer turns
    const currentTeam = getCurrentTeam(gameState);
    if (!currentTeam.isHuman) {
        isComputerPlaying = true;
        endTurnButton.disabled = true;
        runComputerTurns();
    }
}

/**
 * Create turn indicator if it doesn't exist in DOM
 */
function createTurnIndicator(): HTMLElement {
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
function createEndTurnButton(): HTMLButtonElement {
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
function createFastForwardButton(): HTMLButtonElement {
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
function toggleFastForward(): void {
    isFastForward = !isFastForward;
    fastForwardButton.classList.toggle('active', isFastForward);
}

/**
 * Create Surrender button if it doesn't exist in DOM
 */
function createSurrenderButton(): HTMLButtonElement {
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
function handleSurrender(): void {
    if (!gameState || gameState.phase === 'gameOver') {
        return;
    }

    showSurrenderConfirmation();
}

/**
 * Show surrender confirmation modal
 */
function showSurrenderConfirmation(): void {
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
    const handleClick = (e: Event) => {
        const target = e.target as HTMLElement;
        if (target.id === 'cancel-surrender-btn') {
            overlay.removeEventListener('click', handleClick);
            overlay.remove();
        } else if (target.id === 'confirm-surrender-btn') {
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
function executeSurrender(): void {
    // Guard against calling when game is already over
    if (!gameState || gameState.phase === 'gameOver') return;

    // Stop any running game logic
    gameGeneration++;
    isComputerPlaying = false;
    gameStarted = false;

    // Cancel any pending dice animations
    cancelDiceAnimation();

    const humanTeam = gameState.teams.find(t => t.isHuman);
    if (!humanTeam) return;

    // Set game to over state
    gameState = {
        ...gameState,
        phase: 'gameOver',
    };

    // Clear saved game since game is over
    clearSavedGame();

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
    const handleClick = (e: Event) => {
        const target = e.target as HTMLElement;
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
function createCombatLog(): HTMLElement {
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
function generateAndRenderNewMap(): void {
    // Increment game generation to invalidate any pending async operations
    gameGeneration++;

    // Reset map zoom/pan
    resetMapTransform();

    // Reset game state flags
    isComputerPlaying = false;
    isFastForward = false;
    gameStarted = false;  // Game hasn't started until user clicks "Start Game"

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

    // Add click/touch handler for empty space deselection - only once
    if (!svgListenersInitialized) {
        svgElement.addEventListener('click', handleSvgBackgroundClick);
        svgElement.addEventListener('touchend', handleSvgBackgroundTouch, { passive: false });
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
}

/**
 * Show game start message modal
 */
function showGameStartMessage(humanTeam: Team): void {
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
    const handleClick = (e: Event) => {
        const target = e.target as HTMLElement;
        if (target.id === 'start-game-btn') {
            overlay.removeEventListener('click', handleClick);
            overlay.remove();

            if (!gameState) return;

            // NOW the game officially starts
            gameStarted = true;

            // Randomly select who goes first
            gameState = beginGame(gameState);

            // Save the initial game state
            saveGameState();

            logCombatResult(`You are playing as ${humanTeam.name}`);

            // Check who goes first
            const firstTeam = getCurrentTeam(gameState);

            // Set state flags based on who goes first
            if (firstTeam.isHuman) {
                isComputerPlaying = false;
                endTurnButton.disabled = false;
            } else {
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
 * Supports both mouse clicks and touch events
 */
function handleSvgBackgroundClick(event: MouseEvent | TouchEvent): void {
    const target = event.target as Element;
    if (target === svgElement || target.classList.contains('hex-empty')) {
        if (gameState) {
            gameState = deselectTerritory(gameState);
            deselectAll(svgElement);
            clearHighlights(svgElement);
            hideDicePreview();
        }
    }
}

/**
 * Handle touch events on SVG background for deselection
 */
function handleSvgBackgroundTouch(event: TouchEvent): void {
    const target = event.target as Element;
    if (target === svgElement || target.classList.contains('hex-empty')) {
        // Prevent the click event from also firing
        event.preventDefault();
        handleSvgBackgroundClick(event);
    }
}

/**
 * Handle hex click - implements selection and attack logic
 * Supports both mouse clicks and touch events
 */
async function handleHexClick(clickedTerritory: Territory, hex: Hex, event: MouseEvent | TouchEvent): Promise<void> {
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
        return;
    }

    // If clicking on own territory
    if (territory.owner === gameState.currentTeamIndex) {
        // If we already have this territory selected, deselect it
        if (gameState.selectedTerritory === territory.id) {
            gameState = deselectTerritory(gameState);
            deselectAll(svgElement);
            clearHighlights(svgElement);
            hideDicePreview();
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
            // Show dice preview with potential attack dice
            const currentTeam = getCurrentTeam(gameState);
            showDicePreview(territory.armies, currentTeam.color);
        } else {
            hideDicePreview();
        }
    }
    // If clicking on enemy territory while we have a selection
    else if (gameState.selectedTerritory !== null) {
        // Check if this is a valid target
        const targets = getSelectedTerritoryTargets(gameState);
        const isValidTarget = targets.some(t => t.id === territory.id);

        if (isValidTarget) {
            // Hide dice preview before attack
            hideDicePreview();

            // Execute attack
            const sourceTerritory = gameState.territories.find(t => t.id === gameState!.selectedTerritory);

            // Capture colors before attack (defender color changes on conquest)
            const attackerColor = sourceTerritory?.color || '#888';
            const defenderColor = territory.color;

            gameState = attemptAttack(gameState, territory.id, currentDifficulty);

            // Show combat result
            if (gameState.lastCombatResult && sourceTerritory) {
                const sourceName = sourceTerritory.name;
                const targetName = territory.name;
                const result = gameState.lastCombatResult;

                // Log combat result
                logCombatResult(formatCombatResult(result, sourceName, targetName));

                // Capture game generation to detect if game changes during animation
                const currentGeneration = gameGeneration;

                // Show dice animation (non-blocking) and combat animation in parallel
                showDiceAnimation(result, attackerColor, defenderColor);
                await showCombatAnimation(svgElement, result, sourceTerritory.id, territory.id);

                // Only update if this is still the same game
                if (gameGeneration !== currentGeneration || !gameState) {
                    return;
                }

                // Update territory displays after animation (with null safety)
                const updatedSource = gameState.territories.find(t => t.id === sourceTerritory.id);
                const updatedTarget = gameState.territories.find(t => t.id === territory.id);
                if (updatedSource) updateTerritoryDisplay(svgElement, updatedSource);
                if (updatedTarget) updateTerritoryDisplay(svgElement, updatedTarget);

                // Update selection and highlights after animation completes
                deselectAll(svgElement);
                clearHighlights(svgElement);

                // If a territory is still selected after the attack, show it
                if (gameState.selectedTerritory !== null) {
                    selectTerritoryVisual(svgElement, gameState.selectedTerritory);
                    const newTargets = getSelectedTerritoryTargets(gameState);
                    if (newTargets.length > 0) {
                        highlightValidTargets(svgElement, newTargets.map(t => t.id));
                        // Show dice preview for the newly selected territory
                        const selectedTerritory = gameState.territories.find(t => t.id === gameState!.selectedTerritory);
                        if (selectedTerritory) {
                            const currentTeam = getCurrentTeam(gameState);
                            showDicePreview(selectedTerritory.armies, currentTeam.color);
                        }
                    }
                }
            }

            // Check for game over
            if (gameState.phase === 'gameOver' && gameState.winner !== null) {
                clearSavedGame();
                showVictory(gameState.winner);
            } else {
                // Save game state after successful attack
                saveGameState();
            }

            // Update stats
            updateStats();
        }
    }
}

/**
 * Handle End Turn button click
 */
function handleEndTurn(): void {
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
    if (!currentTeam.isHuman) {
        return;
    }

    const previousTeam = currentTeam;
    const resupplyAmount = calculateResupply(gameState, currentDifficulty);

    // End the turn
    gameState = endTurn(gameState);

    // Log resupply
    logCombatResult(`${previousTeam.name} received ${resupplyAmount} reinforcements`);

    // Clear selection and highlights
    deselectAll(svgElement);
    clearHighlights(svgElement);
    hideDicePreview();

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
        clearSavedGame();
        showVictory(gameState.winner);
        return;
    }

    // Save game state after turn ends
    saveGameState();

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
async function runComputerTurns(): Promise<void> {
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
        // Check if game was cancelled or a new game was started
        if (gameGeneration !== thisGameGeneration || !gameStarted) {
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
        await executeComputerTurn(thisGameGeneration);

        // Check again if game changed during async execution
        if (gameGeneration !== thisGameGeneration || !gameStarted) {
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
function showDefeat(): void {
    if (!gameState) return;

    const humanTeam = gameState.teams.find(t => t.isHuman);
    if (!humanTeam) return;

    // Clear saved game since game is over
    clearSavedGame();

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
    const handleClick = (e: Event) => {
        const target = e.target as HTMLElement;
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
 * @param expectedGeneration - The game generation when this turn started, used to detect if game was cancelled
 */
async function executeComputerTurn(expectedGeneration: number): Promise<void> {
    if (!gameState) return;

    const currentTeam = getCurrentTeam(gameState);

    // Add a small delay before starting attacks
    await delay(500);

    // Check if game was cancelled during delay
    if (gameGeneration !== expectedGeneration || !gameStarted) return;

    let attacksThisTurn = 0;

    // Attack loop
    while (shouldContinueAttacking(gameState, attacksThisTurn, currentDifficulty)) {
        // Check if game was cancelled
        if (gameGeneration !== expectedGeneration || !gameStarted) return;

        const attack = findBestAttack(gameState, currentDifficulty);
        if (!attack) break;

        const source = gameState.territories.find(t => t.id === attack.sourceId);
        const target = gameState.territories.find(t => t.id === attack.targetId);

        if (!source || !target) break;

        // Visual feedback - highlight attacking territories
        selectTerritoryVisual(svgElement, source.id);
        highlightValidTargets(svgElement, [target.id]);

        // Small delay to show selection
        await delay(300);

        // Check if game was cancelled during delay
        if (gameGeneration !== expectedGeneration || !gameStarted) return;

        // Select the source territory in game state (required for attemptAttack)
        gameState = selectTerritory(gameState, source.id);

        // Capture colors before attack (defender color changes on conquest)
        const attackerColor = source.color;
        const defenderColor = target.color;

        // Execute the attack (pass difficulty for AI dice boost on Unfair)
        gameState = attemptAttack(gameState, target.id, currentDifficulty);
        attacksThisTurn++;

        // Check if game was cancelled before showing results
        if (gameGeneration !== expectedGeneration || !gameStarted) return;

        // Show combat result
        if (gameState.lastCombatResult) {
            const result = gameState.lastCombatResult;
            logCombatResult(formatCombatResult(result, source.name, target.name));

            // Show dice animation (non-blocking) and combat animation in parallel
            showDiceAnimation(result, attackerColor, defenderColor);
            await showCombatAnimation(svgElement, result, source.id, target.id);

            // Check if game was cancelled during animation
            if (gameGeneration !== expectedGeneration || !gameStarted) return;

            // Update territory displays
            const updatedSource = gameState.territories.find(t => t.id === source.id);
            const updatedTarget = gameState.territories.find(t => t.id === target.id);
            if (updatedSource) updateTerritoryDisplay(svgElement, updatedSource);
            if (updatedTarget) updateTerritoryDisplay(svgElement, updatedTarget);
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

        // Check if game was cancelled during delay
        if (gameGeneration !== expectedGeneration || !gameStarted) return;
    }

    // Check if game was cancelled before ending turn
    if (gameGeneration !== expectedGeneration || !gameStarted) return;

    // End computer's turn
    const previousTeam = getCurrentTeam(gameState);
    const resupplyAmount = calculateResupply(gameState, currentDifficulty);

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

    // Check if game was cancelled before saving
    if (gameGeneration !== expectedGeneration || !gameStarted) return;

    // Save game state after computer turn
    saveGameState();

    // Small delay before next player
    await delay(300);
}

/**
 * Update turn indicator to show computer is playing
 */
function updateTurnIndicatorForComputer(): void {
    if (!gameState) return;

    // Update sidebar to highlight current team
    updateTeamStatsSidebar();
}

/**
 * Utility function for delays
 * When fast forward is enabled, delays are reduced to minimum
 */
function delay(ms: number): Promise<void> {
    const actualDelay = isFastForward ? Math.min(ms, 50) : ms;
    return new Promise(resolve => setTimeout(resolve, actualDelay));
}

/**
 * Handle territory hover
 * Supports both mouse hover and touch events
 */
function handleTerritoryHover(territory: Territory | null, event: MouseEvent | TouchEvent): void {
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
    } else {
        // Hide tooltip
        tooltipElement.classList.remove('visible');
    }
}

/**
 * Update tooltip position based on mouse/touch position
 */
function updateTooltipPosition(event: MouseEvent | TouchEvent): void {
    const offset = 15;
    let clientX: number;
    let clientY: number;

    // Handle touch events
    if ('touches' in event && event.touches.length > 0) {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
    } else if ('clientX' in event) {
        clientX = event.clientX;
        clientY = event.clientY;
    } else {
        return; // Can't determine position
    }

    let x = clientX + offset;
    let y = clientY + offset;

    // Keep tooltip in viewport
    const tooltipRect = tooltipElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (x + tooltipRect.width > viewportWidth - 10) {
        x = clientX - tooltipRect.width - offset;
    }
    if (y + tooltipRect.height > viewportHeight - 10) {
        y = clientY - tooltipRect.height - offset;
    }

    tooltipElement.style.left = `${x}px`;
    tooltipElement.style.top = `${y}px`;
}

/**
 * Update the turn indicator display
 * Now uses the sidebar to show current turn instead of a separate indicator
 */
function updateTurnIndicator(): void {
    if (!gameState) return;

    const currentTeam = getCurrentTeam(gameState);

    if (gameState.phase === 'gameOver') {
        endTurnButton.disabled = true;
    } else {
        endTurnButton.disabled = !currentTeam.isHuman || isComputerPlaying;
    }

    // Update sidebar to highlight current team
    updateTeamStatsSidebar();
}

/**
 * Update the stats display
 */
function updateStats(): void {
    if (!gameState) return;

    // Update sidebar team stats
    updateTeamStatsSidebar();
}

/**
 * Update the team stats sidebar with hexagon indicators
 */
function updateTeamStatsSidebar(): void {
    if (!gameState || !teamStatsElement) return;

    const currentTeam = getCurrentTeam(gameState);

    const teamRows = gameState.teams
        .map(t => {
            const territoryCount = gameState!.territories.filter(ter => ter.owner === t.id).length;
            const totalArmies = gameState!.territories
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
function logCombatResult(message: string): void {
    const entry = document.createElement('div');
    entry.className = 'combat-log-entry';
    entry.textContent = message;

    // Add to top of log
    combatLogElement.insertBefore(entry, combatLogElement.firstChild);

    // Limit log entries
    while (combatLogElement.children.length > 10) {
        combatLogElement.removeChild(combatLogElement.lastChild!);
    }
}

/**
 * Clear the combat log
 */
function clearCombatLog(): void {
    combatLogElement.innerHTML = '';
}

/**
 * Show victory message
 */
function showVictory(winnerId: number): void {
    if (!gameState) return;

    const winner = gameState.teams.find(t => t.id === winnerId);
    if (!winner) return;

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
    const handleClick = (e: Event) => {
        const target = e.target as HTMLElement;
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
function spawnConfetti(teamColor: string): number {
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
function createConfettiPiece(
    container: HTMLElement,
    colors: string[],
    shapes: string[]
): void {
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

// Track touch movement for tooltip positioning on mobile
document.addEventListener('touchmove', (event) => {
    if (tooltipElement && tooltipElement.classList.contains('visible')) {
        updateTooltipPosition(event);
    }
}, { passive: true });

// ============================================================
// MAP ZOOM AND PAN
// ============================================================

let mapScale = 1;
let mapTranslateX = 0;
let mapTranslateY = 0;
let lastTouchX = 0;
let lastTouchY = 0;
let isPanning = false;
let isPortraitMobile = false;

/**
 * Check if we're on a mobile device in portrait orientation
 */
function checkPortraitMobile(): boolean {
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isPortrait = window.innerHeight > window.innerWidth;
    return isMobile && isPortrait;
}

/**
 * Update portrait state and apply transform
 */
function updateOrientationState(): void {
    const wasPortrait = isPortraitMobile;
    isPortraitMobile = checkPortraitMobile();

    // Reset transform when orientation changes
    if (wasPortrait !== isPortraitMobile) {
        resetMapTransform();
    } else {
        applyMapTransform();
    }

    // Hide status bar in portrait mode on iOS
    updateStatusBar();
}

/**
 * Show/hide status bar based on orientation
 */
async function updateStatusBar(): Promise<void> {
    try {
        if (isPortraitMobile) {
            await StatusBar.hide();
        } else {
            await StatusBar.show();
        }
    } catch {
        // StatusBar plugin not available (e.g., in browser)
    }
}

/**
 * Calculate the base scale needed for portrait mode to fill the screen
 */
function getPortraitBaseScale(): number {
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer) return 1;

    const rect = mapContainer.getBoundingClientRect();
    // After 90deg rotation, we want the map to fill the width
    // The ratio of height/width tells us how much to scale up
    const aspectRatio = rect.height / rect.width;
    return aspectRatio;
}

/**
 * Apply transform to the SVG element
 */
function applyMapTransform(): void {
    const svg = document.getElementById('map-svg');
    if (svg) {
        if (isPortraitMobile) {
            // Rotate 90 degrees in portrait mode on mobile
            // Scale up to fill the screen width after rotation
            const baseScale = getPortraitBaseScale();
            const totalScale = baseScale * mapScale;
            svg.style.transform = `translate(${mapTranslateX}px, ${mapTranslateY}px) scale(${totalScale}) rotate(90deg)`;
        } else {
            svg.style.transform = `translate(${mapTranslateX}px, ${mapTranslateY}px) scale(${mapScale})`;
        }
        svg.style.transformOrigin = 'center center';
    }
}

/**
 * Reset map zoom and pan
 */
function resetMapTransform(): void {
    mapScale = 1;
    mapTranslateX = 0;
    mapTranslateY = 0;
    applyMapTransform();
    updateZoomButtonState();
}

/**
 * Toggle zoom between 1x and 2x
 */
function toggleZoom(): void {
    if (mapScale === 1) {
        // Zoom in to 200%
        mapScale = 2;
        mapTranslateX = 0;
        mapTranslateY = 0;
    } else {
        // Zoom out to 100%
        mapScale = 1;
        mapTranslateX = 0;
        mapTranslateY = 0;
    }
    applyMapTransform();
    updateZoomButtonState();
}

/**
 * Update zoom button icon and state based on current zoom level
 */
function updateZoomButtonState(): void {
    const zoomBtn = document.getElementById('zoom-btn');
    const plusIcon = document.getElementById('zoom-plus-icon');
    const minusIcon = document.getElementById('zoom-minus-icon');

    if (!zoomBtn || !plusIcon || !minusIcon) return;

    if (mapScale > 1) {
        // Show minus icon (zoomed in)
        plusIcon.style.display = 'none';
        minusIcon.style.display = 'block';
        zoomBtn.classList.add('active');
        zoomBtn.setAttribute('aria-label', 'Zoom out');
    } else {
        // Show plus icon (zoomed out)
        plusIcon.style.display = 'block';
        minusIcon.style.display = 'none';
        zoomBtn.classList.remove('active');
        zoomBtn.setAttribute('aria-label', 'Zoom in');
    }
}

/**
 * Constrain translation to keep map visible
 */
function constrainTranslation(): void {
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer) return;

    const rect = mapContainer.getBoundingClientRect();
    // Allow panning proportional to how much we've zoomed
    const maxPanX = (rect.width * (mapScale - 1)) / 2;
    const maxPanY = (rect.height * (mapScale - 1)) / 2;

    mapTranslateX = Math.min(maxPanX, Math.max(-maxPanX, mapTranslateX));
    mapTranslateY = Math.min(maxPanY, Math.max(-maxPanY, mapTranslateY));
}

/**
 * Initialize map orientation and pan handlers
 */
function initMapZoom(): void {
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer) return;

    // Initialize portrait state and listen for orientation changes
    isPortraitMobile = checkPortraitMobile();
    window.addEventListener('resize', updateOrientationState);
    window.addEventListener('orientationchange', updateOrientationState);

    // Apply initial transform (with rotation if in portrait)
    applyMapTransform();

    // Set initial status bar state
    updateStatusBar();

    // Single-finger panning when zoomed in
    mapContainer.addEventListener('touchstart', (e: TouchEvent) => {
        if (e.touches.length === 1 && mapScale > 1.05) {
            isPanning = true;
            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;
            e.preventDefault();
        }
    }, { passive: false });

    mapContainer.addEventListener('touchmove', (e: TouchEvent) => {
        if (isPanning && e.touches.length === 1 && mapScale > 1.05) {
            const deltaX = e.touches[0].clientX - lastTouchX;
            const deltaY = e.touches[0].clientY - lastTouchY;

            mapTranslateX += deltaX;
            mapTranslateY += deltaY;

            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;

            constrainTranslation();
            applyMapTransform();
            e.preventDefault();
        }
    }, { passive: false });

    mapContainer.addEventListener('touchend', (e: TouchEvent) => {
        if (e.touches.length === 0) {
            isPanning = false;
        }
    }, { passive: true });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
