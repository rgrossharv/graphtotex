// Keep the TeX runtime and its styles inside this frame and load them only for exports.
const runtimeBase = 'https://cdn.jsdelivr.net/npm/@rod2ik/tikzjax@1.6.0/dist';
let runtimePromise;
let activeRequest = 0;
let observer;
let timeout;

function loadRuntime() {
  if (runtimePromise) return runtimePromise;
  runtimePromise = new Promise((resolve, reject) => {
    window.TikzJaxOptions = {
      assetBaseUrl: runtimeBase,
      workerPool: { enabled: true, maxWorkers: 1, initializationRetries: 0 },
      renderTimeout: 45000,
      maxRetries: 0,
      theme: { defaultTheme: 'light', followSystemTheme: false, adaptiveColors: { enabled: false }, adaptiveFills: { enabled: false } }
    };
    const fonts = document.createElement('link');
    fonts.rel = 'stylesheet';
    fonts.href = `${runtimeBase}/fonts.css`;
    document.head.appendChild(fonts);
    const script = document.createElement('script');
    script.src = `${runtimeBase}/tikzjax.js`;
    script.onload = resolve;
    script.onerror = () => {
      fonts.remove();
      script.remove();
      runtimePromise = undefined;
      reject(new Error('Could not load the TeX renderer.'));
    };
    document.head.appendChild(script);
  });
  return runtimePromise;
}

function report(id, status) {
  if (id !== activeRequest) return;
  clearTimeout(timeout);
  observer?.disconnect();
  parent.postMessage({ type: 'graphtotex-preview', id, status }, location.origin);
}

window.addEventListener('message', async (event) => {
  if (event.source !== parent || event.origin !== location.origin) return;
  const request = event.data;
  if (request?.type !== 'graphtotex-render' || typeof request.code !== 'string' || !Number.isInteger(request.id)) return;
  const { id, code, variant } = request;
  activeRequest = id;
  observer?.disconnect();
  clearTimeout(timeout);
  const figure = document.getElementById('figure');
  figure.replaceChildren();
  timeout = setTimeout(() => report(id, 'error'), 55000);

  try {
    await loadRuntime();
    if (id !== activeRequest) return;
    const source = document.createElement('script');
    source.type = 'text/tikz';
    source.dataset.tikzLibraries = 'arrows.meta';
    if (variant === '3d') {
      source.dataset.texPackages = 'pgfplots';
      source.dataset.addToPreamble = '\\pgfplotsset{compat=1.18}';
    } else if (variant === 'diagram' || variant === 'diagram-cd') {
      source.dataset.texPackages = variant === 'diagram-cd' ? 'tikz-cd,amsmath,amssymb' : 'amsmath,amssymb';
    }
    // The preview typesets the figure alone; centering belongs to the surrounding document.
    source.textContent = code.replace(/\\(?:begin|end)\{center\}/g, '');
    observer = new MutationObserver(() => {
      if (figure.querySelector('.tikzjax-broken-wrapper, .tikzjax-error')) report(id, 'error');
    });
    observer.observe(figure, { childList: true, subtree: true });
    figure.appendChild(source);
  } catch {
    report(id, 'error');
  }
});

document.getElementById('figure').addEventListener('tikzjax-load-finished', async (event) => {
  const id = activeRequest;
  const svg = event.target;
  await document.fonts.ready;
  if (svg.isConnected) report(id, 'ready');
});
