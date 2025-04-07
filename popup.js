// popup.js

// Constants are now loaded from common.js via popup.html
// const STORAGE_KEY_ELO = 'eloData';
// const STORAGE_KEY_HISTORY = 'matchHistory';
// const DEFAULT_ELO = 1200; // Removed, uses value from common.js (1000)

// --- Helper Functions (REMOVED - loaded from common.js) ---
/*
async function getStorageData(key) { ... }
async function setStorageData(key, value) { ... }
*/

/**
 * Displays a temporary status message in the popup.
 * @param {string} message - The message text.
 * @param {'success' | 'error' | 'info'} type - Message type for styling.
 * @param {number} duration - How long the message should be visible (ms).
 */
function showStatusMessage(message, type = 'info', duration = 3000) {
    const existingStatus = document.getElementById('statusMessage');
    if (existingStatus) {
        existingStatus.remove();
    }

    const statusDiv = document.createElement('div');
    statusDiv.id = 'statusMessage';
    statusDiv.className = `status-message status-${type}`;
    statusDiv.textContent = message;

    // Insert after the h1 title
    const h1 = document.querySelector('h1');
    if (h1) {
        h1.insertAdjacentElement('afterend', statusDiv);
    }

    // Fade in
    requestAnimationFrame(() => {
        statusDiv.style.opacity = 1;
        statusDiv.style.transform = 'translateY(0)';
    });

    // Remove after duration
    setTimeout(() => {
        statusDiv.style.opacity = 0;
        statusDiv.style.transform = 'translateY(-10px)';
        setTimeout(() => statusDiv.remove(), 300); // Remove from DOM after fade out
    }, duration);
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
        leaderboardDiv.innerHTML = '<p>No results recorded yet. <br> <a href="https://lmarena.ai" target="_blank" rel="noopener noreferrer">Go to lmarena.ai arena (battle) and start voting!</a></p>';
        return;
    }

    // Sort models by ELO score (descending)
    const sortedModels = Object.entries(eloData).sort(([, dataA], [, dataB]) => {
        const scoreA = (typeof dataA === 'object' && dataA !== null && typeof dataA.score === 'number') ? dataA.score : DEFAULT_ELO;
        const scoreB = (typeof dataB === 'object' && dataB !== null && typeof dataB.score === 'number') ? dataB.score : DEFAULT_ELO;
        return scoreB - scoreA;
    });

    const table = document.createElement('table');
    const thead = table.createTHead();
    const tbody = table.createTBody();
    const headerRow = thead.insertRow();

    // Add headers
    ['Rank', 'Model', 'ELO', 'Votes'].forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        headerRow.appendChild(th);
    });

    sortedModels.forEach(([model, data], index) => {
        const row = tbody.insertRow();

        let displayScore = DEFAULT_ELO;
        let displayVotes = 0;

        if (typeof data === 'object' && data !== null) {
            displayScore = typeof data.score === 'number' ? data.score : DEFAULT_ELO;
            displayVotes = typeof data.votes === 'number' ? data.votes : 0;
        } else if (typeof data === 'number') {
            displayScore = data;
        }

        if (index < 3) {
            row.classList.add(`rank-${index + 1}`);
        }

        const rankCell = row.insertCell();
        rankCell.textContent = index + 1;

        const modelCell = row.insertCell();
        modelCell.textContent = model;
        modelCell.setAttribute('contenteditable', 'true');
        modelCell.setAttribute('data-original-name', model);
        modelCell.addEventListener('blur', handleRename);
        modelCell.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleRename(e);
            }
            if (e.key === 'Escape') {
                e.target.textContent = model;
                e.target.blur();
            }
        });

        const scoreCell = row.insertCell();
        const votesCell = row.insertCell();
        votesCell.textContent = displayVotes;

        const scoreText = document.createTextNode(displayScore);
        scoreCell.appendChild(scoreText);

        if (displayVotes >= 2) {
            const interval = Math.round(CONFIDENCE_INTERVAL_CONSTANT / Math.sqrt(displayVotes));
            const ciSpan = document.createElement('span');
            ciSpan.className = 'ci-value';
            ciSpan.textContent = ` (±${interval})`;
            scoreCell.appendChild(ciSpan);
        }
    });

    leaderboardDiv.appendChild(table);

    // Add nice animation for the table
    table.style.opacity = '0';
    table.style.transform = 'translateY(10px)';
    void table.offsetWidth; // Force reflow
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

    cell.setAttribute('contenteditable', 'false');
    setTimeout(() => cell.setAttribute('contenteditable', 'true'), 0);

    if (newName === originalName || !newName) {
        cell.textContent = originalName;
        return;
    }

    logger.log(`Popup: Requesting rename from '${originalName}' to '${newName}'`);

    chrome.runtime.sendMessage(
        {
            type: 'RENAME_MODEL',
            payload: { oldName: originalName, newName: newName }
        },
        (response) => {
            if (chrome.runtime.lastError) {
                logger.error("Popup: Error sending rename message:", chrome.runtime.lastError.message);
                showStatusMessage(`Error renaming: ${chrome.runtime.lastError.message}`, 'error');
                cell.textContent = originalName;
            } else if (response?.status === 'error') {
                logger.error("Popup: Background reported rename error:", response.message);
                showStatusMessage(`Error renaming: ${response.message}`, 'error');
                cell.textContent = originalName;
            } else if (response?.status === 'success') {
                logger.log("Popup: Background confirmed model rename.");
                // Storage listener handles refresh
            } else {
                logger.warn("Popup: Received unexpected response from background for rename:", response);
                cell.textContent = originalName;
            }
            cell.blur();
        }
    );
}

