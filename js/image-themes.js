(function () {
    'use strict';

    const imageThemes = {
        graphite: 'Graphite',
        plum: 'Plum',
        ocean: 'Ocean',
        forest: 'Forest',
        ember: 'Ember',
    };

    function mountImageThemes(picker) {
        for (const [theme, name] of Object.entries(imageThemes)) {
            const label = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = 'imageTheme';
            input.value = theme;
            input.defaultChecked = theme === 'graphite';
            const preview = document.createElement('span');
            preview.className = 'theme-preview';
            preview.dataset.imageTheme = theme;
            preview.setAttribute('aria-hidden', 'true');
            const heading = document.createElement('strong');
            heading.textContent = 'BDSM Kink List';
            const category = document.createElement('span');
            category.className = 'theme-preview-category';
            category.textContent = 'My Kinks';
            preview.append(heading, category);
            for (const [topic, rating] of [['Dominant', 'favorite'], ['Switch', 'like'], ['Submissive', 'maybe']]) {
                const row = document.createElement('span');
                row.className = 'theme-preview-row';
                row.append(topic, DBList.ratingIcon(rating, 16));
                preview.append(row);
            }
            label.append(input, name, preview);
            picker.append(label);
        }
    }

    Object.assign(DBList, { imageThemes, mountImageThemes });
})();
