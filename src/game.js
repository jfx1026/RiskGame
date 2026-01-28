/**
 * Game state and team management
 */
import { TERRITORY_COLORS } from './colors.js';
// Custom colorblind-friendly palette
const TEAM_COLORS = [
    '#EF476F', // Bubblegum Pink
    '#F78C6B', // Coral Glow
    '#FFD166', // Royal Gold
    '#06D6A0', // Emerald
    '#118AB2', // Ocean Blue
    '#073B4C', // Dark Teal
];
const TEAM_NAMES = [
    'Pink Army',
    'Coral Legion',
    'Gold Empire',
    'Emerald Horde',
    'Ocean Alliance',
    'Teal Dynasty',
];
/**
 * Create teams for a game
 */
export function createTeams(teamCount) {
    const teams = [];
    for (let i = 0; i < teamCount; i++) {
        teams.push({
            id: i,
            name: TEAM_NAMES[i] || `Team ${i + 1}`,
            color: TEAM_COLORS[i] || TERRITORY_COLORS[i],
            territories: [],
        });
    }
    return teams;
}
/**
 * Randomly assign territories to teams
 * Distributes as evenly as possible
 */
export function assignTerritoriesToTeams(territories, teams) {
    // Clear existing assignments
    for (const team of teams) {
        team.territories = [];
    }
    // Shuffle territories for random assignment
    const shuffled = shuffleArray([...territories]);
    // Assign territories round-robin style for even distribution
    for (let i = 0; i < shuffled.length; i++) {
        const teamIndex = i % teams.length;
        const territory = shuffled[i];
        // Assign territory to team
        teams[teamIndex].territories.push(territory.id);
        territory.owner = teamIndex;
        territory.color = teams[teamIndex].color;
    }
}
/**
 * Get team by ID
 */
export function getTeamById(teams, id) {
    return teams.find(t => t.id === id);
}
/**
 * Get territories owned by a team
 */
export function getTeamTerritories(team, territories) {
    return territories.filter(t => t.owner === team.id);
}
/**
 * Get territory count per team
 */
export function getTerritoryCounts(teams) {
    const counts = new Map();
    for (const team of teams) {
        counts.set(team.id, team.territories.length);
    }
    return counts;
}
/**
 * Fisher-Yates shuffle
 */
function shuffleArray(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}
//# sourceMappingURL=game.js.map