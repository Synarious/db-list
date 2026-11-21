(function () {
    'use strict';

    const rolePairs = [
        ['rating-dominate', 'rating-submissive'],
        ['rating-sadist', 'rating-masochist'],
        ['rating-petowner', 'rating-pet'],
        ['rating-mastermistress', 'rating-slave'],
        ['rating-rigger', 'rating-ropebunny'],
        ['rating-caregiver', 'rating-little'],
        ['rating-brattamer', 'rating-brat'],
        ['rating-teacher', 'rating-learner'],
    ];
    const pairedRoleIds = new Map(rolePairs.flatMap(ids => ids.map(id => [id, ids])));
    const partnerRoleChoices = new Map([
        ['rating-withadom', 'rating-dominate'],
        ['rating-withasub', 'rating-submissive'],
    ]);
    const choicesById = new Map(DBList.categories.flatMap(({ topics }) =>
        topics.flatMap(({ choices }) => choices.map(choice => [choice.id, choice]))));
    const singlePartnerChoices = new Map([
        ['male', choicesById.get('adv-detail-you-with-1-male')],
        ['female', choicesById.get('adv-detail-you-with-1-female')],
    ]);
    const groupSettings = DBList.categories.find(({ id }) => id === 'advanced-group-settings');
    const pairs = DBList.categories.flatMap(({ id, title, group, topics }) => {
        const roleTopics = new Map(topics.map(topic => [topic.choices[0].id, topic]));
        return topics.flatMap(({ title: topic, comparison, contextual, fantasy, choices }) => choices.flatMap((own, index) => {
            const base = { title: topic, topicId: choices[0].id, category: title, categoryId: id, group, fantasy, own };
            const partnerRole = choicesById.get(partnerRoleChoices.get(own.id));
            if (partnerRole) {
                const pair = { ...base, other: partnerRole, preferenceSide: 'own' };
                return [pair, { ...pair, own: partnerRole, other: own, preferenceSide: 'other' }];
            }
            const ids = pairedRoleIds.get(own.id);
            const otherRole = ids && roleTopics.get(ids.find(id => id !== own.id));
            const other = otherRole?.choices[0] ?? (comparison === 'counterparts' ? choices[1 - index] : own);
            const groupScenario = id === groupSettings.id && own.id !== 'adv-detail-orgy-4-people';
            const kind = group === 'partner' ? 'partner' :
                contextual || groupScenario || id === 'advanced-roles-with-others' ? 'context' : '';
            const pairingTopic = otherRole && {
                title: ids.map(id => roleTopics.get(id).title).join(' / '),
                topicId: ids[0],
                fantasy: fantasy || otherRole.fantasy,
            };
            return [{ ...base, ...pairingTopic, other, kind }];
        }));
    });

    const declined = new Set(['not-interested', 'limit']);
    const ratings = DBList.ratingOptions.map(([rating]) => rating).filter(Boolean);
    const strongRatings = new Set(['favorite', 'like']);

    function randomIndex(length) {
        return Math.floor(Math.random() * length);
    }

    function createExampleComparison() {
        const ownAnswers = Object.create(null);
        const answers = Object.create(null);

        for (const id of choicesById.keys()) {
            ownAnswers[id] = ratings[randomIndex(ratings.length)];
            answers[id] = ratings[randomIndex(ratings.length)];
        }
        return { ownAnswers, answers };
    }

    function isWillingAgainstLimit(own, other) {
        return (own === 'willing-to-try' && other === 'limit') || (own === 'limit' && other === 'willing-to-try');
    }

    function compareRatings(own, other) {
        if (!own || !other) {
            const rating = own || other;
            if (rating === 'limit') return 'unansweredLimits';
            if (rating === 'not-interested') return 'declinedWithoutCounterpart';
            return 'unanswered';
        }
        const ownDeclines = declined.has(own);
        const otherDeclines = declined.has(other);
        if (ownDeclines && otherDeclines) return 'boundaries';
        if (isWillingAgainstLimit(own, other)) return 'willingLimits';
        if (own === 'limit' || other === 'limit') return 'limits';
        if (ownDeclines || otherDeclines) return 'differences';

        return own === 'maybe' || other === 'maybe' ? 'tentativeMatches' : 'matches';
    }

    function interestLevel(relaxed, result, own, other) {
        const mutualInterest = result === 'matches' || result === 'tentativeMatches';
        const eligible = result === 'matches' || (relaxed && result === 'tentativeMatches');
        return { eligible, exact: mutualInterest && own === other };
    }

    function compareSinglePartner(ownAnswers, otherAnswers, ownGender, otherGender) {
        const own = singlePartnerChoices.get(otherGender);
        const other = singlePartnerChoices.get(ownGender);
        if (!own || !other) return;
        const ownRating = ownAnswers[own.id] ?? '';
        const otherRating = otherAnswers[other.id] ?? '';
        if (!ownRating && !otherRating) return;
        return {
            title: 'One partner each', topicId: 'one-partner-each', category: groupSettings.title,
            categoryId: groupSettings.id, group: groupSettings.group, own, other, ownRating, otherRating,
            result: compareRatings(ownRating, otherRating),
        };
    }

    function groupBreakdownRows(rows) {
        const breakdown = {
            favorite: [], like: [], 'willing-to-try': [], maybe: rows.tentativeMatches,
            'willing-limit': rows.willingLimits, limit: rows.limits,
            'not-interested': rows.differences, boundary: rows.boundaries,
        };
        for (const row of rows.matches) {
            const { ownRating, otherRating } = row;
            const rating = ownRating === otherRating ? ownRating :
                strongRatings.has(ownRating) && strongRatings.has(otherRating) ? 'like' : 'willing-to-try';
            breakdown[rating].push(row);
        }
        return breakdown;
    }

    function compareChecklists(ownAnswers, otherAnswers, mode = 'relaxed', { ownProfile = {}, otherProfile = {} } = {}) {
        const relaxed = mode !== 'standard';
        // Use each actual comparison partner's supplied gender for the checklist defaults.
        const ownContext = DBList.questionContext({ gender: ownProfile.gender, partnerGender: otherProfile.gender });
        const otherContext = DBList.questionContext({ gender: otherProfile.gender, partnerGender: ownProfile.gender });
        ownContext.selfAnatomy = otherContext.partnerAnatomy;
        otherContext.selfAnatomy = ownContext.partnerAnatomy;

        const rows = {
            limits: [], willingLimits: [], unansweredLimits: [], declinedWithoutCounterpart: [], contextualLimits: [],
            differences: [], matches: [], tentativeMatches: [],
            boundaries: [], unanswered: [], partner: [], context: [], applicability: [],
        };
        const details = [];
        const pairing = compareSinglePartner(ownAnswers, otherAnswers, ownProfile.gender, otherProfile.gender);
        if (pairing) {
            Object.assign(pairing, interestLevel(relaxed, pairing.result, pairing.ownRating, pairing.otherRating));
            rows[pairing.result].push(pairing);
        }
        for (const pair of pairs) {
            const ownUsed = pair.own.id === pairing?.own.id;
            const otherUsed = pair.other.id === pairing?.other.id;
            const own = ownUsed ? '' : ownAnswers[pair.own.id] ?? '';
            const other = otherUsed ? '' : otherAnswers[pair.other.id] ?? '';
            if (!own && !other) continue;
            if ((pair.preferenceSide === 'own' && !own) || (pair.preferenceSide === 'other' && !other)) continue;
            let kind = pair.kind;
            if (!kind && (!DBList.isChoiceApplicable(pair.own, ownContext) || !DBList.isChoiceApplicable(pair.other, otherContext))) {
                kind = 'applicability';
            }
            if (kind && (own === 'limit' || other === 'limit')) kind = 'contextualLimits';
            kind ||= compareRatings(own, other);
            const row = {
                ...pair, ownRating: own, otherRating: other, ownUsed, otherUsed, result: kind,
                ...interestLevel(relaxed, kind, own, other),
            };
            rows[kind].push(row);
            details.push(row);
        }
        const mutualInterest = [...rows.matches, ...rows.tentativeMatches];
        const matches = mutualInterest.filter(row => row.eligible).length;
        const confirmedMatches = rows.matches.length;
        const countedWillingLimits = relaxed ? 0 : rows.willingLimits.length;
        const conflicts = rows.limits.length + rows.differences.length + countedWillingLimits;
        const evidence = DBList.compareProfileEvidence(ownAnswers, otherAnswers, ownProfile, otherProfile);
        const breakdownRows = groupBreakdownRows(rows);
        const breakdown = Object.fromEntries(Object.entries(breakdownRows).map(([key, pairs]) => [key, pairs.length]));
        return {
            rows, details, pairing, evidence, matches, confirmedMatches, conflicts, breakdown, breakdownRows,
            total: mutualInterest.length + conflicts,
        };
    }

    Object.assign(DBList, { compareChecklists, createExampleComparison });
})();
