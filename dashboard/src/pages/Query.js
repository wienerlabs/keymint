import QueryPanel from "../components/QueryPanel";
import PageHeader from "../components/PageHeader";
import Badge from "../components/Badge";

export default function Query({ wallet, onRefresh }) {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Live Query"
        description="Execute real x402 payment flows. Each query signs with OWS, pays on-chain, and returns live API data."
        action={
          wallet ? (
            <Badge variant="green">Wallet Connected</Badge>
          ) : (
            <Badge variant="gray">No Wallet</Badge>
          )
        }
      />
      <QueryPanel wallet={wallet} onComplete={onRefresh} />
    </div>
  );
}
