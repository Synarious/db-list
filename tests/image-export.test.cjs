const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { inflateSync } = require('node:zlib');

const script = fs.readFileSync(path.join(__dirname, '../js/png-export.js'), 'utf8');

function rasterizer() {
    const DBList = {};
    const paints = [];
    const canvas = {
        getContext() {
            return { getImageData: () => ({ data: canvas.pixels }) };
        },
    };
    vm.runInNewContext(script, {
        DBList, TextEncoder, Blob, CompressionStream, WritableStream,
        document: { createElement: () => canvas },
        window: {
            async html2canvas(element, { x, y, scale }) {
                const left = Math.round(x * scale);
                const top = Math.round(y * scale);
                paints.push([left, top, canvas.width, canvas.height]);
                canvas.pixels = new Uint8Array(canvas.width * canvas.height * 4);
                for (let row = 0; row < canvas.height; row++) {
                    for (let col = 0; col < canvas.width; col++) {
                        const px = left + col;
                        canvas.pixels.set([px & 255, px >> 8, (top + row) & 255, 255],
                            (row * canvas.width + col) * 4);
                    }
                }
            },
        },
    });
    return { render: DBList.renderTiledPng, paints };
}

test('tiled PNG preserves rows and columns across partial tiles at a fractional scale', async () => {
    const { render, paints } = rasterizer();
    const progress = [];
    const blob = await render({}, { width: 1367, height: 172, scale: 1.5 }, {
        signal: new AbortController().signal,
        report: value => progress.push(value),
    });
    const png = Buffer.from(await blob.arrayBuffer());
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    assert.deepEqual([width, height], [2050, 258]);
    assert.deepEqual(paints, [[0, 0, 2048, 256], [2048, 0, 2, 256], [0, 256, 2048, 2], [2048, 256, 2, 2]]);
    assert.deepEqual(progress, [256 / 258, 1]);

    const chunks = [];
    for (let offset = 8; offset < png.length;) {
        const length = png.readUInt32BE(offset);
        if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') {
            chunks.push(png.subarray(offset + 8, offset + 8 + length));
        }
        offset += length + 12;
    }
    const rows = inflateSync(Buffer.concat(chunks));
    const stride = width * 4 + 1;
    const expected = Buffer.alloc(height * stride);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * stride + 1 + x * 4;
            expected[i] = x & 255;
            expected[i + 1] = x >> 8;
            expected[i + 2] = y & 255;
            expected[i + 3] = 255;
        }
    }
    assert.deepEqual(rows, expected);
});

test('canceling stops the renderer before it paints another band', async () => {
    const { render, paints } = rasterizer();
    const controller = new AbortController();
    await assert.rejects(render({}, { width: 10, height: 400, scale: 1 }, {
        signal: controller.signal,
        report: () => controller.abort(),
    }), { name: 'AbortError' });
    assert.deepEqual(paints, [[0, 0, 10, 256]]);
});
