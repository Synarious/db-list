(function () {
    'use strict';

    const {
        mountAdultPage, readChecklist, isAnswerStorageEvent, ratingOptions, ratingLabel, ratingIcon, compareChecklists,
        parseAnswerBackup, checklistShareHash, parseChecklistShareHash, createExampleComparison,
        bindComparisonInput, comparisonBackupKey, getSavedProfiles, readSavedChecklist, bindPngExport, renderTiledPng,
    } = DBList;
    const app = document.querySelector('#app');
    const compareDialog = document.querySelector('#compare-dialog');
    const chartDialog = document.querySelector('#compare-chart-dialog');
    const chartDialogHeading = document.querySelector('#compare-chart-dialog-heading');
    const chartDialogSummary = document.querySelector('#compare-chart-dialog-summary');
    const chartDialogDescription = document.querySelector('#compare-chart-dialog-description');
    const chartDialogContent = document.querySelector('#compare-chart-dialog-content');
    const openCompare = document.querySelector('#open-compare');
    const input = document.querySelector('#compare-link');
    const secondInput = document.querySelector('#compare-second-link');
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
    const interestLevel = document.querySelector('#compare-interest-level');
    const modeNote = document.querySelector('#compare-mode-note');
    const overviewImage = document.querySelector('#compare-overview-image');
    const imageButton = document.querySelector('#compare-download-image');
    const pairChart = document.querySelector('#compare-pair-chart');
    const pairCount = document.querySelector('#compare-pair-count');
    const compatibility = document.querySelector('#compare-compatibility');
    const compatibilityLabel = document.querySelector('#compare-compatibility-label');
    const compatibilityCount = document.querySelector('#compare-compatibility-count');
    const openLegend = document.querySelector('#compare-open-legend');
    const boundaryLegend = document.querySelector('#compare-boundary-legend');
    const breakdownNote = document.querySelector('#compare-breakdown-note');
    const coverage = document.querySelector('#compare-coverage');
    const personCards = Array.from(document.querySelectorAll('.compare-person'));
    const pairingSection = document.querySelector('#compare-pairing');
    const pairingTable = document.querySelector('#compare-pairing-table');
    const evidenceSection = document.querySelector('#compare-evidence');
    const evidenceList = document.querySelector('#compare-evidence-list');
    const detailsView = document.querySelector('#compare-details-view');
    const details = document.querySelector('#compare-details');
    const matchScore = document.querySelector('#compare-match-score');
    const openScore = document.querySelector('#compare-open-score');
    const conflictScore = document.querySelector('#compare-conflict-score');
    const modes = {
        standard: ['Standard', 'Both people chose Favorite, Like, or Willing to try. Pairing Willing to try with a limit counts as a conflict.'],
        relaxed: ['Relaxed', 'Includes pairs where both people are open and at least one chose Let’s talk about it. Willing to try paired with a limit stays outside the score.'],
    };
    const ratingColors = {
        favorite: '--rating-favorite', like: '--rating-like', 'willing-to-try': '--rating-willing',
        maybe: '--rating-maybe', 'not-interested': '--rating-skip', limit: '--rating-limit',
    };
    const ratedOptions = ratingOptions.filter(([key]) => key);
    const openSegments = [
        ['favorite', 'Both chose Favorite', 'The highest shared interest.'],
        ['like', 'Mutual interest (Like)', 'Both chose Like, or one chose Favorite and the other chose Like.'],
        ['willing-to-try', 'Willing to try (both open)', 'One chose Willing to try and the other chose Favorite, Like, or Willing to try.'],
        ['maybe', 'Let’s talk about it (both open)', 'At least one wants to talk first.'],
    ];
    const boundarySegments = [
        ['willing-limit', 'Willing to try + limit', 'One is willing to try and the other marked it off the table.', '--willing-limit-color'],
        ['limit', 'Other limit conflicts', 'One marked it off the table and the other chose Favorite, Like, or Let’s talk about it.'],
        ['not-interested', 'One person would skip', 'One would skip and the other was open to it.'],
        ['boundary', 'Shared boundaries', 'Both would skip or marked it off the table. Outside the score.', '--rating-blank'],
    ];
    const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });
    const groups = [
        ['limits', 'Potential limit conflicts', 'One person marked this off the table and the other showed interest or openness. Respect the stated limit.', true],
        ['willingLimits', 'Willing to try + limit', 'One person is willing to try it and the other marked it off the table. The limit stands at every interest level.', true],
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
        willingLimits: 'Willing to try + limit',
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
    let chartDialogOpener;
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

    function renderTable(rows, people, labelId, willingLimitScored, showCategory = false) {
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
                if (row.result === 'willingLimits') {
                    result.append(element('small', willingLimitScored ? 'Off the table · counts as a conflict' : 'Off the table · outside the score'));
                }
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
        evidenceList.replaceChildren(...evidence.map(({ title, own, other }) => {
            const section = element('section', '', 'compare-evidence-item');
            const findings = element('dl');
            [own, other].forEach((item, index) => {
                if (!item) return;
                const finding = element('div');
                const explanation = element('dd', item.text);
                if (item.source) explanation.append(element('small', item.source));
                finding.append(element('dt', people[index]), explanation);
                findings.append(finding);
            });
            section.append(element('h4', title), findings);
            return section;
        }));
    }

    function renderDetailGroup(key, title, description, rows, people, byResult, willingLimitScored, open = false) {
        const section = element('details', '', 'compare-detail');
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
        const tableFrame = element('div', '', 'compare-table-frame');
        tableFrame.append(renderTable(rows, people, summary.id, willingLimitScored, byResult));
        section.append(tableFrame);
        return section;
    }

    function countText(count, singular, plural = singular + 's') {
        return count + ' ' + (count === 1 ? singular : plural);
    }

    function chartSegments(definitions, entries, total, scoreNotes = {}) {
        return definitions.map(([key, label, description, color = ratingColors[key]]) => {
            const items = entries[key];
            const share = total ? items.length / total : 0;
            const percentage = share > 0 && share < .001 ? '<0.1%' : percent.format(share);
            return { label, items, share, percentage: total ? percentage : '—', color: `var(${color})`,
                description: [description, scoreNotes[key]].filter(Boolean).join(' ') };
        });
    }

    function svgElement(tag, attributes) {
        const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
        for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
        return node;
    }

    function renderChart(chart, segments, unit, openSegment) {
        const ring = svgElement('svg', { viewBox: '0 0 100 100' });
        const gradients = svgElement('defs', {});
        const chartId = chart.closest('section').getAttribute('aria-labelledby');
        const circle = { cx: 50, cy: 50, r: 41, pathLength: 100 };
        ring.append(gradients, svgElement('circle', { ...circle, class: 'compare-chart-track', 'aria-hidden': 'true' }));
        let start = 0;
        for (const [index, segment] of segments.entries()) {
            if (!segment.share) continue;
            const length = segment.share * 100;
            const gap = length === 100 ? 0 : Math.min(.8, length / 4);
            const label = `${segment.label}, ${countText(segment.items.length, unit)}, ${segment.percentage}`;
            const gradientId = `${chartId}-slice-${index}`;
            const gradient = svgElement('linearGradient', { id: gradientId, x2: '100%', y2: '100%' });
            gradient.style.setProperty('--slice-color', segment.color);
            gradient.append(svgElement('stop', { offset: 0, class: 'compare-slice-highlight' }),
                svgElement('stop', { offset: 1, class: 'compare-slice-shade' }));
            gradients.append(gradient);
            const slice = svgElement('circle', {
                ...circle, class: 'compare-chart-slice', tabindex: 0, role: 'button',
                'aria-label': label, 'aria-haspopup': 'dialog',
                stroke: `url(#${gradientId})`,
                'stroke-dasharray': `${length - gap} ${100 - length + gap}`,
                'stroke-dashoffset': -(start + gap / 2), transform: 'rotate(-90 50 50)',
            });
            slice.style.setProperty('--slice-color', segment.color);
            slice.append(svgElement('title', {}));
            slice.firstChild.textContent = label;
            slice.addEventListener('click', () => openSegment(segment, slice));
            slice.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                if (!event.repeat) openSegment(segment, slice);
            });
            ring.append(slice);
            start += length;
        }
        const existingRing = chart.querySelector('svg');
        if (existingRing) existingRing.replaceWith(ring);
        else chart.prepend(ring);
    }

    function renderLegend(legend, segments, unit, openSegment) {
        legend.replaceChildren(...segments.map(segment => {
            const { label, items, share, percentage, color, description } = segment;
            const count = items.length;
            const item = element('li');
            const row = element(count ? 'button' : 'div', '', 'compare-legend-row');
            const name = element('span', label, 'compare-legend-label');
            if (description) name.append(element('small', description));
            row.style.setProperty('--slice-color', color);
            row.style.setProperty('--slice-share', `${share * 100}%`);
            row.append(element('span', '', 'compare-legend-dot'), name,
                element('span', unit === 'pair' ? countText(count, unit) : String(count), 'compare-legend-count'),
                element('strong', percentage), element('span', '', 'compare-legend-bar'));
            if (count) {
                row.type = 'button';
                row.setAttribute('aria-haspopup', 'dialog');
                row.addEventListener('click', () => openSegment(segment, row));
            }
            item.append(row);
            return item;
        }));
    }

    function showChartDetails(trigger, segment, context, total, unit, content) {
        chartDialogOpener = trigger;
        chartDialogHeading.textContent = `${context} · ${segment.label}`;
        chartDialogSummary.textContent = `${segment.items.length} of ${countText(total, unit)} · ${segment.percentage}`;
        chartDialogDescription.textContent = segment.description;
        chartDialogDescription.hidden = !segment.description;
        chartDialogContent.replaceChildren(content);
        chartDialog.showModal();
        chartDialogContent.scrollTop = 0;
    }

    chartDialog.addEventListener('close', () => {
        if (chartDialog.open) return;
        chartDialogContent.replaceChildren();
        if (chartDialogOpener?.isConnected && !comparison.hidden) chartDialogOpener.focus({ preventScroll: true });
        chartDialogOpener = undefined;
    });

    function renderRatedChoices(choices) {
        const list = element('div', '', 'compare-rated-choices');
        for (const [category, entries] of groupBy(choices, choice => choice.category)) {
            const section = element('section');
            const topics = element('ul');
            for (const { title, detail } of entries) {
                const topic = element('li', title);
                if (detail) topic.append(element('small', detail));
                topics.append(topic);
            }
            section.append(element('h3', category), topics);
            list.append(section);
        }
        return list;
    }

    function renderPerson(card, person, answers) {
        const entries = Object.fromEntries(ratedOptions.map(([key]) => [key, []]));
        let total = 0;
        for (const { title: category, topics } of DBList.categories) {
            for (const { title, choices } of topics) {
                for (const choice of choices) {
                    const rating = answers[choice.id];
                    if (!rating) continue;
                    entries[rating].push({ category, title, detail: choices.length > 1 ? choice.short || choice.prompt : '' });
                    total++;
                }
            }
        }
        const segments = chartSegments(ratedOptions, entries, total);
        const openSegment = (segment, trigger) => showChartDetails(trigger, segment, person, total, 'rating', renderRatedChoices(segment.items));
        const chart = card.querySelector('.compare-person-chart');
        card.querySelector('h3').textContent = person;
        chart.querySelector('.compare-person-count').textContent = String(total);
        chart.querySelector('.compare-chart-value span').textContent = total === 1 ? 'Rating' : 'Ratings';
        renderChart(chart, segments, 'rating', openSegment);
        renderLegend(card.querySelector('ul'), segments, 'rating', openSegment);
    }

    function renderBreakdown(entries, matches, total, mode, people) {
        const compared = Object.values(entries).reduce((sum, rows) => sum + rows.length, 0);
        pairCount.textContent = countText(compared, 'comparable pair');
        const score = total ? matches / total : null;
        const [label] = modes[mode];
        const isGood = score !== null && score >= 0.75;
        pairChart.classList.toggle('is-good', isGood);
        compatibility.textContent = score === null ? '—' : percent.format(score);
        compatibilityLabel.textContent = isGood ? 'Good compatibility' : 'Compatibility';
        compatibilityCount.textContent = total ? `${matches} of ${countText(total, 'scored pair')} meet the ${label} level.` :
            `No pairs count toward compatibility at the ${label} level.`;
        breakdownNote.textContent = compared ?
            'Slice percentages use all comparable pairs, including shared boundaries. Each open pair uses the lower rating.' :
            'There are no comparable pairs. Each person’s chart still shows their saved ratings.';
        const meetsLevel = 'Meets this interest level.';
        const belowLevel = 'Below this interest level.';
        const open = chartSegments(openSegments, entries, compared, {
            'willing-to-try': meetsLevel,
            maybe: mode === 'relaxed' ? meetsLevel : belowLevel,
        });
        const boundaries = chartSegments(boundarySegments, entries, compared, {
            'willing-limit': mode === 'standard' ? 'Counts as a conflict.' : 'Outside the score at this level.',
        });
        const openSegment = (segment, trigger) => {
            const frame = element('div', '', 'compare-table-frame');
            frame.append(renderTable(segment.items, people, chartDialogHeading.id, mode === 'standard', true));
            showChartDetails(trigger, segment, 'Compatibility', compared, 'comparable pair', frame);
        };
        renderChart(pairChart, [...open, ...boundaries], 'pair', openSegment);
        renderLegend(openLegend, open, 'pair', openSegment);
        renderLegend(boundaryLegend, boundaries, 'pair', openSegment);
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
                'Add ratings in MyList or paste two share links.';
            return checklist;
        } catch {
            localStatus.textContent = 'Could not load your saved answers. Check your browser storage settings.';
            return { answers: {}, profile: {} };
        }
    }

    function comparisonPeople() {
        if (imported.ownAnswers) return ['Example A', 'Example B'];
        const first = imported.ownChecklist;
        return [
            first ? first.profile.name ?? 'First link' : localName || 'You',
            imported.savedName ?? imported.profile.name ?? (first ? 'Second link' : 'Other person'),
        ];
    }

    function render() {
        if (chartDialog.open) chartDialog.close();
        const exampleAnswers = imported?.ownAnswers;
        const firstLink = imported?.ownChecklist;
        current.hidden = !imported;
        comparison.hidden = true;
        heading.textContent = exampleAnswers ? 'Example compatibility overview' : 'Compatibility overview';
        loaded.textContent = '';
        if (exampleAnswers) {
            loaded.textContent = 'Generated two fictional sets of ratings.';
        } else if (firstLink) {
            const skipped = firstLink.skipped + imported.skipped;
            loaded.textContent = 'Loaded two share links' + (skipped ?
                ' · ' + countText(skipped, 'unrecognized entry', 'unrecognized entries') + ' skipped' : '');
        } else if (imported) {
            const name = imported.savedName ?? imported.profile.name;
            loaded.textContent = (name ? 'Loaded results for ' + name : 'Loaded results') + ' · ' +
                countText(Object.keys(imported.answers).length, 'rating') +
                (imported.skipped ? ' · ' + countText(imported.skipped, 'unrecognized entry', 'unrecognized entries') + ' skipped' : '');
        }
        const myList = readLocalChecklist();
        localChecklist = firstLink ?? (exampleAnswers ? { answers: exampleAnswers, profile: {} } : myList);
        if (!imported || !Object.keys(localChecklist.answers).length) {
            pairingTable.replaceChildren();
            evidenceList.replaceChildren();
            details.replaceChildren();
            return;
        }

        const [firstPerson, secondPerson] = comparisonPeople();
        renderPerson(personCards[0], firstPerson, localChecklist.answers);
        renderPerson(personCards[1], secondPerson, imported.answers);
        renderComparison();
        comparison.hidden = false;
    }

    function renderComparison() {
        const mode = interestLevel.querySelector('input:checked').value;
        const [, explanation] = modes[mode];
        modeNote.textContent = explanation;

        const { rows, details: detailRows, pairing, matches, conflicts, total, evidence, breakdownRows } = compareChecklists(localChecklist.answers, imported.answers, mode, {
            ownProfile: localChecklist.profile,
            otherProfile: imported.profile,
        });
        const people = comparisonPeople();
        const willingLimitScored = mode === 'standard';
        renderBreakdown(breakdownRows, matches, total, mode, people);
        const otherOpen = rows.matches.length + rows.tentativeMatches.length - matches;
        matchScore.textContent = String(matches);
        openScore.textContent = String(otherOpen);
        conflictScore.textContent = String(conflicts);
        const needsContext = rows.contextualLimits.length + rows.partner.length + rows.context.length + rows.applicability.length;
        const outsideChart = [
            rows.unanswered.length && countText(rows.unanswered.length, 'blank counterpart'),
            rows.unansweredLimits.length && countText(rows.unansweredLimits.length, 'limit with a blank counterpart', 'limits with blank counterparts'),
            rows.declinedWithoutCounterpart.length && countText(rows.declinedWithoutCounterpart.length, 'decline with a blank counterpart', 'declines with blank counterparts'),
            needsContext && countText(needsContext, 'pair') + ' to review for context',
        ].filter(Boolean).join(' · ');
        coverage.textContent = outsideChart ? 'Outside the chart · ' + outsideChart : '';

        pairingSection.hidden = !pairing;
        pairingTable.replaceChildren(...(pairing ? [renderTable([pairing], people, 'compare-pairing-heading', willingLimitScored)] : []));
        renderEvidence(evidence, people);
        for (const section of details.children) {
            if (section.dataset.kind) openDetailGroups.set(section.dataset.kind, section.open);
        }
        const view = detailsView.value;
        const visibleRows = view === 'exact' ? detailRows.filter(row => row.exact) : detailRows;
        if (!visibleRows.length) {
            const empty = element('p', view === 'exact' ? 'No open pairs have identical ratings.' : 'No additional pairs to show.', 'note');
            empty.setAttribute('role', 'status');
            details.replaceChildren(empty);
        } else if (view === 'result') {
            const resultGroups = groupBy(detailRows, row => row.result);
            details.replaceChildren(...groups.flatMap(([key, title, description, open]) => resultGroups.has(key) ?
                [renderDetailGroup(key, title, description, resultGroups.get(key), people, true, willingLimitScored, open)] : []));
        } else {
            const topicGroups = groupBy(visibleRows, row => row.categoryId);
            details.replaceChildren(...Array.from(topicGroups, ([key, items]) =>
                renderDetailGroup(key, items[0].category, '', items, people, false, willingLimitScored)));
        }
    }

    interestLevel.addEventListener('change', () => {
        if (!comparison.hidden) renderComparison();
    });
    detailsView.addEventListener('change', () => {
        if (!comparison.hidden) renderComparison();
    });

    function prepareOverviewImage(clonedDocument, sheet) {
        sheet.classList.add('compare-image-export');
        clonedDocument.body.append(sheet);
        const { defaultView } = clonedDocument;
        const pixel = clonedDocument.createElement('canvas').getContext('2d');
        // html2canvas cannot parse color-mix() or the color(srgb ...) it resolves to.
        function toRgb(color) {
            pixel.fillStyle = color;
            pixel.fillRect(0, 0, 1, 1);
            const [red, green, blue] = pixel.getImageData(0, 0, 1, 1).data;
            return `rgb(${red}, ${green}, ${blue})`;
        }
        const style = defaultView.getComputedStyle(sheet);
        for (const property of ['--muted', '--border', '--willing-limit-color', '--comparison-border', '--chart-border']) {
            sheet.style.setProperty(property, toRgb(style.getPropertyValue(property).trim()));
        }
        // The renderer loads SVGs as standalone images, so they need their own chart styles.
        for (const chart of sheet.querySelectorAll('.compare-chart svg')) {
            chart.setAttribute('fill', 'none');
            chart.setAttribute('stroke-width', '12');
            const track = chart.querySelector('.compare-chart-track');
            track.setAttribute('stroke', defaultView.getComputedStyle(track).stroke);
            for (const stop of chart.querySelectorAll('stop')) {
                stop.setAttribute('stop-color', toRgb(defaultView.getComputedStyle(stop).stopColor));
            }
        }
    }

    bindPngExport(imageButton, async exportProgress => {
        const blob = await renderTiledPng(overviewImage, {
            windowWidth: 1248, scrollX: 0, scrollY: 0, scale: 2, backgroundColor: null,
            onclone: prepareOverviewImage,
        }, exportProgress);
        return { blob, name: 'mylist-compatibility.png' };
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
        status.textContent = '';
        render();
        if (!comparison.hidden) {
            input.value = '';
            secondInput.value = '';
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

    const cancelComparisonInput = bindComparisonInput(compareDialog, (checklist, { example, ownChecklist }) => {
        loadComparison(example ? createExampleComparison() : { ...checklist, ownChecklist });
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
