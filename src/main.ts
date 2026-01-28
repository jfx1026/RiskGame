/**
 * Main entry point for the Risk Game Map Generator
 */

import { generateMap, GeneratedMap, MapGeneratorConfig } from './mapGenerator.js';
import { renderMap, addClickHandlers, addHoverHandlers } from './renderer.js';
import { getTerritoryStats, Territory } from './territory.js';
import { Hex } from './hex.js';

// DOM Elements
let svgElement: SVGSVGElement;
let statsElement: HTMLElement;
let tooltipElement: HTMLElement;

// Current map state
let currentMap: GeneratedMap | null = null;
let currentSize: 'small' | 'medium' | 'large' = 'medium';

// Map size configurations
const MAP_SIZES: Record<string, Partial<MapGeneratorConfig>> = {
    small: {
        gridWidth: 10,
        gridHeight: 8,
        territoryCount: 8,
        minTerritorySize: 3,
        emptyTilePercent: 10,
    },
    medium: {
        gridWidth: 18,
        gridHeight: 12,
        territoryCount: 15,
        minTerritorySize: 4,
        emptyTilePercent: 10,
    },
    large: {
        gridWidth: 26,
        gridHeight: 16,
        territoryCount: 24,
        minTerritorySize: 5,
        emptyTilePercent: 10,
    },
};

/**
 * Initialize the application
 */
function init(): void {
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

    svgElement = svgEl as unknown as SVGSVGElement;
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
function updateActiveButton(activeBtn: Element): void {
    document.querySelectorAll('.size-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    activeBtn.classList.add('active');
}

/**
 * Generate and render a new map
 */
function generateAndRenderNewMap(): void {
    // Generate new map with current size config
    const config = MAP_SIZES[currentSize];
    currentMap = generateMap(config);

    // Render to SVG
    renderMap(svgElement, currentMap);

    // Add interactivity
    addClickHandlers(svgElement, currentMap.territories, handleHexClick);
    addHoverHandlers(svgElement, currentMap.territories, handleTerritoryHover);

    // Update stats display
    updateStats(currentMap);

    console.log(`Generated map with ${currentMap.territories.length} territories`);
}

/**
 * Handle hex click
 */
function handleHexClick(territory: Territory, hex: Hex, event: MouseEvent): void {
    console.log(`Clicked: ${territory.name} at hex (${hex.q}, ${hex.r})`);

    // Visual feedback - briefly highlight
    const target = event.target as SVGElement;
    target.style.filter = 'brightness(1.4)';
    setTimeout(() => {
        target.style.filter = '';
    }, 150);
}

/**
 * Handle territory hover
 */
function handleTerritoryHover(territory: Territory | null, event: MouseEvent): void {
    if (territory) {
        // Show tooltip
        const neighborCount = territory.neighbors.size;
        const hexCount = territory.hexes.size;

        tooltipElement.innerHTML = `
            <strong>${territory.name}</strong><br>
            Hexes: ${hexCount}<br>
            Neighbors: ${neighborCount}
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
 * Update tooltip position based on mouse position
 */
function updateTooltipPosition(event: MouseEvent): void {
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
function updateStats(map: GeneratedMap): void {
    const stats = getTerritoryStats(map.territories);

    statsElement.textContent =
        `${stats.count} territories | ` +
        `${stats.totalHexes} total hexes | ` +
        `Size range: ${stats.minSize}-${stats.maxSize} hexes`;
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
} else {
    init();
}
