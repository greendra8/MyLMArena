// background.js
console.log("MyLMArena: Background script running.");

// Constants (can be shared or redefined here)
const DEFAULT_ELO = 1000;
const K_FACTOR = 32;
const STORAGE_KEY_ELO = 'eloData';
const STORAGE_KEY_HISTORY = 'matchHistory';

// --- Storage Helper Functions (copied from popup.js) ---
async function getStorageData(key) {
    try {
        const data = await chrome.storage.local.get(key);
        return data[key];
    } catch (error) {
        console.error(`Background: Error getting ${key} from storage:`, error);
        return null;
    }
}

async function setStorageData(key, value) {
    try {
        await chrome.storage.local.set({ [key]: value });
    } catch (error) {
        console.error(`Background: Error setting ${key} in storage:`, error);
    }
}

// --- ELO Calculation (copied from popup.js) ---
function calculateElo(ratingA, ratingB, scoreA, kFactor) {
    const expectedScoreA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
    const expectedScoreB = 1 / (1 + Math.pow(10, (ratingA - ratingB) / 400));

    const newRatingA = Math.round(ratingA + kFactor * (scoreA - expectedScoreA));
    const scoreB = 1 - scoreA;
    const newRatingB = Math.round(ratingB + kFactor * (scoreB - expectedScoreB));

    return { newRatingA, newRatingB };
}

// --- Core Match Recording Logic (moved from popup.js) ---
/**
 * Processes and records a match, updating storage.
 * @param {string} modelA - Name of model A.
 * @param {string} modelB - Name of model B.
 * @param {'A' | 'B' | 'Draw'} winnerValue - Outcome of the match.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
async function recordMatch(modelA, modelB, winnerValue) {
    console.log(`Background: Recording match: ${modelA} vs ${modelB}, Winner: ${winnerValue}`);

    if (!modelA || !modelB || !winnerValue) {
        console.error("Background: Invalid data received for recordMatch.", { modelA, modelB, winnerValue });
        return false;
    }

    try {
        // eloData structure: { modelName: { score: ELO, votes: count } }
        let eloData = await getStorageData(STORAGE_KEY_ELO) || {};
        let matchHistory = await getStorageData(STORAGE_KEY_HISTORY) || [];

        // Initialize model data if it doesn't exist
        if (!eloData[modelA]) {
            eloData[modelA] = { score: DEFAULT_ELO, votes: 0 };
        }
        if (!eloData[modelB]) {
            eloData[modelB] = { score: DEFAULT_ELO, votes: 0 };
        }

        const ratingA = eloData[modelA].score;
        const ratingB = eloData[modelB].score;

        let scoreA;
        if (winnerValue === 'A') {
            scoreA = 1;
        } else if (winnerValue === 'B') {
            scoreA = 0;
        } else { // Draw
            scoreA = 0.5;
        }

        const { newRatingA, newRatingB } = calculateElo(ratingA, ratingB, scoreA, K_FACTOR);

        // Update scores and increment vote counts
        eloData[modelA].score = newRatingA;
        eloData[modelA].votes += 1;
        eloData[modelB].score = newRatingB;
        eloData[modelB].votes += 1;

        const matchRecord = {
            modelA: modelA,
            modelB: modelB,
            winner: winnerValue === 'Draw' ? 'Draw' : (winnerValue === 'A' ? modelA : modelB),
            oldRatingA: ratingA,
            oldRatingB: ratingB,
            newRatingA: newRatingA,
            newRatingB: newRatingB,
            timestamp: new Date().toISOString()
        };
        matchHistory.push(matchRecord);

        await setStorageData(STORAGE_KEY_ELO, eloData);
        await setStorageData(STORAGE_KEY_HISTORY, matchHistory);

        console.log('Background: Match recorded successfully:', matchRecord);
        console.log('Background: Updated ELO data:', eloData);
        return true;
    } catch (error) {
        console.error("Background: Error during recordMatch processing:", error);
        return false;
    }
}

/**
 * Renames a model in both eloData and matchHistory.
 * @param {string} oldName - The current name of the model.
 * @param {string} newName - The new name for the model.
 * @returns {Promise<{status: string, message: string}>} - Result object.
 */
