import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import {
  AlertTriangle,
  Building2,
  DollarSign,
  FileText,
  Filter,
  RefreshCw,
  Search,
  ShoppingBag,
} from "lucide-react";
import { useState } from "react";

function RiskBadge({ level, priority }: { level: string; priority: string }) {
  let normalizedPriority = priority?.toLowerCase();
  if (normalizedPriority === 'med') normalizedPriority = 'medium';

  const effectiveLevel = (() => {
    switch (normalizedPriority) {
      case 'low': return 'green';
      case 'medium': return 'yellow';
      case 'high': return 'red';
      case 'critical': return 'red';
      default: return level || 'green';
    }
  })();

  const config = {
    green: { label: "Low Risk", className: "risk-badge-green" },
    yellow: { label: "Med Risk", className: "risk-badge-yellow" },
    red: { label: "High Risk", className: "risk-badge-red" },
  }[effectiveLevel] || { label: effectiveLevel, className: "risk-badge-green" };

  return <span className={`risk-badge ${config.className}`}>{config.label}</span>;
}

function StatusBadge({ status, risk }: { status: string; risk?: string }) {
  // JDE Sales Order Status Codes (exact document flow)
  const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
    "520": { label: "Enter Order/Receive EDI", variant: "outline" },
    "540": { label: "Print Pick", variant: "outline" },
    "560": { label: "Ship Confirmation", variant: "default" },
    "580": { label: "Print Invoices", variant: "default" },
    "581": { label: "Print Interbranch Invoice", variant: "outline" },
    "582": { label: "Print Delivery Notes", variant: "outline" },
    "600": { label: "Invoice Journal", variant: "secondary" },
    "620": { label: "Sales Update", variant: "secondary" },
    "999": { label: "Complete - Ready to Purge", variant: "destructive" },
    // Text fallbacks
    "Pending": { label: "Pending", variant: "outline" },
    "Unknown": { label: "Unknown", variant: "outline" },
  };

  // Determine color based on risk level
  const getRiskColor = () => {
    const riskLevel = risk?.toLowerCase() || "green";
    
    switch (riskLevel) {
      case "red":
        return { label: statusConfig[status]?.label || status.replace(/_/g, " "), className: "bg-red-100 text-red-800 border-red-300 hover:bg-red-100" };
      case "yellow":
        return { label: statusConfig[status]?.label || status.replace(/_/g, " "), className: "bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-100" };
      case "green":
      default:
        return { label: statusConfig[status]?.label || status.replace(/_/g, " "), className: "bg-green-100 text-green-800 border-green-300 hover:bg-green-100" };
    }
  };

  const config = getRiskColor();

  return (
    <Badge className={`border ${config.className} capitalize`}>
      {config.label}
    </Badge>
  );
}

function PriorityBadge({ priority, status }: { priority: string; status: string }) {
  const statusConfig: Record<string, string> = {
    "520": "Enter Order/Receive EDI",
    "540": "Print Pick",
    "560": "Ship Confirmation",
    "580": "Print Invoices",
    "581": "Print Interbranch Invoice",
    "582": "Print Delivery Notes",
    "600": "Invoice Journal",
    "620": "Sales Update",
    "999": "Complete - Ready to Purge",
    "Pending": "Pending",
    "Unknown": "Unknown",
  };

  const statusLabel = statusConfig[status] || status;
  let effectivePriority = priority.toLowerCase();

  // Normalize common variations
  if (effectivePriority === 'med') effectivePriority = 'medium';

  if (statusLabel === "Print Interbranch Invoice" || statusLabel === "Print Delivery Notes") {
    effectivePriority = "low";
  }

  const config: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
    low: { label: "Low", variant: "outline" },
    medium: { label: "Medium", variant: "secondary" },
    high: { label: "High", variant: "default" },
    critical: { label: "Critical", variant: "destructive" },
    // JDE Priority Codes
    "1": { label: "Critical", variant: "destructive" },
    "2": { label: "High", variant: "default" },
    "3": { label: "Medium", variant: "secondary" },
    "4": { label: "Low", variant: "outline" },
    "5": { label: "Low", variant: "outline" },
  };

  const priorityConfig = config[effectivePriority] || { label: effectivePriority, variant: "secondary" as const };

  return (
    <Badge variant={priorityConfig.variant} className="capitalize">
      {priorityConfig.label}
    </Badge>
  );
}

