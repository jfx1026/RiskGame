/**
 * Game state persistence using Capacitor Preferences
 * Handles saving and loading game state to survive app termination
 */

import { Preferences } from '@capacitor/preferences';
import { GameState, Team, GamePhase } from './game.js';
import { Territory, TerritoryType } from './territory.js';
import { CombatResult } from './combat.js';
import { Difficulty } from './ai.js';

// Storage key for the saved game
const SAVED_GAME_KEY = 'risk_game_saved_state';

/**
 * Serializable version of Territory (Sets converted to arrays)
 */
interface SerializedTerritory {
    id: number;
    name: string;
    hexes: string[];           // Array instead of Set
    color: string;
    neighbors: number[];       // Array instead of Set
    owner?: number;
    armies: number;
    type: TerritoryType;
    armyHex?: string;
}

/**
 * Serializable version of GameState
 */
interface SerializedGameState {
    teams: Team[];
    territories: SerializedTerritory[];
    currentTeamIndex: number;
    selectedTerritory: number | null;
    phase: GamePhase;
    turnNumber: number;
    lastCombatResult: CombatResult | null;
    winner: number | null;
    capturedThisTurn: boolean;
    eliminationsThisTurn: number;
}

/**
 * Complete saved game data
 */
interface SavedGameData {
    gameState: SerializedGameState;
    currentSize: 'small' | 'medium' | 'large';
    currentDifficulty: Difficulty;
    gameStarted: boolean;
    savedAt: number;  // Timestamp for debugging
    version: number;  // Schema version for future migrations
}

const SAVE_VERSION = 1;

/**
 * Convert a Territory to its serializable form
 */
function serializeTerritory(territory: Territory): SerializedTerritory {
    return {
        id: territory.id,
        name: territory.name,
        hexes: Array.from(territory.hexes),
        color: territory.color,
        neighbors: Array.from(territory.neighbors),
        owner: territory.owner,
        armies: territory.armies,
        type: territory.type,
        armyHex: territory.armyHex,
    };
}

/**
 * Convert a serialized territory back to Territory with Sets
 */
function deserializeTerritory(serialized: SerializedTerritory): Territory {
    return {
        id: serialized.id,
        name: serialized.name,
        hexes: new Set(serialized.hexes),
        color: serialized.color,
        neighbors: new Set(serialized.neighbors),
        owner: serialized.owner,
        armies: serialized.armies,
        type: serialized.type,
        armyHex: serialized.armyHex,
    };
}

/**
 * Serialize GameState for storage
 */
function serializeGameState(state: GameState): SerializedGameState {
    return {
        teams: state.teams,
        territories: state.territories.map(serializeTerritory),
        currentTeamIndex: state.currentTeamIndex,
        selectedTerritory: state.selectedTerritory,
        phase: state.phase,
        turnNumber: state.turnNumber,
        lastCombatResult: state.lastCombatResult,
        winner: state.winner,
        capturedThisTurn: state.capturedThisTurn,
        eliminationsThisTurn: state.eliminationsThisTurn,
    };
}

/**
 * Deserialize GameState from storage
 */
function deserializeGameState(serialized: SerializedGameState): GameState {
    return {
        teams: serialized.teams,
        territories: serialized.territories.map(deserializeTerritory),
        currentTeamIndex: serialized.currentTeamIndex,
        selectedTerritory: serialized.selectedTerritory,
        phase: serialized.phase,
        turnNumber: serialized.turnNumber,
        lastCombatResult: serialized.lastCombatResult,
        winner: serialized.winner,
        capturedThisTurn: serialized.capturedThisTurn,
        eliminationsThisTurn: serialized.eliminationsThisTurn,
    };
}

/**
 * Save the current game state
 * Call this after any state change that should be persisted
 */
export async function saveGame(
    gameState: GameState,
    currentSize: 'small' | 'medium' | 'large',
    currentDifficulty: Difficulty,
    gameStarted: boolean
): Promise<void> {
    const savedData: SavedGameData = {
        gameState: serializeGameState(gameState),
        currentSize,
        currentDifficulty,
        gameStarted,
        savedAt: Date.now(),
        version: SAVE_VERSION,
    };

    try {
        await Preferences.set({
            key: SAVED_GAME_KEY,
            value: JSON.stringify(savedData),
        });
    } catch (error) {
        console.error('Failed to save game:', error);
    }
}

/**
 * Load a saved game if one exists
 * Returns null if no saved game or if it's invalid
 */
export async function loadGame(): Promise<{
    gameState: GameState;
    currentSize: 'small' | 'medium' | 'large';
    currentDifficulty: Difficulty;
    gameStarted: boolean;
} | null> {
    try {
        const { value } = await Preferences.get({ key: SAVED_GAME_KEY });

        if (!value) {
            return null;
        }

        const savedData: SavedGameData = JSON.parse(value);

        // Version check for future migrations
        if (savedData.version !== SAVE_VERSION) {
            console.warn('Saved game version mismatch, clearing save');
            await clearSavedGame();
            return null;
        }

        // Don't restore games that are already over
        if (savedData.gameState.phase === 'gameOver') {
            await clearSavedGame();
            return null;
        }

        return {
            gameState: deserializeGameState(savedData.gameState),
            currentSize: savedData.currentSize,
            currentDifficulty: savedData.currentDifficulty,
            gameStarted: savedData.gameStarted,
        };
    } catch (error) {
        console.error('Failed to load game:', error);
        return null;
    }
}

/**
 * Check if a saved game exists (without fully loading it)
 */
export async function hasSavedGame(): Promise<boolean> {
    try {
        const { value } = await Preferences.get({ key: SAVED_GAME_KEY });

        if (!value) {
            return false;
        }

        const savedData: SavedGameData = JSON.parse(value);

        // Don't count finished games
        return savedData.gameState.phase !== 'gameOver';
    } catch {
        return false;
    }
}

/**
 * Clear the saved game
 * Call this when a game ends or user starts a new game
 */
export async function clearSavedGame(): Promise<void> {
    try {
        await Preferences.remove({ key: SAVED_GAME_KEY });
    } catch (error) {
        console.error('Failed to clear saved game:', error);
    }
}
