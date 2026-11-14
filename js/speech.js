(function () {
    'use strict';

    function createSpeechControls() {
        const engine = window.speechSynthesis;
        let activeButton = null;
        let playback = null;
        let readLabel = '';
        engine?.getVoices();

        function stop() {
            playback = null;
            if (!activeButton) return;
            engine.cancel();
            activeButton.textContent = readLabel;
            activeButton = null;
        }

        function bind(button, getLines) {
            const message = document.createElement('span');
            message.setAttribute('role', 'status');
            message.className = 'speech-status';
            button.after(message);

            button.addEventListener('click', () => {
                const wasReading = activeButton === button;
                stop();
                message.textContent = '';
                if (wasReading) {
                    message.textContent = 'Reading stopped.';
                    return;
                }

                const voice = engine?.getVoices().find(voice => voice.localService && /^en(?:[-_]|$)/i.test(voice.lang));
                if (!voice) {
                    message.textContent = 'Read aloud needs an English voice installed on this device.';
                    return;
                }

                const queue = getLines()[Symbol.iterator]();
                playback = queue;
                activeButton = button;
                readLabel = button.textContent;
                button.textContent = 'Stop reading';

                function next() {
                    if (playback !== queue) return;
                    const line = queue.next();
                    if (line.done) {
                        stop();
                        return;
                    }
                    const utterance = new SpeechSynthesisUtterance(line.value);
                    utterance.voice = voice;
                    utterance.lang = voice.lang;
                    utterance.onend = next;
                    utterance.onerror = () => {
                        if (playback !== queue) return;
                        stop();
                        message.textContent = 'Read aloud could not play. Check your device’s speech settings.';
                    };
                    engine.speak(utterance);
                }

                next();
            });
        }

        bind(document.querySelector('#read-intro'), () =>
            Array.from(document.querySelectorAll('#instructions p'), p => p.textContent)
        );
        window.addEventListener('pagehide', stop);
        return { bind, stop };
    }

    Object.assign(DBList, { createSpeechControls });
})();