/**
 * Loads ELO data from storage and updates the leaderboard display.
 */
async function loadAndDisplayLeaderboard() {
    logger.log("Popup: Loading and displaying leaderboard...");
    try {
        const eloData = await getStorageData(STORAGE_KEY_ELO) || {};
        displayLeaderboard(eloData);
    } catch (error) {
        logger.error("Popup: Error loading leaderboard data:", error);
        showStatusMessage("Failed to load leaderboard data.", 'error');
    }
}

// --- Event Handling & Initialization ---

document.addEventListener('DOMContentLoaded', async () => {
    logger.log('Popup DOM loaded');

    // Get elements
    const modelAInput = document.getElementById('modelA');
    const modelBInput = document.getElementById('modelB');
    const submitButton = document.getElementById('submitMatch');
    const winnerRadio = document.getElementsByName('winner');
    const toggleFormBtn = document.getElementById('toggleFormBtn');
    const recordMatchForm = document.getElementById('recordMatchForm');
    const settingsBtn = document.getElementById('settingsBtn');

    // Load initial leaderboard
    await loadAndDisplayLeaderboard();

    // Listen for storage changes to update leaderboard automatically
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && (changes[STORAGE_KEY_ELO] || changes[STORAGE_KEY_HISTORY])) {
            logger.log('Popup: Detected data change, refreshing leaderboard.');
            loadAndDisplayLeaderboard();
        }
    });

    // --- Popup Actions ---

    // Settings Button - Opens settings page in a new tab
    settingsBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'settings.html' });
    });

    // Toggle manual form visibility
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

    // Add button press animation for submit button
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

        if (!modelA || !modelB) {
            showStatusMessage('Please enter names for both Model A and Model B.', 'error');
            return;
        }
        if (modelA === modelB) {
            showStatusMessage('Model names cannot be the same.', 'error');
            return;
        }

        submitButton.textContent = 'Submitting...';
        submitButton.disabled = true;

        const messagePayload = {
            type: 'MANUAL_MATCH',
            payload: {
                modelA: modelA,
                modelB: modelB,
                winner: winnerValue
            }
        };

        try {
            chrome.runtime.sendMessage(messagePayload, (response) => {
                if (chrome.runtime.lastError) {
                    logger.error("Popup: Error sending manual match:", chrome.runtime.lastError.message);
                    showStatusMessage(`Error saving match: ${chrome.runtime.lastError.message}`, 'error');
                } else if (response?.status === 'error') {
                    logger.error("Popup: Background reported error:", response.message);
                    showStatusMessage(`Error saving match: ${response.message}`, 'error');
                } else {
                    logger.log("Popup: Background processed manual match:", response);
                    showStatusMessage('Manual match submitted successfully!', 'success');
                    modelAInput.value = '';
                    modelBInput.value = '';
                    document.getElementById('winnerDraw').checked = true;
                    recordMatchForm.classList.add('hidden');
                    toggleFormBtn.textContent = 'Manual Add';
                }
                submitButton.textContent = 'Submit Match';
                submitButton.disabled = false;
            });
        } catch (error) {
            logger.error("Popup: Error during manual sendMessage:", error);
            showStatusMessage(`Error saving match: ${error.message}`, 'error');
            submitButton.textContent = 'Submit Match';
            submitButton.disabled = false;
        }
    });
}); 