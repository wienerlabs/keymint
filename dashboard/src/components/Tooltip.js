import { useState } from "react";

export default function Tooltip({ content, children }) {
  const [visible, setVisible] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 text-xs bg-black text-white rounded-lg whitespace-nowrap border-2 border-black z-50">
          {content}
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-black rotate-45" />
        </span>
      )}
    </span>
  );
}
