(function () {
    'use strict';

    const { categories, ratingLabel } = DBList;
    const openRatings = new Set(['favorite', 'like', 'willing-to-try', 'maybe']);
    const declines = new Set(['not-interested', 'limit']);
    const ageBands = categories.find(category => category.id === 'advanced-adult-ages').topics;
    const ropeDirections = [
        ['Receiving', 'adv-detail-rope-play-self', 'shibari-r'],
        ['Giving', 'adv-detail-rope-play-partner', 'shibari-g'],
    ];

    function switchEvidence(answers, counterpart) {
        const preference = answers['rating-withaswitch'];
        const scene = counterpart['adv-switch-scene'];
        if (!openRatings.has(preference) || !openRatings.has(scene)) return;

        return {
            text: `Switch Partner was rated “${ratingLabel(preference)}”. The other person rated switching within a scene “${ratingLabel(scene)}”.`,
            source: 'Switch Partner and Switching Within a Scene',
        };
    }

    function ageEvidence(answers, age) {
        if (!Number.isSafeInteger(age) || age < 18) return;

        const matching = ageBands.filter(({ ageRange: [min, max] }) => age >= min && age <= max);
        if (!matching.length) return;
        const ratings = matching.map(({ choices }) => answers[choices[0].id] ?? '');
        const bands = matching.map(({ title }) => title).join(' and ');
        const [rating] = ratings;
        const source = 'Adult age ranges and the other person’s reported age';

        if (ratings.some(value => value !== rating)) {
            const details = matching.map(({ title }, index) =>
                `${title} was rated “${ratingLabel(ratings[index], 'partner')}”`).join(' and ');
            return { text: `Review the overlapping age bands. ${details}.`, source };
        }
        if (!rating) return { text: `No preference was recorded for the other person’s age range (${bands}).`, source };
        return {
            text: `The other person’s reported age falls in ${bands}. The preference is “${ratingLabel(rating, 'partner')}”.`,
            source,
        };
    }

    function ropeEvidence(answers) {
        const statements = [];
        for (const [direction, ropeId, shibariId] of ropeDirections) {
            const general = answers[ropeId];
            const specific = answers[shibariId];
            if (openRatings.has(general) && declines.has(specific)) {
                statements.push(`${direction} was rated “${ratingLabel(general)}” for General Rope Play and “${ratingLabel(specific)}” for Shibari.`);
            }
        }
        if (statements.length) {
            return {
                text: statements.join(' ') + ' The specific Shibari rating applies.',
                source: 'General Rope Play and Shibari, in the same direction',
            };
        }
    }

    function compareProfileEvidence(ownAnswers, otherAnswers, ownProfile = {}, otherProfile = {}) {
        const evidence = [
            { title: 'Switch Partner', own: switchEvidence(ownAnswers, otherAnswers), other: switchEvidence(otherAnswers, ownAnswers) },
            { title: 'Adult age preferences', own: ageEvidence(ownAnswers, otherProfile.age), other: ageEvidence(otherAnswers, ownProfile.age) },
            { title: 'General Rope Play and Shibari', own: ropeEvidence(ownAnswers), other: ropeEvidence(otherAnswers) },
        ];
        return evidence.filter(({ own, other }) => own || other);
    }

    Object.assign(DBList, { compareProfileEvidence });
})();
