const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

function openChecklist(route = 'index.html', stored = new Map()) {
    const localStorage = {
        getItem: key => stored.get(key) ?? null,
        setItem: (key, value) => stored.set(key, value),
        removeItem: key => stored.delete(key),
    };
    const context = vm.createContext({
        location: new URL(route, 'https://checklist.test/'), localStorage, navigator: {},
        URL, URLSearchParams, TextEncoder, TextDecoder, atob, btoa, crypto: webcrypto,
    });
    for (const script of ['catalog', 'advanced-expansion', 'advanced-catalog', 'image-themes', 'backup-v1', 'answers',
        'share-links', 'comparison-evidence', 'compatibility']) {
        const filename = path.join(__dirname, '../js', script + '.js');
        vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
    }
    return vm.runInContext('DBList', context);
}

test('every rating survives a backup restore and a shared URL for every question', async () => {
    const app = openChecklist('index.html?mode=advanced&fantasy=1');
    const choices = app.visibleCategories.flatMap(category => category.topics.flatMap(topic => topic.choices));
    for (const [value] of app.ratingOptions.filter(([value]) => value)) {
        for (const choice of choices) await app.saveAnswer(choice.id, value);
        const saved = app.readAnswers();
        assert.equal(Object.keys(saved).length, choices.length);
        const backup = app.parseAnswerBackup(app.createAnswerBackup());
        assert.equal(backup.skipped, 0);
        const stored = new Map();
        await openChecklist('profiles.html', stored).importChecklist(backup);
        const restored = openChecklist('index.html', stored);
        assert.deepEqual(restored.readAnswers(), saved);
        assert.ok(restored.advancedMode && restored.showFantasy);
        const url = new URL(app.createChecklistShareUrl());
        assert.deepEqual(openChecklist(url.href).parseChecklistShareHash(url.hash).answers, saved);
    }
});

test('new share URLs include saved gender and partner preference even after a prior opt-out', async () => {
    for (const sharingPreference of [{}, { shareGender: 'no' }]) {
        const app = openChecklist();
        await app.saveQuestionPreferences({ gender: 'unspecified', partnerGender: 'anyone', ...sharingPreference });

        const url = new URL(app.createChecklistShareUrl());
        const { profile } = openChecklist(url.href).parseChecklistShareHash(url.hash);
        assert.equal(profile.gender, 'unspecified');
        assert.equal(profile.partnerGender, 'anyone');
        assert.equal(profile.shareGender, 'yes');
    }
});

test('themes survive backup and restore while retired details stay out of results and shares', async () => {
    const stored = new Map([['db-list.answers.v1', JSON.stringify({
        questionVersion: 2, answers: {}, profile: { imageTheme: 'plum', kink: 'Old detail', partnerMinAge: 25, partnerMaxAge: 40 },
    })]]);
    const app = openChecklist('index.html', stored);
    assert.equal(app.readChecklist().profile.imageTheme, 'plum');

    for (const imageTheme of ['blood-velvet', 'violet-nocturne', 'rosewater', 'porcelain']) {
        await app.saveProfile({ name: 'Alex', imageTheme });
        const { profile } = app.readChecklist();
        assert.equal(profile.imageTheme, imageTheme);
        assert.equal(profile.kink, 'Old detail');
        assert.deepEqual(Array.from(app.profileLines(profile)), ['Name: Alex']);

        const restored = openChecklist();
        const backup = restored.parseAnswerBackup(app.createAnswerBackup());
        await restored.importChecklist(backup);
        assert.equal(restored.readChecklist().profile.imageTheme, imageTheme);

        const shared = app.parseChecklistShareHash(new URL(app.createChecklistShareUrl()).hash);
        assert.deepEqual(Object.keys(shared.profile), ['name']);
    }
});

test('ambiguous old answers stay unrated and recovery requires consent', async () => {
    const key = 'db-list.answers.v1';
    const stored = new Map([[key, JSON.stringify({ 'shared-cuddling': 'like' })]]);
    const app = openChecklist('profiles.html', stored);
    assert.equal(Object.keys(app.readAnswers()).length, 0);
    const patch = { answers: { 'rating-dominate': 'like' }, profile: {}, skipped: 0 };
    stored.set(key, '{');
    assert.equal(await app.importChecklist(patch, () => false), null);
    assert.equal(stored.get(key), '{');
    await app.importChecklist(patch, () => true);
    assert.equal(app.readAnswers()['rating-dominate'], 'like');
});

