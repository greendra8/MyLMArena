// popup.js

const STORAGE_KEY_ELO = 'eloData';
const STORAGE_KEY_HISTORY = 'matchHistory';
const DEFAULT_ELO = 1200; // Define a default ELO value

// --- Helper Functions ---

/**
 * Gets data from chrome.storage.local.
 * @param {string} key - The key to retrieve.
 * @returns {Promise<any>} - A promise that resolves with the stored data or null.
 */
async function getStorageData(key) {
    try {
        const data = await chrome.storage.local.get(key);
        return data[key];
    } catch (error) {
        console.error(`Popup: Error getting ${key} from storage:`, error);
        return null;
    }
}

/**
 * Sets data in chrome.storage.local.
 * @param {string} key - The key to set.
 * @param {any} value - The value to store.
 * @returns {Promise<void>}
 */
async function setStorageData(key, value) {
    try {
        await chrome.storage.local.set({ [key]: value });
    } catch (error) {
        console.error(`Popup: Error setting ${key} in storage:`, error);
    }
}

/**
 * Displays the ELO leaderboard in the popup.
 * @param {object} eloData - Object mapping model names to data objects. { modelName: { score: ELO, votes: count } }
 */
function displayLeaderboard(eloData) {
    const leaderboardDiv = document.getElementById('leaderboard');
    if (!leaderboardDiv) return;

    leaderboardDiv.innerHTML = ''; // Clear previous content

    if (!eloData || Object.keys(eloData).length === 0) {
        leaderboardDiv.innerHTML = '<p>No matches recorded yet.</p>';
        return;
    }

    // Sort models by ELO score (descending), handling both old (number) and new ({score, votes}) formats
    const sortedModels = Object.entries(eloData).sort(([, dataA], [, dataB]) => {
        const scoreA = (typeof dataA === 'object' && dataA !== null && typeof dataA.score === 'number') ? dataA.score : (typeof dataA === 'number' ? dataA : DEFAULT_ELO);
        const scoreB = (typeof dataB === 'object' && dataB !== null && typeof dataB.score === 'number') ? dataB.score : (typeof dataB === 'number' ? dataB : DEFAULT_ELO);
        return scoreB - scoreA;
    });

    const table = document.createElement('table');
    const thead = table.createTHead();
    const tbody = table.createTBody();
    const headerRow = thead.insertRow();

    // Add headers including 'Votes'
    ['Rank', 'Model', 'ELO', 'Votes'].forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        headerRow.appendChild(th);
    });

    sortedModels.forEach(([model, data], index) => {
        const row = tbody.insertRow();

        // Determine score and votes based on data format
        let displayScore = DEFAULT_ELO;
        let displayVotes = 0; // Default to 0 votes if format is old or votes missing

        if (typeof data === 'object' && data !== null) {
            displayScore = typeof data.score === 'number' ? data.score : DEFAULT_ELO;
            displayVotes = typeof data.votes === 'number' ? data.votes : 0;
        } else if (typeof data === 'number') {
            // Handle old format (data is just the score)
            displayScore = data;
            // Votes are unknown in old format
        }
        // If data is neither object nor number, keep defaults

        // Apply rank class for styling top positions
        if (index < 3) {
            row.classList.add(`rank-${index + 1}`);
        }

        const rankCell = row.insertCell();
        rankCell.textContent = index + 1;

        const modelCell = row.insertCell();
        modelCell.textContent = model;
        modelCell.setAttribute('contenteditable', 'true');
        modelCell.setAttribute('data-original-name', model); // Store original name
        modelCell.addEventListener('blur', handleRename);
        modelCell.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Prevent newline
                handleRename(e);   // Trigger rename on Enter
            }
            if (e.key === 'Escape') {
                // Restore original value on Escape
                e.target.textContent = model;
                e.target.blur(); // Remove focus
            }
        });

        const scoreCell = row.insertCell();
        scoreCell.textContent = displayScore; // Use determined score

        const votesCell = row.insertCell(); // Add cell for votes
        votesCell.textContent = displayVotes; // Use determined votes
    });

    leaderboardDiv.appendChild(table);

    // Add nice animation for the table
    table.style.opacity = '0';
    table.style.transform = 'translateY(10px)';

    // Force reflow to ensure animation works
    void table.offsetWidth;

    // Animate in
    setTimeout(() => {
        table.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        table.style.opacity = '1';
        table.style.transform = 'translateY(0)';
    }, 50);
}

