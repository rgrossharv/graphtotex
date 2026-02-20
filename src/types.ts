import type { MathNode } from 'mathjs';

export interface Viewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface GraphSettings {
  showGrid: boolean;
  showAxes: boolean;
  showTicks: boolean;
}

export interface Expression {
  id: string;
  rawInput: string;
  visible: boolean;
  color: string;
  lineWidth: number;
  dashed: boolean;
  samples: number;
  domainMin: string;
  domainMax: string;
}

export interface PreparedExpression extends Expression {
  normalizedInput: string;
  latex: string | null;
  error: string | null;
  evaluator: ((x: number) => number | null) | null;
  node: MathNode | null;
}

export interface Point {
  x: number;
  y: number;
}
