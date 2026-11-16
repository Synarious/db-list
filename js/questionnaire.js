(function () {
    'use strict';

    const {
        mountAdultPage, clearAnswers, ratingOptions, ratingLabel, readAnswers, saveAnswer,
        checklistProgress, cleanProfile, readChecklist, saveProfile,
        bindAnswerBackups, isAnswerStorageEvent,
        visibleCategories: categories, groups, advancedMode, ratingIcon, fillRatingKey,
    } = DBList;

    const app = document.querySelector('#app');
    const questionnaire = document.querySelector('#questionnaire');
    const skipLink = document.querySelector('.skip-link');
    const previousSection = document.querySelector('#previous-section');
    const nextSection = document.querySelector('#next-section');
    const sectionPicker = document.querySelector('#section-picker');
    const pageNumber = document.querySelector('#checklist-page-number');
    const status = document.querySelector('#status');
    const progress = document.querySelector('#checklist-progress');
    const progressLabel = document.querySelector('#checklist-progress-label');
    const menu = document.querySelector('#main-menu');
    const menus = [menu, sectionPicker];
    const instructions = document.querySelector('#instructions-dialog');
    const customize = document.querySelector('#customize-dialog');
    const customizeForm = document.querySelector('#customize-form');
    DBList.mountImageThemes(document.querySelector('#image-theme-picker'));
    fillRatingKey(document.querySelector('#checklist-rating-key'), 15);
    const resultsUrl = advancedMode ? 'results.html?mode=advanced' : 'results.html';
    document.querySelector('.review-link').href = resultsUrl;
    if (advancedMode) {
        const modeLink = document.querySelector('#checklist-mode');
        modeLink.href = 'index.html';
        modeLink.textContent = 'Standard checklist';
    }
    const customizeStatus = document.querySelector('#customize-status');
    const fields = new Map();
    const tooltip = document.createElement('div');
    tooltip.className = 'checklist-tooltip';
    tooltip.setAttribute('aria-hidden', 'true');
    tooltip.hidden = true;
    document.body.append(tooltip);
    let tooltipAnchor = null;
    let currentPage;

    const pages = categories.map(category => {
        const group = groups.find(group => group.id === category.group);
        const hasMultipleCategories = categories.some(other => other !== category && !other.advanced && other.group === group.id);
        const title = category.advanced ? 'Advanced · ' + category.title : hasMultipleCategories
            ? group.title + ': ' + (category.sectionTitle ?? category.title) : group.title;
        const description = category.subtitle ?? (category.advanced || hasMultipleCategories ? '' : group.description);
        return { category, title, description, hash: '#section-' + category.id };
    });
    const sectionList = sectionPicker.querySelector('ul');
    const sectionLinks = pages.map(page => {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = page.hash;
        link.textContent = page.title;
        item.append(link);
        sectionList.append(item);
        return link;
    });

    function showTooltip(anchor) {
        tooltipAnchor = anchor;
        tooltip.textContent = anchor.dataset.tooltip;
        tooltip.classList.toggle('topic-tooltip', anchor.classList.contains('topic-help'));
        tooltip.hidden = false;

        const bounds = anchor.getBoundingClientRect();
        const { offsetWidth, offsetHeight } = tooltip;
        const left = bounds.left + (bounds.width - offsetWidth) / 2;
        tooltip.style.left = Math.max(8, Math.min(left, document.documentElement.clientWidth - offsetWidth - 8)) + 'px';
        const top = bounds.top >= offsetHeight + 8 ? bounds.top - offsetHeight : bounds.bottom;
        tooltip.style.top = Math.max(8, Math.min(top, window.innerHeight - offsetHeight - 8)) + 'px';
    }

    function hideTooltip() {
        tooltipAnchor = null;
        tooltip.hidden = true;
    }

    questionnaire.addEventListener('pointerover', event => {
        const anchor = event.target.closest('[data-tooltip]');
        if (event.pointerType !== 'touch' && anchor && anchor !== tooltipAnchor) showTooltip(anchor);
    });
    questionnaire.addEventListener('pointerout', event => {
        if (event.pointerType === 'touch' || !tooltipAnchor?.contains(event.target)) return;
        if (!tooltipAnchor.contains(event.relatedTarget) && event.relatedTarget !== tooltip) hideTooltip();
    });
    tooltip.addEventListener('pointerleave', event => {
        if (!tooltipAnchor?.contains(event.relatedTarget) && !tooltipAnchor?.matches(':focus-visible')) hideTooltip();
    });
    questionnaire.addEventListener('focusin', event => {
        const anchor = event.target.closest('[data-tooltip]');
        if (anchor && event.target.matches(':focus-visible')) showTooltip(anchor);
    });
    questionnaire.addEventListener('focusout', event => {
        if (tooltipAnchor?.contains(event.target)) hideTooltip();
    });
    questionnaire.addEventListener('pointerup', event => {
        const anchor = event.target.closest('[data-tooltip]');
        if (event.pointerType === 'touch' && anchor) showTooltip(anchor);
    });
    questionnaire.addEventListener('click', event => {
        const help = event.target.closest('.topic-help');
        if (help) showTooltip(help);
    });
    document.addEventListener('pointerdown', event => {
        if (!tooltipAnchor?.contains(event.target) && event.target !== tooltip) hideTooltip();
        for (const details of menus) {
            if (!details.contains(event.target)) details.open = false;
        }
    });
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        hideTooltip();
        const openMenu = menus.find(details => details.open && details.contains(event.target))
            ?? menus.find(details => details.open);
        if (openMenu) {
            openMenu.open = false;
            openMenu.querySelector('summary').focus();
        }
    });
    sectionList.addEventListener('click', event => {
        if (!event.target.closest('a') || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        sectionPicker.open = false;
        pageNumber.focus({ preventScroll: true });
    });
    window.addEventListener('scroll', hideTooltip);
    window.addEventListener('resize', hideTooltip);

    function refreshAnswers() {
        try {
            const answers = readAnswers();
            for (const [id, field] of fields) {
                const value = answers[id] ?? '';
                field.querySelector('input[value="' + value + '"]').checked = true;
            }
            const { rated, total } = checklistProgress(answers);
            progress.max = total;
            progress.value = rated;
            progressLabel.textContent = rated + '/' + total + ' rated';
            status.textContent = '';
        } catch {
            progress.removeAttribute('value');
            progressLabel.textContent = 'Progress unavailable';
            status.textContent = 'Could not load saved answers. Check browser storage or restore a backup.';
        }
    }

    function createRatingField({ id, prompt, short }, group) {
        const field = document.createElement('div');
        field.className = 'rating-field';
        field.id = 'prompt-' + id;
        field.setAttribute('role', 'radiogroup');
        field.setAttribute('aria-label', prompt);
        if (short) {
            const caption = document.createElement('p');
            caption.className = 'rating-direction';
            caption.textContent = short;
            caption.dataset.tooltip = prompt;
            field.append(caption);
        }

        const choices = document.createElement('div');
        choices.className = 'rating-choices';
        for (const [value] of ratingOptions) {
            const label = document.createElement('label');
            label.className = 'rating-choice';
            const name = ratingLabel(value, group);
            label.dataset.tooltip = name;
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = id;
            radio.value = value;
            radio.checked = value === '';
            radio.setAttribute('aria-label', name);
            const tile = document.createElement('span');
            tile.className = 'rating-tile';
            tile.append(ratingIcon(value));
            label.append(radio, tile);
            choices.append(label);
        }
        field.append(choices);
        fields.set(id, field);

        field.addEventListener('change', async event => {
            try {
                await saveAnswer(id, event.target.value);
                refreshAnswers();
            } catch {
                refreshAnswers();
                status.textContent = 'This change could not be saved. Check your browser storage settings.';
            }
        });
        return field;
    }

    function createTopics(category) {
        const topics = document.createElement('div');
        topics.className = 'topic-grid';
        for (const { title, choices } of category.topics) {
            const topic = document.createElement('fieldset');
            const legend = document.createElement('legend');
            const id = choices[0].id;
            const titleText = document.createElement('span');
            titleText.id = 'topic-title-' + id;
            titleText.textContent = title;
            legend.append(titleText);
            topic.setAttribute('aria-labelledby', titleText.id);
            const description = DBList.topicDescriptions[id];
            if (description) {
                const help = document.createElement('button');
                help.type = 'button';
                help.className = 'topic-help';
                help.textContent = '?';
                help.dataset.tooltip = description;
                help.setAttribute('aria-label', 'About ' + title);
                help.setAttribute('aria-describedby', 'description-' + id);
                const accessibleDescription = document.createElement('span');
                accessibleDescription.id = 'description-' + id;
                accessibleDescription.hidden = true;
                accessibleDescription.textContent = description;
                legend.append(' ', help, accessibleDescription);
            }
            topic.append(legend, ...choices.map(choice => createRatingField(choice, category.group)));
            topics.append(topic);
        }
        return topics;
    }

    function renderSection(page) {
        hideTooltip();
        fields.clear();

        const section = document.createElement('section');
        section.className = 'checklist-section';
        const heading = document.createElement('h2');
        heading.id = page.hash.slice(1);
        heading.tabIndex = -1;
        heading.textContent = page.title;
        section.setAttribute('aria-labelledby', heading.id);
        section.append(heading);
        if (page.description) {
            const description = document.createElement('p');
            description.className = 'note section-description';
            description.textContent = page.description;
            section.append(description);
        }
        section.append(createTopics(page.category));
        questionnaire.replaceChildren(section);

        const index = pages.indexOf(page);
        previousSection.hidden = index === 0;
        if (index > 0) previousSection.href = pages[index - 1].hash;
        const nextPage = pages[index + 1];
        nextSection.href = nextPage?.hash ?? resultsUrl;
        nextSection.textContent = nextPage ? 'Next' : 'Review results';
        sectionPicker.open = false;
        pageNumber.textContent = 'Section ' + (index + 1) + ' of ' + pages.length;
        sectionList.querySelector('[aria-current]')?.removeAttribute('aria-current');
        sectionLinks[index].setAttribute('aria-current', 'page');
        skipLink.href = page.hash;
        currentPage = page;
    }

    function showSection(moveFocus = false) {
        const hash = location.hash;
        const promptId = hash.startsWith('#prompt-') ? hash.slice('#prompt-'.length) : '';
        const promptCategory = promptId && categories.find(category => category.topics.some(topic =>
            topic.choices.some(choice => choice.id === promptId)));
        const page = pages.find(page => page.hash === hash || page.category === promptCategory)
            ?? pages.find(page => hash === '#section-' + page.category.group)
            ?? pages[0];
        const changed = currentPage !== page;
        if (changed) renderSection(page);
        refreshAnswers();

        const field = fields.get(promptId);
        if (field) {
            requestAnimationFrame(() => {
                if (location.hash !== hash || !field.isConnected) return;
                const caption = field.querySelector('.rating-direction') ?? field.closest('fieldset').querySelector('legend');
                caption.tabIndex = -1;
                caption.focus({ preventScroll: true });
                caption.scrollIntoView({ block: 'center' });
            });
        } else if (moveFocus && changed) {
            questionnaire.querySelector('h2').focus({ preventScroll: true });
            window.scrollTo(0, 0);
        }
    }

    document.querySelector('#open-instructions').addEventListener('click', () => {
        menu.open = false;
        instructions.showModal();
    });
    instructions.addEventListener('close', () => {
        menu.querySelector('summary').focus();
    });

    document.querySelector('#open-customize').addEventListener('click', () => {
        customizeStatus.textContent = '';
        customizeForm.reset();
        try {
            const { profile } = readChecklist();
            for (const [key, value] of Object.entries(profile)) {
                const input = customizeForm.elements.namedItem(key);
                if (input) input.value = value;
            }
        } catch {
            customizeStatus.textContent = 'Could not load saved details.';
        }
        customize.showModal();
    });

    customizeForm.addEventListener('submit', async event => {
        event.preventDefault();
        const details = {};
        for (const [key, value] of new FormData(customizeForm)) {
            if (value !== '') details[key] = customizeForm.elements.namedItem(key).type === 'number' ? Number(value) : value;
        }
        let profile;
        try {
            profile = cleanProfile(details);
        } catch (error) {
            customizeStatus.textContent = error.message;
            return;
        }
        const submit = customizeForm.querySelector('button[type="submit"]');
        submit.disabled = true;
        try {
            await saveProfile(profile);
            customize.close();
        } catch {
            customizeStatus.textContent = 'Could not save your details. Check browser storage.';
        } finally {
            submit.disabled = false;
        }
    });

    document.querySelector('#clear-answers').addEventListener('click', async () => {
        if (!window.confirm('Clear all saved answers and profile details from this browser? Downloaded files will remain on your device.')) return;
        try {
            await clearAnswers();
            refreshAnswers();
            document.querySelector('#backup-status').textContent = 'Saved answers and profile cleared.';
        } catch {
            refreshAnswers();
            document.querySelector('#backup-status').textContent = 'Could not clear saved data. Check your browser storage settings.';
        }
    });

    bindAnswerBackups(refreshAnswers);
    window.addEventListener('storage', event => {
        if (fields.size && isAnswerStorageEvent(event)) refreshAnswers();
    });
    window.addEventListener('hashchange', () => {
        if (!app.hidden) showSection(true);
    });
    mountAdultPage(showSection);
})();
