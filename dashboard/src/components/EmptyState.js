import Card from "./Card";

export default function EmptyState({ icon, title, description, action }) {
  return (
    <Card>
      <div className="text-center py-12">
        {icon && <div className="text-4xl mb-4">{icon}</div>}
        <h3 className="font-bold text-lg mb-2">{title}</h3>
        {description && (
          <p className="text-sm text-gray-500 max-w-sm mx-auto mb-4">
            {description}
          </p>
        )}
        {action && action}
      </div>
    </Card>
  );
}