test('importing into a new profile preserves the original ratings and settings', async () => {
    const source = openChecklist();
    await source.saveAnswer('rating-dominate', 'favorite');
    await source.saveProfile({ name: 'Results name', imageTheme: 'plum' });

    const stored = new Map([
        ['db-list.checklist-mode', 'advanced'],
        ['db-list.answer.rating-dominate', 'like'],
        ['db-list.answer.rating-submissive', 'maybe'],
    ]);
    const app = openChecklist('profiles.html', stored);
    const original = app.getSavedProfiles().profiles[0];
    const backup = app.parseAnswerBackup(source.createAnswerBackup());
    await app.addSavedProfile('  Imported copy  ', backup);

    const reopened = openChecklist('index.html', stored);
    const { activeId, profiles } = reopened.getSavedProfiles();
    assert.notEqual(activeId, original.id);
    assert.equal(profiles.find(profile => profile.id === activeId).name, 'Imported copy');
    assert.deepEqual(Object.entries(reopened.readAnswers()), [['rating-dominate', 'favorite']]);
    assert.equal(reopened.readChecklist().profile.name, 'Results name');
    assert.equal(reopened.readChecklist().profile.imageTheme, 'plum');

    await reopened.selectSavedProfile(original.id);
    assert.equal(reopened.readAnswers()['rating-dominate'], 'like');
    assert.equal(reopened.readAnswers()['rating-submissive'], 'maybe');
    assert.equal(reopened.readChecklist().profile.mode, 'advanced');
});

test('saved profiles keep their own data and original dates across switches and reloads', async () => {
    const stored = new Map([
        ['db-list.checklist-mode', 'advanced'],
        ['db-list.answer.rating-dominate', 'like'],
    ]);
    const app = openChecklist('profiles.html', stored);
    const original = app.getSavedProfiles().profiles[0];
    assert.equal(original.createdAt, null);

    await app.addSavedProfile('  Private name  ');
    const { activeId, profiles } = app.getSavedProfiles();
    const created = profiles.find(profile => profile.id === activeId);
    assert.equal(created.name, 'Private name');
    assert.ok(Number.isFinite(Date.parse(created.createdAt)));
    assert.equal(Object.keys(app.readAnswers()).length, 0);
    assert.equal(openChecklist('index.html', stored).advancedMode, false);
    await app.saveAnswer('rating-dominate', 'favorite');
    await app.saveProfile({ name: 'Results name', imageTheme: 'plum' });
    await app.renameSavedProfile(activeId, 'Renamed privately');

    await app.selectSavedProfile(original.id);
    assert.equal(app.readAnswers()['rating-dominate'], 'like');
    assert.equal(openChecklist('index.html', stored).advancedMode, true);
    assert.equal(app.readChecklist().profile.name, undefined);
    await app.selectSavedProfile(activeId);

    const reopened = openChecklist('index.html', stored);
    assert.equal(reopened.getSavedProfiles().activeId, activeId);
    const renamed = reopened.getSavedProfiles().profiles.find(profile => profile.id === activeId);
    assert.equal(renamed.name, 'Renamed privately');
    assert.equal(renamed.createdAt, created.createdAt);
    assert.equal(reopened.readAnswers()['rating-dominate'], 'favorite');
    assert.equal(reopened.readChecklist().profile.imageTheme, 'plum');
    assert.equal(reopened.parseAnswerBackup(reopened.createAnswerBackup()).profile.name, 'Results name');
    assert.equal(reopened.parseChecklistShareHash(new URL(reopened.createChecklistShareUrl()).hash).profile.name, 'Results name');
    assert.ok(!reopened.createAnswerBackup().includes(renamed.name));

    const scopedBackup = reopened.parseAnswerBackup(reopened.createAnswerBackup(original.id));
    assert.equal(scopedBackup.answers['rating-dominate'], 'like');
    assert.equal(scopedBackup.profile.mode, 'advanced');
    assert.equal(scopedBackup.profile.name, undefined);
    const scopedUrl = new URL(reopened.createChecklistShareUrl(original.id));
    assert.ok(openChecklist(scopedUrl.href).advancedMode);
    assert.equal(reopened.parseChecklistShareHash(scopedUrl.hash).answers['rating-dominate'], 'like');
    assert.equal(reopened.getSavedProfiles().activeId, activeId);

    await reopened.removeSavedProfile(activeId);
    assert.equal(reopened.getSavedProfiles().activeId, original.id);
    await reopened.removeSavedProfile(original.id);
    assert.equal(reopened.getSavedProfiles().profiles.length, 0);
    assert.equal(Object.keys(reopened.readAnswers()).length, 0);
    await reopened.saveAnswer('rating-dominate', 'like');
    assert.ok(Number.isFinite(Date.parse(reopened.getSavedProfiles().profiles[0].createdAt)));
    await reopened.addSavedProfile('Temporary');
    await reopened.clearAnswers();
    assert.equal(reopened.getSavedProfiles().profiles.length, 0);
    assert.equal(Object.keys(reopened.readAnswers()).length, 0);
});

