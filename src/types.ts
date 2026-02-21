import type { MathNode } from 'mathjs';

export interface Viewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface Viewport3D {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
  yaw: number;
  pitch: number;
  distance: number;
}

export interface GraphSettings {
  showGrid: boolean;
  showAxes: boolean;
  showTicks: boolean;
}

export interface GraphSettings3D {
  showGrid: boolean;
  showAxes: boolean;
  showBox: boolean;
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

export interface Expression3D {
  id: string;
  rawInput: string;
  visible: boolean;
  color: string;
  lineWidth: number;
  dashed: boolean;
  samples: number;
  domainXMin: string;
  domainXMax: string;
  domainYMin: string;
  domainYMax: string;
}

export interface PreparedExpression extends Expression {
  mode: 'explicit' | 'implicit';
  normalizedInput: string;
  latex: string | null;
  error: string | null;
  evaluator: ((x: number) => number | null) | null;
  implicitEvaluator: ((x: number, y: number) => number | null) | null;
  node: MathNode | null;
}

export interface PreparedExpression3D extends Expression3D {
  normalizedInput: string;
  latex: string | null;
  error: string | null;
  evaluator: ((x: number, y: number) => number | null) | null;
  node: MathNode | null;
}

export interface Point {
  x: number;
  y: number;
}
