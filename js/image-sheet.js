(function () {
    'use strict';

    const { groups, ratingLabel, ratingIcon, fillRatingKey } = DBList;

    function textElement(tag, text) {
        const element = document.createElement(tag);
        element.textContent = text;
        return element;
    }

    const columnLabels = {
        activities: ['Receive', 'Give'],
        gear: ['I wear', 'Partner wears'],
        intimacy: ['Receive', 'Give'],
        communication: ['Receive', 'Give'],
    };

    function categoryTable({ id, title, subtitle, topics, directions = columnLabels[id] }) {
        const hasPairedRows = topics.some(topic => topic.choices.length > 1);

        const table = document.createElement('table');
        const caption = table.createCaption();
        const captionTitle = textElement('strong', title);
        captionTitle.className = 'image-column-title';
        caption.append(captionTitle);
        if (subtitle) caption.append(textElement('span', subtitle));
        const columns = document.createElement('div');
        columns.className = 'image-column-labels';
        const labels = directions ?? ['Rating'];
        for (const label of labels) {
            const column = document.createElement('div');
            column.append(textElement('span', label === 'Partner wears' ? 'They wear' : label));
            columns.append(column);
        }
        caption.append(columns);
        if (hasPairedRows) table.classList.add('image-paired-table');

        const body = table.createTBody();
        for (const topic of topics) {
            const row = body.insertRow();
            const heading = textElement('th', topic.title);
            heading.scope = 'row';
            const paired = topic.choices.length > 1;
            if (paired && topic.choices.some((choice, index) => choice.short !== directions?.[index])) {
                heading.append(textElement('span', topic.choices.map(choice => choice.short).join(' / ')));
            }
            row.append(heading);
            const cell = row.insertCell();
            if (paired) cell.className = 'image-paired-ratings';

            for (const { value } of topic.choices) {
                const rating = document.createElement('div');
                rating.className = 'image-rating';
                if (!value) rating.classList.add('image-unanswered');
                rating.append(ratingIcon(value, 38));
                cell.append(rating);
            }
        }
        const panel = document.createElement('div');
        panel.className = 'image-category-panel';
        panel.append(table);

        const column = document.createElement('div');
        column.className = 'image-category-column';
        const fade = document.createElement('canvas');
        fade.className = 'image-category-fade';
        column.append(panel, fade);
        return column;
    }

    function drawFadingLine(ctx, x, width, depth, color) {
        const gradient = ctx.createLinearGradient(0, 0, 0, depth);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, 0, width, depth);
    }

    function prepareGrid(grid, sheetTop, scale) {
        grid.style.paddingTop = '';
        const tables = [...grid.querySelectorAll('.image-category-panel table')];
        const rowsByColumn = tables.map(table => [...table.tBodies[0].rows]);
        const captionHeight = Math.ceil(Math.max(...tables.map(table => table.caption.getBoundingClientRect().height)));
        const rowHeights = [];
        for (const rows of rowsByColumn) {
            rows.forEach((row, index) => {
                const height = Math.ceil(row.getBoundingClientRect().height);
                rowHeights[index] = Math.max(rowHeights[index] ?? 0, height);
            });
        }
        tables.forEach(table => { table.caption.style.height = captionHeight + 'px'; });
        for (const rows of rowsByColumn) {
            rows.forEach((row, index) => { row.style.height = rowHeights[index] + 'px'; });
        }

        // Align table and canvas edges to whole PNG pixels before capturing them.
        const rowTop = tables[0].tBodies[0].getBoundingClientRect().top - sheetTop;
        grid.style.paddingTop = Math.ceil(rowTop) - rowTop + 'px';

        const styles = getComputedStyle(grid);
        const minimumRowHeight = parseFloat(styles.getPropertyValue('--image-row-height'));
        const stripes = ['--export-glass-stripe', '--export-glass-surface']
            .map(name => styles.getPropertyValue(name).trim());
        const fades = [...grid.querySelectorAll('.image-category-fade')];
        fades.forEach((canvas, columnIndex) => {
            const { left, width, height } = canvas.getBoundingClientRect();
            canvas.width = Math.ceil(width * scale);
            canvas.height = Math.ceil(height * scale);
            const ctx = canvas.getContext('2d');
            ctx.scale(canvas.width / width, canvas.height / height);

            const panelStyle = getComputedStyle(canvas.previousElementSibling);
            const leftBorder = parseFloat(panelStyle.borderLeftWidth);
            const rightBorder = parseFloat(panelStyle.borderRightWidth);
            const rows = rowsByColumn[columnIndex];
            const pattern = ctx.createLinearGradient(0, 0, 0, height);
            const joinBlend = minimumRowHeight * .16;
            const stripeBlend = minimumRowHeight * .04;
            for (let y = 0, index = rows.length; y < height; index++) {
                const stripeHeight = rowHeights[index] ?? minimumRowHeight;
                const blendStart = Math.max(0, y - stripeBlend) / height;
                const blendEnd = Math.min(height, y + (y === 0 ? joinBlend : stripeBlend)) / height;
                pattern.addColorStop(blendStart, stripes[(index + 1) % stripes.length]);
                pattern.addColorStop(blendEnd, stripes[index % stripes.length]);
                y += stripeHeight;
            }
            ctx.fillStyle = pattern;
            ctx.fillRect(leftBorder, 0, width - leftBorder - rightBorder, height);

            const edgeDepth = minimumRowHeight * .5;
            drawFadingLine(ctx, 0, leftBorder, edgeDepth, panelStyle.borderLeftColor);
            drawFadingLine(ctx, width - rightBorder, rightBorder, edgeDepth, panelStyle.borderRightColor);
            const ratingCell = rows.at(-1)?.cells[1];
            if (ratingCell) {
                const cellStyle = getComputedStyle(ratingCell);
                const x = ratingCell.getBoundingClientRect().left - left;
                drawFadingLine(ctx, x, parseFloat(cellStyle.borderLeftWidth), minimumRowHeight * .7, cellStyle.borderLeftColor);
            }

            // Feather the striped surface downward and inward without changing its colors.
            ctx.globalCompositeOperation = 'destination-in';
            const vertical = ctx.createLinearGradient(0, 0, 0, height);
            vertical.addColorStop(0, '#000');
            vertical.addColorStop(.12, '#000e');
            vertical.addColorStop(.36, '#000b');
            vertical.addColorStop(.68, '#0004');
            vertical.addColorStop(1, '#0000');
            ctx.fillStyle = vertical;
            ctx.fillRect(0, 0, width, height);

            const taperWidth = width * .8;
            const taperHeight = height * 1.35;
            const center = width / (2 * taperWidth);
            ctx.scale(taperWidth, taperHeight);
            const taper = ctx.createRadialGradient(center, -.37, 0, center, -.37, 1);
            taper.addColorStop(.73, '#000');
            taper.addColorStop(1, '#0000');
            ctx.fillStyle = taper;
            ctx.fillRect(0, 0, width / taperWidth, height / taperHeight);
        });
    }

    DBList.prepareImageColumns = function (sheet, scale) {
        const sheetTop = sheet.getBoundingClientRect().top;
        for (const grid of sheet.querySelectorAll('.image-categories')) prepareGrid(grid, sheetTop, scale);
    };

    function categoryGrid(categories, advanced = false) {
        const grid = document.createElement('div');
        grid.className = 'image-categories';
        grid.style.gridTemplateColumns = 'repeat(' + categories.length + ', minmax(0, 1fr))';
        if (advanced) {
            const heading = textElement('h2', 'Advanced options');
            heading.className = 'image-group-band image-advanced-heading';
            grid.append(heading);
        }
        for (const { id, title } of groups) {
            const columnCount = categories.filter(category => category.group === id).length;
            if (columnCount === 0) continue;
            const band = textElement('h3', title);
            band.className = 'image-group-band';
            band.style.gridColumn = 'span ' + columnCount;
            grid.append(band);
        }
        grid.append(...categories.map(categoryTable));
        return grid;
    }

    DBList.createImageSheet = function ({ categories, details, example, theme = 'graphite' }) {
        const sheet = document.createElement('div');
        sheet.className = 'image-sheet';
        sheet.dataset.imageTheme = theme;
        sheet.setAttribute('aria-hidden', 'true');

        const legend = document.createElement('ul');
        legend.className = 'image-legend';
        fillRatingKey(legend, 24);

        const brand = textElement('p', example ? 'Deviant Bound · Example' : 'Deviant Bound');
        brand.className = 'image-brand';
        const title = document.createElement('div');
        const intro = textElement('p', 'Make your own at ');
        const site = textElement('a', 'kinklist.deviantbound.com');
        site.href = 'https://kinklist.deviantbound.com/';
        intro.append(site);
        intro.className = 'image-intro';
        title.append(brand);
        if (details.length) {
            const profile = document.createElement('ul');
            profile.className = 'image-profile';
            profile.append(...details.map(detail => textElement('li', detail)));
            title.append(profile);
        }
        title.append(intro);

        const legendNote = textElement('p', 'Read paired ratings left to right. Use the topic subtitle when shown, otherwise use the column headings. In partner preferences, ' +
            'the stop symbol means “' + ratingLabel('limit', 'partner') + '.”');
        legendNote.className = 'image-legend-note';
        const key = document.createElement('div');
        const rubric = textElement('h3', 'Rating rubric');
        rubric.className = 'image-rubric-heading';
        key.append(rubric, legend, legendNote);

        const header = document.createElement('header');
        header.className = 'image-header';
        header.append(title, key);
        sheet.append(header, categoryGrid(categories.filter(category => !category.advanced)));
        const advancedCategories = categories.filter(category => category.advanced);
        if (advancedCategories.length) sheet.append(categoryGrid(advancedCategories, true));
        return sheet;
    };
})();
