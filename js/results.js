(function () {
    'use strict';

    const {
        mountAdultPage, ratingLabel, ratingOptions, readChecklist, checklistProgress, profileLines,
        visibleCategories: categories, groups, advancedMode, ratingIcon, createImageSheet, prepareImageColumns,
        bindAnswerBackups, downloadFile, isAnswerStorageEvent,
    } = DBList;

    const summary = document.querySelector('#summary');
    const sectionNavigation = document.querySelector('#results-sections');
    const status = document.querySelector('#status');
    const progress = document.querySelector('#results-progress');
    const imageButton = document.querySelector('#download-image');
    const textButton = document.querySelector('#download-text');
    const pageHeading = document.querySelector('#app-heading');
    const title = document.querySelector('#summary-heading');
    const profileList = document.querySelector('#results-profile');
    const notice = document.querySelector('#example-notice');
    const exampleMessage = document.querySelector('#example-message');
    const viewOwn = document.querySelector('#view-own-results');
    const checklistUrl = advancedMode ? 'index.html?mode=advanced' : 'index.html';
    for (const link of document.querySelectorAll('a[href="index.html"]')) link.href = checklistUrl;
    const consent = document.querySelector('#consent-note');
    const consentNote = consent.textContent;
    const exampleNote = 'This example uses fictional ratings and profile details.';
    const exampleProfile = { name: 'Alex', role: 'Switch', age: 30, partnerMinAge: 25, partnerMaxAge: 40 };
    const exampleRatings = ratingOptions.map(([value]) => value).filter(Boolean);
    const minimumRatingsForOwnResults = 10;
    const imageExportScale = 2;
    let text = '';
    let imageData;
    let viewOwnResults = false;
    let exporting = false;

    const textRating = { favorite: '*', like: '+', maybe: '?', 'not-interested': '-', limit: 'X', '': '.' };
    const textLimit = advancedMode ? Infinity : 1999;

    function formatTextExport(heading, details, ratedCategories) {
        const lines = [
            heading,
            '* Favorite  + Like  ? Discuss  - Skip  X Limit  . Blank',
            'Pairs follow checklist order. X means dealbreaker for partner traits.',
        ];
        const headerLength = lines.join('\n').length + 1;
        const footer = '\nMore ratings shown in the results page.\n';
        let body = '';
        let truncated = false;
        for (const category of ratedCategories) {
            let prefix = '\n' + category.title + '\n';
            for (const topic of category.topics) {
                if (!topic.choices.some(choice => choice.value)) continue;
                const ratings = topic.choices.map(choice => textRating[choice.value]).join(' ');
                const row = prefix + topic.title + ' ' + ratings + '\n';
                if (headerLength + body.length + row.length + footer.length > textLimit) {
                    truncated = true;
                    break;
                }
                body += row;
                prefix = '';
            }
            if (truncated) break;
        }
        if (truncated) body += footer;
        if (!body) return heading + '\n\nNo ratings yet.\n';
        let remaining = textLimit - headerLength - body.length;
        for (const detail of details) {
            if (detail.length + 1 > remaining) continue;
            lines.push(detail);
            remaining -= detail.length + 1;
        }
        return lines.join('\n') + '\n' + body;
    }

    function renderResults() {
        const expanded = new Set(Array.from(summary.querySelectorAll('details[open]'), detail => detail.id));
        const sections = [];
        const links = [];
        try {
            const { answers, profile } = readChecklist();
            const { rated, total } = checklistProgress(answers);
            const example = rated < minimumRatingsForOwnResults && !viewOwnResults;
            const heading = example ? 'Example · BDSM Kink List' : 'BDSM Kink List';
            const details = profileLines(example ? exampleProfile : profile);
            const note = example ? exampleNote : consentNote;
            pageHeading.textContent = example ? 'Example results' : 'Your results';
            title.textContent = heading;
            consent.textContent = note;
            textButton.textContent = example ? 'Download example text (.txt)' : 'Download text (.txt)';
            imageButton.textContent = example ? 'Download example image (.png)' : 'Download image (.png)';
            profileList.replaceChildren(...details.map(detail => {
                const item = document.createElement('li');
                item.textContent = detail;
                return item;
            }));
            profileList.hidden = !details.length;
            notice.hidden = !example;
            if (example) {
                exampleMessage.textContent = 'You’ve rated ' + rated + ' of ' + total +
                    ' options. Review results opens your own results once you’ve rated ' + minimumRatingsForOwnResults + ' options.';
            }
            let exampleIndex = 0;
            const ratedCategories = categories.map(category => ({
                ...category,
                topics: category.topics.map(topic => ({
                    ...topic,
                    choices: topic.choices.map(choice => ({
                        ...choice,
                        value: example ? exampleRatings[exampleIndex++ % exampleRatings.length] : (answers[choice.id] ?? ''),
                    })),
                })),
            }));
            const { name, role, kink } = example ? exampleProfile : profile;
            const imageDetails = profileLines({ name, role, kink });
            imageData = { categories: ratedCategories, details: imageDetails, example, theme: profile.imageTheme };
            text = formatTextExport(heading, details, ratedCategories);
            const remaining = total - rated;
            progress.dataset.complete = String(remaining === 0);
            progress.textContent = example ? '' : rated + ' of ' + total + ' options rated.';
            for (const group of groups) {
                const groupSection = document.createElement('section');
                groupSection.className = 'results-group';
                const groupHeading = document.createElement('h3');
                groupHeading.textContent = group.title;
                groupHeading.id = 'results-' + group.id;
                groupHeading.tabIndex = -1;
                groupSection.setAttribute('aria-labelledby', groupHeading.id);
                const indexGroup = document.createElement('div');
                const indexHeading = document.createElement('p');
                indexHeading.textContent = group.title;
                indexGroup.append(indexHeading);
                links.push(indexGroup);
                const grid = document.createElement('div');
                grid.className = 'results-categories';
                groupSection.append(groupHeading, grid);
                sections.push(groupSection);
                for (const category of ratedCategories.filter(category => category.group === group.id)) {
                    const section = document.createElement('details');
                    section.className = 'result-category';
                    section.id = 'result-' + category.id;
                    section.setAttribute('name', 'result-category');
                    section.open = expanded.has(section.id);
                    const heading = document.createElement('summary');
                    const headingText = document.createElement('span');
                    headingText.textContent = category.title;
                    const count = document.createElement('span');
                    count.className = 'result-count';
                    const choices = category.topics.flatMap(topic => topic.choices);
                    const rated = choices.filter(choice => choice.value).length;
                    count.dataset.complete = String(rated === choices.length);
                    count.textContent = rated === choices.length ? 'Complete · ' + rated + ' rated' :
                        rated + ' of ' + choices.length + ' rated';
                    heading.append(headingText, count);
                    if (category.subtitle) {
                        const subtitle = document.createElement('span');
                        subtitle.className = 'category-subtitle note';
                        subtitle.textContent = category.subtitle;
                        heading.append(subtitle);
                    }
                    const list = document.createElement('dl');
                    list.className = 'result-topics';

                    for (const topic of category.topics) {
                        const item = document.createElement('div');
                        const term = document.createElement('dt');
                        term.textContent = topic.title;
                        item.append(term);
                        for (const { id, value, prompt } of topic.choices) {
                            const description = ratingLabel(value, category.group);
                            const detail = document.createElement('dd');
                            detail.dataset.rating = value;
                            const promptText = document.createElement(example ? 'span' : 'a');
                            if (!example) {
                                promptText.href = checklistUrl + '#prompt-' + id;
                                promptText.setAttribute('aria-label', 'Edit rating for ' + topic.title + '. ' + prompt);
                            }
                            promptText.textContent = prompt;
                            const badge = document.createElement('span');
                            badge.className = 'result-rating';
                            badge.append(ratingIcon(value, 18), description);
                            promptText.className = 'result-edit';
                            detail.append(promptText, badge);
                            item.append(detail);
                        }
                        list.append(item);
                    }

                    section.append(heading, list);
                    grid.append(section);
                    const link = document.createElement('a');
                    link.href = '#' + section.id;
                    link.textContent = category.title;
                    link.addEventListener('click', event => {
                        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                        section.open = true;
                        heading.focus({ preventScroll: true });
                    });
                    indexGroup.append(link);
                }
            }
        } catch {
            summary.replaceChildren();
            sectionNavigation.replaceChildren();
            progress.textContent = '';
            text = '';
            imageData = null;
            notice.hidden = true;
            profileList.hidden = true;
            pageHeading.textContent = 'Your results';
            title.textContent = 'BDSM Kink List';
            consent.textContent = consentNote;
            textButton.disabled = true;
            imageButton.disabled = true;
            status.textContent = 'Could not load saved answers. Check browser storage or restore a backup.';
            return;
        }
        summary.replaceChildren(...sections);
        sectionNavigation.replaceChildren(...links);
        const target = document.getElementById(location.hash.slice(1));
        if (!expanded.size && target?.matches('.result-category')) target.open = true;
        textButton.disabled = false;
        imageButton.disabled = exporting;
        status.textContent = '';
    }

    viewOwn.addEventListener('click', () => {
        viewOwnResults = true;
        renderResults();
        title.focus();
    });

    textButton.addEventListener('click', () => {
        const name = imageData.example ? 'kink-list-example.txt' : 'kink-list.txt';
        downloadFile(new Blob([text], { type: 'text/plain;charset=utf-8' }), name);
        status.textContent = 'Text download requested.';
    });

    async function renderImage(sheet, scale) {
        prepareImageColumns(sheet, scale);
        const canvas = await window.html2canvas(sheet, {
            scale,
            windowWidth: sheet.offsetWidth,
            windowHeight: sheet.offsetHeight,
            scrollX: 0,
            scrollY: 0,
            onclone: (_document, clonedSheet) => { clonedSheet.style.left = '0'; },
        });
        try {
            const image = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            if (!image) throw new Error('Empty image');
            return image;
        } finally {
            canvas.width = 0;
        }
    }

    imageButton.addEventListener('click', async () => {
        exporting = true;
        imageButton.disabled = true;
        status.textContent = 'Preparing image…';
        const data = imageData;
        let sheet;
        try {
            sheet = createImageSheet(data);
            document.body.append(sheet);
            let scale = imageExportScale;
            let image;
            try {
                image = await renderImage(sheet, scale);
            } catch {
                scale = 1;
                image = await renderImage(sheet, scale);
            }
            downloadFile(image, data.example ? 'kink-list-example.png' : 'kink-list.png');
            status.textContent = scale === 1 ? 'Image download requested at standard resolution.' : 'Image download requested.';
        } catch {
            status.textContent = 'The image could not be created. You can download the text or use the screenshot guide.';
        } finally {
            sheet?.remove();
            exporting = false;
            imageButton.disabled = !text;
        }
    });

    bindAnswerBackups(renderResults);
    window.addEventListener('storage', event => {
        if (!document.querySelector('#app').hidden && isAnswerStorageEvent(event)) renderResults();
    });
    mountAdultPage(renderResults);
})();
