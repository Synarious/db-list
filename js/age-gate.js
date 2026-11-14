(function () {
    'use strict';

    const key = 'db-list.adult-confirmed';

    function mountAdultPage(render) {
        const gate = document.querySelector('#age-gate');
        const app = document.querySelector('#app');
        const accept = document.querySelector('#accept-age');
        const decline = document.querySelector('#decline-age');
        const status = document.querySelector('#age-status');

        function showApp(moveFocus) {
            render();
            gate.hidden = true;
            app.hidden = false;
            if (moveFocus) document.querySelector('#app-heading').focus();
        }

        accept.addEventListener('click', () => {
            try {
                sessionStorage.setItem(key, 'yes');
            } catch {
                status.textContent = 'Enable browser session storage to continue.';
                return;
            }
            showApp(true);
        });

        decline.addEventListener('click', () => {
            status.textContent = 'You must be 18 or older to use this checklist.';
            status.tabIndex = -1;
            status.focus();
            accept.hidden = true;
            decline.hidden = true;
        });

        status.textContent = '';
        accept.disabled = false;
        decline.disabled = false;

        window.addEventListener('pageshow', () => {
            let confirmed = false;
            try {
                confirmed = sessionStorage.getItem(key) === 'yes';
            } catch {
                status.textContent = 'Enable browser session storage to continue.';
            }
            if (confirmed) showApp(false);
            else {
                gate.hidden = false;
                app.hidden = true;
            }
        });
    }

    Object.assign(DBList, { mountAdultPage });
})();