/**
 * Handles the blur/enter event on an editable model name cell.
 * @param {Event} event - The blur or keydown event.
 */
function handleRename(event) {
    const cell = event.target;
    const originalName = cell.getAttribute('data-original-name');
    const newName = cell.textContent.trim();

    // Ensure contenteditable doesn't get stuck
    cell.setAttribute('contenteditable', 'false'); // Temporarily disable during processing
    setTimeout(() => cell.setAttribute('contenteditable', 'true'), 0); // Re-enable

    // If name hasn't changed or is empty, revert and do nothing
    if (newName === originalName || !newName) {
        cell.textContent = originalName; // Revert if invalid or unchanged
        return;
    }

    console.log(`Popup: Requesting rename from '${originalName}' to '${newName}'`);

    // Send message to background script to handle the actual rename
    chrome.runtime.sendMessage(
        {
            type: 'RENAME_MODEL',
            payload: { oldName: originalName, newName: newName }
        },
        (response) => {
            if (chrome.runtime.lastError) {
                console.error("Popup: Error sending rename message:", chrome.runtime.lastError.message);
                alert(`Error renaming model: ${chrome.runtime.lastError.message}`);
                cell.textContent = originalName; // Revert on error
            } else if (response?.status === 'error') {
                console.error("Popup: Background reported rename error:", response.message);
                alert(`Error renaming model: ${response.message}`);
                cell.textContent = originalName; // Revert on error
            } else if (response?.status === 'success') {
                console.log("Popup: Background confirmed model rename.");
                // The storage listener will trigger leaderboard refresh, so no need to manually refresh here.
                // Optionally, update the data attribute if needed, but refresh is safer
                // cell.setAttribute('data-original-name', newName);
            } else {
                console.warn("Popup: Received unexpected response from background for rename:", response);
                cell.textContent = originalName; // Revert on unexpected response
            }
            // Ensure focus is lost after processing
            cell.blur();
        }
    );
}

/**
 * Creates and shows a confirmation dialog.
 * @param {string} title - The dialog title.
 * @param {string} message - The message to display.
 * @param {Function} onConfirm - Callback when user confirms.
 * @returns {HTMLElement} The dialog element.
 */
function showConfirmationDialog(title, message, onConfirm) {
    // Create dialog container
    const dialog = document.createElement('div');
    dialog.className = 'confirmation-dialog';

    // Create dialog content
    const content = document.createElement('div');
    content.className = 'dialog-content';

    // Add title and message
    const titleEl = document.createElement('h3');
    titleEl.textContent = title;
    content.appendChild(titleEl);

    const messageEl = document.createElement('p');
    messageEl.textContent = message;
    content.appendChild(messageEl);

    // Add buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'dialog-buttons';

    const cancelButton = document.createElement('button');
    cancelButton.className = 'secondary-button';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', () => {
        document.body.removeChild(dialog);
    });

    const confirmButton = document.createElement('button');
    confirmButton.className = 'danger-button';
    confirmButton.textContent = 'Confirm';
    confirmButton.addEventListener('click', () => {
        onConfirm();
        document.body.removeChild(dialog);
    });

    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(confirmButton);
    content.appendChild(buttonContainer);

    // Add content to dialog
    dialog.appendChild(content);

    // Add dialog to body
    document.body.appendChild(dialog);

    // Animate in
    dialog.style.opacity = '0';
    void dialog.offsetWidth;
    dialog.style.transition = 'opacity 0.2s ease';
    dialog.style.opacity = '1';

    return dialog;
}

/**
 * Resets all ELO data and match history.
 */
async function resetAllData() {
    try {
        await setStorageData(STORAGE_KEY_ELO, {});
        await setStorageData(STORAGE_KEY_HISTORY, []);
        console.log('Popup: All data has been reset');
        loadAndDisplayLeaderboard();
    } catch (error) {
        console.error('Popup: Error resetting data:', error);
        alert('Failed to reset data. Please try again.');
    }
}

/**
 * Loads ELO data from storage and updates the leaderboard display.
 */
