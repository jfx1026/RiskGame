/**
 * Main entry point for the Risk Game Map Generator
 */
import { generateMap } from './mapGenerator.js';
import { renderMap, addClickHandlers, addHoverHandlers } from './renderer.js';
import { getTerritoryStats } from './territory.js';
import { createTeams, assignTerritoriesToTeams, initializeTerritories } from './game.js';
// DOM Elements
let svgElement;
let statsElement;
let tooltipElement;
// Current game state
let currentMap = null;
let currentTeams = [];
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
    if (!svgEl || !smallBtn || !mediumBtn || !largeBtn || !statsEl || !tooltipEl) {
        console.error('Required DOM elements not found');
        return;
    }
    svgElement = svgEl;
    statsElement = statsEl;
    tooltipElement = tooltipEl;
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
    // Set initial active button
    updateActiveButton(mediumBtn);
    // Generate initial map
    generateAndRenderNewMap();
    console.log('Risk Game Map Generator initialized');
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
 * Generate and render a new map
 */
function generateAndRenderNewMap() {
    // Get config for current size
    const gameConfig = GAME_CONFIGS[currentSize];
    // Generate new map
    currentMap = generateMap(gameConfig.map);
    // Create teams and assign territories
    currentTeams = createTeams(gameConfig.teamCount);
    assignTerritoriesToTeams(currentMap.territories, currentTeams);
    // Initialize territory types and armies
    initializeTerritories(currentMap.territories, currentTeams, gameConfig.armiesPerTeam);
    // Render to SVG
    renderMap(svgElement, currentMap);
    // Add interactivity
    addClickHandlers(svgElement, currentMap.territories, handleHexClick);
    addHoverHandlers(svgElement, currentMap.territories, handleTerritoryHover);
    // Update stats display
    updateStats(currentMap, currentTeams);
    console.log(`Generated map with ${currentMap.territories.length} territories for ${currentTeams.length} teams`);
}
/**
 * Handle hex click
 */
function handleHexClick(territory, hex, event) {
    console.log(`Clicked: ${territory.name} at hex (${hex.q}, ${hex.r})`);
    // Visual feedback - briefly highlight
    const target = event.target;
    target.style.filter = 'brightness(1.4)';
    setTimeout(() => {
        target.style.filter = '';
    }, 150);
}
/**
 * Handle territory hover
 */
function handleTerritoryHover(territory, event) {
    if (territory) {
        // Show tooltip with team info
        const neighborCount = territory.neighbors.size;
        const hexCount = territory.hexes.size;
        const team = territory.owner !== undefined ? currentTeams[territory.owner] : null;
        const teamName = team ? team.name : 'Unowned';
        const typeLabel = territory.type === 'big' ? 'Large' : 'Small';
        tooltipElement.innerHTML = `
            <strong>${territory.name}</strong> (${typeLabel})<br>
            Team: ${teamName}<br>
            Armies: ${territory.armies}<br>
            Neighbors: ${neighborCount}
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
 * Update the stats display
 */
function updateStats(map, teams) {
    const stats = getTerritoryStats(map.territories);
    // Count territories per team
    const teamStats = teams.map(t => `${t.name.split(' ')[0]}: ${t.territories.length}`).join(', ');
    statsElement.textContent =
        `${teams.length} teams | ${stats.count} territories | ${teamStats}`;
}
// Track mouse movement for tooltip positioning
document.addEventListener('mousemove', (event) => {
    if (tooltipElement.classList.contains('visible')) {
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