import Card from "./Card";

export default function StatBox({ label, value, accent }) {
  const accentColors = {
    1: "bg-accent1",
    2: "bg-accent2",
    3: "bg-accent3",
  };

  return (
    <Card>
      <div className="flex items-center gap-3">
        <div
          className={`w-3 h-3 rounded-full border border-black ${accentColors[accent] || "bg-accent1"}`}
        />
        <span className="text-sm uppercase tracking-wide text-gray-500">
          {label}
        </span>
      </div>
      <div className="mt-3 text-3xl font-bold">{value}</div>
    </Card>
  );
}
