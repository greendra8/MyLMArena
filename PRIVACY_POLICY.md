**Privacy Policy for MyLMArena Chrome Extension**

**Effective Date:** April 8th, 2025

**1. Introduction**

This Privacy Policy describes how the MyLMArena Chrome Extension ("we," "us," or "our") handles information when you use our browser extension. We are committed to protecting your privacy. This policy explains what data the extension interacts with, what data is collected for analytics, and how that data is used.

**2. Information We Collect**

The MyLMArena extension handles two main types of information:

*   **a) Locally Stored Data (Not Transmitted Externally):**
    *   **ELO Rankings (`eloData`):** Your personal ELO scores for different language models.
    *   **Match History (`matchHistory`):** Records of the matches you've voted on (Model A, Model B, winner, ELO changes, timestamp).
    *   **Functionality:** This data is stored *only* on your local computer using the `chrome.storage.local` API provided by your browser. It is essential for the core function of the extension – maintaining your private leaderboard. We do *not* transmit this ELO or match history data to any external servers unless you explicitly use the "Export Data" feature.

*   **b) Anonymized Usage Analytics (Transmitted to Google Analytics):**
    *   To understand how the extension is used, identify issues, and improve functionality, we use Google Analytics. This service collects anonymized data about your interaction with the extension using the Google Analytics Measurement Protocol. The data sent includes:
        *   **Pseudonymous Identifiers:** A randomly generated `client_id` (unique to your extension installation) and `session_id` (unique to a browsing session) are sent to help distinguish usage sessions without identifying you personally.
        *   **Interaction Events:** Information about how you interact with the extension, such as:
            *   Opening the extension popup or settings page (`page_view`).
            *   Clicking buttons within the extension (e.g., 'Manual Add', 'Settings', 'Submit Match', 'Export Data', 'Import Data', 'Reset Data').
            *   Events related to core functionality (e.g., `automated_match_recorded`, `manual_match_submit`).
            *   Extension lifecycle events (`extension_installed`, `extension_updated`).
        *   **Error Reports:** Anonymized details if the extension encounters a script error (error message, stack trace context) to help us diagnose and fix bugs.
        *   **Technical Information (Collected by Google):** Google Analytics automatically collects certain technical information via the Measurement Protocol, such as your IP address (which may be used to infer general geographic location), browser type and version, and operating system. This is standard for Google Analytics and is processed according to their policies.

**3. How We Use Your Information**

*   **Local Data:** Used solely to provide the core functionality of the extension – displaying your personal ELO rankings and match history.
*   **Analytics Data:** Used exclusively for internal purposes:
    *   To analyze usage patterns and understand which features are most used.
    *   To identify and debug errors or crashes within the extension.
    *   To make informed decisions about future improvements and feature development.
    *   To count the number of active installations and updates.

**4. Data Sharing and Third Parties**

*   We **do not sell, rent, or trade** any user data.
*   **Local Data (`eloData`, `matchHistory`) is NOT shared** with any third party. It remains on your device.
*   **Analytics Data is shared ONLY with Google Analytics** for the processing purposes described above. Google's use of this data is governed by their own Privacy Policy and terms. You can learn more about how Google collects and processes data here: [https://policies.google.com/technologies/partner-sites](https://policies.google.com/technologies/partner-sites)

**5. Data Security**

We rely on the security measures provided by the browser's storage APIs (`chrome.storage.local`, `chrome.storage.session`) for local data. Analytics data transmission uses HTTPS via the Google Analytics Measurement Protocol. While we strive to use acceptable means to protect your information, no method of transmission over the Internet or electronic storage is 100% secure.

**6. Your Choices**

*   You can disable or uninstall the MyLMArena extension at any time through your browser's extension management settings.
*   You can clear the extension's local storage via your browser's settings, but be aware this will permanently delete your ELO rankings and match history stored by the extension.
*   You can learn more about Google Analytics and opt-out options here: [https://tools.google.com/dlpage/gaoptout](https://tools.google.com/dlpage/gaoptout) (Note: This tool is primarily designed for websites, but provides information on Google Analytics privacy).

**7. Children's Privacy**

The MyLMArena extension is not intended for use by children under the age of 13. We do not knowingly collect any information from children under 13.

**8. Changes to This Policy**

We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy here and updating the "Effective Date" at the top. You are advised to review this Privacy Policy periodically for any changes.

**9. Contact Us**

If you have any questions about this Privacy Policy, please open an issue on the project's GitHub repository: [https://github.com/greendra8/MyLMArena/issues](https://github.com/greendra8/MyLMArena/issues)