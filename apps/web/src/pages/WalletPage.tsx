import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api/client.js";
import { Layout } from "../components/Layout.js";
import { LoadingScreen } from "../components/LoadingScreen.js";
import { useApp } from "../store/AppContext.js";

interface TxRecord {
  id: string;
  amount: number;
  balanceAfter: number;
  type: "CREDIT" | "DEBIT" | "ADJUSTMENT";
  source: string;
  description: string;
  createdAt: string;
}

interface PurchaseRecord {
  id: string;
  pricePaid: number;
  createdAt: string;
  cosmeticItem: { slug: string; name: string; category: string; rarity: string };
}

interface WalletResponse {
  wallet: { balance: number; totalEarned: number; totalSpent: number };
  transactions: TxRecord[];
  purchases: PurchaseRecord[];
  page: number;
  totalPages: number;
}

export function WalletPage() {
  const { user } = useApp();
  const [filter, setFilter] = useState<"all" | "rewards" | "purchases">("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<WalletResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const userId = user?.id ?? null;

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest<WalletResponse>(
        `/api/economy/transactions?filter=${filter}&page=${page}&pageSize=25`
      );
      setData(res);
    } finally {
      setLoading(false);
    }
  }, [userId, filter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user) {
    return (
      <Layout>
        <div className="pixel-panel max-w-md mx-auto p-6 text-center space-y-4">
          <h1 className="font-arcade-title text-base text-[#f5b935]">COIN WALLET</h1>
          <p className="text-xs text-[#b8c2dc]">Sign in to view your Coin balance, rewards, and purchase history.</p>
          <Link to="/login" className="pixel-btn pixel-btn-primary text-xs">Sign In</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-5">
        <div className="pixel-panel p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-arcade-title text-lg text-[#f5b935]">WALLET &amp; LEDGER</h1>
            <p className="text-xs text-[#b8c2dc] mt-1">
              Server-validated virtual Coin ledger with idempotent transaction auditing.
            </p>
          </div>
          <Link to="/shop" className="pixel-btn pixel-btn-primary text-xs">Spend in Shop</Link>
        </div>

        {loading || !data ? (
          <LoadingScreen label="LOADING COIN LEDGER..." />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="pixel-panel p-4">
                <div className="text-[10px] text-[#b8c2dc]">CURRENT BALANCE</div>
                <div className="font-arcade-title text-xl text-[#f5b935] mt-1">
                  {data.wallet.balance.toLocaleString()} C
                </div>
              </div>
              <div className="pixel-panel p-4">
                <div className="text-[10px] text-[#b8c2dc]">LIFETIME EARNED</div>
                <div className="font-arcade-title text-xl text-[#3ac463] mt-1">
                  +{data.wallet.totalEarned.toLocaleString()} C
                </div>
              </div>
              <div className="pixel-panel p-4">
                <div className="text-[10px] text-[#b8c2dc]">LIFETIME SPENT</div>
                <div className="font-arcade-title text-xl text-[#38a3f1] mt-1">
                  -{data.wallet.totalSpent.toLocaleString()} C
                </div>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2">
              {(["all", "rewards", "purchases"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setFilter(f);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 text-xs uppercase border-2 border-[#0a0d1a] cursor-pointer ${
                    filter === f ? "bg-[#f5b935] text-[#121629] font-bold" : "bg-[#1c2340]"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Transactions Table */}
            <div className="pixel-panel overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#141930] border-b-2 border-[#0a0d1a] text-[#b8c2dc] text-[10px] uppercase">
                    <th className="p-3">Date</th>
                    <th className="p-3">Source</th>
                    <th className="p-3">Description</th>
                    <th className="p-3 text-right">Amount</th>
                    <th className="p-3 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map((tx) => (
                    <tr key={tx.id} className="border-b border-[#0a0d1a]/50">
                      <td className="p-3 text-[#b8c2dc] whitespace-nowrap">
                        {new Date(tx.createdAt).toLocaleString()}
                      </td>
                      <td className="p-3 font-bold text-[10px]">{tx.source}</td>
                      <td className="p-3">{tx.description}</td>
                      <td
                        className={`p-3 text-right font-bold ${
                          tx.amount >= 0 ? "text-[#3ac463]" : "text-[#e84545]"
                        }`}
                      >
                        {tx.amount >= 0 ? `+${tx.amount}` : tx.amount} C
                      </td>
                      <td className="p-3 text-right text-[#f5b935]">{tx.balanceAfter} C</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Purchase Receipt Log */}
            {data.purchases.length > 0 && (
              <div className="pixel-panel p-4 space-y-3">
                <h2 className="font-arcade-title text-xs text-[#38a3f1]">PURCHASE RECEIPTS</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                  {data.purchases.map((p) => (
                    <div key={p.id} className="pixel-panel-inset p-3 flex justify-between items-center">
                      <div>
                        <div className="font-bold">{p.cosmeticItem.name}</div>
                        <div className="text-[10px] text-[#b8c2dc]">
                          {p.cosmeticItem.category} &bull; {new Date(p.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <span className="font-bold text-[#f5b935]">{p.pricePaid} C</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
