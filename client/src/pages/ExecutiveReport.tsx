import DashboardLayout from "@/components/DashboardLayout";
import { ExecutiveReportViewer } from "@/components/ExecutiveReportViewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import type { ExecutiveReport } from "../../../shared/types";
import { useLocation } from "wouter";

export default function ExecutiveReport() {
  const [, setLocation] = useLocation();
  const [summaryData, setSummaryData] = useState<ExecutiveReport | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [errorSummary, setErrorSummary] = useState("");

  const fetchExecutiveSummary = async () => {
    setLoadingSummary(true);
    setErrorSummary("");
    setSummaryData(null);
    // toast.loading("Fetching executive summary...");
    
    try {
      const response = await fetch("https://jde-visionary-ai-backend-87wn.onrender.com/api/executive-summary");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setSummaryData(data);
      // toast.success("Executive summary loaded");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch";
      setErrorSummary(message);
      toast.error(message);
    } finally {
      setLoadingSummary(false);
    }
  };

  useEffect(() => {
    fetchExecutiveSummary();
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Executive Summary Report</h1>
            <p className="text-muted-foreground">AI-generated analysis of supply chain performance</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setLocation("/")} >
              ← Back to Dashboard
            </Button>
            <Button onClick={fetchExecutiveSummary} disabled={loadingSummary}>
              Refresh Report
            </Button>
          </div>
        </div>

        {loadingSummary && (
          <div className="flex flex-col items-center justify-center py-24">
            <Skeleton className="h-[600px] w-full max-w-4xl mx-auto" />
            <p className="text-muted-foreground mt-4 text-center">Generating AI-powered executive summary...</p>
          </div>
        )}

        {errorSummary && (
          <Card>
            <CardHeader>
              <CardTitle>Error Loading Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-destructive">{errorSummary}</p>
              <Button 
                variant="outline" 
                className="mt-2" 
                onClick={fetchExecutiveSummary}
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {summaryData && (
          <ExecutiveReportViewer data={summaryData} />
        )}
      </div>
    </DashboardLayout>
  );
}

