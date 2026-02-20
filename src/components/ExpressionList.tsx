import type { Expression, PreparedExpression } from '../types';
import ExpressionRow from './ExpressionRow';

interface ExpressionListProps {
  expressions: PreparedExpression[];
  onChange: (id: string, patch: Partial<Expression>) => void;
  onRemove: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}

export default function ExpressionList({
  expressions,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown
}: ExpressionListProps) {
  return (
    <div className="expr-list">
      {expressions.map((expression, index) => (
        <ExpressionRow
          key={expression.id}
          expression={expression}
          index={index}
          total={expressions.length}
          onChange={onChange}
          onRemove={onRemove}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
        />
      ))}
    </div>
  );
}
