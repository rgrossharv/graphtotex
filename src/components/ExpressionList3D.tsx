import type { Expression3D, PreparedExpression3D } from '../types';
import ExpressionRow3D from './ExpressionRow3D';

interface ExpressionList3DProps {
  expressions: PreparedExpression3D[];
  onChange: (id: string, patch: Partial<Expression3D>) => void;
  onRemove: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}

export default function ExpressionList3D({
  expressions,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown
}: ExpressionList3DProps) {
  return (
    <div className="expr-list">
      {expressions.map((expression, index) => (
        <ExpressionRow3D
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
