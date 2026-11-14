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
    const backupVersion = 1;
    const perAnswerKey = id => 'db-list.answer.' + id;
    const legacyKey = (id, rating) => 'r_' + id + '-' + rating;
    const legacyRatings = ratings.map(([rating]) => rating).reverse();

    const choices = categories.flatMap(category => category.topics.flatMap(topic => topic.choices));
    const choiceIds = new Set(choices.map(choice => choice.id));
    const oldIds = new Set(choices.flatMap(choice => [choice.id, ...(choice.previousIds ?? [])]));

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

        for (const rating of legacyRatings) {
            const legacy = storage.getItem(legacyKey(id, rating));
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
        return answers;
    }

    function readAnswers(storage = localStorage, saved = storage.getItem(answersKey)) {
        if (saved === null) return readOldAnswers(storage);

        const data = JSON.parse(saved);
        if (!isRecord(data)) throw new Error('Invalid saved answers.');
        const answers = Object.create(null);
        for (const [id, value] of Object.entries(data)) {
            if (!value || !choiceIds.has(id) || !isRating(value)) throw new Error('Invalid saved rating.');
            answers[id] = value;
        }
        return answers;
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

    function saveAnswer(id, value) {
        return updateAnswers(() => {
            if (!choiceIds.has(id) || !isRating(value)) throw new Error('Invalid rating.');

            const storage = localStorage;
            const saved = storage.getItem(answersKey);
            const answers = readAnswers(storage, saved);
            if (value) answers[id] = value;
            else delete answers[id];
            storage.setItem(answersKey, JSON.stringify(answers));
            if (saved === null) removeOldAnswers(storage);
        });
    }

    function replaceAnswers(answers) {
        return updateAnswers(() => {
            const storage = localStorage;
            storage.setItem(answersKey, JSON.stringify(answers));
            removeOldAnswers(storage);
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
        const answers = readAnswers();
        return JSON.stringify({ format: backupFormat, version: backupVersion, answers }, null, 2) + '\n';
    }

    function parseAnswerBackup(text) {
        let backup;
        try {
            backup = JSON.parse(text);
        } catch {
            throw new Error('This file could not be read as JSON. Choose a checklist backup.');
        }
        if (backup?.format !== backupFormat) throw new Error('Choose a JSON backup exported from this checklist.');
        if (backup.version !== backupVersion) throw new Error('This backup uses an unsupported version.');
        if (!isRecord(backup.answers)) throw new Error('This backup is missing its answer data.');

        const answers = Object.create(null);
        for (const [id, value] of Object.entries(backup.answers)) {
            if (!choiceIds.has(id)) throw new Error('This backup contains a question this version of the checklist does not recognize.');
            if (!isRating(value)) throw new Error('This backup contains an invalid rating.');
            if (value) answers[id] = value;
        }
        return answers;
    }

    function isAnswerStorageEvent(event) {
        const { key, storageArea } = event;
        if (key === answersKey || key === null) return storageArea === localStorage;
        return (key.startsWith('db-list.answer.') || key.startsWith('r_')) &&
            storageArea === localStorage && localStorage.getItem(answersKey) === null;
    }

    Object.assign(DBList, {
        ratingOptions, ratingLabel, readAnswers, saveAnswer, clearAnswers, replaceAnswers,
        createAnswerBackup, parseAnswerBackup, isAnswerStorageEvent,
    });
})();
