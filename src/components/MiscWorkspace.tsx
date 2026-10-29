import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import katex from 'katex';
import { CALCULATOR_EXAMPLES, OPERATIONS, TEX_COMPLETIONS, type CalculationRequest, type CalculationResult, type CalculatorMode } from '../lib/calculator';
import TexTools from './TexTools';
import ComplexCalculator from './ComplexCalculator';
import PdfToTex from './PdfToTex';
import './MiscWorkspace.css';

export function MathPreview({ latex, display = true }: { latex: string; display?: boolean }) {
  const preview = useMemo(() => {
    try { return { html: katex.renderToString(latex || '\\phantom{x}', { displayMode: display, throwOnError: true, strict: 'ignore', trust: false }), error: null }; }
    catch { return { html: '', error: 'Finish the TeX expression to see its preview.' }; }
  }, [latex, display]);
  return preview.error ? <p className="misc-hint">{preview.error}</p> : <div className="misc-math" dangerouslySetInnerHTML={{ __html: preview.html }} />;
}

const INITIAL: CalculationRequest = {
  input: CALCULATOR_EXAMPLES[0].input, secondInput: '', mode: 'scientific', operation: 'auto',
  variables: 'x', order: 1, lower: '0', upper: '1', point: '0', angleUnit: 'rad'
};
const BINARY = ['multiply', 'add', 'solve', 'dot', 'cross'];
const MULTIVARIABLE = ['gradient', 'hessian', 'jacobian', 'divergence', 'curl'];
const KEYPAD = [
  ['sin', '\\sin(x)', 'x'], ['cos', '\\cos(x)', 'x'], ['tan', '\\tan(x)', 'x'], ['ln', '\\ln(x)', 'x'], ['log', '\\log_{10}(x)', 'x'], ['√', '\\sqrt{x}', 'x'],
  ['sin⁻¹', '\\arcsin(x)', 'x'], ['cos⁻¹', '\\arccos(x)', 'x'], ['tan⁻¹', '\\arctan(x)', 'x'], ['π', '\\pi ', ''], ['e', 'e', ''], ['x²', '^{2}', ''],
  ['7', '7', ''], ['8', '8', ''], ['9', '9', ''], ['(', '(', ''], [')', ')', ''], ['⌫', 'backspace', ''],
  ['4', '4', ''], ['5', '5', ''], ['6', '6', ''], ['×', '\\cdot ', ''], ['÷', '\\div ', ''], ['^', '^{n}', 'n'],
  ['1', '1', ''], ['2', '2', ''], ['3', '3', ''], ['+', '+', ''], ['−', '-', ''], ['AC', 'clear', ''],
  ['0', '0', ''], ['.', '.', ''], ['!', '!', ''], ['a/b', '\\frac{a}{b}', 'a'], ['|x|', '\\left|x\\right|', 'x'], ['=', 'calculate', '']
];

