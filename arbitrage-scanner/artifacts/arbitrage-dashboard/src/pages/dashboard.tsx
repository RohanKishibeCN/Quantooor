import { useState } from "react";
import { Layout } from "@/components/layout";
import { StatsHeader } from "@/components/stats-header";
import { SpreadMatrix } from "@/components/spread-matrix";
import { OpportunityFeed } from "@/components/opportunity-feed";
import { DexDexOpportunityFeed } from "@/components/dexdex-opportunity-feed";
import { PriceTable } from "@/components/price-table";
import { SpreadChart } from "@/components/spread-chart";
import { ExitOptimizer } from "@/components/exit-optimizer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Tab = "dashboard" | "exit-optimizer";

export function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === "dashboard" && (
        <div className="flex flex-col gap-6 animate-in fade-in duration-500">
          <section>
            <StatsHeader />
          </section>
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[400px]">
            <SpreadMatrix />
            <SpreadChart />
          </section>
          <section className="grid grid-cols-1 xl:grid-cols-3 gap-6 h-[600px]">
            <div className="xl:col-span-1 h-full">
              <Tabs defaultValue="live" className="flex flex-col h-full">
                <TabsList className="self-start">
                  <TabsTrigger value="live" className="font-mono text-xs">
                    Live Opportunities
                  </TabsTrigger>
                  <TabsTrigger value="dexdex" className="font-mono text-xs">
                    DEX-DEX Base/USDC
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="live" className="mt-2 flex-1 h-full">
                  <OpportunityFeed />
                </TabsContent>
                <TabsContent value="dexdex" className="mt-2 flex-1 h-full">
                  <DexDexOpportunityFeed />
                </TabsContent>
              </Tabs>
            </div>
            <div className="xl:col-span-2 h-full">
              <PriceTable />
            </div>
          </section>
        </div>
      )}

      {activeTab === "exit-optimizer" && (
        <div className="animate-in fade-in duration-500">
          <ExitOptimizer />
        </div>
      )}
    </Layout>
  );
}
