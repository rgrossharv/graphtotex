import { calculate } from './calculatorEngine';
import type { CalculationRequest } from './calculator';

self.onmessage = (event: MessageEvent<{ id: number; request: CalculationRequest }>) => {
  const { id, request } = event.data;
  try { self.postMessage({ id, result: calculate(request) }); }
  catch (error) { self.postMessage({ id, error: error instanceof Error ? error.message : 'This calculation could not be completed.' }); }
};