export default function MiscWorkspace() {
  const [tool, setTool] = useState<'calculator' | 'complex' | 'pdf' | 'html' | 'decompile'>('calculator');
  const [request, setRequest] = useState<CalculationRequest>(INITIAL);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [autocomplete, setAutocomplete] = useState(true);
  const [completion, setCompletion] = useState<{ start: number; prefix: string } | null>(null);
  const [activeOption, setActiveOption] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const signature = JSON.stringify(request);
  const suggestions = autocomplete && completion ? TEX_COMPLETIONS.filter((item) => item.command.startsWith(completion.prefix)).slice(0, 6) : [];
  const patch = (value: Partial<CalculationRequest>) => setRequest((previous) => ({ ...previous, ...value }));

  useEffect(() => {
    setResult(null); setError(''); setCopyStatus(''); setBusy(false);
    workerRef.current?.terminate();
    clearTimeout(timerRef.current);
    return () => { workerRef.current?.terminate(); clearTimeout(timerRef.current); };
  }, [signature]);

  const calculate = () => {
    workerRef.current?.terminate();
    clearTimeout(timerRef.current);
    setBusy(true); setError(''); setCopyStatus(''); setResult(null); setCompletion(null);
    const worker = new Worker(new URL('../lib/calculator.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    const fail = (message: string) => { clearTimeout(timerRef.current); worker.terminate(); setBusy(false); setError(message); };
    worker.onmessage = (event: MessageEvent<{ result?: CalculationResult; error?: string }>) => {
      clearTimeout(timerRef.current); worker.terminate(); setBusy(false);
      if (event.data.error) setError(event.data.error);
      else if (event.data.result) setResult(event.data.result);
    };
    worker.onerror = () => fail('The calculator could not load. Check your connection and try again.');
    timerRef.current = setTimeout(() => fail('This calculation took too long. Try a smaller expression or matrix.'), 12000);
    worker.postMessage({ id: 1, request });
  };

  const insert = (text: string, selected = '', replaceFrom?: number) => {
    const input = inputRef.current;
    if (!input) return;
    const start = replaceFrom ?? input.selectionStart;
    const end = input.selectionEnd;
    patch({ input: request.input.slice(0, start) + text + request.input.slice(end) });
    setCompletion(null);
    requestAnimationFrame(() => {
      input.focus();
      const offset = selected ? text.indexOf(selected) : text.length;
      input.setSelectionRange(start + offset, start + offset + selected.length);
    });
  };
  const refreshCompletion = (input: HTMLTextAreaElement) => {
    const before = input.value.slice(0, input.selectionStart);
    const match = before.match(/\\[a-zA-Z]*(?:\{[a-zA-Z]*)?$/);
    setCompletion(match ? { start: before.length - match[0].length, prefix: match[0] } : null);
    setActiveOption(0);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); calculate(); return; }
    if (!suggestions.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setActiveOption((value) => (value + (event.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length);
    } else if (event.key === 'Tab' || event.key === 'Enter') {
      event.preventDefault(); const item = suggestions[activeOption]; insert(item.insert, item.select, completion?.start);
    } else if (event.key === 'Escape') { event.preventDefault(); setCompletion(null); }
  };
  const changeMode = (mode: CalculatorMode) => {
    const example = CALCULATOR_EXAMPLES.find((item) => item.mode === mode)!;
    setRequest({ ...INITIAL, mode, input: example.input, operation: example.operation || 'auto' });
    setCompletion(null);
  };
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setCopyStatus('Copied TeX to clipboard.'); }
    catch { setCopyStatus('Select the TeX source below to copy it manually.'); }
  };
  const download = () => {
    if (!result) return;
    const source = ['\\documentclass{article}', '\\usepackage{amsmath,amssymb}', '\\begin{document}', '\\[', result.equation, '\\]', '\\end{document}'].join('\n');
    const url = URL.createObjectURL(new Blob([source], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'graphtotex-calculation.tex'; anchor.click(); URL.revokeObjectURL(url);
  };
  const requiresVariables = request.mode === 'calculus' && request.operation !== 'auto';

  return (
    <main className="misc-workspace">
      <div className="misc-toolbar" role="navigation" aria-label="Misc tools">
        {([{ value: 'calculator', label: 'Calculator' }, { value: 'complex', label: 'Complex graph' }, { value: 'decompile', label: 'PDF → TeX' }, { value: 'pdf', label: 'TeX → PDF' }, { value: 'html', label: 'TeX → HTML' }] as const).map((item) => <button key={item.value} className={tool === item.value ? 'is-active' : ''} aria-pressed={tool === item.value} onClick={() => setTool(item.value)}>{item.label}</button>)}
        <span>TeX in. Math out.</span>
      </div>
      {tool === 'decompile' ? <PdfToTex /> : tool === 'complex' ? <ComplexCalculator /> : tool !== 'calculator' ? <TexTools kind={tool} /> : <div className="misc-calculator">
        <section className="misc-input-panel" aria-label="Calculator input">
          <div className="misc-panel-heading"><h2>Misc calculator</h2><p>Scientific, calculus I–III, and linear algebra</p></div>
          <div className="misc-input-content">
            <div className="misc-mode-switch" role="group" aria-label="Calculator type">
              {([{ value: 'scientific', label: 'Scientific' }, { value: 'calculus', label: 'Calculus' }, { value: 'linear', label: 'Linear algebra' }] as const).map((item) => <button key={item.value} aria-pressed={request.mode === item.value} className={request.mode === item.value ? 'is-active' : ''} onClick={() => changeMode(item.value)}>{item.label}</button>)}
            </div>
            <label className="misc-field">Operation<select value={request.operation} onChange={(event) => patch({ operation: event.target.value })}>{OPERATIONS[request.mode].map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label className="misc-field">Try an example<select aria-label="Calculator example" value="" onChange={(event) => { const example = CALCULATOR_EXAMPLES[Number(event.target.value)]; setRequest({ ...INITIAL, ...example, operation: example.operation || 'auto', variables: example.variables || 'x', secondInput: example.secondInput || '' }); }}><option value="" disabled>Choose an example</option>{CALCULATOR_EXAMPLES.map((item, index) => <option key={item.label} value={index}>{item.label}</option>)}</select></label>
            <div className="misc-editor-heading"><label htmlFor="misc-tex-input">{request.mode === 'linear' ? 'Matrix or vector A · TeX input' : 'TeX input'}</label><label><input type="checkbox" checked={autocomplete} onChange={(event) => { setAutocomplete(event.target.checked); setCompletion(null); }} />Autocomplete</label></div>
            <div className="misc-editor">
              <textarea ref={inputRef} id="misc-tex-input" value={request.input} rows={5} spellCheck={false} autoCapitalize="off" autoComplete="off" aria-autocomplete="list" aria-controls={suggestions.length ? 'tex-completions' : undefined} aria-activedescendant={suggestions.length ? `tex-completion-${activeOption}` : undefined}
                onChange={(event) => { patch({ input: event.target.value }); refreshCompletion(event.target); }} onKeyDown={onKeyDown}
                onClick={(event) => refreshCompletion(event.currentTarget)} onBlur={() => setCompletion(null)} />
              {!!suggestions.length && <div className="misc-completions" id="tex-completions" role="listbox" aria-label="TeX completions">{suggestions.map((item, index) => <button key={item.command} id={`tex-completion-${index}`} role="option" aria-selected={index === activeOption} onPointerDown={(event) => event.preventDefault()} onClick={() => insert(item.insert, item.select, completion?.start)}><code>{item.command}</code><span>{item.label}</span></button>)}</div>}
            </div>
            <p className="misc-hint">Type <code>\</code> for commands. Tab or Enter completes. ⌘/Ctrl + Enter calculates.</p>
            {BINARY.includes(request.operation) && <label className="misc-field">{request.operation === 'solve' ? 'Column vector b · TeX input' : 'Matrix or vector B · TeX input'}<textarea aria-label="Second TeX input" rows={3} value={request.secondInput} spellCheck={false} onChange={(event) => patch({ secondInput: event.target.value })} /></label>}
            {requiresVariables && <label className="misc-field">{MULTIVARIABLE.includes(request.operation) ? 'Variables (comma-separated)' : 'With respect to'}<input value={request.variables} onChange={(event) => patch({ variables: event.target.value })} placeholder={MULTIVARIABLE.includes(request.operation) ? 'x, y, z' : 'x'} /></label>}
            {request.operation === 'derivative' && <label className="misc-field">Derivative order<select value={request.order} onChange={(event) => patch({ order: Number(event.target.value) })}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}
            {request.operation === 'definite' && <div className="misc-field-pair"><label className="misc-field">Lower bound<input value={request.lower} onChange={(event) => patch({ lower: event.target.value })} /></label><label className="misc-field">Upper bound<input value={request.upper} onChange={(event) => patch({ upper: event.target.value })} /></label></div>}
            {request.operation === 'limit' && <label className="misc-field">Approaches<input value={request.point} onChange={(event) => patch({ point: event.target.value })} /></label>}
            {request.mode === 'scientific' && <>
              <div className="misc-angle-switch" role="group" aria-label="Angle unit">{(['rad', 'deg'] as const).map((value) => <button key={value} aria-pressed={request.angleUnit === value} onClick={() => patch({ angleUnit: value })}>{value === 'rad' ? 'Radians' : 'Degrees'}</button>)}</div>
              <div className="misc-keypad" aria-label="Scientific calculator keypad">{KEYPAD.map(([label, text, selection]) => <button key={label} aria-label={text === 'backspace' ? 'Backspace' : text === 'clear' ? 'Clear expression' : text === 'calculate' ? 'Evaluate expression' : label} className={text === 'calculate' ? 'is-primary' : ''} onClick={() => {
                if (text === 'calculate') calculate();
                else if (text === 'clear') { patch({ input: '' }); inputRef.current?.focus(); }
                else if (text === 'backspace') { const input = inputRef.current; if (input) { const start = input.selectionStart, end = input.selectionEnd; patch({ input: request.input.slice(0, Math.max(0, start - (start === end ? 1 : 0))) + request.input.slice(end) }); requestAnimationFrame(() => { input.focus(); input.setSelectionRange(Math.max(0, start - 1), Math.max(0, start - 1)); }); } }
                else insert(text, selection);
              }}>{label}</button>)}</div>
            </>}
            {request.mode !== 'scientific' && <div className="misc-snippets" aria-label="TeX templates">{(request.mode === 'linear' ? TEX_COMPLETIONS.filter((item) => item.command.includes('bmatrix')) : TEX_COMPLETIONS.filter((item) => ['\\frac', '\\int', '\\iint', '\\iiint', '\\partial'].includes(item.command))).map((item) => <button key={item.command} onClick={() => insert(item.insert, item.select)}>{item.label}</button>)}</div>}
          </div>
          <div className="misc-input-footer"><button className="misc-primary-button" onClick={calculate} disabled={busy || !request.input.trim()}>{busy ? 'Calculating…' : 'Calculate'}</button></div>
        </section>
        <section className="misc-output-panel" aria-label="Calculator output">
          <div className="misc-panel-heading"><h2>Preview & result</h2><p>Typeset math with editable TeX to copy or download.</p></div>
          <div className="misc-output-content">
            <section className="misc-preview-section"><h3>Input preview</h3><MathPreview latex={request.input} />{BINARY.includes(request.operation) && <MathPreview latex={request.secondInput} />}</section>
            {error && <p className="misc-error" role="alert">{error}</p>}
            {busy && <p className="misc-hint" role="status">Working on your calculation…</p>}
            {result ? <>
              <section className="misc-result-section" aria-label="Calculation result"><h3>{result.unevaluated ? 'Unevaluated result' : 'Result'}</h3><MathPreview latex={result.latex} />{result.approximate && <><h3>Decimal approximation</h3><MathPreview latex={result.approximate} /></>}{result.note && <p className="misc-hint">{result.note}</p>}</section>
              <div className="misc-result-actions"><button onClick={() => copy(result.latex)}>Copy result TeX</button><button onClick={() => copy(`\\[\n${result.equation}\n\\]`)}>Copy equation TeX</button><button onClick={download}>Download .tex</button></div>
              <p className="misc-copy-status" role="status">{copyStatus}</p>
              <label className="misc-field">Equation TeX<textarea aria-label="Result TeX" rows={5} readOnly value={`\\[\n${result.equation}\n\\]`} /></label>
            </> : !busy && !error && <div className="misc-empty-result"><span aria-hidden="true">∫ · ∂ · A⁻¹</span><h3>Start with an expression.</h3><p>Calculate a value, find a derivative or integral, or work with matrices. Your result appears here with TeX ready to copy.</p></div>}
          </div>
        </section>
      </div>}
    </main>
  );
}
