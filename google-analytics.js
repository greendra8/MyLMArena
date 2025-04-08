const GA_ENDPOINT = 'https://www.google-analytics.com/mp/collect';
const GA_DEBUG_ENDPOINT = 'https://www.google-analytics.com/debug/mp/collect';

// Provided by user
const MEASUREMENT_ID = 'G-KWK1MZJ6XD';
const API_SECRET = 'zwjlkFZ8TamMyL-D2yxoLA';

const DEFAULT_ENGAGEMENT_TIME_MSEC = 100;
const SESSION_EXPIRATION_IN_MIN = 30;

class Analytics {
    constructor(debug = false) {
        this.debug = debug;
    }

    async getOrCreateClientId() {
        let { clientId } = await chrome.storage.local.get('clientId');
        if (!clientId) {
            clientId = self.crypto.randomUUID();
            await chrome.storage.local.set({ clientId });
        }
        return clientId;
    }

    async getOrCreateSessionId() {
        // storage.session is recommended, but check availability (mainly for Firefox)
        if (!chrome.storage.session) {
            console.warn("Analytics: chrome.storage.session is not available. Using fallback (might impact session accuracy).");
            // Simple fallback: generate a session ID based on timestamp, will create new session often
            return Date.now().toString();
        }

        let { sessionData } = await chrome.storage.session.get('sessionData');
        const currentTimeInMs = Date.now();
        if (sessionData && sessionData.timestamp) {
            const durationInMin = (currentTimeInMs - sessionData.timestamp) / 60000;
            if (durationInMin > SESSION_EXPIRATION_IN_MIN) {
                sessionData = null;
            } else {
                sessionData.timestamp = currentTimeInMs;
                await chrome.storage.session.set({ sessionData });
            }
        }
        if (!sessionData) {
            sessionData = {
                session_id: currentTimeInMs.toString(),
                timestamp: currentTimeInMs.toString()
            };
            await chrome.storage.session.set({ sessionData });
        }
        return sessionData.session_id;
    }

    async fireEvent(name, params = {}) {
        if (!API_SECRET || !MEASUREMENT_ID) {
            console.warn("Analytics: API_SECRET or MEASUREMENT_ID is missing. Skipping event.");
            return;
        }

        // Ensure session_id and engagement_time_msec are added if not present
        if (!params.session_id) {
            params.session_id = await this.getOrCreateSessionId();
        }
        if (!params.engagement_time_msec) {
            params.engagement_time_msec = DEFAULT_ENGAGEMENT_TIME_MSEC;
        }

        try {
            const response = await fetch(
                `${this.debug ? GA_DEBUG_ENDPOINT : GA_ENDPOINT
                }?measurement_id=${MEASUREMENT_ID}&api_secret=${API_SECRET}`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        client_id: await this.getOrCreateClientId(),
                        events: [
                            {
                                name,
                                params
                            }
                        ]
                    })
                }
            );
            if (this.debug) {
                const responseText = await response.text();
                console.log("Analytics Debug Response:", responseText);
            }
        } catch (e) {
            console.error('Google Analytics request failed with an exception', e);
        }
    }

    async firePageViewEvent(pageTitle, pageLocation, additionalParams = {}) {
        if (!document.hidden) { // Only track page views if the page is visible
            return this.fireEvent('page_view', {
                page_title: pageTitle,
                page_location: pageLocation,
                ...additionalParams
            });
        }
    }

    async fireErrorEvent(error, additionalParams = {}) {
        const safeError = {
            message: error.message || 'Unknown error',
            stack: error.stack || 'No stack trace',
        };
        // Ensure stack traces don't leak sensitive info if necessary in the future
        return this.fireEvent('extension_error', {
            ...safeError, // Send sanitized error info
            ...additionalParams
        });
    }
}

// Export a single instance 