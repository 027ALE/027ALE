(() => {
    'use strict';

    // =========================
    // Configurazione
    // =========================

    // Se hai un proxy tuo, sostituisci questo valore.
    // Per compatibilità con il tuo codice originale lascio il proxy pubblico già usato.
    const ICS_PROXY_BASE = 'https://api.allorigins.win/raw?url=';

    // =========================
    // Riferimenti DOM
    // =========================

    const loadLinksBtn = document.getElementById('loadLinksBtn');
    const jsonFileInput = document.getElementById('jsonFileInput');
    const linkList = document.getElementById('linkList');
    const linkPanel = document.getElementById('linkPanel');
    const statusEl = document.getElementById('status');

    // =========================
    // Stato applicativo
    // =========================

    let localCatalog = { calendars: [] };
    let catalogCache = { calendars: [] };

    window.localCatalog = localCatalog;
    window.catalogCache = catalogCache;

    // =========================
    // Utility UI
    // =========================

    function setStatusSafe(message, isError = false) {
        if (typeof window.setStatus === 'function' && window.setStatus !== setStatusSafe) {
            window.setStatus(message, isError);
            return;
        }

        if (!statusEl) return;
        statusEl.textContent = message || '';
        statusEl.style.color = isError ? '#ff453a' : '#34c759';
    }

    function clearStatusSafe() {
        if (typeof window.clearStatus === 'function' && window.clearStatus !== clearStatusSafe) {
            window.clearStatus();
            return;
        }

        if (!statusEl) return;
        statusEl.textContent = '';
    }

    // =========================
    // Utility parsing / fetch
    // =========================

    function isProbablyICS(text) {
        return typeof text === 'string' && /BEGIN:VCALENDAR/i.test(text);
    }

    function decodePrivateCalendarPayload(payload) {
        if (typeof payload !== 'string' || !payload.trim()) {
            throw new Error('Contenuto del calendario privato vuoto.');
        }

        const raw = payload.trim();

        if (isProbablyICS(raw)) return raw;

        try {
            const decoded = atob(raw);
            if (isProbablyICS(decoded)) return decoded;
        } catch (_) {
            // Nessuna azione: il payload potrebbe già essere testo semplice.
        }

        return raw;
    }

    function normalizeCalendarUrl(url) {
        if (typeof url !== 'string' || !url.trim()) {
            throw new Error('URL calendario non valido.');
        }

        let normalized = url.trim();

        if (/^webcal:/i.test(normalized)) {
            normalized = normalized.replace(/^webcal:/i, 'https:');
        }

        return normalized;
    }

    function buildRemoteFetchUrl(url) {
        const normalized = normalizeCalendarUrl(url);

        if (!/^https?:\/\//i.test(normalized)) {
            throw new Error('Sono supportati solo URL HTTP/HTTPS per il download remoto.');
        }

        return ICS_PROXY_BASE
            ? ICS_PROXY_BASE + encodeURIComponent(normalized)
            : normalized;
    }

    function getICSRenderer() {
        if (typeof window.parseAndRenderICS === 'function') {
            return window.parseAndRenderICS;
        }

        if (typeof window.handleICSText === 'function') {
            return window.handleICSText;
        }

        throw new Error('Nessuna funzione di parsing ICS disponibile: serve parseAndRenderICS() oppure handleICSText().');
    }

    function renderICSText(icsText) {
        const renderer = getICSRenderer();
        renderer(icsText);
    }

    async function fetchICSText(url) {
        const finalUrl = buildRemoteFetchUrl(url);

        const response = await fetch(finalUrl, {
            method: 'GET',
            cache: 'no-store',
            redirect: 'follow'
        });

        if (!response.ok) {
            throw new Error(`Download non riuscito (HTTP ${response.status}).`);
        }

        const text = await response.text();

        if (!text || !text.trim()) {
            throw new Error('Il file ICS scaricato è vuoto.');
        }

        return text;
    }

    // =========================
    // Catalogo
    // =========================

    function validateCatalog(data) {
        if (!data || !Array.isArray(data.calendars)) {
            throw new Error('Struttura catalog.json non valida: manca l\'array "calendars".');
        }

        return data;
    }

    function resetLinkList() {
        if (linkList) {
            linkList.innerHTML = '';
        }
    }

    function ensureLinkPanelVisible() {
        if (linkPanel) {
            linkPanel.style.display = 'block';
        }
    }

    async function handleCalendarSelection(calendar) {
        clearStatusSafe();

        try {
            if (!calendar || typeof calendar !== 'object') {
                throw new Error('Voce calendario non valida.');
            }

            if (calendar.type === 'private') {
                const privateText = decodePrivateCalendarPayload(calendar.blobKey);
                renderICSText(privateText);
                setStatusSafe(`Calendario privato "${calendar.name || 'senza nome'}" caricato con successo.`);
                return;
            }

            if (!calendar.url) {
                throw new Error('Il calendario pubblico non contiene alcun URL.');
            }

            if (location.protocol === 'file:') {
                setStatusSafe(
                    'Stai eseguendo la pagina come file locale. Per i calendari remoti apri l’app tramite HTTP/HTTPS.',
                    true
                );
                return;
            }

            setStatusSafe(`Scaricamento in corso: ${calendar.name || 'Calendario'}...`);

            const icsText = await fetchICSText(calendar.url);
            renderICSText(icsText);

            setStatusSafe(`Calendario pubblico "${calendar.name || 'senza nome'}" caricato con successo.`);
        } catch (error) {
            setStatusSafe(`Errore caricando il calendario: ${error.message}`, true);
        }
    }

    function createCalendarButton(calendar) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'link-btn';
        btn.style.display = 'block';
        btn.style.width = '100%';
        btn.style.textAlign = 'left';
        btn.style.background = 'none';
        btn.style.border = 'none';
        btn.style.color = '#0a84ff';
        btn.style.padding = '6px 0';
        btn.style.cursor = 'pointer';

        const tipo = calendar.type === 'private' ? '🔒 Criptato' : '🌐 Pubblico';
        btn.textContent = `${calendar.name || 'Calendario senza nome'} (${tipo})`;

        btn.addEventListener('click', () => {
            handleCalendarSelection(calendar);
        });

        return btn;
    }

    function renderCatalog(catalog) {
        resetLinkList();

        if (!linkList) {
            throw new Error('Elemento #linkList non trovato nel DOM.');
        }

        catalog.calendars.forEach((calendar) => {
            linkList.appendChild(createCalendarButton(calendar));
        });

        ensureLinkPanelVisible();
    }

    function applyCatalog(data) {
        const validCatalog = validateCatalog(data);

        localCatalog = validCatalog;
        catalogCache = validCatalog;

        window.localCatalog = localCatalog;
        window.catalogCache = catalogCache;

        renderCatalog(validCatalog);

        setStatusSafe(`Catalogo locale caricato: ${validCatalog.calendars.length} calendari trovati.`);
    }

    function readCatalogFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (event) => {
                try {
                    const text = event.target?.result;
                    const data = JSON.parse(text);
                    resolve(data);
                } catch (error) {
                    reject(new Error(`Errore nel file JSON: ${error.message}`));
                }
            };

            reader.onerror = () => {
                reject(new Error('Impossibile leggere il file selezionato.'));
            };

            reader.readAsText(file);
        });
    }

    async function onJsonFileChange(event) {
        const file = event.target?.files?.[0];
        if (!file) return;

        try {
            setStatusSafe('Lettura catalogo in corso...');
            const data = await readCatalogFile(file);
            applyCatalog(data);
        } catch (error) {
            setStatusSafe(error.message, true);
        } finally {
            if (jsonFileInput) {
                jsonFileInput.value = '';
            }
        }
    }

    // =========================
    // API pubblica compatibile
    // =========================

    function loadLinkCatalog() {
        if (!jsonFileInput) {
            setStatusSafe('Elemento #jsonFileInput non trovato nel DOM.', true);
            return;
        }

        jsonFileInput.click();
    }

    // Espone la funzione globalmente, così eventuali onclick HTML non generano ReferenceError
    window.loadLinkCatalog = loadLinkCatalog;

    // =========================
    // Inizializzazione
    // =========================

    function init() {
        if (loadLinksBtn) {
            loadLinksBtn.addEventListener('click', loadLinkCatalog);
        }

        if (jsonFileInput) {
            jsonFileInput.addEventListener('change', onJsonFileChange);
        }
    }

    init();
})();