test('comparison matches complementary fluid and anatomy roles for the actual partner', () => {
    const app = openChecklist();
    const ownAnswers = {
        'adv-detail-cum-play-give': 'favorite',
        'adv-detail-menses-receive': 'like',
        'adv-detail-clit-stimulation-partner': 'favorite',
        'adv-detail-cock-play-worship-follow': 'like',
    };
    const otherAnswers = {
        'adv-detail-cum-play-receive': 'like',
        'adv-detail-menses-give': 'maybe',
        'adv-detail-clit-stimulation-self': 'willing-to-try',
        'adv-detail-cock-play-worship-lead': 'like',
    };
    // Saved question preferences can describe a different partner than the person being compared.
    const ownProfile = { gender: 'male', partnerGender: 'male' };
    const otherProfile = { gender: 'female', partnerGender: 'female' };
    const { rows, matches, total } = app.compareChecklists(ownAnswers, otherAnswers, 'standard', { ownProfile, otherProfile });
    assert.equal(total, 4);
    assert.equal(matches, 3);
    assert.ok(rows.matches.some(row => row.title === 'Semen-related Interests'));
    assert.ok(rows.matches.some(row => row.title === 'Penis Worship'));
    assert.equal(rows.tentativeMatches.length, 1);
    assert.equal(rows.tentativeMatches[0].title, 'Menstrual Fluid');
    assert.equal(rows.unanswered.length, 0);

    const reversed = app.compareChecklists(otherAnswers, ownAnswers, 'standard',
        { ownProfile: otherProfile, otherProfile: ownProfile });
    assert.equal(reversed.matches, matches);
    assert.equal(reversed.total, total);
    assert.equal(reversed.rows.tentativeMatches[0].own.id, rows.tentativeMatches[0].other.id);
});

test('comparison keeps missing roles, context, and shared boundaries outside the score', () => {
    const app = openChecklist();
    const ownAnswers = {
        'adv-detail-menses-give': 'like',
        'adv-detail-cum-play-give': 'like',
        'adv-detail-lactation-receive': 'like',
        'adv-detail-watersports-give': 'limit',
        'adv-detail-bukkake-give': 'like',
        'adv-detail-muscular': 'like',
    };
    const otherAnswers = {
        'adv-detail-menses-receive': 'like',
        'adv-detail-lactation-give': 'limit',
        'adv-detail-watersports-receive': 'not-interested',
        'adv-detail-bukkake-receive': 'like',
        'adv-detail-muscular': 'like',
    };
    const profiles = { ownProfile: { gender: 'male' }, otherProfile: { gender: 'female' } };
    const { rows, matches, conflicts, total } = app.compareChecklists(ownAnswers, otherAnswers, 'relaxed', profiles);
    assert.equal(total, 1);
    assert.equal(matches, 0);
    assert.equal(conflicts, 1);
    assert.equal(rows.limits[0].title, 'Lactation');
    assert.equal(rows.applicability[0].title, 'Menstrual Fluid');
    assert.equal(rows.unanswered[0].title, 'Semen-related Interests');
    assert.equal(rows.boundaries[0].title, 'Urine-related Interests');
    assert.equal(rows.context.length, 1);
    assert.equal(rows.partner[0].title, 'Muscular');
    assert.equal(app.compareChecklists(ownAnswers, otherAnswers, 'relaxed').rows.applicability.length, 0);
});

