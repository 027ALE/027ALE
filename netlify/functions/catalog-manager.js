// 1. Quando clicchi "Seleziona da link", apri il selettore file per il catalog.json
loadLinksBtn.addEventListener('click', () => {
    jsonFileInput.click();
});

// 2. Gestisci la lettura del file catalog.json caricato dal tuo Mac
jsonFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setStatus('Lettura catalogo in corso...');
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            if (data && Array.isArray(data.calendars)) {
                localCatalog = data;
                catalogCache = data; // mantiene compatibilità con il tuo codice esistente
                
                // Popola il pannello dei link con i dati del file JSON
                linkList.innerHTML = '';
                localCatalog.calendars.forEach(c => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'link-btn';
                    btn.style.textAlign = 'left';
                    btn.style.background = 'none';
                    btn.style.color = '#0a84ff';
                    btn.style.padding = '4px 0';
                    
                    const tipo = c.type === 'private' ? '🔒 Criptato' : '🌐 Pubblico';
                    btn.textContent = `${c.name} (${tipo})`;
                    
                    // Al clic sul calendario, scarica o legge il file .ics corrispondente
                    btn.onclick = async () => {
                        clearStatus();
                        if (c.type === 'private') {
                            // Se privato, decodifica il testo/blob salvato nel JSON
                            if (!c.blobKey) {
                                setStatus('Errore: Contenuto del calendario privato vuoto.', true);
                                return;
                            }
                            // Esegue il parsing del testo dell'iCal direttamente dal blob locale
                            setStatus(`Caricato calendario privato: ${c.name}`);
                            
                            // INTEGRAZIONE: Passa il blob privato alla tua funzione esistente di parsing
                            if (typeof parseAndRenderICS === 'function') {
                                parseAndRenderICS(c.blobKey);
                            } else if (typeof handleICSText === 'function') {
                                handleICSText(c.blobKey);
                            }
                        } else if (c.url) {
                            // Se pubblico, scarica l'URL .ics inserito
                            setStatus(`Scaricamento in corso: ${c.name}...`);
                            try {
                                let fetchUrl = c.url;
                                // Converte lo schema webcal:// in https:// per supportare fetch()
                                if (/^webcal:/i.test(fetchUrl)) {
                                    fetchUrl = fetchUrl.replace(/^webcal:/i, 'https:');
                                }
                                
                                // AGGIORNAMENTO CRITICO: Usa un proxy CORS pubblico per aggirare il blocco di Apple iCloud
                                const proxyUrl = 'https://corsproxy.io?' + encodeURIComponent(fetchUrl);
                                
                                const res = await fetch(proxyUrl);
                                if (!res.ok) throw new Error('Impossibile scaricare il file dal server di origine');
                                const icsText = await res.text();
                                
                                // INTEGRAZIONE: Passa il testo ICS scaricato alla tua funzione esistente di parsing
                                if (typeof parseAndRenderICS === 'function') {
                                    parseAndRenderICS(icsText);
                                } else if (typeof handleICSText === 'function') {
                                    handleICSText(icsText);
                                }
                                
                                setStatus(`Calendario pubblico "${c.name}" caricato con successo!`, false);
                            } catch (err) {
                                setStatus(`Errore CORS/Rete scaricando l'URL: ${err.message}`, true);
                            }
                        }
                    };
                    linkList.appendChild(btn);
                });

                linkPanel.style.display = 'block';
                setStatus(`Catalogo locale caricato! ${localCatalog.calendars.length} calendari trovati.`, false);
            } else {
                throw new Error('Struttura catalog.json non valida.');
            }
        } catch (err) {
            setStatus('Errore file JSON: ' + err.message, true);
        }
    };
    reader.readAsText(file);
});
