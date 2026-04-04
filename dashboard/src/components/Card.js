export default function Card({ children, className = "" }) {
  return (
    <div
      className={`border-2 border-black rounded-xl p-6 bg-white ${className}`}
    >
      {children}
    </div>
  );
}