test('comparison uses stated self roles for partner role preferences and treats Skip as a decline', () => {
    const app = openChecklist();
    const ownAnswers = { 'rating-withadom': 'favorite', 'strapon-r': 'like', 'peggingpiv-r': 'like' };
    const otherAnswers = { 'rating-dominate': 'maybe', 'strapon-g': 'not-interested', 'peggingpiv-g': 'like' };
    const profiles = { ownProfile: { gender: 'male' }, otherProfile: { gender: 'female' } };
    const { rows, matches, conflicts } = app.compareChecklists(ownAnswers, otherAnswers, 'standard', profiles);
    assert.equal(matches, 1);
    assert.equal(conflicts, 1);
    assert.equal(rows.tentativeMatches[0].title, 'Dominant Partner');
    assert.equal(rows.matches[0].title, 'Vaginal Strap-on Play');
    assert.equal(rows.differences[0].title, 'Strap-on');
    const skipAndMaybe = app.compareChecklists({ 'strapon-r': 'maybe' }, { 'strapon-g': 'not-interested' });
    assert.equal(skipAndMaybe.conflicts, 1);
    assert.equal(app.compareChecklists(ownAnswers, otherAnswers, 'strict', profiles).matches, 1);
});

test('interest levels change the selected overlap and preserve the meaning of every rating', () => {
    const app = openChecklist();
    const ownAnswers = {
        'shibari-g': 'favorite',
        'rating-spanked': 'willing-to-try',
        'rating-spanking': 'like',
        'rating-mono': 'favorite',
        'rating-poly': 'maybe',
        'rating-swinging': 'not-interested',
        'adv-plan-in-person': 'not-interested',
        'adv-plan-voice': 'limit',
    };
    const otherAnswers = {
        'shibari-r': 'like',
        'rating-spanking': 'favorite',
        'rating-spanked': 'not-interested',
        'rating-mono': 'maybe',
        'rating-poly': 'limit',
        'rating-swinging': 'limit',
    };
    for (const [mode, expected] of [['strict', 1], ['standard', 2], ['relaxed', 3]]) {
        const { matches, confirmedMatches, conflicts, total, rows } = app.compareChecklists(ownAnswers, otherAnswers, mode);
        assert.equal(matches, expected);
        assert.equal(confirmedMatches, 2);
        assert.equal(conflicts, 2);
        assert.equal(total, 5);
        assert.equal(rows.matches.find(row => row.title === 'Shibari').eligible, true);
        assert.equal(rows.matches.find(row => row.title === 'Shibari').exact, false);
        assert.equal(rows.tentativeMatches[0].title, 'Monogamous');
        assert.equal(rows.limits[0].title, 'Polyamorous');
        assert.equal(rows.boundaries[0].title, 'Swinging');
        assert.equal(rows.declinedWithoutCounterpart[0].title, 'In-person Planning');
        assert.equal(rows.unansweredLimits[0].title, 'Voice Planning');
    }
});

test('Foreskin Worship compares an explicit receiving rating and leaves it blank when absent', () => {
    const app = openChecklist();
    const ownAnswers = { 'adv-detail-foreskin-worship': 'like' };
    const otherAnswers = {
        'adv-detail-foreskin-worship-receive': 'willing-to-try',
        'adv-detail-cock-play-worship-follow': 'favorite',
    };
    const profiles = { ownProfile: { gender: 'female' }, otherProfile: { gender: 'male' } };
    const compared = app.compareChecklists(ownAnswers, otherAnswers, 'standard', profiles);
    assert.equal(compared.rows.matches.find(row => row.title === 'Foreskin Worship').otherRating, 'willing-to-try');
    delete otherAnswers['adv-detail-foreskin-worship-receive'];
    const missing = app.compareChecklists(ownAnswers, otherAnswers, 'relaxed', profiles);
    assert.equal(missing.rows.unanswered.find(row => row.title === 'Foreskin Worship').otherRating, '');
});

