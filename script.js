(() => {
    const checkButton = document.getElementById('checkKeys');
    const installBtn = document.getElementById('installBtn');
    const statusEl = document.getElementById('status');
    let deferredInstallPrompt = null;

    const registerServiceWorker = async () => {
        if (!('serviceWorker' in navigator)) {
            return;
        }

        try {
            await navigator.serviceWorker.register('./sw.js');
            if (statusEl) {
                statusEl.textContent = 'Offline-ready app shell enabled.';
            }
        } catch {
            if (statusEl) {
                statusEl.textContent = 'Install support is limited on this browser.';
            }
        }
    };

    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredInstallPrompt = event;

        if (installBtn) {
            installBtn.hidden = false;
            installBtn.textContent = 'Install app';
        }
    });

    installBtn?.addEventListener('click', async () => {
        if (!deferredInstallPrompt) {
            return;
        }

        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        installBtn.hidden = true;
        if (statusEl) {
            statusEl.textContent = 'Installing...';
        }
    });

    checkButton?.addEventListener('click', async () => {
        const apiKeys = document
            .getElementById('apiKeys')
            .value
            .split(/\r?\n/)
            .map((key) => key.trim())
            .filter(Boolean);

        const selectedModel = document.getElementById('modelSelector').value;
        const resultsDiv = document.getElementById('results');
        resultsDiv.innerHTML = '';

        for (const key of apiKeys) {
            const resultDiv = document.createElement('div');
            resultDiv.classList.add('result');
            resultDiv.textContent = `Checking ${key}...`;
            resultsDiv.appendChild(resultDiv);

            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${key}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        "contents": [{
                            "parts": [{
                                "text": "hello"
                            }]
                        }]
                    })
                });

                if (response.ok) {
                    resultDiv.textContent = `${key} - Alive`;
                    resultDiv.classList.add('alive');
                } else {
                    resultDiv.textContent = `${key} - Dead`;
                    resultDiv.classList.add('dead');
                }
            } catch {
                resultDiv.textContent = `${key} - Dead (Error)`;
                resultDiv.classList.add('dead');
            }
        }
    });

    checkButton && registerServiceWorker();
})();
