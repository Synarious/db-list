(function () {
    'use strict';

    const comparisonBackupKey = 'db-list.pending-comparison';
    const missingLink = 'Paste the full MyList share link from Results → Share URL (Copy).';

    function parseComparisonLink(value) {
        // Share data lives in the fragment, so importing does not contact the link's host.
        const pasted = value.trim().replace(/[\s\\]+$/, '');
        const markdown = /^\[(?:[^\]\\\r\n]|\\.)*\]\(\s*(\S+?)(?:[ \t]+(?:"[^"\r\n]*"|'[^'\r\n]*'))?\s*\)$/.exec(pasted);
        const target = (markdown?.[1] ?? pasted).replace(/^<(\S+)>$/, '$1').replace(/\\([#~:/_.&-])/g, '$1');
        let url;
        try {
            url = new URL(target, location.href);
        } catch {
            throw new Error(missingLink);
        }
        if (!['https:', 'http:', 'file:'].includes(url.protocol)) throw new Error(missingLink);
        const hash = DBList.checklistShareHash(url.hash);
        if (!hash) throw new Error(missingLink);
        return { hash, checklist: DBList.parseChecklistShareHash(hash) };
    }

    function bindComparisonInput(container, apply) {
        const form = container.querySelector('#compare-link-form');
        const input = container.querySelector('#compare-link');
        const secondInput = container.querySelector('#compare-second-link');
        const fileInput = container.querySelector('#compare-file');
        const linkStatus = container.querySelector('#compare-link-status');
        const status = container.querySelector('#compare-import-status');
        let request = 0;

        function clearLinkError() {
            linkStatus.textContent = '';
            input.removeAttribute('aria-invalid');
            secondInput?.removeAttribute('aria-invalid');
        }

        input.addEventListener('input', clearLinkError);
        secondInput?.addEventListener('input', clearLinkError);
        form.addEventListener('submit', event => {
            event.preventDefault();
            request++;
            clearLinkError();
            status.textContent = '';
            const secondLink = secondInput?.value.trim();
            let currentInput = input;
            try {
                const first = parseComparisonLink(input.value);
                if (!secondLink) {
                    apply(first.checklist, { hash: first.hash });
                    return;
                }
                if (!Object.keys(first.checklist.answers).length) throw new Error('These results contain no usable ratings.');

                currentInput = secondInput;
                const second = parseComparisonLink(secondLink);
                if (!Object.keys(second.checklist.answers).length) throw new Error('These results contain no usable ratings.');
                apply(second.checklist, { hash: second.hash, ownChecklist: first.checklist });
            } catch (error) {
                currentInput.setAttribute('aria-invalid', 'true');
                const label = currentInput === input ? 'First link. ' : 'Second link. ';
                linkStatus.textContent = (secondLink ? label : '') + error.message;
                currentInput.focus();
            }
        });

        container.querySelector('#compare-example').addEventListener('click', () => {
            request++;
            clearLinkError();
            status.textContent = '';
            try {
                apply(undefined, { example: true });
            } catch (error) {
                status.textContent = error.message;
            }
        });

        container.querySelector('#compare-backup').addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files[0];
            fileInput.value = '';
            if (!file) return;
            const selection = ++request;
            clearLinkError();
            if (file.size > 1024 * 1024) {
                status.textContent = 'Choose a MyList backup of 1 MB or less.';
                return;
            }
            status.textContent = '';
            let backup;
            try {
                backup = await file.text();
            } catch {
                if (selection === request) status.textContent = 'Could not read the selected file.';
                return;
            }
            if (selection !== request) return;
            try {
                apply(DBList.parseAnswerBackup(backup), { backup });
            } catch (error) {
                status.textContent = error.message;
            }
        });
        return () => {
            request++;
            clearLinkError();
        };
    }

    Object.assign(DBList, { bindComparisonInput, comparisonBackupKey, parseComparisonLink });
})();
