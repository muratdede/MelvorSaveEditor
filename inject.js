(() => {
    const d = document;

    const div = d.createElement("div");
    div.style = `
        position:fixed;
        top:80px;
        left:80px;
        width:min(900px, calc(100vw - 40px));
        height:min(750px, calc(100vh - 40px));
        z-index:999999;
        background:#111;
        border:1px solid #444;
        border-radius:8px;
        box-shadow:0 10px 35px rgba(0,0,0,.55);
        display:flex;
        flex-direction:column;
        overflow:hidden;
        resize:both;
        min-width:420px;
        min-height:320px;
        font-family:Arial,sans-serif;
    `;

    div.innerHTML = `
        <div id="titlebar" style="
            height:34px;
            min-height:34px;
            padding:0 6px 0 10px;
            display:flex;
            align-items:center;
            justify-content:space-between;
            background:#222;
            color:#eee;
            cursor:move;
            user-select:none;
            border-bottom:1px solid #444;
        ">
            <span>Melvor Save JSON Editor</span>
            <button id="close" title="Close" style="
                width:28px;
                height:28px;
                border:0;
                border-radius:5px;
                background:transparent;
                color:#ddd;
                font-size:20px;
                line-height:20px;
                cursor:pointer;
            ">×</button>
        </div>

        <div style="
            padding:10px;
            display:flex;
            flex-direction:column;
            gap:5px;
            flex:1;
            min-height:0;
        ">
            <textarea id="save" placeholder="Save String" style="height:20%;min-height:50px"></textarea>
            <button id="decode">Decode</button>

            <textarea id="json" style="flex:1;min-height:80px"></textarea>

            <button id="encode">Encode</button>
            <textarea id="output" placeholder="New Save String" style="height:20%;min-height:50px"></textarea>
        </div>
    `;

    d.body.appendChild(div);

    const save = div.querySelector("#save");
    const json = div.querySelector("#json");
    const output = div.querySelector("#output");
    const decodeBtn = div.querySelector("#decode");
    const encodeBtn = div.querySelector("#encode");
    const closeBtn = div.querySelector("#close");
    const titlebar = div.querySelector("#titlebar");

    let dragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    titlebar.addEventListener("mousedown", e => {
        if (e.target.closest("#close"))
            return;

        dragging = true;

        const rect = div.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;

        document.body.style.userSelect = "none";
        e.preventDefault();
    });

    d.addEventListener("mousemove", e => {
        if (!dragging)
            return;

        const maxLeft = Math.max(0, window.innerWidth - div.offsetWidth);
        const maxTop = Math.max(0, window.innerHeight - div.offsetHeight);

        const left = Math.min(
            Math.max(0, e.clientX - dragOffsetX),
            maxLeft
        );

        const top = Math.min(
            Math.max(0, e.clientY - dragOffsetY),
            maxTop
        );

        div.style.left = `${left}px`;
        div.style.top = `${top}px`;
    });

    d.addEventListener("mouseup", () => {
        if (!dragging)
            return;

        dragging = false;
        document.body.style.userSelect = "";
    });

    function snap(value, seen = new WeakSet(), depth = 0) {
        if (value == null)
            return value;

        if (
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean"
        )
            return value;

        if (
            typeof value === "undefined" ||
            typeof value === "function"
        )
            return undefined;

        if (value === game)
            return undefined;

        if (depth > 10)
            return undefined;

        if (typeof value === "object") {
            if (seen.has(value))
                return undefined;

            seen.add(value);
        }

        if (value instanceof Map) {
            return {
                __type: "Map",
                entries: [...value.entries()].map(([k, v]) => [
                    snap(k, seen, depth + 1),
                    snap(v, seen, depth + 1)
                ])
            };
        }

        if (value instanceof Set) {
            return {
                __type: "Set",
                values: [...value].map(v =>
                    snap(v, seen, depth + 1)
                )
            };
        }

        if (Array.isArray(value)) {
            return value.map(v =>
                snap(v, seen, depth + 1)
            );
        }

        if (
            depth > 0 &&
            typeof value.id === "string" &&
            (
                value.namespace !== undefined ||
                value.localID !== undefined
            )
        ) {
            return {
                __ref: value.id
            };
        }

        const className =
            value.constructor?.name ?? "";

        if (
            className.includes("Registry") ||
            className === "NamespaceMap" ||
            className === "NamespaceRegistry"
        )
            return undefined;

        const out = {};

        for (const key of Object.keys(value)) {
            if (
                key === "game" ||
                key === "_game" ||
                key === "renderQueue" ||
                key === "registeredNamespaces" ||
                key === "dummyNamespaces"
            )
                continue;

            try {
                const v = snap(
                    value[key],
                    seen,
                    depth + 1
                );

                if (v !== undefined)
                    out[key] = v;

            } catch {}
        }

        return out;
    }

    function snapshotSaveData() {
        return {
            tickTimestamp:
                game.tickTimestamp,

            saveTimestamp:
                game.saveTimestamp,

            activeAction:
                game.activeAction
                    ? { __ref: game.activeAction.id }
                    : null,

            pausedAction:
                game.pausedAction
                    ? { __ref: game.pausedAction.id }
                    : null,

            _isPaused:
                game._isPaused,

            merchantsPermitRead:
                game.merchantsPermitRead,

            currentGamemode:
                game.currentGamemode
                    ? { __ref: game.currentGamemode.id }
                    : null,

            characterName:
                game.characterName,

            bank:
                snap(game.bank),

            combat:
                snap(game.combat),

            golbinRaid:
                snap(game.golbinRaid),

            minibar:
                snap(game.minibar),

            petManager:
                snap(game.petManager),

            shop:
                snap(game.shop),

            itemCharges:
                snap(game.itemCharges),

            tutorial:
                snap(game.tutorial),

            potions:
                snap(game.potions),

            stats:
                snap(game.stats),

            settings:
                snap(game.settings),

            readNewsIDs:
                snap(game.readNewsIDs),

            lastLoadedGameVersion:
                game.lastLoadedGameVersion,

            completion:
                snap(game.completion),

            keyboard:
                snap(game.keyboard),

            birthdayEvent2023CompletionTracker:
                snap(game.birthdayEvent2023CompletionTracker),

            clueHunt:
                snap(game.clueHunt),

            activeLevelCapIncreases:
                game.activeLevelCapIncreases.map(x => ({
                    __ref: x.id
                })),

            levelCapIncreasesBeingSelected:
                game.levelCapIncreasesBeingSelected.map(x => ({
                    __ref: x.id
                })),

            _levelCapIncreasesBought:
                game._levelCapIncreasesBought,

            _abyssalLevelCapIncreasesBought:
                game._abyssalLevelCapIncreasesBought,

            currentRealm:
                game.currentRealm
                    ? { __ref: game.currentRealm.id }
                    : null,

            skills:
                game.skills.allObjects.map(skill => ({
                    id: skill.id,
                    data: snap(skill)
                })),

            currencies:
                game.currencies.allObjects.map(currency => ({
                    id: currency.id,
                    data: snap(currency)
                })),

            abyssDepths:
                game.abyssDepths.allObjects.map(x => ({
                    id: x.id,
                    timesCompleted: x.timesCompleted
                })),

            strongholds:
                game.strongholds.allObjects.map(x => ({
                    id: x.id,
                    timesCompleted: x.timesCompleted
                }))
        };
    }

    function apply(target, source) {
        if (!target || !source)
            return;

        for (const key of Object.keys(source)) {
            const s = source[key];
            const t = target[key];

            if (
                s &&
                typeof s === "object" &&
                s.__ref
            )
                continue;

            if (
                s &&
                s.__type === "Map" &&
                t instanceof Map
            ) {
                const oldEntries = [...t.entries()];

                s.entries.forEach(([sk, sv], i) => {
                    if (!oldEntries[i])
                        return;

                    const [oldKey, oldValue] =
                        oldEntries[i];

                    if (
                        oldValue &&
                        sv &&
                        typeof oldValue === "object" &&
                        typeof sv === "object"
                    ) {
                        apply(oldValue, sv);
                    } else {
                        t.set(oldKey, sv);
                    }
                });

                continue;
            }

            if (
                s &&
                s.__type === "Set" &&
                t instanceof Set
            )
                continue;

            if (
                Array.isArray(s) &&
                Array.isArray(t)
            ) {
                for (let i = 0; i < s.length; i++) {
                    if (
                        t[i] &&
                        s[i] &&
                        typeof t[i] === "object" &&
                        typeof s[i] === "object"
                    ) {
                        apply(t[i], s[i]);
                    } else {
                        t[i] = s[i];
                    }
                }

                continue;
            }

            if (
                s !== null &&
                t !== null &&
                typeof s === "object" &&
                typeof t === "object"
            ) {
                apply(t, s);
            } else {
                target[key] = s;
            }
        }
    }

    function applySaveData(data) {
        const simpleFields = [
            "tickTimestamp",
            "saveTimestamp",
            "_isPaused",
            "merchantsPermitRead",
            "characterName",
            "readNewsIDs",
            "lastLoadedGameVersion",
            "birthdayEvent2023CompletionTracker",
            "_levelCapIncreasesBought",
            "_abyssalLevelCapIncreasesBought"
        ];

        for (const key of simpleFields) {
            if (key in data)
                game[key] = data[key];
        }

        if (data.activeAction === null) {
            game.activeAction = undefined;
        } else if (data.activeAction?.__ref) {
            game.activeAction =
                game.activeActions.getObjectByID(
                    data.activeAction.__ref
                );
        }

        if (data.pausedAction === null) {
            game.pausedAction = undefined;
        } else if (data.pausedAction?.__ref) {
            game.pausedAction =
                game.activeActions.getObjectByID(
                    data.pausedAction.__ref
                );
        }

        if (data.currentGamemode?.__ref) {
            const obj =
                game.gamemodes.getObjectByID(
                    data.currentGamemode.__ref
                );

            if (obj)
                game.currentGamemode = obj;
        }

        if (data.currentRealm?.__ref) {
            const obj =
                game.realms.getObjectByID(
                    data.currentRealm.__ref
                );

            if (obj)
                game.currentRealm = obj;
        }

        const objects = [
            "bank",
            "combat",
            "golbinRaid",
            "minibar",
            "petManager",
            "shop",
            "itemCharges",
            "tutorial",
            "potions",
            "stats",
            "settings",
            "completion",
            "keyboard",
            "clueHunt"
        ];

        for (const key of objects) {
            if (data[key])
                apply(game[key], data[key]);
        }

        for (const entry of data.skills ?? []) {
            const skill =
                game.skills.getObjectByID(entry.id);

            if (skill)
                apply(skill, entry.data);
        }

        for (const entry of data.currencies ?? []) {
            const currency =
                game.currencies.getObjectByID(entry.id);

            if (currency)
                apply(currency, entry.data);
        }

        for (const entry of data.abyssDepths ?? []) {
            const depth =
                game.abyssDepths.getObjectByID(entry.id);

            if (depth)
                depth.timesCompleted =
                    entry.timesCompleted;
        }

        for (const entry of data.strongholds ?? []) {
            const stronghold =
                game.strongholds.getObjectByID(entry.id);

            if (stronghold)
                stronghold.timesCompleted =
                    entry.timesCompleted;
        }

        if (data.activeLevelCapIncreases) {
            game.activeLevelCapIncreases =
                data.activeLevelCapIncreases
                    .map(x =>
                        game.skillLevelCapIncreases
                            .getObjectByID(x.__ref)
                    )
                    .filter(Boolean);
        }

        if (data.levelCapIncreasesBeingSelected) {
            game.levelCapIncreasesBeingSelected =
                data.levelCapIncreasesBeingSelected
                    .map(x =>
                        game.skillLevelCapIncreases
                            .getObjectByID(x.__ref)
                    )
                    .filter(Boolean);
        }
    }

    decodeBtn.onclick = () => {
        try {
            const reader =
                new SaveWriter("Read", 1);

            const saveVersion =
                reader.setDataFromSaveString(
                    save.value.trim()
                );

            game.decode(
                reader,
                saveVersion
            );

            const data =
                snapshotSaveData();

            json.value =
                JSON.stringify(
                    data,
                    null,
                    2
                );

            console.log(
                "JSON size:",
                json.value.length
            );

        } catch (e) {
            console.error(e);
            alert(e.stack || e);
        }
    };

    encodeBtn.onclick = () => {
        try {
            const data =
                JSON.parse(json.value);

            applySaveData(data);

            output.value =
                game.generateSaveString();

        } catch (e) {
            console.error(e);
            alert(e.stack || e);
        }
    };

    closeBtn.onclick =
        () => div.remove();
})();