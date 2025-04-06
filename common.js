// common.js

// --- Constants ---
const STORAGE_KEY_ELO = 'eloData';
const STORAGE_KEY_HISTORY = 'matchHistory';
const DEFAULT_ELO = 1000; // Standardized default ELO
const K_FACTOR = 32;
const CONFIDENCE_INTERVAL_CONSTANT = 150; // For calculating score uncertainty

// --- Development Mode Check & Logger ---
// Checks if the extension is running unpacked (development mode).
// Extensions installed from the store will have an update_url.
const isDevelopmentMode = !('update_url' in chrome.runtime.getManifest());

// Conditional logger object
const logger = {
    log: (...args) => {
        if (isDevelopmentMode) {
            console.log('MyLMArena [DEV]:', ...args);
        }
    },
    warn: (...args) => {
        if (isDevelopmentMode) {
            console.warn('MyLMArena [DEV]:', ...args);
        }
    },
    // Keep errors visible even in production for critical issues
    error: (...args) => {
        console.error('MyLMArena:', ...args);
    },
    // A specific method for info that might be useful sometimes, but less noisy than log
    info: (...args) => {
        if (isDevelopmentMode) {
            console.info('MyLMArena [DEV]:', ...args);
        }
    }
};

// --- Storage Helper Functions ---
async function getStorageData(key) {
    try {
        // Use chrome.storage.local API
        const data = await chrome.storage.local.get(key);
        return data[key];
    } catch (error) {
        console.error(`Storage Helper: Error getting ${key} from storage:`, error);
        // Consider how errors should be propagated or handled depending on context
        return undefined; // Return undefined or null to indicate failure/not found
    }
}

async function setStorageData(key, value) {
    try {
        // Use chrome.storage.local API
        await chrome.storage.local.set({ [key]: value });
        return true; // Indicate success
    } catch (error) {
        console.error(`Storage Helper: Error setting ${key} in storage:`, error);
        return false; // Indicate failure
    }
}

// --- ELO Calculation ---
/**
 * Calculates new ELO ratings based on the outcome of a match.
 * @param {number} ratingA - Current ELO rating of player A.
 * @param {number} ratingB - Current ELO rating of player B.
 * @param {number} scoreA - Outcome for player A (1 for win, 0.5 for draw, 0 for loss).
 * @param {number} kFactor - The K-factor to use for the calculation.
 * @returns {{newRatingA: number, newRatingB: number}} - The new ELO ratings.
 */
function calculateElo(ratingA, ratingB, scoreA, kFactor) {
    const expectedScoreA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
    const expectedScoreB = 1 / (1 + Math.pow(10, (ratingA - ratingB) / 400));

    const newRatingA = Math.round(ratingA + kFactor * (scoreA - expectedScoreA));
    const scoreB = 1 - scoreA; // Score B is the inverse of Score A
    const newRatingB = Math.round(ratingB + kFactor * (scoreB - expectedScoreB));

    return { newRatingA, newRatingB };
} 