export default function SalesOrders() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // JDE Sales Orders - fetched directly from JDE MSSQL tables
  const { data: salesOrders, isLoading, refetch } = trpc.salesOrder.listJDE.useQuery({
    status: statusFilter !== "all" ? statusFilter : undefined,
  });

  const getJDEItemName = (itemNumber: string) => {
    if (!itemNumber) return "N/A";
    return `Item #${itemNumber}`;
  };

  const filteredOrders = salesOrders?.filter((so: any) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      so.soNumber.toLowerCase().includes(query) ||
      so.customerName.toLowerCase().includes(query)
    );
  });

  const totalValue = (filteredOrders?.reduce((acc: number, so: any) => acc + Number(so.totalAmount), 0) || 0);
  const atRiskOrders = filteredOrders?.filter((so: any) => so.priority?.toLowerCase() === "high" || so.priority?.toLowerCase() === "critical");
  const highPriorityOrders = filteredOrders?.filter((so: any) => so.priority?.toLowerCase() === "high" || so.priority?.toLowerCase() === "critical");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="accent-square-lg" />
              <h1 className="text-3xl font-bold tracking-tight">Sales Orders</h1>
            </div>
            <p className="text-muted-foreground">
              Track customer orders and fulfillment status
            </p>
          </div>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="metric-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-caption">Total Orders</p>
                  <p className="text-3xl font-bold">{filteredOrders?.length || 0}</p>
                </div>
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card className="metric-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-caption">Total Value</p>
                  <p className="text-3xl font-bold">${(totalValue / 1000).toFixed(0)}K</p>
                </div>
                <DollarSign className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card className="metric-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-caption">At Risk</p>
                  <p className="text-3xl font-bold text-[oklch(0.55_0.25_27)]">
                    {atRiskOrders?.length || 0}
                  </p>
                </div>
                <AlertTriangle className="h-8 w-8 text-[oklch(0.55_0.25_27)]" />
              </div>
            </CardContent>
          </Card>
          <Card className="metric-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-caption">High Priority</p>
                  <p className="text-3xl font-bold">{highPriorityOrders?.length || 0}</p>
                </div>
                <ShoppingBag className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by SO number or customer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="enter_order">Enter Order/Receive EDI</SelectItem>
                  <SelectItem value="print_pick">Print Pick</SelectItem>
                  <SelectItem value="ship_confirm">Ship Confirmation</SelectItem>
                  <SelectItem value="print_invoice">Print Invoices</SelectItem>
                  <SelectItem value="invoice_journal">Invoice Journal</SelectItem>
                  <SelectItem value="sales_update">Sales Update</SelectItem>
                  <SelectItem value="complete">Complete - Ready to Purge</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-caption">
              {filteredOrders?.length || 0} Sales Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SO Number</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Ship Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders?.map((so: any) => (
                    <TableRow key={so.id || so.soNumber}>
                      <TableCell className="font-medium">{so.soNumber}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          {so.customerName}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getJDEItemName(so.itemNumber)}
                      </TableCell>
                      <TableCell>{so.quantity}</TableCell>
                      <TableCell className="font-medium">
                        ${Number(so.totalAmount).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {so.requestedShipDate ? (
                          <span>{so.requestedShipDate}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={so.status} risk={so.fulfillmentRisk} />
                      </TableCell>
                      <TableCell>
                        <PriorityBadge priority={so.priority} status={so.status} />
                      </TableCell>
                      <TableCell>
                        <RiskBadge level={so.fulfillmentRisk} priority={so.priority} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
