const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../js/file-download.js'), 'utf8');
const macUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';
const linuxUserAgent = 'Mozilla/5.0 (X11; Linux x86_64)';

function supportsImageExport(navigator) {
    const DBList = {};
    vm.runInNewContext(script, { DBList, navigator });
    return DBList.supportsImageExport();
}

test('image export is unavailable on iOS, iPadOS, and Android in mobile and desktop modes', () => {
    for (const navigator of [
        { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' },
        { userAgent: macUserAgent, platform: 'MacIntel', maxTouchPoints: 5 },
        { userAgent: 'Mozilla/5.0 (Linux; Android 10; K)' },
        { userAgent: linuxUserAgent, userAgentData: { platform: 'Android' } },
        { userAgent: linuxUserAgent, platform: 'Linux armv81', maxTouchPoints: 5, userAgentData: { platform: 'Linux' } },
    ]) {
        assert.equal(supportsImageExport(navigator), false, JSON.stringify(navigator));
    }
});

test('desktop image export remains available on Mac, Linux, and touch-enabled Windows', () => {
    for (const navigator of [
        { userAgent: macUserAgent, platform: 'MacIntel', maxTouchPoints: 0 },
        { userAgent: linuxUserAgent, platform: 'Linux x86_64', maxTouchPoints: 5 },
        { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32', maxTouchPoints: 10 },
    ]) {
        assert.equal(supportsImageExport(navigator), true, JSON.stringify(navigator));
    }
});
