(function () {
    'use strict';

    DBList.supportsImageExport = function () {
        const { userAgent, userAgentData, platform, maxTouchPoints } = navigator;
        const mobilePlatform = /\b(?:Android|iPhone|iPad|iPod)\b/i;
        // iPadOS can report macOS, and Chrome's Android desktop mode can report Linux.
        const appleTouchDevice = platform === 'MacIntel' && maxTouchPoints > 1;
        const androidDesktopMode = platform === 'Linux armv81' && maxTouchPoints > 0;
        return !(mobilePlatform.test(userAgent) || mobilePlatform.test(platform) ||
            userAgentData?.platform === 'Android' || appleTouchDevice || androidDesktopMode);
    };

    DBList.downloadFile = function (blob, name) {
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
    };
})();
