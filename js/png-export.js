(function () {
    'use strict';

    const tileWidth = 2048;
    const bandHeight = 256;
    const encoder = new TextEncoder();
    const crcTable = Uint32Array.from({ length: 256 }, (_, byte) => {
        for (let bit = 0; bit < 8; bit++) {
            byte = (byte >>> 1) ^ (byte & 1 ? 0xedb88320 : 0);
        }
        return byte;
    });

    function pngChunk(type, data = new Uint8Array()) {
        const chunk = new Uint8Array(data.length + 12);
        const view = new DataView(chunk.buffer);
        view.setUint32(0, data.length);
        chunk.set(encoder.encode(type), 4);
        chunk.set(data, 8);
        let crc = 0xffffffff;
        for (const byte of chunk.subarray(4, -4)) {
            crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
        }
        view.setUint32(chunk.length - 4, ~crc);
        return chunk;
    }

    DBList.renderTiledPng = async function (element, options, { signal, report }) {
        const { scale } = options;
        let { width, height } = options;
        const canvas = document.createElement('canvas');

        // Compare measures its export layout inside the fixed-width cloned document.
        if (width === undefined || height === undefined) {
            canvas.width = canvas.height = 1;
            await window.html2canvas(element, {
                ...options, canvas, width: 1, height: 1,
                async onclone(doc, clone) {
                    await options.onclone?.(doc, clone);
                    const bounds = clone.getBoundingClientRect();
                    width = Math.ceil(bounds.width);
                    height = Math.ceil(bounds.height);
                },
            });
            canvas.width = 0;
        }

        const pixelWidth = Math.floor(width * scale);
        const pixelHeight = Math.floor(height * scale);
        if (!(pixelWidth > 0 && pixelHeight > 0)) throw new Error('Empty export');
        const header = new Uint8Array(13);
        const view = new DataView(header.buffer);
        view.setUint32(0, pixelWidth);
        view.setUint32(4, pixelHeight);
        header.set([8, 6], 8); // 8-bit RGBA
        const chunks = [Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), pngChunk('IHDR', header)];
        const stream = new CompressionStream('deflate');
        const writer = stream.writable.getWriter();
        const collect = stream.readable.pipeTo(new WritableStream({
            write(data) {
                chunks.push(pngChunk('IDAT', data));
            },
        }));
        // Observe errors even if the renderer is still painting a tile.
        collect.catch(() => {});

        try {
            const stride = pixelWidth * 4 + 1; // Includes the PNG filter byte for each row.
            for (let top = 0; top < pixelHeight; top += bandHeight) {
                const rows = Math.min(bandHeight, pixelHeight - top);
                const band = new Uint8Array(stride * rows);
                for (let left = 0; left < pixelWidth; left += tileWidth) {
                    signal.throwIfAborted();
                    const columns = Math.min(tileWidth, pixelWidth - left);
                    canvas.width = columns;
                    canvas.height = rows;
                    await window.html2canvas(element, {
                        ...options, canvas, x: left / scale, y: top / scale,
                        width: columns / scale, height: rows / scale,
                    });
                    signal.throwIfAborted();
                    const pixels = canvas.getContext('2d').getImageData(0, 0, columns, rows).data;
                    canvas.width = 0;
                    const tileStride = columns * 4;
                    for (let row = 0; row < rows; row++) {
                        band.set(pixels.subarray(row * tileStride, (row + 1) * tileStride),
                            row * stride + 1 + left * 4);
                    }
                }
                await writer.write(band);
                report((top + rows) / pixelHeight);
            }
            await writer.close();
            await collect;
            chunks.push(pngChunk('IEND'));
            return new Blob(chunks, { type: 'image/png' });
        } catch (error) {
            await writer.abort(error).catch(() => {});
            throw error;
        } finally {
            canvas.width = 0;
        }
    };

    DBList.bindPngExport = function (button, render, failureMessage = 'Could not create the PNG. Try exporting again.') {
        const dialog = document.createElement('dialog');
        dialog.className = 'png-export';
        dialog.setAttribute('aria-labelledby', 'png-export-title');
        dialog.innerHTML = `
            <h2 id="png-export-title">Export PNG</h2>
            <p class="note" role="status"></p>
            <progress max="1" aria-label="Image export progress"></progress>
            <div class="actions">
                <button type="button" class="page-primary" data-save hidden>Save PNG</button>
                <button type="button" class="secondary" data-share hidden>Share image</button>
                <button type="button" class="secondary" data-close autofocus>Cancel</button>
            </div>`;
        const status = dialog.querySelector('[role="status"]');
        const meter = dialog.querySelector('progress');
        const save = dialog.querySelector('[data-save]');
        const share = dialog.querySelector('[data-share]');
        const close = dialog.querySelector('[data-close]');
        let controller;
        let file;
        document.body.append(dialog);

        function cancel() {
            if (controller) {
                controller.abort();
                status.textContent = 'Canceling export…';
            } else {
                dialog.close();
            }
        }

        close.addEventListener('click', cancel);
        dialog.addEventListener('cancel', event => {
            event.preventDefault();
            cancel();
        });
        dialog.addEventListener('close', () => { file = undefined; });
        save.addEventListener('click', () => {
            DBList.downloadFile(file, file.name);
            dialog.close();
        });
        share.addEventListener('click', async () => {
            try {
                await navigator.share({ files: [file] });
            } catch (error) {
                if (error.name !== 'AbortError' && dialog.open) status.textContent = 'Use Save PNG to keep a copy.';
            }
        });

        button.hidden = false;
        button.addEventListener('click', async () => {
            if (dialog.open) return;
            if (typeof CompressionStream !== 'function') {
                meter.hidden = true;
                status.textContent = failureMessage;
                close.textContent = 'Close';
                dialog.showModal();
                return;
            }
            controller = new AbortController();
            const { signal } = controller;
            meter.value = 0;
            meter.hidden = false;
            save.hidden = share.hidden = true;
            close.textContent = 'Cancel';
            status.textContent = 'Creating your full-resolution PNG on this device.';
            dialog.showModal();
            try {
                const { blob, name } = await render({
                    signal,
                    report(fraction) {
                        meter.value = fraction;
                        if (fraction === 1) status.textContent = 'Finishing PNG…';
                    },
                });
                signal.throwIfAborted();
                file = new File([blob], name, { type: blob.type });
                share.hidden = !navigator.canShare?.({ files: [file] });
                save.hidden = false;
                status.textContent = 'Your PNG is ready.';
                save.focus();
            } catch {
                if (signal.aborted) dialog.close();
                else status.textContent = failureMessage;
            } finally {
                controller = undefined;
                meter.hidden = true;
                close.textContent = 'Close';
            }
        });
    };
})();
