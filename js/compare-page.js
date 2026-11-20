(function () {
    'use strict';

    const {
        mountAdultPage, readChecklist, isAnswerStorageEvent, ratingLabel, ratingIcon, compareChecklists,
        parseAnswerBackup, checklistShareHash, parseChecklistShareHash, createExampleComparison,
        bindComparisonInput, comparisonBackupKey, getSavedProfiles, readSavedChecklist,
    } = DBList;
    const app = document.querySelector('#app');
    const compareDialog = document.querySelector('#compare-dialog');
    const openCompare = document.querySelector('#open-compare');
    const input = document.querySelector('#compare-link');
    const profileForm = document.querySelector('#compare-profile-form');
    const profileSelect = document.querySelector('#compare-profile');
    const profileId = new URLSearchParams(location.search).get('profile');
    openCompare.addEventListener('click', () => compareDialog.showModal());
    const clear = document.querySelector('#compare-clear');
    const current = document.querySelector('#compare-current');
    const localStatus = document.querySelector('#compare-local-status');
    const editMyList = document.querySelector('#compare-edit-mylist');
    const status = document.querySelector('#compare-import-status');
    const loaded = document.querySelector('#compare-loaded');
    const comparison = document.querySelector('#comparison');
    const heading = document.querySelector('#comparison-heading');
    const answerCounts = document.querySelector('#compare-answer-counts');
    const strictness = document.querySelector('#compare-strictness');
    const strictnessControl = document.querySelector('#compare-strictness-control');
    const modeNote = document.querySelector('#compare-mode-note');
    const coverage = document.querySelector('#compare-coverage');
    const categoryGrid = document.querySelector('#compare-category-grid');
    const pairingSection = document.querySelector('#compare-pairing');
    const pairingTable = document.querySelector('#compare-pairing-table');
    const evidenceSection = document.querySelector('#compare-evidence');
    const evidenceTable = document.querySelector('#compare-evidence-table');
    const detailsView = document.querySelector('#compare-details-view');
    const details = document.querySelector('#compare-details');
    const matchScore = document.querySelector('#compare-match-score');
    const matchCount = document.querySelector('#compare-match-count');
    const openScore = document.querySelector('#compare-open-score');
    const openCount = document.querySelector('#compare-open-count');
    const conflictScore = document.querySelector('#compare-conflict-score');
    const conflictCount = document.querySelector('#compare-conflict-count');
    const modes = [
        ['strict', 'Strong interest', 'Both people chose Favorite or Like.'],
        ['standard', 'Standard', 'Both people chose Favorite, Like, or Willing to try.'],
        ['relaxed', 'Exploratory', 'Also highlights tentative matches where at least one person chose Let’s talk about it and both are open.'],
    ];
    const groups = [
        ['limits', 'Potential limit conflicts', 'One person marked this off the table and the other showed interest or openness. Respect the stated limit.', true],
        ['unansweredLimits', 'Limits with an unanswered counterpart', 'One person set a limit. The corresponding answer is blank.', true],
        ['contextualLimits', 'Limits and dealbreakers to verify', 'These ratings depend on traits, roles, or circumstances. Check which ones apply to your situation.', true],
        ['differences', 'One person would skip', 'One person is open to this and the other would rather skip it.'],
        ['matches', 'Mutual interest', 'Both chose Favorite, Like, or Willing to try.'],
        ['tentativeMatches', 'Tentative matches', 'Both are open, and at least one person chose Let’s talk about it.'],
        ['boundaries', 'Shared boundaries', 'Both people would skip the option or have marked it off the table.'],
        ['declinedWithoutCounterpart', 'Declines with a blank counterpart', 'One person would rather skip this. The other person left the corresponding rating blank.'],
        ['unanswered', 'Other unanswered pairs', 'Only one person rated this option or the corresponding role.'],
        ['partner', 'Partner preferences to check', 'These answers describe what each person looks for. Check which traits and dealbreakers apply to each other.'],
        ['context', 'Scenarios to review', 'These options need details about the people or roles involved.'],
        ['applicability', 'Roles to confirm', 'These saved ratings fall outside the checklist’s default body or fluid roles for this pairing. Confirm which roles apply.'],
    ];
    const resultNames = {
        limits: 'Limit conflict',
        unansweredLimits: 'Limit · counterpart blank',
        contextualLimits: 'Limit · check context',
        differences: 'One person would skip',
        matches: 'Mutual interest',
        tentativeMatches: 'Tentative match',
        boundaries: 'Shared boundary',
        declinedWithoutCounterpart: 'Declined · counterpart blank',
        unanswered: 'Counterpart blank',
        partner: 'Check partner traits',
        context: 'Check scenario',
        applicability: 'Confirm roles',
    };
    const openDetailGroups = new Map();
    let imported;
    let localChecklist;
    let localName;
    let currentHash = '';
    let hasMounted = false;

    function element(tag, text, className) {
        const node = document.createElement(tag);
        if (text) node.textContent = text;
        if (className) node.className = className;
        return node;
    }

    function answerCell(choice, rating, group, showPrompt, usedInPairing) {
        const cell = element('td');
        if (usedInPairing) {
            cell.append(element('small', 'Shown under One partner each'));
            return cell;
        }
        const value = element('span', '', 'compare-rating');
        value.dataset.rating = rating;
        value.append(ratingIcon(rating, 15), element('span', ratingLabel(rating, group)));
        cell.append(value);
        if (showPrompt) cell.append(element('small', choice.short || choice.prompt));
        return cell;
    }

    function groupBy(items, getKey) {
        const grouped = new Map();
        for (const item of items) {
            const key = getKey(item);
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(item);
        }
        return grouped;
    }

    function renderTable(rows, people, labelId, showCategory = false) {
        const table = element('table', '', 'compare-table');
        table.setAttribute('aria-labelledby', labelId);
        const header = table.createTHead().insertRow();
        for (const columnTitle of [...people, 'Result']) {
            const column = element('th', columnTitle);
            column.scope = 'col';
            header.append(column);
        }
        for (const topicRows of groupBy(rows, row => row.topicId).values()) {
            const [first] = topicRows;
            const body = table.createTBody();
            const topic = element('th', first.title, 'compare-topic-heading');
            topic.scope = 'rowgroup';
            topic.colSpan = 3;
            const context = [showCategory && first.category, first.fantasy && 'Fantasy'].filter(Boolean).join(' · ');
            if (context) topic.append(element('small', context));
            body.insertRow().append(topic);
            for (const row of topicRows) {
                const showPrompt = row.own.id !== row.other.id || row.topicId === 'one-partner-each' || row.preferenceSide;
                const result = element('td', resultNames[row.result], 'compare-pair-result');
                result.dataset.result = row.result;
                if (row.eligible === false && row.topicId !== 'one-partner-each' &&
                    (row.result === 'matches' || row.result === 'tentativeMatches')) {
                    result.append(element('small', 'Outside interest level'));
                }
                body.insertRow().append(
                    answerCell(row.own, row.ownRating, row.preferenceSide === 'other' ? 'self' : row.group, showPrompt, row.ownUsed),
                    answerCell(row.other, row.otherRating, row.preferenceSide === 'own' ? 'self' : row.group, showPrompt, row.otherUsed),
                    result,
                );
            }
        }
        return table;
    }

    function renderEvidence(evidence, people) {
        evidenceSection.hidden = !evidence.length;
        evidenceTable.replaceChildren();
        if (!evidence.length) return;

        const table = element('table', '', 'compare-table compare-evidence-table');
        table.setAttribute('aria-labelledby', 'compare-evidence-heading');
        const header = table.createTHead().insertRow();
        for (const title of ['Preference', ...people]) {
            const column = element('th', title);
            column.scope = 'col';
            header.append(column);
        }
        const body = table.createTBody();
        for (const { title, own, other } of evidence) {
            const heading = element('th', title);
            heading.scope = 'row';
            const row = body.insertRow();
            row.append(heading);
            for (const item of [own, other]) {
                const cell = element('td', item?.text ?? '—');
                if (item?.source) cell.append(element('small', item.source));
                row.append(cell);
            }
        }
        evidenceTable.append(table);
    }

    function renderDetailGroup(key, title, description, rows, people, byResult, open = false) {
        const section = element('details', '', 'panel compare-detail');
        section.dataset.kind = key;
        section.open = openDetailGroups.get(key) ?? open;
        const summary = element('summary');
        summary.id = 'compare-group-' + key;
        const label = element('span', '', 'compare-group-label');
        const count = byResult ? rows.length : new Set(rows.map(row => row.topicId)).size;
        const noun = byResult ? 'pair' : 'topic';
        label.append(element('span', title), element('span', countText(count, noun), 'compare-group-count'));
        summary.append(label);
        section.append(summary);
        if (description) section.append(element('p', description, 'note'));
        section.append(renderTable(rows, people, summary.id, byResult));
        return section;
    }

    function countText(count, singular, plural = singular + 's') {
        return count + ' ' + (count === 1 ? singular : plural);
    }

    function renderCategoryGrid(rows, review) {
        const open = [...rows.matches, ...rows.tentativeMatches];
        const results = [
            ['match', rows.matches.filter(row => row.eligible), 'mutual interest'],
            ['tentative', rows.tentativeMatches.filter(row => row.eligible), 'tentative matches'],
            ['outside', open.filter(row => !row.eligible), 'open pairs outside interest level'],
            ['difference', rows.differences, 'where one person would skip'],
            ['limit', rows.limits, 'limit conflicts'],
            ['boundary', rows.boundaries, 'shared boundaries'],
            ['declined', rows.declinedWithoutCounterpart, 'declines with blank counterparts'],
            ['review', review, 'need review'],
        ];
        const categories = new Map(DBList.categories.map(({ id }) => [id, {}]));
        for (const [result, items] of results) {
            for (const { categoryId } of items) {
                const counts = categories.get(categoryId);
                counts[result] = (counts[result] ?? 0) + 1;
            }
        }

        const visibleIds = new Set(DBList.visibleCategories.map(({ id }) => id));
        const displayed = DBList.categories.filter(({ id }) =>
            visibleIds.has(id) || Object.keys(categories.get(id)).length);
        categoryGrid.replaceChildren(...displayed.map(({ id, title }) => {
            const category = element('li', '', 'compare-category');
            const markers = element('span', '', 'compare-category-markers');
            markers.setAttribute('aria-hidden', 'true');
            const counts = categories.get(id);
            const summary = results.map(([result, , label]) => {
                const count = counts[result] ?? 0;
                for (let i = 0; i < count; i++) {
                    const marker = element('span', '', 'compare-category-marker');
                    marker.dataset.result = result;
                    markers.append(marker);
                }
                return count + ' ' + label;
            });
            const description = markers.childElementCount ? summary.join(', ') : 'No rated pairs';
            category.title = title + ' — ' + description;
            if (markers.childElementCount) {
                markers.style.setProperty('--marker-count', markers.childElementCount);
            } else {
                markers.textContent = '—';
            }
            category.append(
                element('span', title, 'compare-category-name'),
                element('span', description, 'compare-visually-hidden'),
                markers,
            );
            return category;
        }));
    }

    function readLocalChecklist() {
        editMyList.hidden = true;
        profileForm.hidden = true;
        localName = '';
        try {
            const { activeId, profiles } = getSavedProfiles();
            const selected = profiles.find(profile => profile.id === profileId);
            if (profileId !== null && !selected) {
                localStatus.textContent = 'This saved profile is no longer available.';
                editMyList.href = 'profiles.html';
                editMyList.textContent = 'Open Profiles';
                editMyList.hidden = false;
                return { answers: {}, profile: {} };
            }
            const alternatives = profiles.filter(profile => profile.id !== (profileId ?? activeId));
            const previous = profileSelect.value;
            profileSelect.replaceChildren(new Option('Choose a profile', ''),
                ...alternatives.map(profile => new Option(profile.name, profile.id)));
            profileSelect.value = alternatives.some(profile => profile.id === previous) ? previous : '';
            profileForm.hidden = !alternatives.length;

            localName = selected?.name ?? '';
            const checklist = selected ? readSavedChecklist(selected.id) : readChecklist();
            const count = Object.keys(checklist.answers).length;
            editMyList.hidden = count > 0;
            if (selected) {
                editMyList.href = 'profiles.html';
                editMyList.textContent = 'Open Profiles to edit ratings';
            }
            localStatus.textContent = count || selected ? (localName || 'MyList') + ' has ' + countText(count, 'saved rating') + '.' :
                'Save ratings in MyList to compare with another person.';
            return checklist;
        } catch {
            localStatus.textContent = 'Could not load your saved answers. Check your browser storage settings.';
            return { answers: {}, profile: {} };
        }
    }

    function render() {
        const exampleAnswers = imported?.ownAnswers;
        current.hidden = !imported;
        comparison.hidden = true;
        heading.textContent = exampleAnswers ? 'Example compatibility overview' : 'Compatibility overview';
        loaded.textContent = '';
        if (exampleAnswers) {
            loaded.textContent = 'Generated two fictional sets of ratings.';
        } else if (imported) {
            const name = imported.savedName ?? imported.profile.name;
            loaded.textContent = (name ? 'Loaded results for ' + name : 'Loaded results') + ' · ' +
                countText(Object.keys(imported.answers).length, 'rating') +
                (imported.skipped ? ' · ' + countText(imported.skipped, 'unrecognized entry', 'unrecognized entries') + ' skipped' : '');
        }
        const myList = readLocalChecklist();
        localChecklist = exampleAnswers ? { answers: exampleAnswers, profile: {} } : myList;
        if (!imported || !Object.keys(localChecklist.answers).length) {
            pairingTable.replaceChildren();
            evidenceTable.replaceChildren();
            details.replaceChildren();
            return;
        }

        const ownCount = Object.keys(localChecklist.answers).length;
        const otherCount = Object.keys(imported.answers).length;
        answerCounts.textContent = exampleAnswers
            ? 'Sample data · ' + countText(ownCount, 'rating') + ' for Example A · ' +
                countText(otherCount, 'rating') + ' for Example B'
            : (localName || 'MyList') + ' · ' + countText(ownCount, 'rating') + ' · ' + (imported.savedName ?? 'Loaded ratings') + ' · ' +
                countText(otherCount, 'rating');
        renderComparison();
        comparison.hidden = false;
    }

    function renderComparison() {
        const [mode, label, explanation] = modes[strictness.valueAsNumber];
        strictnessControl.dataset.mode = mode;
        strictness.setAttribute('aria-valuetext', label);
        modeNote.textContent = explanation;

        const { rows, details: detailRows, pairing, matches, conflicts, total, evidence } = compareChecklists(localChecklist.answers, imported.answers, mode, {
            ownProfile: localChecklist.profile,
            otherProfile: imported.profile,
        });
        const tentativeSelected = rows.tentativeMatches.filter(row => row.eligible).length;
        const tentativeOther = rows.tentativeMatches.length - tentativeSelected;
        const otherOpen = rows.matches.length + rows.tentativeMatches.length - matches;
        matchScore.textContent = String(matches);
        matchCount.textContent = [
            matches > tentativeSelected && (matches - tentativeSelected) + ' with mutual interest',
            tentativeSelected && countText(tentativeSelected, 'tentative match', 'tentative matches'),
        ].filter(Boolean).join(' · ');
        openScore.textContent = String(otherOpen);
        openCount.textContent = [
            otherOpen > tentativeOther && (otherOpen - tentativeOther) + ' with mutual interest',
            tentativeOther && countText(tentativeOther, 'tentative match', 'tentative matches'),
        ].filter(Boolean).join(' · ');
        conflictScore.textContent = String(conflicts);
        conflictCount.textContent = [
            rows.limits.length && countText(rows.limits.length, 'limit conflict'),
            rows.differences.length && rows.differences.length + ' where one would skip',
        ].filter(Boolean).join(' · ');
        const needsContext = [...rows.contextualLimits, ...rows.partner, ...rows.context, ...rows.applicability];
        renderCategoryGrid(rows, [...rows.unanswered, ...rows.unansweredLimits, ...needsContext]);
        coverage.textContent = [
            countText(total, 'pair', 'pairs') + ' with interest or conflict',
            rows.boundaries.length && countText(rows.boundaries.length, 'shared boundary', 'shared boundaries'),
            rows.unanswered.length && countText(rows.unanswered.length, 'blank counterpart'),
            rows.unansweredLimits.length && countText(rows.unansweredLimits.length, 'limit with a blank counterpart', 'limits with blank counterparts'),
            rows.declinedWithoutCounterpart.length && countText(rows.declinedWithoutCounterpart.length, 'decline with a blank counterpart', 'declines with blank counterparts'),
            needsContext.length && needsContext.length + ' to review',
        ].filter(Boolean).join(' · ');

        const people = imported.ownAnswers ? ['Example A', 'Example B'] : [localName || 'You', imported.savedName ?? 'Other person'];
        pairingSection.hidden = !pairing;
        pairingTable.replaceChildren(...(pairing ? [renderTable([pairing], people, 'compare-pairing-heading')] : []));
        renderEvidence(evidence, people);
        for (const section of details.children) {
            if (section.dataset.kind) openDetailGroups.set(section.dataset.kind, section.open);
        }
        const byResult = detailsView.value === 'result';
        if (byResult) {
            const resultGroups = groupBy(detailRows, row => row.result);
            details.replaceChildren(...groups.flatMap(([key, title, description, open]) => resultGroups.has(key) ?
                [renderDetailGroup(key, title, description, resultGroups.get(key), people, true, open)] : []));
        } else {
            const visibleRows = detailsView.value === 'exact' ? detailRows.filter(row => row.exact) : detailRows;
            if (detailsView.value === 'exact' && !visibleRows.length) {
                const empty = element('p', 'No open pairs have identical ratings.', 'note');
                empty.setAttribute('role', 'status');
                details.replaceChildren(empty);
                return;
            }
            const topicGroups = groupBy(visibleRows, row => row.categoryId);
            details.replaceChildren(...Array.from(topicGroups, ([key, items]) =>
                renderDetailGroup(key, items[0].category, '', items, people, false)));
        }
    }

    strictness.addEventListener('input', () => {
        if (!comparison.hidden) renderComparison();
    });
    detailsView.addEventListener('change', () => {
        if (!comparison.hidden) renderComparison();
    });

    function clearShareHash() {
        if (!checklistShareHash(location.hash)) return;
        const url = new URL(location.href);
        url.hash = '';
        history.replaceState(history.state, '', url);
        currentHash = '';
    }

    function loadComparison(checklist, fromLocation = false) {
        if (!Object.keys(checklist.answers).length) {
            const skipped = checklist.skipped ? ' ' + countText(checklist.skipped, 'entry', 'entries') + ' skipped.' : '';
            throw new Error('These results contain no usable ratings.' + skipped);
        }
        if (!fromLocation) clearShareHash();
        imported = checklist;
        input.value = '';
        status.textContent = '';
        render();
        if (!comparison.hidden) {
            compareDialog.close();
            if (!fromLocation) heading.focus();
        }
    }

    function showLocationShare() {
        const hash = checklistShareHash(location.hash);
        if (hash === currentHash) return;
        currentHash = hash;
        cancelComparisonInput();
        imported = undefined;
        status.textContent = '';
        if (!hash) {
            render();
            return;
        }
        try {
            loadComparison(parseChecklistShareHash(hash), true);
        } catch (error) {
            render();
            status.textContent = error.message;
        }
    }

    const cancelComparisonInput = bindComparisonInput(compareDialog, (checklist, { example }) => {
        loadComparison(example ? createExampleComparison() : checklist);
    });
    compareDialog.addEventListener('close', cancelComparisonInput);
    profileForm.addEventListener('submit', event => {
        event.preventDefault();
        cancelComparisonInput();
        status.textContent = '';
        try {
            const { activeId, profiles } = getSavedProfiles();
            const other = profiles.find(profile => profile.id === profileSelect.value && profile.id !== (profileId ?? activeId));
            if (!other) throw new Error('Choose another saved profile.');
            loadComparison({ ...readSavedChecklist(other.id), savedName: other.name });
        } catch (error) {
            status.textContent = error.message;
        }
    });

    function loadPendingComparison() {
        const url = new URL(location.href);
        const source = url.searchParams.get('source');
        if (!source) return;
        url.searchParams.delete('source');
        history.replaceState(history.state, '', url);
        try {
            if (source === 'example') loadComparison(createExampleComparison());
            if (source === 'backup') {
                const backup = sessionStorage.getItem(comparisonBackupKey);
                sessionStorage.removeItem(comparisonBackupKey);
                if (!backup) throw new Error('Choose the JSON backup again to start the comparison.');
                loadComparison(parseAnswerBackup(backup));
            }
        } catch (error) {
            status.textContent = error.message;
        }
    }

    clear.addEventListener('click', () => {
        cancelComparisonInput();
        clearShareHash();
        imported = undefined;
        status.textContent = '';
        render();
        input.focus();
    });
    window.addEventListener('storage', event => {
        if (!app.hidden && isAnswerStorageEvent(event)) render();
    });
    window.addEventListener('hashchange', () => {
        if (!app.hidden) showLocationShare();
    });

    mountAdultPage(() => {
        render();
        showLocationShare();
        loadPendingComparison();
        if (hasMounted) return;
        hasMounted = true;
        queueMicrotask(() => {
            if (!app.hidden && comparison.hidden && !compareDialog.open) compareDialog.showModal();
        });
    });
})();
