import { useEffect, useMemo, useRef, useState } from 'react';
import { prepareComplex, type ComplexView } from '../lib/complexMath';
import { renderMathPreview } from '../lib/formatting';

const EXAMPLES = ['z^2', '(z^2-1)/(z^2+1)', '1/z', 'exp(z)', 'sin(z)', 'tan(z)', 'log(z)', 'sqrt(z)', 'conj(z)'];
const INITIAL: ComplexView = { real: 0, imaginary: 0, radius: 3 };
const number = (value: number) => Number(value.toPrecision(6)).toString();
const texNumber = (value: number) => number(value).replace(/e([+-]?\d+)/, '\\times 10^{$1}');
const complexTex = (rawReal: number, rawImaginary: number) => {
  const tolerance = Math.max(Math.abs(rawReal), Math.abs(rawImaginary)) * Number.EPSILON * 8;
  const real = Math.abs(rawReal) <= tolerance ? 0 : rawReal;
  const imaginary = Math.abs(rawImaginary) <= tolerance ? 0 : rawImaginary;
  return imaginary === 0 ? texNumber(real) : `${real === 0 ? '' : texNumber(real)}${imaginary < 0 ? '-' : real === 0 ? '' : '+'}${Math.abs(imaginary) === 1 ? '' : texNumber(Math.abs(imaginary))}i`;
};

