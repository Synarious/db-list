(function () {
    'use strict';

    const namespace = 'http://www.w3.org/2000/svg';
    const symbols = {
        favorite: { path: 'M12 2.5 15 8.6 21.7 9.6 16.9 14.3 18 21 12 17.8 6 21 7.1 14.3 2.3 9.6 9 8.6Z', color: '#a6bfff', solid: true },
        like: { path: 'M8 10l3.6-6.6c.4-.8 1.4-.9 2-.4.8.7 1.1 1.8.8 2.8L13.5 9H19a2 2 0 0 1 2 2.4l-1.4 7A2 2 0 0 1 17.6 20H8z M4 10h4v10H4z', color: '#78d9b1' },
        maybe: { path: 'M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0Z M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.1-1.5 2.4 M12 17.5h.01', color: '#f1d58b' },
        'not-interested': { path: 'M6 6l12 12 M18 6 6 18', color: '#efae81' },
        limit: { path: 'M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0Z M5 19 19 5', color: '#f29ba8' },
        '': { path: 'M7 12h10', color: '#b7b7bf' },
    };

    function ratingIcon(value, size = 24) {
        const { path, color, solid } = symbols[value];
        const icon = document.createElementNS(namespace, 'svg');
        icon.setAttribute('class', 'rating-icon');
        icon.setAttribute('width', size);
        icon.setAttribute('height', size);
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('aria-hidden', 'true');
        const shape = document.createElementNS(namespace, 'path');
        shape.setAttribute('d', path);
        shape.setAttribute('fill', solid ? color : 'none');
        if (!solid) {
            shape.setAttribute('stroke', color);
            shape.setAttribute('stroke-width', '2.1');
            shape.setAttribute('stroke-linecap', 'round');
            shape.setAttribute('stroke-linejoin', 'round');
        }
        icon.append(shape);
        return icon;
    }

    function fillRatingKey(list, size) {
        for (const [value, label] of DBList.ratingOptions) {
            const item = document.createElement('li');
            item.append(ratingIcon(value, size), label);
            list.append(item);
        }
    }

    Object.assign(DBList, { ratingIcon, fillRatingKey });
})();
