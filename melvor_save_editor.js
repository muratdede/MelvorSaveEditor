(function waitForMelvorSaveEditor() {
    const d = document;

    if (
        !d.body ||
        typeof game === "undefined" ||
        typeof SaveWriter === "undefined"
    ) {
        setTimeout(waitForMelvorSaveEditor, 500);
        return;
    }

    // Remove a previous instance cleanly, including document-level listeners.
    if (typeof window.__melvorSaveEditorCleanup === "function") {
        try { window.__melvorSaveEditorCleanup(); } catch {}
    }

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
        <div id="mse-titlebar" style="height:38px;min-height:38px;display:flex;align-items:center;justify-content:space-between;padding:0 7px 0 10px;background:#0b1220;border-bottom:1px solid #374151;cursor:move;user-select:none">
            <div style="display:flex;align-items:center;gap:5px;min-width:0">
                <button id="mse-toggle" title="Minimize" aria-label="Minimize" style="width:26px;height:26px;border:0;border-radius:5px;background:transparent;color:#d1d5db;font-size:14px;line-height:26px;padding:0;cursor:pointer">▼</button>
                <strong>Melvor Save Editor</strong>
            </div>
            <button id="mse-close" title="Close" aria-label="Close" style="width:30px;height:30px;border:0;border-radius:6px;background:transparent;color:#d1d5db;font-size:21px;cursor:pointer">×</button>
        </div>

        <div id="mse-body" style="padding:10px;display:flex;flex-direction:column;gap:8px;flex:1;min-height:0">
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

    function currencyEntries() {
        const currencies = game?.currencies?.allObjects;
        if (!currencies) {
            const gp = game?.gp;
            return gp ? [gp] : [];
        }

        const list = [...currencies];

        // Some builds expose GP separately as game.gp. Ensure it is visible
        // without duplicating it when it is already in the registry.
        if (game?.gp && !list.includes(game.gp))
            list.unshift(game.gp);

        return list;
    }

    function currencyName(currency) {
        try {
            return currency?.name ?? currency?.id ?? "Unknown Currency";
        } catch {
            return currency?.id ?? "Unknown Currency";
        }
    }

    function currencyAmount(currency) {
        if (!currency) return 0;
        if (typeof currency.amount === "number") return currency.amount;
        if (typeof currency._amount === "number") return currency._amount;
        return Number(currency.amount ?? currency._amount ?? 0);
    }

    function setCurrencyAmount(currency, requested) {
        const target = Math.max(0, Math.floor(Number(requested)));
        if (!Number.isFinite(target)) throw new Error("Invalid currency amount");

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
        throw new Error("Currency cannot be modified with this game version.");
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

    function objectMedia(object) {
        try { return object?.media ?? object?._media ?? ""; }
        catch { return ""; }
    }

    function skillEntries() {
        const skills = game?.skills?.allObjects;
        if (!skills) return [];
        return [...skills].filter(skill =>
            typeof skill?.addXP === "function" &&
            Number.isFinite(Number(skill?.xp ?? skill?._xp)) &&
            Number.isFinite(Number(skill?.level ?? skill?._level))
        );
    }

    function skillName(skill) {
        try { return skill?.name ?? skill?.id ?? "Unknown Skill"; }
        catch { return skill?.id ?? "Unknown Skill"; }
    }

    function skillLevel(skill) {
        const value = Number(skill?.level ?? skill?._level ?? 1);
        return Number.isFinite(value) ? value : 1;
    }

    function skillXP(skill) {
        const value = Number(skill?.xp ?? skill?._xp ?? 0);
        return Number.isFinite(value) ? value : 0;
    }

    function skillLevelCap(skill) {
        const candidates = [
            skill?.currentLevelCap,
            skill?.levelCap,
            skill?._levelCap,
            skill?.maxLevel
        ];
        for (const value of candidates) {
            const n = Number(value);
            if (Number.isFinite(n) && n > 0) return n;
        }
        return null;
    }

    function xpForLevel(targetLevel) {
        const target = Math.max(1, Math.floor(Number(targetLevel)));
        if (!Number.isFinite(target)) throw new Error("Invalid target level");
        if (target <= 1) return 0;

        const table = globalThis.exp;
        if (!table) throw new Error("Global XP table (exp) is unavailable in this game build.");

        // Older Melvor builds expose level_to_xp(), while newer builds may
        // expose levelToXP() or only xpToLevel(). Prefer the direct API.
        if (typeof table.level_to_xp === "function")
            return Math.max(0, Math.floor(Number(table.level_to_xp(target))));

        if (typeof table.levelToXP === "function")
            return Math.max(0, Math.floor(Number(table.levelToXP(target))));

        if (typeof table.xpToLevel !== "function")
            throw new Error("No supported XP conversion function was found on exp.");

        let low = 0;
        let high = 1;

        while (table.xpToLevel(high) < target) {
            high *= 2;
            if (!Number.isSafeInteger(high) || high > Number.MAX_SAFE_INTEGER / 2)
                throw new Error(`Could not calculate XP for level ${target}.`);
        }

        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            if (table.xpToLevel(mid) >= target) high = mid;
            else low = mid + 1;
        }

        return low;
    }

    function addSkillXP(skillID, requestedXP) {
        const skill = game?.skills?.getObjectByID?.(skillID);
        if (!skill) throw new Error(`Skill not found: ${skillID}`);
        if (typeof skill.addXP !== "function")
            throw new Error(`${skillID} does not expose addXP().`);

        const amount = Math.floor(Number(requestedXP));
        if (!Number.isFinite(amount) || amount <= 0)
            throw new Error("XP to add must be greater than 0.");

        skill.addXP(amount);
    }

    function raiseSkillToLevel(skillID, requestedLevel) {
        const skill = game?.skills?.getObjectByID?.(skillID);
        if (!skill) throw new Error(`Skill not found: ${skillID}`);
        if (typeof skill.addXP !== "function")
            throw new Error(`${skillID} does not expose addXP().`);

        const target = Math.max(1, Math.floor(Number(requestedLevel)));
        if (!Number.isFinite(target)) throw new Error("Invalid target level.");

        const currentLevel = skillLevel(skill);
        if (target <= currentLevel)
            throw new Error(`Target level must be above current level (${currentLevel}). Lowering levels is intentionally disabled.`);

        const cap = skillLevelCap(skill);
        if (cap !== null && target > cap)
            throw new Error(`Target level ${target} exceeds this skill's current cap (${cap}).`);

        const targetXP = xpForLevel(target);
        const currentXP = skillXP(skill);
        const delta = Math.max(0, Math.ceil(targetXP - currentXP));
        if (delta <= 0)
            throw new Error(`No XP is required to reach level ${target}.`);

        skill.addXP(delta);

        if (skillLevel(skill) < target) {
            // Protect against rounding/table boundary differences between builds.
            skill.addXP(1);
        }
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
        // Preserve UI state across re-renders. On the first render there are no
        // existing sections, so all <details> elements keep their default
        // collapsed state.
        const sectionState = new Map(
            [...tree.querySelectorAll("details[data-section]")].map(section => [
                section.dataset.section,
                section.open
            ])
        );
        const previousScrollTop = tree.scrollTop;

        const currencies = currencyEntries();
        const entries = bankEntries();
        const skills = skillEntries();
        const allItems = game?.items?.allObjects ? [...game.items.allObjects] : [];

        const itemOptions = allItems.map(item =>
            `<option value="${esc(item.id)}">${esc(itemName(item))}</option>`
        ).join("");

        const currencyRows = currencies.map(currency => {
            const id = currency?.id ?? "";
            const media = objectMedia(currency);
            return `
                <tr data-currency-id="${esc(id)}">
                    <td style="width:36px;text-align:center">${media ? `<img src="${esc(media)}" style="width:28px;height:28px;object-fit:contain" onerror="this.style.display='none'">` : ""}</td>
                    <td style="min-width:200px">
                        <strong>${esc(currencyName(currency))}</strong>
                    </td>
                    <td style="min-width:230px;color:#9ca3af">${esc(id)}</td>
                    <td style="min-width:180px">
                        <input class="mse-currency-amount" type="number" min="0" step="1"
                               value="${esc(Math.floor(currencyAmount(currency)))}"
                               style="width:100%;box-sizing:border-box">
                    </td>
                </tr>
            `;
        }).join("");

        const skillRows = skills.map(skill => {
            const level = skillLevel(skill);
            const xp = skillXP(skill);
            const cap = skillLevelCap(skill);
            const media = objectMedia(skill);
            return `
                <tr data-skill-id="${esc(skill.id)}">
                    <td style="width:36px;text-align:center">${media ? `<img src="${esc(media)}" style="width:28px;height:28px;object-fit:contain" onerror="this.style.display='none'">` : ""}</td>
                    <td style="min-width:170px"><strong>${esc(skillName(skill))}</strong><div style="font-size:11px;color:#9ca3af">${esc(skill.id)}</div></td>
                    <td style="width:70px;text-align:center">${esc(level)}</td>
                    <td style="min-width:130px;text-align:right">${esc(Math.floor(xp).toLocaleString())}</td>
                    <td style="width:70px;text-align:center">${esc(cap ?? "—")}</td>
                    <td style="min-width:220px">
                        <div style="display:grid;grid-template-columns:1fr auto;gap:5px">
                            <input class="mse-skill-add-xp" type="number" min="1" step="1" placeholder="XP to add">
                            <button class="mse-skill-add-xp-btn">Add XP</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");

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

            <details data-section="currency" style="border-bottom:1px solid #374151">
                <summary style="padding:10px 12px;background:#111827;cursor:pointer;font-weight:700">
                    Currency <span style="font-weight:400;color:#9ca3af">(${currencies.length})</span>
                </summary>
                <div style="padding:8px">
                    <div style="overflow:auto">
                        <table style="width:100%;border-collapse:collapse;white-space:nowrap">
                            <thead style="position:sticky;top:0;background:#1f2937;z-index:1">
                                <tr>
                                    <th style="width:36px"></th>
                                    <th style="text-align:left">Currency</th>
                                    <th style="text-align:left">ID</th>
                                    <th style="text-align:left">Amount</th>
                                </tr>
                            </thead>
                            <tbody>${currencyRows}</tbody>
                        </table>
                    </div>
                </div>
            </details>

            <details data-section="skills" style="border-bottom:1px solid #374151">
                <summary style="padding:10px 12px;background:#111827;cursor:pointer;font-weight:700">Skills <span style="font-weight:400;color:#9ca3af">(${skills.length})</span></summary>
                <div style="padding:8px">
                    <div style="padding:4px 4px 10px;color:#9ca3af">
                        XP is applied through each skill's <code>addXP()</code> method.
                    </div>
                    <div style="overflow:auto">
                        <table style="width:100%;border-collapse:collapse;white-space:nowrap">
                            <thead style="position:sticky;top:0;background:#1f2937;z-index:1">
                                <tr>
                                    <th style="width:36px"></th><th style="text-align:left">Skill</th><th>Level</th><th style="text-align:right">XP</th><th>Cap</th><th>Add XP</th>
                                </tr>
                            </thead>
                            <tbody>${skillRows}</tbody>
                        </table>
                    </div>
                </div>
            </details>

            <details data-section="bank-items">
                <summary style="padding:10px 12px;background:#111827;cursor:pointer;font-weight:700">Bank Items <span style="font-weight:400;color:#9ca3af">(${entries.length})</span></summary>
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

        // Restore section open/closed state after rebuilding the tree.
        tree.querySelectorAll("details[data-section]").forEach(section => {
            if (sectionState.has(section.dataset.section))
                section.open = sectionState.get(section.dataset.section);
        });
        tree.scrollTop = previousScrollTop;

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

        tree.querySelectorAll(".mse-currency-amount").forEach(input => {
            const row = input.closest("tr");
            input.addEventListener("change", () => {
                try {
                    const currencyID = row.dataset.currencyId;
                    const currency =
                        game?.currencies?.getObjectByID?.(currencyID) ??
                        currencyEntries().find(x => (x?.id ?? "") === currencyID);

                    if (!currency)
                        throw new Error(`Currency not found: ${currencyID}`);

                    setCurrencyAmount(currency, input.value);
                    input.value = Math.floor(currencyAmount(currency));
                    setStatus(`${currencyName(currency)} updated.`);
                } catch (e) {
                    setStatus(e.stack || e.message || String(e), true);
                    console.error(e);
                    render();
                }
            });
        });

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

        tree.querySelectorAll(".mse-skill-add-xp-btn").forEach(button => {
            const row = button.closest("tr");
            const input = row.querySelector(".mse-skill-add-xp");
            button.addEventListener("click", () => {
                try {
                    const skillID = row.dataset.skillId;
                    addSkillXP(skillID, input.value);
                    const updated = game.skills.getObjectByID(skillID);
                    setStatus(`${skillName(updated)}: XP added through addXP(). Level ${skillLevel(updated)}, XP ${Math.floor(skillXP(updated)).toLocaleString()}.`);
                    render();
                } catch (e) {
                    setStatus(e.stack || e.message || String(e), true);
                    console.error(e);
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
            setStatus(`Decoded save version ${saveVersion}. Edit Currency, Skills, or Bank Items below.`);
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

    const titlebar = $("#mse-titlebar");
    const body = $("#mse-body");
    const toggleBtn = $("#mse-toggle");

    let dragging = false;
    let dx = 0;
    let dy = 0;
    let minimized = false;
    let expandedHeight = win.style.height;
    let expandedMinHeight = win.style.minHeight;
    let expandedResize = win.style.resize;

    function cleanup() {
        dragging = false;
        d.body.style.userSelect = "";
        d.removeEventListener("mousemove", onMouseMove);
        d.removeEventListener("mouseup", onMouseUp);

        if (win.isConnected)
            win.remove();

        if (window.__melvorSaveEditorCleanup === cleanup)
            delete window.__melvorSaveEditorCleanup;
    }

    function setMinimized(value) {
        minimized = value;

        if (minimized) {
            expandedHeight = win.style.height || `${win.offsetHeight}px`;
            expandedMinHeight = win.style.minHeight;
            expandedResize = win.style.resize;

            body.style.display = "none";
            win.style.height = "38px";
            win.style.minHeight = "38px";
            win.style.resize = "none";
            toggleBtn.textContent = "▶";
            toggleBtn.title = "Maximize";
            toggleBtn.setAttribute("aria-label", "Maximize");
        } else {
            body.style.display = "flex";
            win.style.height = expandedHeight || "min(780px,calc(100vh - 40px))";
            win.style.minHeight = expandedMinHeight || "420px";
            win.style.resize = expandedResize || "both";
            toggleBtn.textContent = "▼";
            toggleBtn.title = "Minimize";
            toggleBtn.setAttribute("aria-label", "Minimize");
        }
    }

    function onMouseDown(e) {
        if (e.target.closest("#mse-close") || e.target.closest("#mse-toggle"))
            return;

        dragging = true;
        const r = win.getBoundingClientRect();
        dx = e.clientX - r.left;
        dy = e.clientY - r.top;
        d.body.style.userSelect = "none";
        e.preventDefault();
    }

    function onMouseMove(e) {
        if (!dragging || !win.isConnected)
            return;

        const left = Math.min(
            Math.max(0, e.clientX - dx),
            Math.max(0, innerWidth - win.offsetWidth)
        );

        const top = Math.min(
            Math.max(0, e.clientY - dy),
            Math.max(0, innerHeight - win.offsetHeight)
        );

        win.style.left = `${left}px`;
        win.style.top = `${top}px`;
    }

    function onMouseUp() {
        dragging = false;
        d.body.style.userSelect = "";
    }

    $("#mse-close").onclick = cleanup;
    toggleBtn.onclick = () => setMinimized(!minimized);

    titlebar.addEventListener("mousedown", onMouseDown);
    d.addEventListener("mousemove", onMouseMove);
    d.addEventListener("mouseup", onMouseUp);

    // Expose cleanup only so reinjecting or closing removes the injector cleanly.
    window.__melvorSaveEditorCleanup = cleanup;

    setStatus("Paste a save string and press Decode.");
})();
