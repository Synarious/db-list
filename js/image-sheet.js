(function () {
    'use strict';

    const { groups, ratingOptions, ratingLabel, ratingFace } = DBList;

    function textElement(tag, text) {
        const element = document.createElement(tag);
        element.textContent = text;
        return element;
    }

    function categoryTable({ title, topics }) {
        const table = document.createElement('table');
        table.createCaption().textContent = title;
        if (topics.some(topic => topic.choices.length > 1)) table.className = 'image-paired-table';

        const body = table.createTBody();
        for (const { title: topic, choices } of topics) {
            const row = body.insertRow();
            row.append(textElement('th', topic));
            const cell = row.insertCell();
            const paired = choices.length > 1;
            if (paired) cell.className = 'image-paired-ratings';

            for (const { value, short } of choices) {
                const rating = document.createElement('div');
                rating.className = 'image-rating';
                if (!value) rating.classList.add('image-unanswered');
                rating.append(ratingFace(value, paired ? 25 : 32));
                if (paired) rating.append(textElement('span', short));
                cell.append(rating);
            }
        }
        return table;
    }

    DBList.createImageSheet = function (categories, consentNote) {
        const sheet = document.createElement('div');
        sheet.className = 'image-sheet';
        sheet.setAttribute('aria-hidden', 'true');

        const legend = document.createElement('ul');
        legend.className = 'image-legend';
        for (const [value, label] of ratingOptions) {
            const item = textElement('li', label);
            item.prepend(ratingFace(value));
            legend.append(item);
        }

        const grid = document.createElement('div');
        grid.className = 'image-categories';
        grid.style.gridTemplateColumns = 'repeat(' + categories.length + ', minmax(0, 1fr))';
        for (const { id, title } of groups) {
            const columnCount = categories.filter(category => category.group === id).length;
            if (columnCount === 0) continue;
            const band = textElement('h3', title);
            band.className = 'image-group-band';
            band.style.gridColumn = 'span ' + columnCount;
            grid.append(band);
        }
        grid.append(...categories.map(categoryTable));

        const brand = textElement('p', 'Deviant Bound');
        brand.className = 'image-brand';
        const title = document.createElement('div');
        const intro = textElement('p', consentNote);
        intro.className = 'image-intro';
        title.append(brand, textElement('h2', 'BDSM Kink List'), intro);

        const legendNote = textElement('p', 'In partner preferences, the red face means “' +
            ratingLabel('limit', 'partner') + '.” Relationship options are rated separately.');
        legendNote.className = 'image-legend-note';
        const key = document.createElement('div');
        key.append(legend, legendNote);

        const header = document.createElement('header');
        header.className = 'image-header';
        header.append(title, key);
        sheet.append(header, grid);
        return sheet;
    };
})();
