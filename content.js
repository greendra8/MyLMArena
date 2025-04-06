logger.log("MyLMArena: Content script injected.");

// --- Globals --- 
let currentModelA = null; // Stores the latest identified Model A
let currentModelB = null; // Stores the latest identified Model B
let observer = null; // Reference to the MutationObserver

// State for handling post-vote name appearance
let pendingVoteOutcome = null; // Stores 'A', 'B', or 'Draw' after click
let waitingForNamesAfterVote = false; // Flag set after click, reset after names appear & message sent

// --- DOM Interaction & Logic --- 

/**
 * Attempts to find and extract the model names from H3 tags on the page.
 * Strategy: Find H3 tags starting with "Model A:" or "Model B:".
 * If waiting for names post-vote, it sends the message upon finding them.
 */
function extractModelNames() {
    let modelA_local = null; // Use local vars for this scan result
    let modelB_local = null;
    let foundA_local = false;
    let foundB_local = false;

    const h3Elements = document.querySelectorAll('h3');

    for (const h3 of h3Elements) {
        const text = h3.textContent?.trim();
        if (!text) continue;

        if (!foundA_local && text.startsWith("Model A:")) {
            modelA_local = text.substring("Model A:".length).trim();
            if (modelA_local) {
                foundA_local = true;
            }
        } else if (!foundB_local && text.startsWith("Model B:")) {
            modelB_local = text.substring("Model B:".length).trim();
            if (modelB_local) {
                foundB_local = true;
            }
        }
        if (foundA_local && foundB_local) break;
    }

    // Log updates to global state only if they change
    if (modelA_local !== currentModelA) {
        logger.log(`Model A updated: ${modelA_local}`);
        currentModelA = modelA_local;
    }
    if (modelB_local !== currentModelB) {
        logger.log(`Model B updated: ${modelB_local}`);
        currentModelB = modelB_local;
    }

    // --- Check for post-vote name capture --- 
    if (waitingForNamesAfterVote && foundA_local && foundB_local && modelA_local && modelB_local && pendingVoteOutcome) {

        logger.log(`Found names (${modelA_local}, ${modelB_local}) after waiting for vote outcome: ${pendingVoteOutcome}`);

        const matchData = {
            type: 'AUTOMATED_MATCH',
            payload: {
                modelA: modelA_local,
                modelB: modelB_local,
                winner: pendingVoteOutcome
            }
        };

        logger.log("Sending match data (post-vote capture):", matchData);
        try {
            chrome.runtime.sendMessage(matchData, (response) => {
                if (chrome.runtime.lastError) {
                    logger.error("Error sending message (post-vote capture):", chrome.runtime.lastError.message);
                } else {
                    logger.log("Message response (post-vote capture):", response ? JSON.stringify(response) : "(No response)");
                }
            });
        } catch (error) {
            logger.error("Error during chrome.runtime.sendMessage (post-vote capture):", error);
        }

        // Reset the flags/state immediately after attempting to send
        pendingVoteOutcome = null;
        waitingForNamesAfterVote = false;
        logger.log("Reset post-vote state.");

    } else if (waitingForNamesAfterVote && (!foundA_local || !foundB_local)) {
        // We are waiting, but didn't find the names *in this specific scan*
        logger.log("Still waiting for names post-vote, H3s not found/parsed in this scan.");
    }

    // --- Warnings --- (Simplified)
    if (!foundA_local || !foundB_local) {
        // Don't warn if waiting, as names are expected to be missing then.
        if (!waitingForNamesAfterVote) {
            // If not waiting, and names are missing, maybe log a milder warning or debug message.
            // console.debug("Model name H3s not currently found (expected if before vote reveal).");
        }
    }
}

/**
 * Finds buttons based on their exact text content and attaches listeners.
 * @returns {boolean} - True if listeners were successfully attached in this run.
 */
function attachVoteListeners() {
    let attached_in_this_run = false;
    const buttons = document.querySelectorAll('button');
    const voteOptions = [
        { text: '👈  A is better', value: 'A' },
        { text: '👉  B is better', value: 'B' },
        { text: '🤝  Tie', value: 'Draw' },
        { text: '👎  Both are bad', value: 'Draw' },
    ];

    voteOptions.forEach(option => {
        const button = Array.from(buttons).find(btn => btn.textContent?.trim() === option.text);
        if (button) {
            // Check if listener already exists
            if (!button.dataset.eloListenerAttached) {
                button.addEventListener('click', () => handleVote(option.value));
                button.dataset.eloListenerAttached = 'true';
                logger.log(`Attached listener to "${option.text}" button.`);
                attached_in_this_run = true;
            }
            // Don't need else clause - if attached, it's fine
        } else {
            // Don't warn here, buttons might appear/disappear normally
            // console.debug(`Button not found: "${option.text}"`);
        }
    });
    return attached_in_this_run;
}


/**
 * Handles the vote button click.
 * Stores the outcome and sets a flag to wait for names.
 * @param {'A' | 'B' | 'Draw'} winnerValue - The outcome determined by the clicked button.
 */
function handleVote(winnerValue) {
    logger.log(`Vote button clicked: ${winnerValue}. Storing outcome and waiting for names...`);

    // Store the outcome and set the flag
    pendingVoteOutcome = winnerValue;
    waitingForNamesAfterVote = true;

    // Prevent potential double-clicks or race conditions briefly
    // (Optional, might not be needed)
    // disableVoteButtonsTemporarily(); 

    // The actual sending happens in extractModelNames when the names appear after the vote
}


/**
 * Sets up the MutationObserver to watch for changes in the arena interface.
 */
function setupMutationObserver() {
    if (observer) {
        logger.log("Observer already exists. Disconnecting first.")
        observer.disconnect();
    }

    const targetNode = document.body;
    if (!targetNode) {
        logger.error("Could not find target node (document.body) for MutationObserver.");
        return;
    }

    logger.log("Setting up MutationObserver on document.body");

    const config = { childList: true, subtree: true, characterData: true };

    // Debounce timer variable
    let debounceTimer = null;

    const callback = (mutationList, obs) => {
        // Basic relevance check: Did *anything* change?
        // More complex checks were removed for simplicity, can be added back if needed.
        if (mutationList.length === 0) return;

        // console.log(`MutationObserver detected ${mutationList.length} changes. Debouncing scan...`);

        // Clear existing timer if mutation happens again quickly
        clearTimeout(debounceTimer);

        // Set a new timer
        debounceTimer = setTimeout(() => {
            logger.log("Running debounced scan...")
            // Run scans regardless of perceived relevance
            extractModelNames();
            attachVoteListeners();

        }, 500); // Increased debounce to 500ms
    };

    observer = new MutationObserver(callback);
    observer.observe(targetNode, config);
    logger.log("MutationObserver is now active.");

    // Run initial scan immediately after setup
    logger.log("Performing initial scan...");
    extractModelNames();
    attachVoteListeners();
}


// --- Initialization --- 

// No longer use checkElementsReady or initInterval

// Start the observer immediately on script injection
setupMutationObserver();

// Optional: Add a listener for page unload to disconnect the observer
window.addEventListener('beforeunload', () => {
    if (observer) {
        logger.log("Disconnecting observer on page unload.");
        observer.disconnect();
        observer = null;
    }
}); 