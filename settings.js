// settings.js
const analytics = new Analytics(); // Instantiate directly

// --- Global Variables --- 
let pendingImportData = null; // Variable to hold parsed data from the selected file

// --- Helper Functions (Copied from popup.js - ideally move to common.js) ---

/**
 * Displays a temporary status message.
 * @param {string} message - The message text.
 * @param {'success' | 'error' | 'info'} type - Message type for styling.
 * @param {number} duration - How long the message should be visible (ms).
 */
function showStatusMessage(message, type = 'info', duration = 3000) {
    const container = document.getElementById('statusMessageContainer');
    if (!container) return;

    // Remove existing message
    const existingStatus = container.querySelector('.status-message');
    if (existingStatus) {
        existingStatus.remove();
    }

    const statusDiv = document.createElement('div');
    statusDiv.className = `status-message status-${type}`;
    statusDiv.textContent = message;
    container.appendChild(statusDiv);

    // Fade in
    requestAnimationFrame(() => {
        statusDiv.style.opacity = 1;
        statusDiv.style.transform = 'translateY(0)';
    });

    // Remove after duration
    setTimeout(() => {
        if (statusDiv) {
            statusDiv.style.opacity = 0;
            statusDiv.style.transform = 'translateY(-10px)';
            setTimeout(() => statusDiv.remove(), 300); // Remove from DOM after fade out
        }
    }, duration);
}

/**
 * Creates and shows a confirmation dialog.
 * @param {string} title - The dialog title.
 * @param {string} message - The message to display.
 * @param {Function} onConfirm - Callback when user confirms.
 * @returns {HTMLElement} The dialog element.
 */
function showConfirmationDialog(title, message, onConfirm) {
    const container = document.getElementById('confirmationDialogPlaceholder');
    if (!container) return;

    // Clear previous dialog
    container.innerHTML = '';

    // Create dialog container
    const dialog = document.createElement('div');
    dialog.className = 'confirmation-dialog'; // Use existing CSS class

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
        container.removeChild(dialog);
    });

    const confirmButton = document.createElement('button');
    confirmButton.className = 'danger-button'; // Use danger for reset/import confirm
    confirmButton.textContent = 'Confirm';
    confirmButton.addEventListener('click', () => {
        onConfirm();
        container.removeChild(dialog);
    });

    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(confirmButton);
    content.appendChild(buttonContainer);

    dialog.appendChild(content);
    container.appendChild(dialog);

    // Animate in (slightly different from popup version)
    dialog.style.opacity = '0';
    void dialog.offsetWidth;
    dialog.style.transition = 'opacity 0.2s ease';
    dialog.style.opacity = '1';

    return dialog;
}

// --- Settings Logic (Adapted from popup.js) ---

/**
 * Resets all ELO data and match history.
 */
async function resetAllData() {
    try {
        await setStorageData(STORAGE_KEY_ELO, {});
        await setStorageData(STORAGE_KEY_HISTORY, []);
        logger.log('Settings: All data has been reset');
        showStatusMessage('All data has been reset.', 'success');
        // No leaderboard to refresh here
    } catch (error) {
        logger.error('Settings: Error resetting data:', error);
        showStatusMessage('Failed to reset data. Please try again.', 'error');
        analytics.fireErrorEvent(error, { context: 'reset_all_data' }); // Track error
    }
}

/**
 * Exports current data (ELO and History) to a JSON file.
 */
