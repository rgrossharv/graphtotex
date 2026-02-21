import type { MathNode } from 'mathjs';

export interface TikzExpr3DResult {
  ok: boolean;
  expression?: string;
  reason?: string;
}

function wrapBinary(op: string, left: string, right: string): string {
  return `(${left})${op}(${right})`;
}

function convertNode(node: MathNode): TikzExpr3DResult {
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
    if (name === 'x' || name === 'y') {
      return { ok: true, expression: name };
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
        return { ok: true, expression: `pow(${left.expression},${right.expression})` };
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

    if (fnNode.args.length !== 1) {
      return { ok: false, reason: `${fnName} with multiple arguments is unsupported.` };
    }

    const arg = convertNode(fnNode.args[0]);
    if (!arg.ok || !arg.expression) {
      return arg;
    }

    switch (fnName) {
      case 'sin':
      case 'cos':
      case 'tan':
        return { ok: true, expression: `${fnName}(deg(${arg.expression}))` };
      case 'asin':
      case 'acos':
      case 'atan':
        return { ok: true, expression: `(${fnName}(${arg.expression}))*pi/180` };
      case 'sqrt':
      case 'abs':
      case 'exp':
        return { ok: true, expression: `${fnName}(${arg.expression})` };
      case 'log':
        return { ok: true, expression: `ln(${arg.expression})` };
      case 'log10':
        return { ok: true, expression: `(ln(${arg.expression})/ln(10))` };
      default:
        return { ok: false, reason: `Unsupported function ${fnName}` };
    }
  }

  return { ok: false, reason: `Unsupported node type ${node.type}` };
}

export function convertAstToTikz3D(node: MathNode | null): TikzExpr3DResult {
  if (!node) {
    return { ok: false, reason: 'No parsed expression.' };
  }

  return convertNode(node);
}
