(() => {
    const d = document;

    const old = d.getElementById("melvor-smart-save-editor");
    if (old) old.remove();

    const win = d.createElement("div");
    win.id = "melvor-smart-save-editor";
    win.style.cssText = `
        position:fixed; top:70px; left:70px;
        width:min(980px,calc(100vw - 40px));
        height:min(780px,calc(100vh - 40px));
        min-width:600px; min-height:420px;
        z-index:2147483647;
        background:#111827; color:#e5e7eb;
        border:1px solid #374151; border-radius:10px;
        box-shadow:0 18px 60px rgba(0,0,0,.55);
        display:flex; flex-direction:column; overflow:hidden;
        resize:both; font:13px/1.35 Arial,sans-serif;
    `;

    win.innerHTML = `
        <div id="mse-titlebar" style="height:38px;min-height:38px;display:flex;align-items:center;justify-content:space-between;padding:0 7px 0 12px;background:#0b1220;border-bottom:1px solid #374151;cursor:move;user-select:none">
            <strong>Melvor Smart Save Editor</strong>
            <button id="mse-close" title="Close" style="width:30px;height:30px;border:0;border-radius:6px;background:transparent;color:#d1d5db;font-size:21px;cursor:pointer">×</button>
        </div>

        <div style="padding:10px;display:flex;flex-direction:column;gap:8px;flex:1;min-height:0">
            <div style="display:grid;grid-template-columns:1fr auto;gap:7px">
                <textarea id="mse-save" placeholder="Save String" style="height:68px;resize:vertical;background:#0b1220;color:#e5e7eb;border:1px solid #374151;border-radius:6px;padding:7px"></textarea>
                <button id="mse-decode" style="min-width:92px">Decode</button>
            </div>

            <div id="mse-status" style="min-height:18px;color:#9ca3af"></div>

            <div id="mse-tree" style="flex:1;min-height:0;overflow:auto;border:1px solid #374151;border-radius:7px;background:#0f172a"></div>

            <div style="display:grid;grid-template-columns:auto 1fr;gap:7px">
                <button id="mse-encode">Encode Save</button>
                <textarea id="mse-output" readonly placeholder="New Save String" style="height:62px;resize:vertical;background:#0b1220;color:#e5e7eb;border:1px solid #374151;border-radius:6px;padding:7px"></textarea>
            </div>
        </div>
    `;

    d.body.appendChild(win);

    const $ = s => win.querySelector(s);
    const tree = $("#mse-tree");
    const saveInput = $("#mse-save");
    const output = $("#mse-output");
    const status = $("#mse-status");

    const esc = value => String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");

    function setStatus(message, error = false) {
        status.textContent = message;
        status.style.color = error ? "#fca5a5" : "#9ca3af";
    }

    function getItemByID(id) {
        return game?.items?.getObjectByID?.(id.trim());
    }

    function getGoldCurrency() {
        return game?.gp ?? game?.currencies?.getObjectByID?.("melvorD:GP");
    }

    function currencyAmount(currency) {
        if (!currency) return 0;
        if (typeof currency.amount === "number") return currency.amount;
        if (typeof currency._amount === "number") return currency._amount;
        return Number(currency.amount ?? currency._amount ?? 0);
    }

    function setCurrencyAmount(currency, requested) {
        const target = Math.max(0, Math.floor(Number(requested)));
        if (!Number.isFinite(target)) throw new Error("Invalid gold amount");

        const current = currencyAmount(currency);
        const delta = target - current;
        if (delta === 0) return;

        if (delta > 0 && typeof currency.add === "function") {
            currency.add(delta);
            return;
        }
        if (delta < 0 && typeof currency.remove === "function") {
            currency.remove(-delta);
            return;
        }
        if ("_amount" in currency) {
            currency._amount = target;
            return;
        }
        if ("amount" in currency) {
            currency.amount = target;
            return;
        }
        throw new Error("Gold currency cannot be modified with this game version.");
    }

    function bankEntries() {
        const items = game?.bank?.items;
        if (!(items instanceof Map)) return [];
        return [...items.entries()].map(([item, bankItem]) => ({ item, bankItem }));
    }

    function itemName(item) {
        try { return item?.name ?? item?.id ?? "Unknown"; }
        catch { return item?.id ?? "Unknown"; }
    }

    function itemMedia(item) {
        try { return item?.media ?? ""; }
        catch { return ""; }
    }

    function removeBankItem(item, qty) {
        if (qty <= 0) return;
        if (typeof game.bank.removeItemQuantity === "function") {
            game.bank.removeItemQuantity(item, qty, true);
            return;
        }
        throw new Error("game.bank.removeItemQuantity() is unavailable.");
    }

    function addBankItem(item, qty) {
        if (qty <= 0) return;
        if (typeof game.bank.addItem === "function") {
            // logLost=false, found=true, ignoreSpace=true, notify=false
            game.bank.addItem(item, qty, false, true, true, false);
            return;
        }
        if (typeof game.bank.addItemByID === "function") {
            game.bank.addItemByID(item.id, qty, false);
            return;
        }
        throw new Error("No supported bank add method found.");
    }

    function replaceBankItem(oldID, newID) {
        const oldItem = getItemByID(oldID);
        const newItem = getItemByID(newID);
        if (!oldItem) throw new Error(`Old item not found: ${oldID}`);
        if (!newItem) throw new Error(`Item ID not found: ${newID}`);
        if (oldItem === newItem) return;

        const oldBankItem = game.bank.items.get(oldItem);
        if (!oldBankItem) throw new Error(`Bank item not found: ${oldID}`);

        const qty = Number(oldBankItem.quantity) || 0;
        const oldTab = oldBankItem.tab;
        const oldPosition = oldBankItem.tabPosition;
        const targetAlreadyExists = game.bank.items.has(newItem);

        // Use Bank's public mutation API so all internal indexes remain valid.
        removeBankItem(oldItem, qty);
        addBankItem(newItem, qty);

        // If the target did not already exist, retain the old visual placement
        // when this game build exposes writable placement fields.
        if (!targetAlreadyExists) {
            const newBankItem = game.bank.items.get(newItem);
            if (newBankItem) {
                try { if (oldTab !== undefined) newBankItem.tab = oldTab; } catch {}
                try { if (oldPosition !== undefined) newBankItem.tabPosition = oldPosition; } catch {}
            }
        }
    }

    function setBankQuantity(id, requested) {
        const item = getItemByID(id);
        if (!item) throw new Error(`Item ID not found: ${id}`);
        const bankItem = game.bank.items.get(item);
        if (!bankItem) throw new Error(`Bank item not found: ${id}`);

        const target = Math.max(0, Math.floor(Number(requested)));
        if (!Number.isFinite(target)) throw new Error("Invalid quantity");
        const current = Number(bankItem.quantity) || 0;
        const delta = target - current;

        if (delta > 0) addBankItem(item, delta);
        else if (delta < 0) removeBankItem(item, -delta);
    }

    function render() {
        const gold = getGoldCurrency();
        const entries = bankEntries();
        const allItems = game?.items?.allObjects ? [...game.items.allObjects] : [];

        const itemOptions = allItems.map(item =>
            `<option value="${esc(item.id)}">${esc(itemName(item))}</option>`
        ).join("");

        const rows = entries.map(({ item, bankItem }, index) => {
            const media = itemMedia(item);
            return `
                <tr data-old-id="${esc(item.id)}">
                    <td style="width:36px;text-align:center">${media ? `<img src="${esc(media)}" style="width:28px;height:28px;object-fit:contain" onerror="this.style.display='none'">` : ""}</td>
                    <td style="min-width:170px"><div class="mse-item-name" style="font-weight:600">${esc(itemName(item))}</div></td>
                    <td style="min-width:260px"><input class="mse-item-id" list="mse-item-ids" value="${esc(item.id)}" style="width:100%;box-sizing:border-box"></td>
                    <td style="width:120px"><input class="mse-qty" type="number" min="0" step="1" value="${esc(bankItem.quantity)}" style="width:100%;box-sizing:border-box"></td>
                    <td style="width:58px;text-align:center">${esc(bankItem.tab ?? "")}</td>
                    <td style="width:70px;text-align:center">${esc(bankItem.tabPosition ?? index)}</td>
                </tr>
            `;
        }).join("");

        tree.innerHTML = `
            <datalist id="mse-item-ids">${itemOptions}</datalist>

            <details open style="border-bottom:1px solid #374151">
                <summary style="padding:10px 12px;background:#111827;cursor:pointer;font-weight:700">▾ Gold Currency</summary>
                <div style="padding:12px;display:grid;grid-template-columns:180px minmax(180px,320px);align-items:center;gap:8px">
                    <label for="mse-gold">Gold (GP)</label>
                    <input id="mse-gold" type="number" min="0" step="1" value="${esc(currencyAmount(gold))}">
                </div>
            </details>

            <details open>
                <summary style="padding:10px 12px;background:#111827;cursor:pointer;font-weight:700">▾ Bank Items <span style="font-weight:400;color:#9ca3af">(${entries.length})</span></summary>
                <div style="padding:8px">
                    <div style="display:grid;grid-template-columns:minmax(260px,1fr) 120px auto;gap:6px;margin-bottom:8px">
                        <input id="mse-add-id" list="mse-item-ids" placeholder="Item ID, e.g. melvorD:Tin_Ore">
                        <input id="mse-add-qty" type="number" min="1" step="1" value="1">
                        <button id="mse-add">Add Item</button>
                    </div>
                    <div id="mse-add-preview" style="min-height:18px;margin-bottom:7px;color:#9ca3af"></div>

                    <div style="overflow:auto">
                        <table style="width:100%;border-collapse:collapse;white-space:nowrap">
                            <thead style="position:sticky;top:0;background:#1f2937;z-index:1">
                                <tr>
                                    <th></th><th style="text-align:left">Item</th><th style="text-align:left">ID</th><th>Quantity</th><th>Tab</th><th>Pos</th>
                                </tr>
                            </thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>
            </details>
        `;

        tree.querySelectorAll("input,button").forEach(el => {
            el.style.background = el.tagName === "BUTTON" ? "#243244" : "#0b1220";
            el.style.color = "#e5e7eb";
            el.style.border = "1px solid #4b5563";
            el.style.borderRadius = "5px";
            el.style.padding = "6px";
        });
        tree.querySelectorAll("th,td").forEach(el => {
            el.style.padding = "5px 6px";
            el.style.borderBottom = "1px solid #263244";
        });

        const goldInput = tree.querySelector("#mse-gold");
        if (goldInput) {
            goldInput.addEventListener("change", () => {
                try {
                    const currency = getGoldCurrency();
                    if (!currency) throw new Error("Gold currency not found.");
                    setCurrencyAmount(currency, goldInput.value);
                    goldInput.value = currencyAmount(currency);
                    setStatus("Gold updated.");
                } catch (e) {
                    setStatus(e.stack || e.message || String(e), true);
                    console.error(e);
                }
            });
        }

        tree.querySelectorAll(".mse-item-id").forEach(input => {
            const row = input.closest("tr");
            const preview = row.querySelector(".mse-item-name");

            input.addEventListener("input", () => {
                const resolved = getItemByID(input.value);
                preview.textContent = resolved ? itemName(resolved) : "Unknown item";
                preview.style.color = resolved ? "#e5e7eb" : "#fca5a5";
            });

            input.addEventListener("change", () => {
                const oldID = row.dataset.oldId;
                const newID = input.value.trim();
                try {
                    replaceBankItem(oldID, newID);
                    setStatus(`${oldID} → ${newID} updated.`);
                    render();
                } catch (e) {
                    input.value = oldID;
                    setStatus(e.stack || e.message || String(e), true);
                    console.error(e);
                    render();
                }
            });
        });

        tree.querySelectorAll(".mse-qty").forEach(input => {
            const row = input.closest("tr");
            input.addEventListener("change", () => {
                try {
                    setBankQuantity(row.dataset.oldId, input.value);
                    setStatus(`${row.dataset.oldId} quantity updated.`);
                    render();
                } catch (e) {
                    setStatus(e.stack || e.message || String(e), true);
                    console.error(e);
                    render();
                }
            });
        });

        const addID = tree.querySelector("#mse-add-id");
        const addQty = tree.querySelector("#mse-add-qty");
        const addPreview = tree.querySelector("#mse-add-preview");
        const addBtn = tree.querySelector("#mse-add");

        if (addID) {
            addID.addEventListener("input", () => {
                const item = getItemByID(addID.value);
                addPreview.textContent = item ? itemName(item) : (addID.value ? "Unknown item ID" : "");
                addPreview.style.color = item ? "#86efac" : "#fca5a5";
            });
        }

        if (addBtn) {
            addBtn.addEventListener("click", () => {
                try {
                    const item = getItemByID(addID.value);
                    if (!item) throw new Error(`Item ID not found: ${addID.value}`);
                    const qty = Math.max(1, Math.floor(Number(addQty.value)));
                    if (!Number.isFinite(qty)) throw new Error("Invalid quantity");
                    addBankItem(item, qty);
                    setStatus(`${item.id} x${qty} added.`);
                    render();
                } catch (e) {
                    setStatus(e.stack || e.message || String(e), true);
                    console.error(e);
                }
            });
        }
    }

    $("#mse-decode").onclick = () => {
        try {
            const reader = new SaveWriter("Read", 1);
            const saveVersion = reader.setDataFromSaveString(saveInput.value.trim());
            game.decode(reader, saveVersion);
            output.value = "";
            render();
            setStatus(`Decoded save version ${saveVersion}. Edit Gold or Bank Items below.`);
        } catch (e) {
            console.error(e);
            setStatus(e.stack || e.message || String(e), true);
            alert(e.stack || e);
        }
    };

    $("#mse-encode").onclick = () => {
        try {
            output.value = game.generateSaveString();
            setStatus(`Save generated (${output.value.length.toLocaleString()} chars).`);
        } catch (e) {
            console.error(e);
            setStatus(e.stack || e.message || String(e), true);
            alert(e.stack || e);
        }
    };

    $("#mse-close").onclick = () => win.remove();

    // Draggable title bar
    const titlebar = $("#mse-titlebar");
    let dragging = false;
    let dx = 0;
    let dy = 0;

    titlebar.addEventListener("mousedown", e => {
        if (e.target.closest("#mse-close")) return;
        dragging = true;
        const r = win.getBoundingClientRect();
        dx = e.clientX - r.left;
        dy = e.clientY - r.top;
        d.body.style.userSelect = "none";
        e.preventDefault();
    });

    d.addEventListener("mousemove", e => {
        if (!dragging || !win.isConnected) return;
        const left = Math.min(Math.max(0, e.clientX - dx), Math.max(0, innerWidth - win.offsetWidth));
        const top = Math.min(Math.max(0, e.clientY - dy), Math.max(0, innerHeight - win.offsetHeight));
        win.style.left = `${left}px`;
        win.style.top = `${top}px`;
    });

    d.addEventListener("mouseup", () => {
        dragging = false;
        d.body.style.userSelect = "";
    });

    setStatus("Paste a save string and press Decode.");
})();
