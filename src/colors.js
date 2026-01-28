/**
 * Territory color palette
 * Designed to be visually distinct and reasonably colorblind-friendly
 * Using varied hues, saturations, and lightness values
 */
// Primary palette - 16 distinct colors for territories
export const TERRITORY_COLORS = [
    '#e63946', // Red
    '#457b9d', // Steel blue
    '#2a9d8f', // Teal
    '#e9c46a', // Yellow/Gold
    '#8338ec', // Purple
    '#f77f00', // Orange
    '#06d6a0', // Mint green
    '#ef476f', // Pink
    '#118ab2', // Blue
    '#84a98c', // Sage green
    '#9d4edd', // Violet
    '#fb8500', // Amber
    '#3d5a80', // Navy blue
    '#90be6d', // Light green
    '#f4a261', // Peach/Salmon
    '#577590', // Slate blue
];
// Extended palette if more colors needed
export const EXTENDED_COLORS = [
    ...TERRITORY_COLORS,
    '#bc6c25', // Brown
    '#dda15e', // Tan
    '#606c38', // Olive
    '#283618', // Dark green
];
/**
 * Get a color for a territory by index
 * Wraps around if index exceeds palette size
 */
export function getTerritoryColor(index) {
    return TERRITORY_COLORS[index % TERRITORY_COLORS.length];
}
/**
 * Get a shuffled copy of the color palette
 * Useful for randomizing territory colors each generation
 */
export function shuffleColors(colors = TERRITORY_COLORS) {
    const shuffled = [...colors];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}
/**
 * Generate a contrasting text color (black or white) for a given background
 */
export function getContrastColor(hexColor) {
    // Remove # if present
    const hex = hexColor.replace('#', '');
    // Parse RGB values
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    // Calculate relative luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
}
//# sourceMappingURL=colors.js.map