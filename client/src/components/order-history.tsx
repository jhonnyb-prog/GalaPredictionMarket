import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, TrendingUp, TrendingDown, Clock } from "lucide-react";

interface OrderHistoryItem {
  id: string;
  outcome: string;
  shares: string;
  price: string;
  amount: string;
  side: 'buy' | 'sell';
  username: string;
  createdAt: string;
}

interface OrderHistoryProps {
  marketId: string;
}

export function OrderHistory({ marketId }: OrderHistoryProps) {
  const [limit, setLimit] = useState(25);

  const { data: orderHistory = [], isLoading, error } = useQuery<OrderHistoryItem[]>({
    queryKey: ['/api/markets', marketId, 'history', { limit }],
    queryFn: async () => {
      const response = await fetch(`/api/markets/${marketId}/history?limit=${limit}`);
      if (!response.ok) {
        throw new Error('Failed to fetch order history');
      }
      return response.json();
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 animate-spin" />
          <span className="text-sm text-muted-foreground">Loading order history...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Failed to load order history</p>
      </div>
    );
  }

  if (orderHistory.length === 0) {
    return (
      <div className="text-center py-12">
        <Activity className="w-12 h-12 mx-auto mb-4 opacity-20" />
        <p className="text-muted-foreground mb-2">No trading activity yet</p>
        <p className="text-sm text-muted-foreground">Order history will appear here once trading begins</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4" />
          <h3 className="font-medium">Order History</h3>
          <Badge variant="outline" className="text-xs">
            {orderHistory.length} orders
          </Badge>
        </div>
        {orderHistory.length >= limit && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLimit(prev => prev + 25)}
            data-testid="button-load-more"
          >
            Load More
          </Button>
        )}
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-medium">Token</TableHead>
              <TableHead className="font-medium">Side</TableHead>
              <TableHead className="font-medium">Shares</TableHead>
              <TableHead className="font-medium">Price</TableHead>
              <TableHead className="font-medium">Value</TableHead>
              <TableHead className="font-medium">User</TableHead>
              <TableHead className="font-medium">
                <div className="flex items-center space-x-1">
                  <Clock className="w-3 h-3" />
                  <span>Time</span>
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orderHistory.map((order) => (
              <TableRow
                key={order.id}
                className="hover:bg-muted/20 transition-colors"
                data-testid={`row-order-${order.id}`}
              >
                <TableCell>
                  <div className="flex items-center space-x-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        order.outcome === 'yes' ? 'bg-green-500' : 'bg-red-500'
                      }`}
                    />
                    <span className={`font-medium text-sm ${
                      order.outcome === 'yes' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
                    }`}>
                      {order.outcome.toUpperCase()}
                    </span>
                  </div>
                </TableCell>
                
                <TableCell>
                  <div className="flex items-center space-x-1">
                    {order.side === 'buy' ? (
                      <TrendingUp className="w-3 h-3 text-green-500" />
                    ) : (
                      <TrendingDown className="w-3 h-3 text-red-500" />
                    )}
                    <span
                      className={`text-xs font-medium uppercase ${
                        order.side === 'buy' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      {order.side}
                    </span>
                  </div>
                </TableCell>

                <TableCell className="font-mono text-sm">
                  {parseFloat(order.shares).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                </TableCell>

                <TableCell className="font-mono text-sm">
                  ${parseFloat(order.price).toFixed(4)}
                </TableCell>

                <TableCell className="font-mono text-sm font-medium">
                  ${parseFloat(order.amount).toFixed(2)}
                </TableCell>

                <TableCell>
                  <Badge variant="secondary" className="text-xs">
                    {order.username}
                  </Badge>
                </TableCell>

                <TableCell className="text-xs text-muted-foreground">
                  {new Date(order.createdAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="text-xs text-muted-foreground text-center">
        Showing {orderHistory.length} most recent orders • Updates on page refresh
      </div>
    </div>
  );
}