import React from "react";
import ReactDOM from "react-dom/client";
import { Buffer } from "buffer";
import "./index.css";
import App from "./App";

// Solana web3.js depends on Buffer being globally available; CRA 5 does not
// polyfill it automatically.
if (typeof window !== "undefined" && !window.Buffer) {
  window.Buffer = Buffer;
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
