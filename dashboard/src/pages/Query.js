import QueryPanel from "../components/QueryPanel";

export default function Query({ wallet, onRefresh }) {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Live Query</h1>
      <p className="text-sm text-gray-500 mb-6">
        Execute real x402 payment flows. Each query signs with OWS, pays on-chain, and returns live API data.
      </p>
      <QueryPanel wallet={wallet} onComplete={onRefresh} />
    </div>
  );
}