async function renameModel(oldName, newName) {
    console.log(`Background: Renaming model from '${oldName}' to '${newName}'`);
    if (!oldName || !newName || oldName === newName) {
        return { status: "error", message: "Invalid old or new name provided." };
    }

    try {
        let eloData = await getStorageData(STORAGE_KEY_ELO) || {};
        let matchHistory = await getStorageData(STORAGE_KEY_HISTORY) || [];

        // Check if old name exists and new name doesn't (or is same as old)
        if (!eloData[oldName]) {
            return { status: "error", message: `Model '${oldName}' not found.` };
        }
        if (eloData[newName]) {
            return { status: "error", message: `Model name '${newName}' already exists.` };
        }

        // Update eloData: Copy data, delete old key
        eloData[newName] = eloData[oldName];
        delete eloData[oldName];

        // Update matchHistory
        const updatedHistory = matchHistory.map(match => {
            let updated = false;
            const newMatch = { ...match }; // Clone match
            if (newMatch.modelA === oldName) {
                newMatch.modelA = newName;
                updated = true;
            }
            if (newMatch.modelB === oldName) {
                newMatch.modelB = newName;
                updated = true;
            }
            // Also update winner field if it contains the old name
            if (newMatch.winner === oldName) {
                newMatch.winner = newName;
                updated = true;
            }
            return updated ? newMatch : match; // Return updated match only if changed
        });

        // Save updated data
        await setStorageData(STORAGE_KEY_ELO, eloData);
        await setStorageData(STORAGE_KEY_HISTORY, updatedHistory);

        console.log(`Background: Model '${oldName}' successfully renamed to '${newName}'.`);
        return { status: "success", message: "Model renamed successfully." };

    } catch (error) {
        console.error("Background: Error during renameModel processing:", error);
        return { status: "error", message: "An internal error occurred during renaming." };
    }
}

// --- Message Listener --- 

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Background: Message received:", message);

    // Check if the message is from our content script (optional but good practice)
    // Note: sender.id might change during development when reloading extension
    // Can also check sender.url if needed
    // if (sender.id !== chrome.runtime.id) { 
    //     console.warn("Background: Received message from unexpected sender:", sender);
    //     return false; 
    // }

    if (message.type === 'AUTOMATED_MATCH') {
        const { modelA, modelB, winner } = message.payload;

        // Use the recordMatch function defined in the background script
        recordMatch(modelA, modelB, winner)
            .then(success => {
                if (success) {
                    // Send response back to content script 
                    sendResponse({ status: "success", message: "Match recorded by background script." });
                } else {
                    sendResponse({ status: "error", message: "Background script failed to record match." });
                }
            })
            .catch(error => {
                console.error("Background: Error processing AUTOMATED_MATCH message:", error);
                sendResponse({ status: "error", message: "Background script encountered an error." });
            });

        return true; // Indicates an asynchronous response will be sent
    }
    // Handle rename request
    else if (message.type === 'RENAME_MODEL') {
        const { oldName, newName } = message.payload;
        // Wrap the async call in a self-executing async function
        // to ensure the promise chain completes before sending response.
        (async () => {
            try {
                const response = await renameModel(oldName, newName);
                sendResponse(response);
            } catch (error) {
                console.error("Background: Error processing RENAME_MODEL message:", error);
                // Ensure a response is sent even on unexpected errors
                sendResponse({ status: "error", message: "Background script encountered an error during rename." });
            }
        })(); // Immediately invoke the async function
        return true; // Crucial: Indicates async response is coming
    }
    // Handle other message types if needed in the future
    // e.g., message from popup asking for current data

    console.log("Background: Unhandled message type:", message.type);
    return false; // No async response planned for other types
});

// Keep service worker alive (basic mechanism, might need more robust approach for complex tasks)
// This might not be strictly necessary just for handling messages, but useful if bg script did more.
let lifeline;

keepAlive();

chrome.runtime.onConnect.addListener(port => {
    if (port.name === 'keepAlive') {
        lifeline = port;
        setTimeout(keepAliveForced, 295e3); // 5 minutes minus 5 seconds
        port.onDisconnect.addListener(keepAliveForced);
    }
});

function keepAliveForced() {
    lifeline?.disconnect();
    lifeline = null;
    keepAlive();
}

async function keepAlive() {
    if (lifeline) return;
    for (const tab of await chrome.tabs.query({ url: "*://*/*" })) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: () => chrome.runtime.connect({ name: 'keepAlive' }),
            });
            chrome.tabs.onUpdated.removeListener(retryOnTabUpdate);
            return;
        } catch (e) { }
    }
    chrome.tabs.onUpdated.addListener(retryOnTabUpdate);
}

async function retryOnTabUpdate(tabId, info, tab) {
    if (info.url && /^(file|https?):/.test(info.url)) {
        keepAlive();
    }
} 