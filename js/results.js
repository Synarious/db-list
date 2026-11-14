(function () {
    'use strict';

    const {
        mountAdultPage, ratingLabel, readAnswers, categories, groups, createSpeechControls, ratingFace, createImageSheet,
        bindAnswerBackups, downloadFile, isAnswerStorageEvent,
    } = DBList;

    const summary = document.querySelector('#summary');
    const sectionNavigation = document.querySelector('#results-sections');
    const status = document.querySelector('#status');
    const progress = document.querySelector('#results-progress');
    const imageButton = document.querySelector('#download-image');
    const textButton = document.querySelector('#download-text');
    const consentNote = document.querySelector('#consent-note').textContent;
    const speech = createSpeechControls();
    let text = '';
    let imageData = [];
    let exporting = false;

    function renderResults() {
        speech.stop();
        const expanded = new Set(Array.from(summary.querySelectorAll('details[open]'), detail => detail.id));
        const sections = [];
        const links = [];
        const lines = ['BDSM Kink List', consentNote];
        try {
            const answers = readAnswers();
            imageData = categories.map(category => ({
                ...category,
                topics: category.topics.map(topic => ({
                    ...topic,
                    choices: topic.choices.map(choice => ({ ...choice, value: answers[choice.id] ?? '' })),
                })),
            }));
            const allChoices = imageData.flatMap(category => category.topics.flatMap(topic => topic.choices));
            const remaining = allChoices.filter(choice => !choice.value).length;
            progress.dataset.complete = String(remaining === 0);
            progress.textContent = remaining === 0 ? 'You’ve rated every option.' :
                remaining + (remaining === 1 ? ' option is' : ' options are') + ' still blank.';
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
                lines.push('', group.title);

                for (const category of imageData.filter(category => category.group === group.id)) {
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
                    const list = document.createElement('dl');
                    list.className = 'result-topics';
                    const categoryLines = [category.title];

                    for (const topic of category.topics) {
                        const item = document.createElement('div');
                        const term = document.createElement('dt');
                        term.textContent = topic.title;
                        item.append(term);
                        const labels = topic.choices.map(({ id, value, prompt }) => {
                            const description = ratingLabel(value, category.group);
                            const detail = document.createElement('dd');
                            detail.dataset.rating = value;
                            const promptText = document.createElement('a');
                            promptText.href = 'index.html#prompt-' + id;
                            promptText.setAttribute('aria-label', 'Edit rating for ' + topic.title + '. ' + prompt);
                            promptText.textContent = prompt;
                            const badge = document.createElement('span');
                            badge.className = 'result-rating';
                            badge.append(ratingFace(value, 18), description);
                            promptText.className = 'result-edit';
                            detail.append(promptText, badge);
                            item.append(detail);
                            return prompt + ': ' + description;
                        });
                        list.append(item);
                        categoryLines.push(topic.title + ' — ' + labels.join(' / '));
                    }

                    const readButton = document.createElement('button');
                    readButton.type = 'button';
                    readButton.className = 'secondary';
                    readButton.textContent = 'Read ' + category.title + ' aloud';
                    section.append(heading, readButton, list);
                    speech.bind(readButton, () => categoryLines);
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
                    lines.push('', ...categoryLines);
                }
            }
        } catch {
            summary.replaceChildren();
            sectionNavigation.replaceChildren();
            progress.textContent = '';
            text = '';
            imageData = [];
            textButton.disabled = true;
            imageButton.disabled = true;
            status.textContent = 'Could not load saved answers. Check browser storage or restore a backup.';
            return;
        }
        summary.replaceChildren(...sections);
        sectionNavigation.replaceChildren(...links);
        const target = document.getElementById(location.hash.slice(1));
        if (!expanded.size && target?.matches('.result-category')) target.open = true;
        text = lines.join('\r\n') + '\r\n';
        textButton.disabled = false;
        imageButton.disabled = exporting;
        status.textContent = '';
    }

    textButton.addEventListener('click', () => {
        downloadFile(new Blob([text], { type: 'text/plain;charset=utf-8' }), 'kink-list.txt');
        status.textContent = 'Text download requested.';
    });

    imageButton.addEventListener('click', async () => {
        exporting = true;
        imageButton.disabled = true;
        status.textContent = 'Preparing image…';
        let sheet;
        try {
            sheet = createImageSheet(imageData, consentNote);
            document.body.append(sheet);
            const canvas = await window.html2canvas(sheet, {
                scale: 1,
                windowWidth: sheet.offsetWidth,
                windowHeight: sheet.offsetHeight,
                scrollX: 0,
                scrollY: 0,
                onclone: (_document, clonedSheet) => { clonedSheet.style.left = '0'; },
            });
            const image = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            if (!image) throw new Error('Empty image');
            downloadFile(image, 'kink-list.png');
            status.textContent = 'Image download requested.';
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
