import { useLayoutEffect, useMemo, useRef } from 'react';
import katex from 'katex';
import { mathLabel } from '../lib/diagram';

interface DiagramMathProps {
  label: string;
  onSize?: (width: number, height: number) => void;
}

export function previewMath(label: string): { html: string; error: string | null } {
  try {
    return {
      html: katex.renderToString(mathLabel(label), {
        throwOnError: true, displayMode: false, strict: 'ignore', trust: false, maxExpand: 1000
      }),
      error: null
    };
  } catch (error) {
    return { html: '', error: error instanceof Error ? error.message : 'This label cannot be previewed.' };
  }
}

export default function DiagramMath({ label, onSize }: DiagramMathProps) {
  const element = useRef<HTMLSpanElement>(null);
  const sizeCallback = useRef(onSize);
  sizeCallback.current = onSize;
  const preview = useMemo(() => previewMath(label), [label]);
  useLayoutEffect(() => {
    const span = element.current;
    if (!span || !sizeCallback.current) return;
    let active = true;
    const measure = () => { if (active) sizeCallback.current?.(span.offsetWidth, span.offsetHeight); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(span);
    document.fonts.ready.then(measure);
    return () => { active = false; observer.disconnect(); };
  }, [label]);
  return (
    <span ref={element} className={`diagram-math ${preview.error ? 'has-error' : ''}`} title={preview.error ?? label}>
      {preview.error ? label : <span dangerouslySetInnerHTML={{ __html: preview.html }} />}
    </span>
  );
}