export default function ComplexCalculator() {
  const [input, setInput] = useState('z^2');
  const [view, setView] = useState<ComplexView>(INITIAL);
  const [point, setPoint] = useState({ real: '1', imaginary: '1' });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [revision, setRevision] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prepared = useMemo(() => { try { return { ...prepareComplex(input), error: '' }; } catch (error) { return { latex: '', evaluate: null, error: error instanceof Error ? error.message : 'Check the function.' }; } }, [input]);
  const real = Number(point.real), imaginary = Number(point.imaginary);
  const value = point.real.trim() && point.imaginary.trim() && Number.isFinite(real) && Number.isFinite(imaginary) ? prepared.evaluate?.(real, imaginary) : null;
  const equation = prepared.latex ? `f(z)=${prepared.latex}` : '';
  const result = value ? `f\\!\\left(${complexTex(real, imaginary)}\\right)=${complexTex(value.re, value.im)}` : '';

  useEffect(() => {
    setError(''); setCopyStatus('');
    const canvas = canvasRef.current, context = canvas?.getContext('2d');
    context?.clearRect(0, 0, canvas!.width, canvas!.height);
    if (prepared.error) { setBusy(false); return; }
    setBusy(true);
    const worker = new Worker(new URL('../lib/complexGraph.worker.ts', import.meta.url), { type: 'module' });
    const fail = (message: string) => { worker.terminate(); setBusy(false); setError(message); };
    const timer = setTimeout(() => fail('Plotting took too long. Try a simpler function.'), 12000);
    worker.onmessage = (event: MessageEvent<{ pixels?: ArrayBuffer; size: number; error?: string }>) => {
      clearTimeout(timer); setBusy(false); worker.terminate();
      if (event.data.error) { setError(event.data.error); return; }
      if (!canvas || !context || !event.data.pixels) return;
      const size = event.data.size;
      canvas.width = size; canvas.height = size;
      context.putImageData(new ImageData(new Uint8ClampedArray(event.data.pixels), size, size), 0, 0);
      context.lineWidth = 1; context.font = '12px system-ui';
      const screen = (value: number, center: number) => (value - center + view.radius) / (2 * view.radius) * size;
      const step = 10 ** Math.floor(Math.log10(view.radius));
      const axis = (vertical: boolean) => {
        const center = vertical ? view.real : view.imaginary;
        for (let tick = Math.ceil((center - view.radius) / step) * step, count = 0; tick <= center + view.radius && count++ < 30; tick += step) {
          const position = vertical ? screen(tick, center) : size - screen(tick, center);
          context.strokeStyle = Math.abs(tick) < step * 1e-8 ? '#ffffffb3' : '#ffffff30';
          context.beginPath(); context.moveTo(vertical ? position : 0, vertical ? 0 : position); context.lineTo(vertical ? position : size, vertical ? size : position); context.stroke();
          context.fillStyle = '#fff'; context.shadowColor = '#000'; context.shadowBlur = 3;
          context.fillText(number(tick), vertical ? Math.min(size - 30, Math.max(3, position + 3)) : 5, vertical ? size - 8 : Math.min(size - 8, Math.max(14, position - 4)));
          context.shadowBlur = 0;
        }
      };
      axis(true); axis(false);
    };
    worker.onerror = () => { clearTimeout(timer); fail('The complex plot could not load. Try plotting again.'); };
    worker.postMessage({ input, view, size: 480 });
    return () => { clearTimeout(timer); worker.terminate(); };
  }, [input, view, prepared.error, revision]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(`\\[\n${equation}${result ? `\\qquad ${result}` : ''}\n\\]`); setCopyStatus('Copied TeX.'); }
    catch { setCopyStatus('Select the TeX below to copy it.'); }
  };
  return <div className="misc-calculator complex-calculator">
    <section className="misc-input-panel" aria-label="Complex calculator input">
      <div className="misc-panel-heading"><h2>Complex graphing calculator</h2><p>Functions over the complex plane, z = x + iy.</p></div>
      <div className="misc-input-content">
        <label className="misc-field">f(z)<input aria-label="Complex function" value={input} onChange={event => setInput(event.target.value)} spellCheck={false} autoCapitalize="off" /></label>
        <label className="misc-field">Example<select aria-label="Complex function example" value="" onChange={event => setInput(event.target.value)}><option disabled value="">Choose a function</option>{EXAMPLES.map(example => <option key={example}>{example}</option>)}</select></label>
        <p className="misc-hint">Use z, i, pi, e, and functions such as exp(z), log(z), sqrt(z), or conj(z). Powers use ^; multiplication uses *.</p>
        <div className="misc-math" dangerouslySetInnerHTML={{ __html: renderMathPreview(equation, '') }} />
        {prepared.error && <p role="alert" className="misc-error">{prepared.error}</p>}
        <div className="misc-field-pair"><label className="misc-field">Center Re<input type="number" value={view.real} onChange={event => { if (event.target.value && Number.isFinite(event.target.valueAsNumber)) setView(previous => ({ ...previous, real: event.target.valueAsNumber })); }} /></label><label className="misc-field">Center Im<input type="number" value={view.imaginary} onChange={event => { if (event.target.value && Number.isFinite(event.target.valueAsNumber)) setView(previous => ({ ...previous, imaginary: event.target.valueAsNumber })); }} /></label></div>
        <div className="misc-result-actions"><button onClick={() => setView(previous => ({ ...previous, radius: Math.max(0.001, previous.radius / 2) }))}>Zoom in</button><button onClick={() => setView(previous => ({ ...previous, radius: Math.min(10000, previous.radius * 2) }))}>Zoom out</button><button onClick={() => setView(INITIAL)}>Reset view</button></div>
        <h3 className="complex-point-heading">Evaluate a point</h3>
        <div className="misc-field-pair"><label className="misc-field">Re(z)<input aria-label="Point real part" type="number" value={point.real} onChange={event => setPoint(previous => ({ ...previous, real: event.target.value }))} /></label><label className="misc-field">Im(z)<input aria-label="Point imaginary part" type="number" value={point.imaginary} onChange={event => setPoint(previous => ({ ...previous, imaginary: event.target.value }))} /></label></div>
        {result ? <div className="misc-math" aria-label="Complex point result" dangerouslySetInnerHTML={{ __html: renderMathPreview(result, result) }} /> : !prepared.error && <p className="misc-hint">The value is undefined here, or the point is incomplete.</p>}
        {value && <p className="misc-hint">|f(z)| = {number(Math.hypot(value.re, value.im))} · arg f(z) = {value.re === 0 && value.im === 0 ? 'undefined' : `${number(Math.atan2(value.im, value.re))} rad`}</p>}
        <button disabled={!equation} onClick={copy}>Copy TeX</button><p className="misc-copy-status" role="status">{copyStatus}</p>
        <label className="misc-field">TeX source<textarea readOnly rows={3} aria-label="Complex result TeX" value={equation ? `${equation}${result ? `\\qquad ${result}` : ''}` : ''} /></label>
      </div>
    </section>
    <section className="misc-output-panel" aria-label="Complex function graph">
      <div className="misc-panel-heading"><h2>Complex plane</h2><p>Horizontal: Re(z) · Vertical: Im(z). Click the graph to evaluate a point.</p></div>
      <div className="complex-plot-content">
        <div className="complex-plot-status" role="status">{busy ? 'Plotting…' : error ? 'Plot unavailable' : prepared.error ? 'Enter a valid function' : 'Plot ready'}</div>
        {error && <p className="misc-error" role="alert">{error}<button onClick={() => setRevision(value => value + 1)}>Retry plot</button></p>}
        <canvas ref={canvasRef} width={480} height={480} aria-label="Domain coloring graph of the complex function" onClick={event => { if (busy || prepared.error || error) return; const rect = event.currentTarget.getBoundingClientRect(); setPoint({ real: number(view.real + ((event.clientX - rect.left) / rect.width * 2 - 1) * view.radius), imaginary: number(view.imaginary + (1 - (event.clientY - rect.top) / rect.height * 2) * view.radius) }); }} />
        <div className="complex-color-key" aria-label="Argument color legend"><span>0</span><span>π/2</span><span>π</span><span>−π/2</span><span>0</span></div>
        <p className="misc-hint">Color shows arg f(z); brightness bands show |f(z)|. Zeros are black. Non-finite values are dark gray. log, sqrt, and fractional powers use their principal branches.</p>
        <button disabled={busy || !!prepared.error || !!error} onClick={() => { const anchor = document.createElement('a'); anchor.href = canvasRef.current!.toDataURL('image/png'); anchor.download = 'graphtotex-complex.png'; anchor.click(); }}>Download graph PNG</button>
      </div>
    </section>
  </div>;
}
