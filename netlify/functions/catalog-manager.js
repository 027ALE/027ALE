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
                            // NOTA: Qui dovrai passare c.blobKey alla tua funzione esistente che elabora il testo dell'ICS
                        } else if (c.url) {
                            // Se pubblico, scarica l'URL .ics inserito
                            setStatus(`Scaricamento in corso: ${c.name}...`);
                            try {
                                // alcuni cataloghi usano lo schema webcal:// — sostituiscilo con https:// per fetch
                                let fetchUrl = c.url;
                                if (/^webcal:/i.test(fetchUrl)) fetchUrl = fetchUrl.replace(/^webcal:/i, 'https:');
                                const res = await fetch(fetchUrl);
                                if (!res.ok) throw new Error('Impossibile scaricare il file URL');
                                const icsText = await res.text();
                                // NOTA: Qui passerai icsText alla tua funzione esistente che elabora il testo dell'ICS
                                setStatus(`Calendario pubblico caricato!`, false);
                            } catch (err) {
                                setStatus(`Errore di rete scaricando l'URL: ${err.message}`, true);
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
