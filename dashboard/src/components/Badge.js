const VARIANTS = {
  blue: "bg-accent1/20 text-black border-accent1",
  pink: "bg-accent2/20 text-black border-accent2",
  yellow: "bg-accent3/20 text-black border-accent3",
  green: "bg-green-100 text-green-800 border-green-300",
  gray: "bg-gray-100 text-gray-600 border-gray-300",
};

export default function Badge({ children, variant = "blue", className = "" }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${VARIANTS[variant] || VARIANTS.blue} ${className}`}
    >
      {children}
    </span>
  );
}