async function exportData() {
    logger.log("Settings: Starting data export...");
    try {
        const eloData = await getStorageData(STORAGE_KEY_ELO) || {};
        const matchHistory = await getStorageData(STORAGE_KEY_HISTORY) || [];

        const exportObject = {
            eloData: eloData,
            matchHistory: matchHistory,
            exportDate: new Date().toISOString(),
            version: 1
        };

        const jsonString = JSON.stringify(exportObject, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `MyLMArena_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        logger.log("Settings: Data export successful.");
        showStatusMessage('Data exported successfully!', 'success');
    } catch (error) {
        logger.error('Settings: Error exporting data:', error);
        showStatusMessage(`Error exporting data: ${error.message}`, 'error');
        analytics.fireErrorEvent(error, { context: 'export_data' }); // Track error
    }
}

/**
 * Handles the confirmation step for importing data.
 * @param {object | null} dataToImport - The parsed data from the file.
 */
async function handleImportConfirmation(dataToImport) {
    if (!dataToImport) {
        showStatusMessage('No valid file data loaded. Please select a file first.', 'error');
        return;
    }

    logger.log("Settings: Showing confirmation for pre-loaded import data...");

    showConfirmationDialog(
        'Confirm Import',
        'Importing the selected file will overwrite all current ELO rankings and match history. Are you sure?',
        async () => {
            try {
                await setStorageData(STORAGE_KEY_ELO, dataToImport.eloData);
                await setStorageData(STORAGE_KEY_HISTORY, dataToImport.matchHistory);
                logger.log('Settings: Data imported successfully.');
                showStatusMessage('Data imported successfully! Changes will reflect in the popup.', 'success');

                pendingImportData = null;
                document.getElementById('importDataBtn').disabled = true;
                document.getElementById('importFile').value = null;
            } catch (storageError) {
                logger.error('Settings: Error saving imported data:', storageError);
                showStatusMessage(`Error saving imported data: ${storageError.message}`, 'error');
                analytics.fireErrorEvent(storageError, { context: 'import_confirmation_save' }); // Track error
                pendingImportData = null;
                document.getElementById('importDataBtn').disabled = true;
            }
        }
    );
}

/**
 * Reads and validates the selected JSON file when the file input changes.
 * @param {Event} event - The change event from the file input.
 */
function handleFileSelection(event) {
    const fileInput = event.target;
    const importButton = document.getElementById('importDataBtn');
    const file = fileInput.files[0];
    pendingImportData = null;
    importButton.disabled = true;

    if (!file) return;

    logger.log("Settings: File selected, starting read and validation...");

    if (!file.type === 'application/json' && !file.name.endsWith('.json')) {
        showStatusMessage('Invalid file type. Please select a .json file.', 'error');
        fileInput.value = null;
        return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
        try {
            const importedData = JSON.parse(e.target.result);
            if (!importedData || typeof importedData.eloData !== 'object' || !Array.isArray(importedData.matchHistory)) {
                throw new Error('Invalid JSON structure. Expected {eloData: {}, matchHistory: []}.');
            }
            pendingImportData = importedData;
            importButton.disabled = false;
            logger.log("Settings: File read and validated successfully.");
            showStatusMessage(`File "${file.name}" loaded. Click 'Import Data' to confirm.`, 'info', 5000);
        } catch (parseError) {
            logger.error('Settings: Error parsing JSON file:', parseError);
            showStatusMessage(`Error reading file: ${parseError.message}`, 'error');
            analytics.fireErrorEvent(parseError, { context: 'import_file_parse' }); // Track error
            pendingImportData = null;
            importButton.disabled = true;
            fileInput.value = null;
        }
    };

    reader.onerror = (readError) => {
        logger.error('Settings: Error reading file:', readError.target.error);
        showStatusMessage(`Error reading file: ${readError.target.error.message}`, 'error');
        analytics.fireErrorEvent(new Error(readError.target.error?.message || 'File read error'), { context: 'import_file_read' }); // Track error
        pendingImportData = null;
        importButton.disabled = true;
        fileInput.value = null;
    };

    reader.readAsText(file);
}

// --- Event Listeners --- 
document.addEventListener('DOMContentLoaded', () => {
    logger.log('Settings page loaded');

    // Track page view
    analytics.firePageViewEvent(document.title, document.location.href);

    const exportDataBtn = document.getElementById('exportDataBtn');
    const importFile = document.getElementById('importFile');
    const importDataBtn = document.getElementById('importDataBtn');
    const resetDataBtnSettings = document.getElementById('resetDataBtnSettings');

    // Export Data
    exportDataBtn.addEventListener('click', () => {
        analytics.fireEvent('button_click', { button_id: 'exportDataBtn' });
        exportData();
    });

    // File Selection Listener
    importFile.addEventListener('change', handleFileSelection);

    // Import Data Button Listener
    importDataBtn.addEventListener('click', () => {
        analytics.fireEvent('button_click', { button_id: 'importDataBtn' });
        handleImportConfirmation(pendingImportData);
    });

    // Reset data button
    resetDataBtnSettings.addEventListener('click', () => {
        analytics.fireEvent('button_click', { button_id: 'resetDataBtnSettings' });
        showConfirmationDialog(
            'Reset All Data?',
            'This will delete all ELO rankings and match history. This action cannot be undone.',
            resetAllData
        );
    });
}); 