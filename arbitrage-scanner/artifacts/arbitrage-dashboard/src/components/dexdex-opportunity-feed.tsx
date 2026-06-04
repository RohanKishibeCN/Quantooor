import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useDexDexOpportunities,
  type DexDexOpportunity,
} from "@/hooks/use-dexdex-opportunities";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AlertCircle, Copy, Layers, ArrowRightLeft } from "lucide-react";
import { format } from "date-fns";

function truncateAddress(address: string, head = 6, tail = 4) {
  if (!address) return "–";
  if (address.length <= head + tail + 2) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

function formatUsd(value: number) {
  const v = Number.isFinite(value) ? value : 0;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(2)}k`;
  return `$${v.toFixed(4)}`;
}

function formatTime(value: DexDexOpportunity["computedAt"]) {
  if (value == null) return "–";
  const d = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(d.getTime())) return "–";
  return format(d, "HH:mm:ss");
}

export function DexDexOpportunityFeed() {
  const [limit, setLimit] = useState(20);
  const [minNetProfitUsdRaw, setMinNetProfitUsdRaw] = useState("0");
  const minNetProfitUsd = useMemo(() => {
    const n = Number(minNetProfitUsdRaw);
    return Number.isFinite(n) ? n : 0;
  }, [minNetProfitUsdRaw]);

  const { data: opportunities, isLoading } = useDexDexOpportunities({
    limit,
    minNetProfitUsd: minNetProfitUsd > 0 ? minNetProfitUsd : undefined,
  });
  const { toast } = useToast();

  const copyToClipboard = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    toast({
      title: "Data Copied",
      description: "DEX-DEX opportunity data copied to clipboard.",
    });
  };

  return (
    <Card className="flex flex-col h-full bg-card border-border/50 overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/50 bg-muted/20">
        <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          DEX-DEX Base/USDC
        </CardTitle>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Select value={minNetProfitUsdRaw} onValueChange={setMinNetProfitUsdRaw}>
            <SelectTrigger className="w-[130px] h-8 bg-background border-border/50 font-mono text-xs">
              <SelectValue placeholder="min profit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">min $0</SelectItem>
              <SelectItem value="0.1">min $0.1</SelectItem>
              <SelectItem value="0.5">min $0.5</SelectItem>
              <SelectItem value="1">min $1</SelectItem>
              <SelectItem value="2">min $2</SelectItem>
              <SelectItem value="5">min $5</SelectItem>
            </SelectContent>
          </Select>

          <Select value={String(limit)} onValueChange={(v) => setLimit(Number.parseInt(v, 10) || 20)}>
            <SelectTrigger className="w-[100px] h-8 bg-background border-border/50 font-mono text-xs">
              <SelectValue placeholder="limit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">limit 10</SelectItem>
              <SelectItem value="20">limit 20</SelectItem>
              <SelectItem value="50">limit 50</SelectItem>
              <SelectItem value="100">limit 100</SelectItem>
            </SelectContent>
          </Select>

          <Badge variant="outline" className="font-mono text-[10px] border-blue-400/50 text-blue-300">
            BASE
          </Badge>
          <Badge variant="outline" className="font-mono text-[10px] border-emerald-400/50 text-emerald-400">
            USDC
          </Badge>
          <Badge variant="outline" className="font-mono text-[10px] border-amber-400/50 text-amber-400">
            DEX↔DEX
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-0 overflow-auto flex-1 custom-scrollbar">
        {isLoading && !opportunities ? (
          <div className="flex flex-col space-y-2 p-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 bg-muted/50 animate-pulse rounded-md" />
            ))}
          </div>
        ) : !opportunities || opportunities.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
            <AlertCircle className="h-8 w-8 mb-2 opacity-50" />
            <span className="text-sm font-mono">NO_DEXDEX_OPPORTUNITY</span>
            <span className="text-xs mt-1 opacity-50">Waiting for Base/USDC pool inefficiencies...</span>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {opportunities.map((opp, idx) => {
              const buyDexId = opp.buyDexId || "–";
              const sellDexId = opp.sellDexId || "–";
              const tokenAddress = opp.tokenAddress || "–";
              const buyPoolAddress = opp.buyPoolAddress || "–";
              const sellPoolAddress = opp.sellPoolAddress || "–";
              const amountInUsdc =
                typeof opp.amountInUsdc === "number" && Number.isFinite(opp.amountInUsdc) ? opp.amountInUsdc : 0;
              const netProfitUsd = typeof opp.netProfitUsd === "number" && Number.isFinite(opp.netProfitUsd) ? opp.netProfitUsd : 0;
              const liquidityUsd =
                typeof opp.liquidityUsd === "number" && Number.isFinite(opp.liquidityUsd) ? opp.liquidityUsd : undefined;
              const priceImpactBps =
                typeof opp.priceImpactBps === "number" && Number.isFinite(opp.priceImpactBps) ? opp.priceImpactBps : undefined;
              const computedAt = opp.computedAt;
              const isHot = netProfitUsd >= 1;

              return (
                <div
                  key={`${tokenAddress}-${buyPoolAddress}-${sellPoolAddress}-${idx}`}
                  className={cn(
                    "px-3 py-2.5 group transition-colors hover:bg-muted/20",
                    isHot && "animate-flash-green"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono font-bold text-sm text-foreground truncate">
                          {truncateAddress(String(tokenAddress), 10, 6)}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground/50">
                          {formatTime(computedAt)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-mono border-amber-400/50 text-amber-400 bg-amber-400/5">
                          <span className="opacity-70 uppercase">{String(buyDexId)}</span>
                        </div>

                        <ArrowRightLeft className="h-3 w-3 text-muted-foreground/50 shrink-0" />

                        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-mono border-amber-400/50 text-amber-400 bg-amber-400/5">
                          <span className="opacity-70 uppercase">{String(sellDexId)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border/50 bg-muted/10 text-[10px] font-mono text-muted-foreground">
                          <span className="opacity-60">BUY_POOL</span>
                          <span className="text-foreground">{truncateAddress(String(buyPoolAddress), 10, 6)}</span>
                        </div>
                        <div className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border/50 bg-muted/10 text-[10px] font-mono text-muted-foreground">
                          <span className="opacity-60">SELL_POOL</span>
                          <span className="text-foreground">{truncateAddress(String(sellPoolAddress), 10, 6)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono text-muted-foreground/80">
                        <span>
                          AMOUNT_IN: <span className="text-foreground">{formatUsd(amountInUsdc)}</span>
                        </span>
                        <span className="text-muted-foreground/40">·</span>
                        <span>
                          LIQ: <span className="text-foreground">{liquidityUsd != null ? formatUsd(liquidityUsd) : "–"}</span>
                        </span>
                        {priceImpactBps != null ? (
                          <>
                            <span className="text-muted-foreground/40">·</span>
                            <span>
                              IMPACT: <span className="text-foreground">{priceImpactBps.toFixed(1)} bps</span>
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className={cn(
                          "font-mono font-bold text-base tabular-nums",
                          isHot ? "text-primary" : "text-emerald-400"
                        )}
                      >
                        {formatUsd(netProfitUsd)}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground/60">NET_PROFIT</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 opacity-0 group-hover:opacity-60 transition-opacity"
                        onClick={() => copyToClipboard(opp)}
                        title="Copy Opportunity Data"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
