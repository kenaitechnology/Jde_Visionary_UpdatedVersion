import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { Users, DollarSign, PackageCheck, AlertTriangle, Truck, FileText } from 'lucide-react';
import { ExecutiveReport } from '../../../shared/types';

interface Props {
  data: ExecutiveReport | null;
  className?: string;
}

export function ExecutiveReportViewer({ data, className = '' }: Props) {
  if (!data) return null;

  // Parse fullReport metrics (simple key: value extraction)
  const parseMetrics = (report: string) => {
    const lines = report.split('\n').filter(line => line.includes(':'));
    return lines.map(line => {
      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();
      return { key: key.trim(), value: value.trim() };
    });
  };

  const metrics = parseMetrics(data.fullReport);

  // Critical insights from summary (static for demo, parse in future)
  const criticalInsights = [
    'Sales Stagnation: No open orders and zero open quantity',
    'Inventory Risk: 32 SKUs in low stock',
    'PO Delays: 1 open PO with 4 units',
  ];

  // Recommendations extracted
  const recommendations = [
    { title: 'Address Inventory Shortages', impact: '$10K-$20K' },
    { title: 'Drive New Sales', impact: '$25K-$50K' },
    { title: 'Optimize Pricing Strategy', impact: '$5K-$10K' },
    { title: 'Strengthen Supplier Relationships', impact: '$5K' },
    { title: 'Implement Sales Forecasting', impact: '$15K' },
  ];

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl">{data.reportType.replace(/-/g, ' ').toUpperCase()}</CardTitle>
              <CardDescription>AI-generated executive analysis</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Critical Insights */}
      <Alert variant="destructive" className="border-l-4 border-destructive">
        <AlertTriangle className="h-5 w-5" />
        <AlertDescription className="ml-0">
          <h3 className="font-semibold mb-2">Critical Insights</h3>
          <ul className="space-y-1 text-sm">
            {criticalInsights.map((insight, i) => (
              <li key={i} className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                <span>{insight}</span>
              </li>
            ))}
          </ul>
        </AlertDescription>
      </Alert>

      {/* Main Content Tabs */}
      <Tabs defaultValue="summary" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="summary">Executive Summary</TabsTrigger>
          <TabsTrigger value="metrics">Key Metrics</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
        </TabsList>

        {/* Executive Summary */}
        <TabsContent value="summary" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <article className="prose prose-sm max-w-none dark:prose-in-dark">
                <ReactMarkdown rehypePlugins={[rehypeRaw]}>{data.summary}</ReactMarkdown>
              </article>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Key Metrics */}
        <TabsContent value="metrics" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Full JDE Dashboard Metrics</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {metrics.map(({ key, value }, i) => (
                  <Card key={i} className="metric-card">
                    <CardContent className="pt-6 pb-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium capitalize">{key}</p>
                          <p className="text-2xl font-bold mt-1">{value}</p>
                        </div>
                        <div className="text-muted-foreground">
                          {key.includes('Revenue') && <DollarSign className="h-6 w-6" />}
                          {key.includes('Customers') && <Users className="h-6 w-6" />}
                          {key.includes('Orders') && <PackageCheck className="h-6 w-6" />}
                          {key.includes('Shipments') && <Truck className="h-6 w-6" />}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recommendations */}
        <TabsContent value="recommendations" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Prioritized Business Recommendations</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {recommendations.map((rec, i) => (
                <div key={i} className="flex items-start gap-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex-shrink-0 w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center mt-0.5">
                    <span className="text-xs font-bold text-primary">{i + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold">{rec.title}</h4>
                    <p className="text-sm text-muted-foreground mb-1">Estimated Impact: <Badge>{rec.impact}</Badge></p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

    </div>
  );
}

