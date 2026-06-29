import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Row {
  userId: string;
  name: string;
  openValue: number;
  weighted: number;
  wonCount: number;
  wonValue: number;
  winRate: number;
}

const formatUSD = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export function OwnerLeaderboard({ rows }: { rows: Row[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Owner leaderboard</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Owner</TableHead>
                <TableHead className="text-right">Open</TableHead>
                <TableHead className="text-right">Weighted</TableHead>
                <TableHead className="text-right">Won</TableHead>
                <TableHead className="text-right">Win rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.userId}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right">{formatUSD(r.openValue)}</TableCell>
                  <TableCell className="text-right">{formatUSD(r.weighted)}</TableCell>
                  <TableCell className="text-right">
                    {r.wonCount} · {formatUSD(r.wonValue)}
                  </TableCell>
                  <TableCell className="text-right">{r.winRate}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
