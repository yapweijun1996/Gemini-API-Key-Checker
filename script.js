(() => {
    const STORAGE_KEY = 'gemini_api_admin_state_v1';
    const APP_VERSION = 1;
    const DB_NAME = 'gemini_api_admin_db';
    const DB_VERSION = 1;
    const HISTORY_STORE = 'key_check_history';
    const MAX_HISTORY_ITEMS = 120;
    const endpointBase = 'https://generativelanguage.googleapis.com/v1beta/models';

    const elems = {
        themeToggleBtn: document.getElementById('themeToggleBtn'),
        modelSelector: document.getElementById('modelSelector'),
        aliasInput: document.getElementById('keyAlias'),
        keyInput: document.getElementById('keyInput'),
        addKeyBtn: document.getElementById('addKeyBtn'),
        importBtn: document.getElementById('importBtn'),
        bulkKeys: document.getElementById('bulkKeys'),
        keysBody: document.getElementById('keysBody'),
        toggleAllKeys: document.getElementById('toggleAllKeys'),
        checkEnabledBtn: document.getElementById('checkEnabledBtn'),
        runSelectedBtn: document.getElementById('runSelectedBtn'),
        deleteCheckedBtn: document.getElementById('deleteCheckedBtn'),
        clearResultsBtn: document.getElementById('clearResultsBtn'),
        clearHistoryBtn: document.getElementById('clearHistoryBtn'),
        clearAllBtn: document.getElementById('clearAllBtn'),
        installBtn: document.getElementById('installBtn'),
        statusEl: document.getElementById('status'),
        connectionState: document.getElementById('connectionState'),
        results: document.getElementById('results'),
        historyBody: document.getElementById('historyBody')
    };

    let state = loadState();
    let deferredInstallPrompt = null;
    let dbPromise = null;

    function createId() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function parseJSON(raw, fallback) {
        try {
            return JSON.parse(raw);
        } catch {
            return fallback;
        }
    }

    function loadState() {
        const preferredTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light';
        const defaults = {
            appVersion: APP_VERSION,
            model: 'gemini-2.5-flash',
            theme: preferredTheme,
            keys: []
        };

        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return defaults;
        }

        const parsed = parseJSON(raw, {});
        if (!parsed || typeof parsed !== 'object') {
            return defaults;
        }

        return {
            appVersion: APP_VERSION,
            model: parsed.model || defaults.model,
            theme: parsed.theme || defaults.theme,
            keys: Array.isArray(parsed.keys) ? parsed.keys : []
        };
    }

    function saveState() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function migrateState() {
        state.keys = state.keys.map((entry) => ({
            id: entry.id || createId(),
            alias: String(entry.alias || '').trim() || `key-${createId().slice(0, 6)}`,
            key: String(entry.key || ''),
            enabled: Boolean(entry.enabled),
            lastCheckedAt: entry.lastCheckedAt || '',
            lastResult: entry.lastResult || ''
        })).filter((entry) => entry.key);
    }

    function setStatus(message) {
        if (elems.statusEl) {
            elems.statusEl.textContent = message;
        }
    }

    function maskKey(rawKey) {
        if (!rawKey) {
            return 'N/A';
        }
        if (rawKey.length <= 10) {
            return '******';
        }
        return `${rawKey.slice(0, 4)}***${rawKey.slice(-4)}`;
    }

    function keySuffix(rawKey) {
        if (!rawKey) {
            return 'N/A';
        }
        return rawKey.slice(-6);
    }

    function formatDate(isoDate) {
        if (!isoDate) {
            return 'Never';
        }
        const d = new Date(isoDate);
        return Number.isNaN(d.getTime()) ? 'Invalid date' : d.toLocaleString();
    }

    function updateConnectionState() {
        if (!elems.connectionState) {
            return;
        }
        const computed = getComputedStyle(document.body);
        elems.connectionState.textContent = navigator.onLine ? 'Online' : 'Offline';
        elems.connectionState.style.background = navigator.onLine
            ? computed.getPropertyValue('--status-bg-online').trim()
            : computed.getPropertyValue('--status-bg-offline').trim();
        if (!navigator.onLine) {
            setStatus('You are offline. Data is still available from local storage + history cache.');
        } else if (!elems.statusEl.textContent) {
            setStatus('Ready to check keys.');
        }
    }

    function openDatabase() {
        if (dbPromise) {
            return dbPromise;
        }

        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.addEventListener('upgradeneeded', () => {
                const db = request.result;
                if (db.objectStoreNames.contains(HISTORY_STORE)) {
                    db.deleteObjectStore(HISTORY_STORE);
                }
                const store = db.createObjectStore(HISTORY_STORE, { keyPath: 'id' });
                store.createIndex('by_checked_at', 'checkedAt', { unique: false });
            });

            request.addEventListener('success', () => resolve(request.result));
            request.addEventListener('error', () => reject(request.error || new Error('IndexedDB open failed')));
        });

        return dbPromise;
    }

    async function withStore(mode, callback) {
        const db = await openDatabase();
        const tx = db.transaction(HISTORY_STORE, mode);
        const store = tx.objectStore(HISTORY_STORE);
        const promise = callback(store);
        await new Promise((resolve, reject) => {
            tx.addEventListener('complete', resolve);
            tx.addEventListener('error', () => reject(tx.error || new Error('IndexedDB transaction error')));
            tx.addEventListener('abort', () => reject(tx.error || new Error('IndexedDB transaction aborted')));
        });
        return promise;
    }

    async function addHistoryRecord(record) {
        const payload = {
            id: createId(),
            ...record,
            checkedAt: new Date().toISOString()
        };

        await withStore('readwrite', (store) => store.add(payload));
        return payload;
    }

    async function listHistory(limit = MAX_HISTORY_ITEMS) {
        const db = await openDatabase();
        const tx = db.transaction(HISTORY_STORE, 'readonly');
        const store = tx.objectStore(HISTORY_STORE).index('by_checked_at');
        const output = [];

        return await new Promise((resolve, reject) => {
            const request = store.openCursor(null, 'prev');
            request.addEventListener('success', () => {
                const cursor = request.result;
                if (!cursor || output.length >= limit) {
                    resolve(output);
                    return;
                }
                output.push(cursor.value);
                cursor.continue();
            });
            request.addEventListener('error', () => reject(request.error || new Error('History cursor failed')));
        });
    }

    async function clearHistory() {
        await withStore('readwrite', (store) => store.clear());
    }

    function setModelFromState() {
        elems.modelSelector.value = state.model || 'gemini-2.5-flash';
    }

    function normalizeTheme(theme) {
        if (theme !== 'light' && theme !== 'dark') {
            return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
        }
        return theme;
    }

    function setTheme(theme) {
        state.theme = normalizeTheme(theme);
        document.body.classList.remove('theme-light', 'theme-dark');
        document.body.classList.add(`theme-${state.theme}`);

        const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
        if (elems.themeToggleBtn) {
            elems.themeToggleBtn.textContent = `Theme: ${nextTheme === 'dark' ? 'Dark' : 'Light'}`;
            elems.themeToggleBtn.setAttribute('data-theme-target', nextTheme);
        }

        const themeColor = state.theme === 'dark' ? '#0f172a' : '#f8fafc';
        const themeMeta = document.querySelector('meta[name="theme-color"]');
        if (themeMeta) {
            themeMeta.setAttribute('content', themeColor);
        }
    }

    function applyThemeFromState() {
        state.theme = normalizeTheme(state.theme);
        setTheme(state.theme);
    }

    function collectCheckedIds() {
        return Array.from(document.querySelectorAll('#keysBody input[type="checkbox"][data-key-id]'))
            .filter((input) => input.checked)
            .map((input) => input.getAttribute('data-key-id'));
    }

    function getEntryById(id) {
        return state.keys.find((entry) => entry.id === id) || null;
    }

    function syncToggleAllState() {
        if (!elems.toggleAllKeys) {
            return;
        }
        if (state.keys.length === 0) {
            elems.toggleAllKeys.checked = false;
            return;
        }
        elems.toggleAllKeys.checked = state.keys.every((entry) => entry.enabled);
    }

    function renderKeys() {
        elems.keysBody.innerHTML = '';

        if (state.keys.length === 0) {
            elems.keysBody.innerHTML = '<tr><td colspan="6" class="small muted">No API keys saved yet.</td></tr>';
            syncToggleAllState();
            return;
        }

        for (const entry of state.keys) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <input
                        type="checkbox"
                        data-key-id="${entry.id}"
                        ${entry.enabled ? 'checked' : ''}
                        aria-label="Enable ${escape(entry.alias)}"
                    >
                </td>
                <td><span class="key-name">${escape(entry.alias)}</span></td>
                <td>${maskKey(entry.key)} ${entry.key ? `<span class=\"small\">(...${keySuffix(entry.key)})</span>` : ''}</td>
                <td>${escape(state.model || 'gemini-2.5-flash')}</td>
                <td class="small">
                    ${entry.lastCheckedAt ? formatDate(entry.lastCheckedAt) : 'Never'}
                    ${entry.lastResult ? `<br><span class="muted">${escape(entry.lastResult)}</span>` : ''}
                </td>
                <td>
                    <button class="action-link" type="button" data-delete-key="${entry.id}">Delete</button>
                </td>
            `;
            elems.keysBody.appendChild(row);
        }
        syncToggleAllState();
    }

    async function renderHistory() {
        const rows = await listHistory(MAX_HISTORY_ITEMS);
        elems.historyBody.innerHTML = '';

        if (rows.length === 0) {
            elems.historyBody.innerHTML = '<tr><td colspan="6" class="small muted">No history yet.</td></tr>';
            return;
        }

        for (const item of rows) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${formatDate(item.checkedAt)}</td>
                <td>${escape(item.alias)}</td>
                <td>${maskKey(item.keyValue || '')}</td>
                <td>${escape(item.model || '')}</td>
                <td>${escape(item.status)}</td>
                <td class="small">${escape(item.info || '')}</td>
            `;
            elems.historyBody.appendChild(row);
        }
    }

    function clearResultsView() {
        elems.results.innerHTML = '';
    }

    function pushResultToView(item) {
        const result = document.createElement('div');
        result.className = `result-row ${item.status === 'Alive' ? 'alive' : 'dead'}`;
        result.innerHTML = `
            <span>${escape(item.alias)} - ${escape(item.keySuffix)} (${escape(item.model)})</span>
            <span>${escape(item.status)} ${item.code ? `(${escape(item.code)})` : ''}</span>
        `;
        elems.results.appendChild(result);
    }

    async function checkKey(entry, model) {
        let status = 'Dead';
        let code = '';
        let info = '';

        try {
            const response = await fetch(`${endpointBase}/${model}:generateContent?key=${encodeURIComponent(entry.key)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: 'hello'
                        }]
                    }]
                })
            });

            if (response.ok) {
                status = 'Alive';
                info = 'Validation call succeeded.';
            } else {
                status = 'Dead';
                code = String(response.status);
                info = `HTTP ${response.status} ${response.statusText}`.trim();
            }
        } catch (error) {
            status = 'Error';
            info = error?.message || 'Network or runtime issue';
        }

        const result = {
            id: entry.id,
            alias: entry.alias,
            model,
            status,
            code,
            info,
            keySuffix: keySuffix(entry.key),
            keyValue: entry.key
        };

        entry.lastCheckedAt = new Date().toISOString();
        entry.lastResult = `${status}${code ? ` (${code})` : ''}`;
        pushResultToView(result);
        await addHistoryRecord(result);
        saveState();
        renderKeys();

        return result;
    }

    async function runChecks(ids, fallbackAllIfEmpty = false) {
        const target = ids.length ? ids : (fallbackAllIfEmpty ? state.keys.filter((entry) => entry.enabled).map((entry) => entry.id) : []);
        if (!navigator.onLine) {
            setStatus('Cannot check keys while offline.');
            return;
        }
        const entriesToCheck = target.map(getEntryById).filter((entry) => entry && entry.key);
        if (entriesToCheck.length === 0) {
            setStatus('No keys selected.');
            return;
        }

        elems.checkEnabledBtn.disabled = true;
        elems.runSelectedBtn.disabled = true;
        elems.deleteCheckedBtn.disabled = true;
        clearResultsView();
        setStatus('Checking selected keys...');
        for (const entry of entriesToCheck) {
            await checkKey(entry, state.model);
        }
        setStatus(`Completed ${entriesToCheck.length} check(s).`);
        await renderHistory();
        elems.checkEnabledBtn.disabled = false;
        elems.runSelectedBtn.disabled = false;
        elems.deleteCheckedBtn.disabled = false;
    }

    function addOrUpdateKey(alias, keyValue) {
        const cleanAlias = String(alias || '').trim() || `key-${createId().slice(0, 6)}`;
        const cleanKey = String(keyValue || '').trim();

        if (!cleanKey) {
            setStatus('API key cannot be empty.');
            return false;
        }

        const existing = state.keys.find((entry) => entry.key === cleanKey || entry.alias === cleanAlias);
        if (existing) {
            existing.alias = cleanAlias;
            existing.key = cleanKey;
            existing.enabled = true;
        } else {
            state.keys.push({
                id: createId(),
                alias: cleanAlias,
                key: cleanKey,
                enabled: true,
                lastCheckedAt: '',
                lastResult: ''
            });
        }

        saveState();
        renderKeys();
        elems.aliasInput.value = '';
        elems.keyInput.value = '';
        setStatus(`Saved key: ${cleanAlias}`);
        return true;
    }

    function deleteKeysByIds(ids) {
        const idSet = new Set(ids);
        state.keys = state.keys.filter((entry) => !idSet.has(entry.id));
        saveState();
        renderKeys();
    }

    function importBulk(raw) {
        const lines = String(raw || '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

        if (lines.length === 0) {
            setStatus('No keys found in bulk input.');
            return;
        }

        let added = 0;
        for (const line of lines) {
            const parts = line.split('|');
            if (parts.length >= 2) {
                const alias = parts.shift().trim();
                const keyVal = parts.join('|').trim();
                if (addOrUpdateKey(alias, keyVal)) {
                    added += 1;
                }
            } else if (line.length > 0) {
                if (addOrUpdateKey('', line)) {
                    added += 1;
                }
            }
        }

        if (added > 0) {
            setStatus(`Imported ${added} key(s) from bulk input.`);
            elems.bulkKeys.value = '';
            return;
        }

        setStatus('No valid keys imported.');
    }

    async function clearAllData() {
        const shouldClear = window.confirm('This will remove local keys, settings, and history from this browser. Continue?');
        if (!shouldClear) {
            return;
        }
        localStorage.removeItem(STORAGE_KEY);
        state = loadState();
        migrateState();
        elems.bulkKeys.value = '';
        elems.aliasInput.value = '';
        elems.keyInput.value = '';
        applyThemeFromState();
        syncToggleAllState();
        await clearHistory();
        setModelFromState();
        renderKeys();
        await renderHistory();
        clearResultsView();
        setStatus('All local data has been cleared.');
    }

    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            setStatus('This browser does not support service workers.');
            return;
        }

        navigator.serviceWorker.register('./sw.js')
            .then(() => {
                setStatus('PWA offline assets ready.');
            })
            .catch(() => {
                setStatus('Offline mode unavailable; service worker registration failed.');
            });
    }

    function updateInstallButton(event) {
        event.preventDefault();
        deferredInstallPrompt = event;
        if (elems.installBtn) {
            elems.installBtn.hidden = false;
            elems.installBtn.textContent = 'Install Gemini Checker';
        }
    }

    async function installApp() {
        if (!deferredInstallPrompt) {
            return;
        }
        const result = await deferredInstallPrompt.prompt();
        await result.userChoice;
        deferredInstallPrompt = null;
        elems.installBtn.hidden = true;
        setStatus('Install flow completed.');
    }

    function escape(text) {
        return String(text)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function bindEvents() {
        elems.themeToggleBtn?.addEventListener('click', () => {
            const next = elems.themeToggleBtn.getAttribute('data-theme-target') || 'light';
            setTheme(next);
            saveState();
        });

        elems.modelSelector.addEventListener('change', () => {
            const selectedModel = String(elems.modelSelector.value || '').trim();
            state.model = selectedModel || 'gemini-2.5-flash';
            elems.modelSelector.value = state.model;
            saveState();
            renderKeys();
        });

        elems.addKeyBtn.addEventListener('click', () => {
            addOrUpdateKey(elems.aliasInput.value, elems.keyInput.value);
        });

        elems.importBtn.addEventListener('click', () => {
            importBulk(elems.bulkKeys.value);
        });

        elems.checkEnabledBtn.addEventListener('click', async () => {
            const enabledIds = state.keys.filter((entry) => entry.enabled).map((entry) => entry.id);
            await runChecks(enabledIds, false);
        });

        elems.runSelectedBtn.addEventListener('click', async () => {
            const selectedIds = collectCheckedIds();
            await runChecks(selectedIds, false);
        });

        elems.deleteCheckedBtn.addEventListener('click', () => {
            const selectedIds = collectCheckedIds();
            if (selectedIds.length === 0) {
                setStatus('No keys selected for delete.');
                return;
            }
            const confirmed = window.confirm(`Delete ${selectedIds.length} selected key(s)?`);
            if (!confirmed) {
                return;
            }
            deleteKeysByIds(selectedIds);
            setStatus('Deleted selected keys.');
        });

        elems.clearResultsBtn.addEventListener('click', () => {
            clearResultsView();
        });

        elems.clearHistoryBtn.addEventListener('click', async () => {
            const shouldClear = window.confirm('Clear check history only?');
            if (!shouldClear) {
                return;
            }
            await clearHistory();
            await renderHistory();
            setStatus('History cleared.');
        });

        elems.clearAllBtn.addEventListener('click', clearAllData);

        elems.toggleAllKeys.addEventListener('change', (event) => {
            const checked = event.target.checked;
            document.querySelectorAll('#keysBody input[type="checkbox"][data-key-id]').forEach((checkbox) => {
                checkbox.checked = checked;
                const id = checkbox.getAttribute('data-key-id');
                const entry = getEntryById(id);
                if (entry) {
                    entry.enabled = checked;
                }
            });
            saveState();
        });

        elems.keysBody.addEventListener('change', (event) => {
            const target = event.target;
            if (target.matches('input[type="checkbox"][data-key-id]')) {
                const id = target.getAttribute('data-key-id');
                const entry = getEntryById(id);
                if (entry) {
                    entry.enabled = target.checked;
                    saveState();
                    renderKeys();
                    return;
                }
            }
            const deleteId = target.getAttribute('data-delete-key');
            if (deleteId) {
                deleteKeysByIds([deleteId]);
                setStatus('Key deleted.');
            }
        });

        elems.keysBody.addEventListener('click', (event) => {
            const target = event.target;
            const deleteId = target.getAttribute && target.getAttribute('data-delete-key');
            if (deleteId) {
                deleteKeysByIds([deleteId]);
            }
        });

        window.addEventListener('online', updateConnectionState);
        window.addEventListener('offline', updateConnectionState);
        window.addEventListener('beforeinstallprompt', updateInstallButton);
        elems.installBtn?.addEventListener('click', installApp);
    }

    async function boot() {
        migrateState();
        setModelFromState();
        applyThemeFromState();
        renderKeys();
        registerServiceWorker();
        await renderHistory();
        updateConnectionState();
        bindEvents();
        if (!elems.statusEl.textContent) {
            setStatus('Ready to check keys.');
        }
    }

    boot().catch((error) => {
        console.error('Bootstrap failed', error);
        setStatus('App initialization failed. See console.');
    });
})();
