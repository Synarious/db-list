(function () {
    'use strict';

    const {
        mountAdultPage, clearAnswers, ratingOptions, ratingLabel, readAnswers, saveAnswer,
        bindAnswerBackups, isAnswerStorageEvent,
        categories, groups, createSpeechControls, ratingFace,
    } = DBList;

    const questionnaire = document.querySelector('#questionnaire');
    const sectionNavigation = document.querySelector('#checklist-sections');
    const status = document.querySelector('#status');
    const speech = createSpeechControls();
    const fields = new Map();

    function refreshAnswers() {
        try {
            const answers = readAnswers();
            for (const [id, field] of fields) {
                const value = answers[id] ?? '';
                field.querySelector('input[value="' + value + '"]').checked = true;
            }
            status.textContent = '';
        } catch {
            status.textContent = 'Could not load saved answers. Check browser storage or restore a backup.';
        }
    }

    function createRatingField({ id, prompt }, group) {
        const field = document.createElement('div');
        field.className = 'rating-field';
        field.setAttribute('role', 'radiogroup');

        const caption = document.createElement('p');
        caption.className = 'rating-direction';
        caption.id = 'prompt-' + id;
        caption.textContent = prompt;
        field.setAttribute('aria-labelledby', caption.id);

        const choices = document.createElement('div');
        choices.className = 'rating-choices';
        for (const [value] of ratingOptions) {
            const label = document.createElement('label');
            label.className = 'rating-choice';
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = id;
            radio.value = value;
            radio.checked = value === '';
            const tile = document.createElement('span');
            tile.className = 'rating-tile';
            tile.append(ratingFace(value), ratingLabel(value, group));
            label.append(radio, tile);
            choices.append(label);
        }
        field.append(caption, choices);
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

    function createCategory(category) {
        const section = document.createElement('details');
        const heading = document.createElement('summary');
        heading.textContent = category.title;
        const readButton = document.createElement('button');
        readButton.type = 'button';
        readButton.className = 'secondary';
        readButton.textContent = 'Read ' + category.title + ' aloud';
        section.append(heading, readButton);
        speech.bind(readButton, () => [
            category.title,
            'Ratings are ' + ratingOptions.map(([value]) => ratingLabel(value, category.group)).join(', ') + '.',
            ...category.topics.flatMap(({ title, choices }) => [
                title + '.',
                ...choices.map(({ id, prompt }) => {
                    const value = fields.get(id).querySelector('input:checked').value;
                    return prompt + '. ' + ratingLabel(value, category.group) + '.';
                }),
            ]),
        ]);

        const topics = document.createElement('div');
        topics.className = 'topic-grid';
        for (const { title, choices } of category.topics) {
            const topic = document.createElement('fieldset');
            if (choices.length > 1) topic.className = 'topic-paired';
            const legend = document.createElement('legend');
            legend.textContent = title;
            topic.append(legend, ...choices.map(choice => createRatingField(choice, category.group)));
            topics.append(topic);
        }
        section.append(topics);
        return section;
    }

    function renderQuestionnaire() {
        if (fields.size) {
            refreshAnswers();
            return;
        }

        for (const group of groups) {
            const section = document.createElement('section');
            section.className = 'checklist-group';
            const heading = document.createElement('h2');
            heading.id = 'section-' + group.id;
            heading.tabIndex = -1;
            heading.textContent = group.title;
            section.setAttribute('aria-labelledby', heading.id);
            const description = document.createElement('p');
            description.className = 'note group-description';
            description.textContent = group.description;
            section.append(heading, description);

            const jump = document.createElement('a');
            jump.href = '#' + heading.id;
            jump.textContent = group.title;
            sectionNavigation.append(jump);

            for (const category of categories.filter(category => category.group === group.id)) {
                section.append(createCategory(category));
            }
            questionnaire.append(section);
        }
        questionnaire.querySelector('details').open = true;
        refreshAnswers();
    }

    document.querySelector('#clear-answers').addEventListener('click', async () => {
        if (!window.confirm('Clear all saved checklist answers from this browser? Downloaded files will remain on your device.')) return;
        try {
            speech.stop();
            await clearAnswers();
            refreshAnswers();
            status.textContent = 'Saved answers cleared.';
        } catch {
            refreshAnswers();
            status.textContent = 'Could not clear saved answers. Check your browser storage settings.';
        }
    });

    bindAnswerBackups(() => {
        speech.stop();
        refreshAnswers();
    });
    window.addEventListener('storage', event => {
        if (fields.size && isAnswerStorageEvent(event)) refreshAnswers();
    });
    mountAdultPage(() => {
        renderQuestionnaire();
        if (!location.hash.startsWith('#prompt-')) return;
        const field = fields.get(location.hash.slice('#prompt-'.length));
        if (!field) return;

        field.closest('details').open = true;
        requestAnimationFrame(() => {
            const caption = field.querySelector('.rating-direction');
            caption.tabIndex = -1;
            caption.focus({ preventScroll: true });
            caption.scrollIntoView({ block: 'center' });
        });
    });
})();
