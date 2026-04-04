const COLORS = {
  online: "bg-green-500",
  offline: "bg-gray-400",
  warning: "bg-accent3",
  error: "bg-accent2",
  info: "bg-accent1",
};

export default function StatusDot({ status = "online", pulse = false, size = "sm" }) {
  const sizeClass = size === "sm" ? "w-2 h-2" : "w-3 h-3";
  const color = COLORS[status] || COLORS.online;

  return (
    <span className="relative inline-flex">
      {pulse && (
        <span
          className={`absolute inline-flex h-full w-full rounded-full ${color} opacity-75 animate-ping`}
        />
      )}
      <span
        className={`relative inline-flex rounded-full ${sizeClass} ${color} border border-black`}
      />
    </span>
  );
}
