(function () {
    'use strict';

    const { createAnswerBackup, parseAnswerBackup, importChecklist } = DBList;
    const maxBackupBytes = 1024 * 1024;

    function downloadFile(blob, name) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        document.body.append(link);
        try {
            link.click();
        } finally {
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
        }
    }

    function bindAnswerBackups(refresh) {
        const exportButton = document.querySelector('#export-answers');
        const importButton = document.querySelector('#import-answers');
        const fileInput = document.querySelector('#answer-backup-file');
        const status = document.querySelector('#backup-status');

        exportButton.addEventListener('click', () => {
            try {
                const backup = createAnswerBackup();
                downloadFile(new Blob([backup], { type: 'application/json' }), 'deviant-bound-checklist-backup.json');
                status.textContent = 'Backup download requested.';
            } catch {
                status.textContent = 'Could not export your saved answers. Check your browser storage and download settings.';
            }
        });

        importButton.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files[0];
            fileInput.value = '';
            if (!file) return;

            importButton.disabled = true;
            status.textContent = '';
            try {
                if (file.size > maxBackupBytes) {
                    status.textContent = 'This file is too large. Choose a checklist backup of 1 MB or less.';
                    return;
                }

                let text;
                try {
                    text = await file.text();
                } catch {
                    status.textContent = 'Could not read the selected file.';
                    return;
                }

                let checklist;
                try {
                    checklist = parseAnswerBackup(text);
                } catch (error) {
                    status.textContent = error.message;
                    return;
                }

                const count = Object.keys(checklist.answers).length + Object.keys(checklist.profile).length;
                if (!count) {
                    status.textContent = 'No compatible entries found. Skipped ' + checklist.skipped + '.';
                    return;
                }
                if (!window.confirm('Import up to ' + count + ' compatible entries into blank fields? Existing values will be kept. ' +
                    checklist.skipped + ' incompatible entries will be skipped.')) {
                    status.textContent = 'Import canceled.';
                    return;
                }

                let report;
                try {
                    report = await importChecklist(checklist);
                } catch {
                    status.textContent = 'Could not save the imported answers. Check your browser storage settings.';
                    return;
                }

                refresh();
                status.textContent = 'Added ' + report.added + ' · Already matched ' + report.matching +
                    ' · Conflicts kept ' + report.conflicts + ' · Skipped ' + report.skipped;
            } finally {
                importButton.disabled = false;
            }
        });
    }

    Object.assign(DBList, { bindAnswerBackups, downloadFile });
})();