test('related evidence preserves scope and leaves ambiguous age bands for review', () => {
    const app = openChecklist();
    const ownAnswers = { 'rating-withaswitch': 'favorite', 'adv-detail-18-22': 'like', 'adv-detail-22-26': 'limit' };
    const otherAnswers = {
        'adv-switch-scene': 'willing-to-try',
        'adv-detail-rope-play-self': 'like',
        'shibari-r': 'limit',
    };
    const getEvidence = (age, mode) => app.compareChecklists(ownAnswers, otherAnswers, mode, { otherProfile: { age } });
    const compared = getEvidence(22, 'standard');
    assert.match(compared.evidence.find(row => row.title === 'Switch Partner').own.text, /within a scene/);
    assert.equal(compared.rows.partner.find(row => row.title === 'Switch Partner').otherRating, '');
    assert.match(compared.evidence.find(row => row.title === 'Adult age preferences').own.text, /overlapping age bands/);
    assert.match(compared.evidence.find(row => row.title === 'General Rope Play and Shibari').other.text, /specific Shibari rating applies/);
    assert.match(getEvidence(24, 'standard').evidence.find(row => row.title === 'Adult age preferences').own.text, /Dealbreaker/);
    assert.deepEqual(getEvidence(22, 'strict').evidence, getEvidence(22, 'relaxed').evidence);
    assert.equal(getEvidence(undefined, 'standard').evidence.some(row => row.title === 'Adult age preferences'), false);
});

test('one-partner ratings refer to the other person’s gender and count as a single pairing', () => {
    const app = openChecklist();
    const man = { gender: 'male' };
    const woman = { gender: 'female' };
    const ownAnswers = { 'adv-detail-you-with-1-female': 'favorite', 'adv-detail-you-with-1-male': 'limit' };
    const otherAnswers = { 'adv-detail-you-with-1-male': 'like' };
    const compared = app.compareChecklists(ownAnswers, otherAnswers, 'strict', { ownProfile: man, otherProfile: woman });
    assert.equal(compared.total, 1);
    assert.equal(compared.matches, 1);
    assert.equal(compared.pairing.own.id, 'adv-detail-you-with-1-female');
    assert.equal(compared.pairing.other.id, 'adv-detail-you-with-1-male');
    assert.equal(compared.rows.contextualLimits[0].otherUsed, true);
    assert.equal(compared.details.includes(compared.pairing), false);

    const reversed = app.compareChecklists(otherAnswers, ownAnswers, 'standard', { ownProfile: woman, otherProfile: man });
    assert.equal(reversed.pairing.own.id, compared.pairing.other.id);
    assert.equal(reversed.pairing.result, compared.pairing.result);
    const sameGender = app.compareChecklists(ownAnswers, otherAnswers, 'standard', { ownProfile: man, otherProfile: man });
    assert.equal(sameGender.pairing.own.id, sameGender.pairing.other.id);
    assert.equal(sameGender.pairing.result, 'limits');
    const differentScenario = app.compareChecklists(ownAnswers, { 'adv-detail-you-with-2-males': 'like' },
        'standard', { ownProfile: man, otherProfile: woman });
    assert.equal(differentScenario.pairing.result, 'unanswered');
    assert.equal(differentScenario.rows.context[0].title, 'Two or More Male Partners');
    assert.equal(app.compareChecklists(ownAnswers, otherAnswers).pairing, undefined);
});

test('one activity topic keeps both directions and their independent results', () => {
    const app = openChecklist();
    const { details } = app.compareChecklists(
        { 'shibari-r': 'willing-to-try', 'shibari-g': 'like', 'rating-dominate': 'like', 'rating-submissive': 'like' },
        { 'shibari-g': 'limit', 'shibari-r': 'like', 'rating-dominate': 'like', 'rating-submissive': 'like' },
    );
    const shibari = details.filter(row => row.title === 'Shibari');
    assert.equal(shibari.length, 2);
    assert.equal(shibari[0].topicId, shibari[1].topicId);
    assert.equal(shibari[0].own.short, 'Receive');
    assert.equal(shibari[0].result, 'limits');
    assert.equal(shibari[1].own.short, 'Give');
    assert.equal(shibari[1].result, 'matches');
    const roles = details.filter(row => row.title === 'Dominant / Submissive');
    assert.equal(roles.length, 2);
    assert.equal(roles[0].topicId, roles[1].topicId);
});
