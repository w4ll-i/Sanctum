import { scorePassword } from '../../crypto/vault';

export function PasswordStrength({ password }) {
  if (!password) return null;
  const { score, label } = scorePassword(password);

  const colors = [
    'bg-sanctum-border',
    'bg-red-500',
    'bg-orange-500',
    'bg-yellow-500',
    'bg-green-500',
  ];

  const textColors = [
    'text-sanctum-muted',
    'text-red-400',
    'text-orange-400',
    'text-yellow-400',
    'text-green-400',
  ];

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              i < score ? colors[score] : 'bg-sanctum-border'
            }`}
          />
        ))}
      </div>
      {label && (
        <p className={`text-xs font-medium ${textColors[score]}`}>{label}</p>
      )}
    </div>
  );
}

