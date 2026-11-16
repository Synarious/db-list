(function () {
    'use strict';

    const { categories } = DBList;

    // The order matches the original results page's precedence for conflicting legacy answers.
    const ratings = [
        ['favorite', 'Favorite'],
        ['like', 'Like'],
        ['maybe', 'Open to discussing'],
        ['not-interested', 'I’d rather skip this'],
        ['limit', 'Off the table'],
    ];
    const ratingOptions = [...ratings, ['', 'Left blank']];
    const labels = Object.fromEntries(ratingOptions);

    function ratingLabel(value, group) {
        return value === 'limit' && group === 'partner' ? 'Dealbreaker for me' : labels[value];
    }

    const answersKey = 'db-list.answers.v1';
    const backupFormat = 'deviant-bound-checklist';
    const backupVersion = 2;
    const perAnswerKey = id => 'db-list.answer.' + id;
    const legacyKey = (id, rating) => 'r_' + id + '-' + rating;
    const legacyRatings = ratings.map(([rating]) => rating).reverse();

    const choices = categories.flatMap(({ group, topics, advanced }) => topics.flatMap(({ choices }) =>
        choices.map(choice => ({ ...choice, group, advanced }))));
    const choiceMeanings = new Map(choices.map(({ id, group, prompt }) => [id, [group, prompt]]));
    const choiceIds = new Set(choiceMeanings.keys());
    const visibleChoiceIds = choices.filter(choice => DBList.advancedMode || !choice.advanced).map(choice => choice.id);
    if (choiceIds.size !== choices.length) throw new Error('Duplicate rating IDs in the checklist catalog.');
    const profileFields = ['name', 'role', 'kink', 'age', 'partnerMinAge', 'partnerMaxAge', 'imageTheme'];
    // These are the published v1 rating meanings. Keep them when relabeling a rating.
    const v1Labels = {
        favorite: 'Favorite', like: 'Like', maybe: 'Open to discussing',
        'not-interested': 'I’d rather skip this', limit: 'Off the table',
    };
    const mergedChoices = choices.filter(choice => choice.mergedIds);
    const mergedIds = new Set(mergedChoices.flatMap(choice => choice.mergedIds));
    const splitAnswers = new Map(
        ['vanilla', 'cuddling', 'kissing', 'sexting', 'voicesex', 'webcamsex', 'fantasyrp', 'roleplay']
            .map(id => ['shared-' + id, [id + '-r', id + '-g']])
    );
    // The original Giving column used "-r" for these rows, and Receiving used "-g".
    // Only the original radio keys need to be flipped. Newer keys use the current prompts.
    const originalRadioIds = new Map([...splitAnswers.values()].flatMap(([receive, give]) => [
        [receive, give], [give, receive],
    ]));
    const retiredIds = new Set([
        'rating-taller', 'rating-average', 'rating-livingnearby', 'shared-inperson', 'inperson-r', 'inperson-g',
        'paddle-r', 'rating-paddle', 'masculation-r', 'masculation-g', 'gimpfullbody-r', 'gimpfullbody-g',
        'analtoys', 'analtoys-r', 'analtoys-g', 'buttplug-r', 'buttplug-g',
    ]);
    const oldIds = new Set([
        ...mergedIds, ...splitAnswers.keys(), ...retiredIds,
        ...choices.flatMap(choice => [choice.id, ...(choice.previousIds ?? [])]),
    ]);

    function isKnownChoice(id) {
        return choiceIds.has(id) || mergedIds.has(id) || splitAnswers.has(id) || retiredIds.has(id);
    }

    function isRating(value) {
        return typeof value === 'string' && Object.hasOwn(labels, value);
    }

    function isRecord(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function readOldAnswer(storage, id, previousIds) {
        const saved = storage.getItem(perAnswerKey(id));
        if (saved !== null) return isRating(saved) ? saved : '';

        if (previousIds) {
            const [first, second] = previousIds.map(previous => readOldAnswer(storage, previous));
            return first === second ? first : '';
        }

        const radioId = originalRadioIds.get(id) ?? id;
        for (const rating of legacyRatings) {
            const legacy = storage.getItem(legacyKey(radioId, rating));
            try {
                if (JSON.parse(legacy)?.checked === true) return rating;
            } catch {
                // Ignore malformed legacy entries and check the next rating.
            }
        }
        return '';
    }

    function readOldAnswers(storage) {
        const answers = Object.create(null);
        for (const { id, previousIds } of choices) {
            const value = readOldAnswer(storage, id, previousIds);
            if (value) answers[id] = value;
        }
        for (const id of [...mergedIds, ...splitAnswers.keys()]) {
            const value = readOldAnswer(storage, id);
            if (value) answers[id] = value;
        }
        return migrateAnswers(answers);
    }

    function migrateAnswers(answers) {
        for (const { id, mergedIds } of mergedChoices) {
            const ratings = new Set(mergedIds.map(oldId => answers[oldId]).filter(Boolean));
            if (!answers[id] && ratings.size === 1) [answers[id]] = ratings;
            for (const oldId of mergedIds) delete answers[oldId];
        }
        for (const [oldId, newIds] of splitAnswers) {
            if (!answers[oldId]) continue;
            for (const id of newIds) answers[id] ??= answers[oldId];
            delete answers[oldId];
        }
        for (const id of retiredIds) delete answers[id];
        return answers;
    }

    function cleanProfile(data) {
        if (!isRecord(data)) throw new Error('Profile details must be an object.');
        const profile = {};
        if (typeof data.imageTheme === 'string' && Object.hasOwn(DBList.imageThemes, data.imageTheme)) {
            profile.imageTheme = data.imageTheme;
        }
        for (const key of ['name', 'role', 'kink']) {
            const value = data[key];
            if (value === undefined || value === '') continue;
            if (typeof value !== 'string' || value.length > 60 || /[\r\n]/.test(value)) {
                throw new Error('Name, role, and kink must each be 60 characters or fewer.');
            }
            if (value.trim()) profile[key] = value.trim();
        }
        for (const key of ['age', 'partnerMinAge', 'partnerMaxAge']) {
            const value = data[key];
            if (value === undefined) continue;
            if (!Number.isSafeInteger(value) || value < 18) throw new Error('Enter ages as whole numbers of 18 or older.');
            profile[key] = value;
        }
        if (profile.partnerMinAge > profile.partnerMaxAge) {
            throw new Error('The minimum partner age must be at or below the maximum.');
        }
        return profile;
    }

    function readProfilePatch(data, duplicateKeys) {
        const profile = {};
        let skipped = 0;
        if (!isRecord(data)) return { profile, skipped: data === undefined ? 0 : 1 };
        for (const [key, value] of Object.entries(data)) {
            if (duplicateKeys?.has(key) || !profileFields.includes(key)) {
                skipped++;
                continue;
            }
            try {
                const field = cleanProfile({ [key]: value });
                if (Object.hasOwn(field, key)) profile[key] = field[key];
                else skipped++;
            } catch {
                skipped++;
            }
        }
        if (profile.partnerMinAge > profile.partnerMaxAge) {
            delete profile.partnerMinAge;
            delete profile.partnerMaxAge;
            skipped += 2;
        }
        return { profile, skipped };
    }

    function profileLines({ name, role, kink, age, partnerMinAge, partnerMaxAge }) {
        let partnerAges;
        if (partnerMinAge && partnerMaxAge) {
            partnerAges = partnerMinAge === partnerMaxAge ? String(partnerMinAge) : partnerMinAge + '–' + partnerMaxAge;
        } else if (partnerMinAge) {
            partnerAges = partnerMinAge + '+';
        } else if (partnerMaxAge) {
            partnerAges = 'Up to ' + partnerMaxAge;
        }
        return [
            name && 'Name: ' + name,
            role && 'BDSM role: ' + role,
            kink && 'Kink: ' + kink,
            age && 'Age: ' + age,
            partnerAges && 'Partner ages: ' + partnerAges,
        ].filter(Boolean);
    }

    function checklistProgress(answers) {
        return { total: visibleChoiceIds.length, rated: visibleChoiceIds.filter(id => answers[id]).length };
    }

    function readChecklist(storage = localStorage, saved = storage.getItem(answersKey)) {
        if (saved === null) return { answers: readOldAnswers(storage), profile: {} };

        const data = JSON.parse(saved);
        if (!isRecord(data)) throw new Error('Invalid saved answers.');
        const wrapped = Object.hasOwn(data, 'answers');
        const savedAnswers = wrapped ? data.answers : data;
        if (!isRecord(savedAnswers)) throw new Error('Invalid saved answers.');
        const answers = Object.create(null);
        for (const [id, value] of Object.entries(savedAnswers)) {
            if (value && isKnownChoice(id) && isRating(value)) answers[id] = value;
        }
        const profile = wrapped ? readProfilePatch(data.profile).profile : {};
        return { answers: migrateAnswers(answers), profile };
    }

    function readAnswers() {
        return readChecklist().answers;
    }

    function removeOldAnswers(storage) {
        for (const id of oldIds) {
            storage.removeItem(perAnswerKey(id));
            for (const rating of legacyRatings) storage.removeItem(legacyKey(id, rating));
        }
    }

    async function updateAnswers(update) {
        // Keep the read and write together when multiple tabs edit the checklist.
        if (navigator.locks) return navigator.locks.request(answersKey, update);
        return update();
    }

    function editChecklist(edit) {
        return updateAnswers(() => {
            const storage = localStorage;
            const saved = storage.getItem(answersKey);
            const checklist = readChecklist(storage, saved);
            edit(checklist);
            storage.setItem(answersKey, JSON.stringify(checklist));
            if (saved === null) removeOldAnswers(storage);
        });
    }

    function saveAnswer(id, value) {
        return editChecklist(({ answers }) => {
            if (!choiceIds.has(id) || !isRating(value)) throw new Error('Invalid rating.');
            if (value) answers[id] = value;
            else delete answers[id];
        });
    }

    function saveProfile(profile) {
        return editChecklist(checklist => {
            checklist.profile = cleanProfile(profile);
        });
    }

    function importChecklist(patch) {
        return updateAnswers(() => {
            const storage = localStorage;
            const saved = storage.getItem(answersKey);
            const checklist = readChecklist(storage, saved);
            const report = { added: 0, matching: 0, conflicts: 0, skipped: patch.skipped };

            function fill(target, key, value) {
                if (!Object.hasOwn(target, key)) {
                    target[key] = value;
                    report.added++;
                } else if (target[key] === value) report.matching++;
                else report.conflicts++;
            }

            for (const [id, value] of Object.entries(patch.answers)) fill(checklist.answers, id, value);
            const min = checklist.profile.partnerMinAge ?? patch.profile.partnerMinAge;
            const max = checklist.profile.partnerMaxAge ?? patch.profile.partnerMaxAge;
            for (const [key, value] of Object.entries(patch.profile)) {
                if ((key === 'partnerMinAge' || key === 'partnerMaxAge') &&
                    !Object.hasOwn(checklist.profile, key) && min > max) report.conflicts++;
                else fill(checklist.profile, key, value);
            }
            if (report.added) storage.setItem(answersKey, JSON.stringify(checklist));
            return report;
        });
    }

    function clearAnswers() {
        return updateAnswers(() => {
            const storage = localStorage;
            removeOldAnswers(storage);
            storage.removeItem(answersKey);
        });
    }

    function createAnswerBackup() {
        const { answers, profile } = readChecklist();
        const entries = Object.entries(answers).map(([id, value]) => {
            const [group, prompt] = choiceMeanings.get(id);
            return { id, value, group, prompt, label: ratingLabel(value, group) };
        });
        return JSON.stringify({ format: backupFormat, version: backupVersion, profile, answers: entries }, null, 2) + '\n';
    }

    // Track duplicate members at their JSON paths after JSON.parse has validated the syntax.
    function findDuplicateMembers(text, root) {
        const duplicates = new WeakMap();
        const stack = [];
        const tokens = /("(?:[^"\\]|\\.)*")\s*(:)?|[{}\[\]]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g;
        for (const [token, key, colon] of text.matchAll(tokens)) {
            const parent = stack.at(-1);
            if (colon) {
                const name = JSON.parse(key);
                if (parent.seen.has(name) && isRecord(parent.value)) {
                    if (!duplicates.has(parent.value)) duplicates.set(parent.value, new Set());
                    duplicates.get(parent.value).add(name);
                }
                parent.seen.add(name);
                parent.key = name;
            } else if (token === '}' || token === ']') {
                stack.pop();
            } else {
                const value = parent && parent.value && Object.hasOwn(parent.value, parent.key)
                    ? parent.value[parent.key] : parent ? undefined : root;
                if (Array.isArray(parent?.value)) parent.key++;
                if (token === '{' || token === '[') {
                    stack.push({ value, key: 0, seen: new Set() });
                }
            }
        }
        return duplicates;
    }

    function parseAnswerBackup(text) {
        let backup;
        try {
            backup = JSON.parse(text);
        } catch {
            throw new Error('This file could not be read as JSON. Choose a checklist backup.');
        }
        if (backup?.format !== backupFormat) throw new Error('Choose a JSON backup exported from this checklist.');
        const legacy = backup.version === 1;
        if (!Number.isSafeInteger(backup.version) || backup.version < 1 ||
            !(legacy ? isRecord(backup.answers) : Array.isArray(backup.answers))) {
            throw new Error('This backup uses an unsupported format or is missing its answers.');
        }

        const duplicateMembers = findDuplicateMembers(text, backup);
        const duplicateEnvelope = duplicateMembers.get(backup);
        if (duplicateEnvelope?.has('format') || duplicateEnvelope?.has('version') || duplicateEnvelope?.has('answers')) {
            throw new Error('This backup repeats its format, version, or answer list.');
        }
        const { profile, skipped: invalidProfile } = duplicateEnvelope?.has('profile')
            ? { profile: {}, skipped: 1 }
            : readProfilePatch(backup.profile, duplicateMembers.get(backup.profile));
        const answers = Object.create(null);
        const seen = new Set();
        const duplicates = new Set(duplicateMembers.get(backup.answers));
        let skipped = invalidProfile;

        const entries = legacy ? Object.entries(backup.answers).map(([id, value]) => {
            const [group, prompt] = Object.hasOwn(DBList.backupV1Choices, id) ? DBList.backupV1Choices[id] : [];
            const label = value === 'limit' && group === 'partner' ? 'Dealbreaker for me' :
                typeof value === 'string' ? v1Labels[value] : undefined;
            return { id, value, group, prompt, label };
        }) : backup.answers;

        for (const entry of entries) {
            if (typeof entry?.id !== 'string') continue;
            if (seen.has(entry.id)) duplicates.add(entry.id);
            seen.add(entry.id);
        }
        for (const entry of entries) {
            const { id, value, group, prompt, label } = isRecord(entry) ? entry : {};
            const current = choiceMeanings.get(id);
            if (duplicateMembers.has(entry) || duplicates.has(id) || !current || current[0] !== group || current[1] !== prompt ||
                !value || !isRating(value) || label !== ratingLabel(value, group)) {
                skipped++;
                continue;
            }
            answers[id] = value;
        }
        return { answers, profile, skipped };
    }

    function isAnswerStorageEvent(event) {
        const { key, storageArea } = event;
        if (key === answersKey || key === null) return storageArea === localStorage;
        return (key.startsWith('db-list.answer.') || key.startsWith('r_')) &&
            storageArea === localStorage && localStorage.getItem(answersKey) === null;
    }

    Object.assign(DBList, {
        ratingOptions, ratingLabel, readAnswers, readChecklist, checklistProgress, saveAnswer, clearAnswers,
        cleanProfile, saveProfile, profileLines, importChecklist,
        createAnswerBackup, parseAnswerBackup, isAnswerStorageEvent,
    });
})();
