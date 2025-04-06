// background.js

logger.log("MyLMArena: Background script running.");

// Constants and helpers are now imported from common.js

// --- Core Match Recording Logic (Uses functions from common.js) ---
/**
 * Processes and records a match, updating storage.
 * @param {string} modelA - Name of model A.
 * @param {string} modelB - Name of model B.
 * @param {'A' | 'B' | 'Draw'} winnerValue - Outcome of the match.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
async function recordMatch(modelA, modelB, winnerValue) {
    logger.log(`Background: Recording match: ${modelA} vs ${modelB}, Winner: ${winnerValue}`);

    if (!modelA || !modelB || !winnerValue) {
        logger.error("Background: Invalid data received for recordMatch.", { modelA, modelB, winnerValue });
        return false;
    }

    try {
        // eloData structure: { modelName: { score: ELO, votes: count } }
        let eloData = await getStorageData(STORAGE_KEY_ELO) || {}; // Use common func
        let matchHistory = await getStorageData(STORAGE_KEY_HISTORY) || []; // Use common func

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

        await setStorageData(STORAGE_KEY_ELO, eloData); // Use common func
        await setStorageData(STORAGE_KEY_HISTORY, matchHistory); // Use common func

        logger.log('Background: Match recorded successfully:', matchRecord);
        logger.log('Background: Updated ELO data:', eloData);
        return true;
    } catch (error) {
        logger.error("Background: Error during recordMatch processing:", error);
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
    logger.log(`Background: Renaming model from '${oldName}' to '${newName}'`);
    if (!oldName || !newName || oldName === newName) {
        return { status: "error", message: "Invalid old or new name provided." };
    }

    try {
        let eloData = await getStorageData(STORAGE_KEY_ELO) || {}; // Use common func
        let matchHistory = await getStorageData(STORAGE_KEY_HISTORY) || []; // Use common func

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
        await setStorageData(STORAGE_KEY_ELO, eloData); // Use common func
        await setStorageData(STORAGE_KEY_HISTORY, updatedHistory); // Use common func

        logger.log(`Background: Model '${oldName}' successfully renamed to '${newName}'.`);
        return { status: "success", message: "Model renamed successfully." };

    } catch (error) {
        logger.error("Background: Error during renameModel processing:", error);
        return { status: "error", message: "An internal error occurred during renaming." };
    }
}

// --- Message Listener --- 

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    logger.log("Background: Message received:", message);

    // Check if the message is from our content script (optional but good practice)
    // Note: sender.id might change during development when reloading extension
    // Can also check sender.url if needed
    // if (sender.id !== chrome.runtime.id) { 
    //     console.warn("Background: Received message from unexpected sender:", sender);
    //     return false; 
    // }

    if (message.type === 'AUTOMATED_MATCH' || message.type === 'MANUAL_MATCH') {
        const { modelA, modelB, winner } = message.payload;
        const source = message.type === 'MANUAL_MATCH' ? 'Manual' : 'Automated';
        logger.log(`Background: Received ${source} match.`);

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
                logger.error("Background: Error processing match message:", error);
                sendResponse({ status: "error", message: "Background script encountered an error processing the match." });
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
                logger.error("Background: Error processing RENAME_MODEL message:", error);
                // Ensure a response is sent even on unexpected errors
                sendResponse({ status: "error", message: "Background script encountered an error during rename." });
            }
        })(); // Immediately invoke the async function
        return true; // Crucial: Indicates async response is coming
    }
    // Handle other message types if needed in the future
    // e.g., message from popup asking for current data

    logger.log("Background: Unhandled message type:", message.type);
    return false; // No async response planned for other types
});

logger.log("Background: Initialized listeners."); 