async function loadAndDisplayLeaderboard() {
    console.log("Popup: Loading and displaying leaderboard...");
    const eloData = await getStorageData(STORAGE_KEY_ELO) || {};
    displayLeaderboard(eloData);
}

// --- Event Handling & Initialization ---

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Popup DOM loaded');

    const modelAInput = document.getElementById('modelA');
    const modelBInput = document.getElementById('modelB');
    const submitButton = document.getElementById('submitMatch');
    const winnerRadio = document.getElementsByName('winner');
    const toggleFormBtn = document.getElementById('toggleFormBtn');
    const resetDataBtn = document.getElementById('resetDataBtn');
    const recordMatchForm = document.getElementById('recordMatchForm');

    // Load initial leaderboard
    await loadAndDisplayLeaderboard();

    // Listen for storage changes to update leaderboard automatically
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes[STORAGE_KEY_ELO]) {
            console.log('Popup: Detected ELO data change, refreshing leaderboard.');
            // The new value is in changes[STORAGE_KEY_ELO].newValue
            displayLeaderboard(changes[STORAGE_KEY_ELO].newValue || {});
        }
    });

    // Toggle form visibility
    toggleFormBtn.addEventListener('click', () => {
        const isHidden = recordMatchForm.classList.contains('hidden');
        if (isHidden) {
            recordMatchForm.classList.remove('hidden');
            toggleFormBtn.textContent = 'Hide Form';
        } else {
            recordMatchForm.classList.add('hidden');
            toggleFormBtn.textContent = 'Manual Add';
        }
    });

    // Reset data button
    resetDataBtn.addEventListener('click', () => {
        showConfirmationDialog(
            'Reset All Data?',
            'This will delete all ELO rankings and match history. This action cannot be undone.',
            resetAllData
        );
    });

    // Add button press animation
    submitButton.addEventListener('mousedown', () => {
        submitButton.style.transform = 'scale(0.98)';
    });

    submitButton.addEventListener('mouseup', () => {
        submitButton.style.transform = 'scale(1)';
    });

    submitButton.addEventListener('mouseleave', () => {
        submitButton.style.transform = 'scale(1)';
    });

    // Handle manual submission
    submitButton.addEventListener('click', async () => {
        const modelA = modelAInput.value.trim();
        const modelB = modelBInput.value.trim();
        let winnerValue = 'Draw';

        for (const radio of winnerRadio) {
            if (radio.checked) {
                winnerValue = radio.value;
                break;
            }
        }

        // Basic Validation
        if (!modelA || !modelB) {
            alert('Please enter names for both Model A and Model B.');
            return;
        }
        if (modelA === modelB) {
            alert('Model names cannot be the same.');
            return;
        }

        // Add button feedback for submission
        submitButton.textContent = 'Submitting...';
        submitButton.disabled = true;

        // Send data to background script for processing
        console.log("Popup: Sending manual match data to background...");
        const messagePayload = {
            type: 'AUTOMATED_MATCH', // Reuse the same type for simplicity
            payload: {
                modelA: modelA,
                modelB: modelB,
                winner: winnerValue
            }
        };

        try {
            chrome.runtime.sendMessage(messagePayload, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Popup: Error sending manual match:", chrome.runtime.lastError.message);
                    alert(`Error saving match: ${chrome.runtime.lastError.message}`);
                } else if (response?.status === 'error') {
                    console.error("Popup: Background reported error:", response.message);
                    alert(`Error saving match: ${response.message}`);
                } else {
                    console.log("Popup: Background processed manual match:", response);
                    // Clear inputs on success
                    modelAInput.value = '';
                    modelBInput.value = '';
                    document.getElementById('winnerDraw').checked = true;

                    // Automatically hide the form after successful submission
                    recordMatchForm.classList.add('hidden');
                    toggleFormBtn.textContent = 'Manual Add';
                }

                // Reset button state
                submitButton.textContent = 'Submit Match';
                submitButton.disabled = false;
            });
        } catch (error) {
            console.error("Popup: Error during manual sendMessage:", error);
            alert(`Error saving match: ${error.message}`);

            // Reset button state
            submitButton.textContent = 'Submit Match';
            submitButton.disabled = false;
        }
    });
}); 