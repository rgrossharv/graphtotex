import type { MathNode } from 'mathjs';

export interface TikzExprResult {
  ok: boolean;
  expression?: string;
  reason?: string;
}

const UNSUPPORTED_TRIG = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan']);
const SUPPORTED_FUNCTIONS = new Set(['sqrt', 'abs', 'exp', 'log', 'ln']);

function wrapBinary(op: string, left: string, right: string): string {
  return `(${left})${op}(${right})`;
}

function convertNode(node: MathNode): TikzExprResult {
  const unknownNode = (): TikzExprResult => ({
    ok: false,
    reason: `Unsupported node type ${node.type}`
  });

  if (node.type === 'ParenthesisNode') {
    const content = (node as unknown as { content: MathNode }).content;
    return convertNode(content);
  }

  if (node.type === 'ConstantNode') {
    const value = (node as unknown as { value: string }).value;
    if (value === 'pi') {
      return { ok: true, expression: 'pi' };
    }
    if (value === 'e') {
      return { ok: true, expression: 'exp(1)' };
    }
    return { ok: true, expression: value };
  }

  if (node.type === 'SymbolNode') {
    const name = (node as unknown as { name: string }).name;
    if (name === 'x') {
      return { ok: true, expression: '\\x' };
    }
    if (name === 'pi') {
      return { ok: true, expression: 'pi' };
    }
    if (name === 'e') {
      return { ok: true, expression: 'exp(1)' };
    }
    return { ok: false, reason: `Unsupported symbol ${name}` };
  }

  if (node.type === 'OperatorNode') {
    const operatorNode = node as unknown as {
      fn: string;
      args: MathNode[];
      op: string;
      isUnary: () => boolean;
    };

    if (operatorNode.isUnary() && operatorNode.op === '-') {
      const arg = convertNode(operatorNode.args[0]);
      if (!arg.ok || !arg.expression) {
        return arg;
      }
      return { ok: true, expression: `-(${arg.expression})` };
    }

    if (operatorNode.args.length !== 2) {
      return { ok: false, reason: 'Only binary operators are supported.' };
    }

    const left = convertNode(operatorNode.args[0]);
    const right = convertNode(operatorNode.args[1]);

    if (!left.ok) {
      return left;
    }
    if (!right.ok) {
      return right;
    }

    if (!left.expression || !right.expression) {
      return { ok: false, reason: 'Failed to convert binary operation.' };
    }

    switch (operatorNode.fn) {
      case 'add':
        return { ok: true, expression: wrapBinary('+', left.expression, right.expression) };
      case 'subtract':
        return { ok: true, expression: wrapBinary('-', left.expression, right.expression) };
      case 'multiply':
        return { ok: true, expression: wrapBinary('*', left.expression, right.expression) };
      case 'divide':
        return { ok: true, expression: wrapBinary('/', left.expression, right.expression) };
      case 'pow':
        return {
          ok: true,
          expression: `pow(${left.expression},${right.expression})`
        };
      default:
        return { ok: false, reason: `Unsupported operator ${operatorNode.op}` };
    }
  }

  if (node.type === 'FunctionNode') {
    const fnNode = node as unknown as {
      fn: { name?: string; type: string };
      args: MathNode[];
    };

    const fnName = fnNode.fn.name ?? '';

    if (UNSUPPORTED_TRIG.has(fnName)) {
      return {
        ok: false,
        reason: `Trig/inverse trig export is emitted as coordinates for safety (${fnName}).`
      };
    }

    if (!SUPPORTED_FUNCTIONS.has(fnName)) {
      return { ok: false, reason: `Unsupported function ${fnName}` };
    }

    if (fnNode.args.length !== 1) {
      return { ok: false, reason: `${fnName} with multiple arguments is unsupported.` };
    }

    const arg = convertNode(fnNode.args[0]);
    if (!arg.ok || !arg.expression) {
      return arg;
    }

    if (fnName === 'log' || fnName === 'ln') {
      return { ok: true, expression: `ln(${arg.expression})` };
    }

    return { ok: true, expression: `${fnName}(${arg.expression})` };
  }

  return unknownNode();
}

export function convertAstToTikz(node: MathNode | null): TikzExprResult {
  if (!node) {
    return { ok: false, reason: 'No parsed expression.' };
  }
  return convertNode(node);
}
