import { useCallback, useRef, useState } from 'react';
import { loadDiagram, type Diagram } from './diagram';

interface History {
  past: Diagram[];
  present: Diagram;
  future: Diagram[];
}

export default function useDiagramHistory() {
  const [history, setHistory] = useState<History>(() => ({ past: [], present: loadDiagram(), future: [] }));
  const ref = useRef(history);
  const lastEdit = useRef({ key: '', time: 0 });
  const apply = useCallback((next: History) => { ref.current = next; setHistory(next); }, []);
  const update = useCallback((value: Diagram | ((diagram: Diagram) => Diagram), mergeKey = '') => {
    const previous = ref.current;
    const present = typeof value === 'function' ? value(previous.present) : value;
    if (present === previous.present) return;
    const now = Date.now();
    const merge = !!mergeKey && mergeKey === lastEdit.current.key && now - lastEdit.current.time < 1000;
    lastEdit.current = { key: mergeKey, time: now };
    apply({ past: merge ? previous.past : [...previous.past.slice(-99), previous.present], present, future: [] });
  }, [apply]);
  const preview = useCallback((value: (diagram: Diagram) => Diagram) => {
    apply({ ...ref.current, present: value(ref.current.present) });
  }, [apply]);
  const commitGesture = useCallback((previous: Diagram) => {
    lastEdit.current = { key: '', time: 0 };
    apply({ ...ref.current, past: [...ref.current.past.slice(-99), previous], future: [] });
  }, [apply]);
  const undo = useCallback(() => {
    const current = ref.current;
    if (!current.past.length) return;
    lastEdit.current = { key: '', time: 0 };
    apply({ past: current.past.slice(0, -1), present: current.past[current.past.length - 1],
      future: [current.present, ...current.future] });
  }, [apply]);
  const redo = useCallback(() => {
    const current = ref.current;
    if (!current.future.length) return;
    lastEdit.current = { key: '', time: 0 };
    apply({ past: [...current.past, current.present], present: current.future[0], future: current.future.slice(1) });
  }, [apply]);
  return { diagram: history.present, update, preview, commitGesture, undo, redo,
    canUndo: history.past.length > 0, canRedo: history.future.length > 0 };
}
