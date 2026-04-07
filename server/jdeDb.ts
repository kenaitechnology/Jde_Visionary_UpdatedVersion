import sql from "mssql";
import { JDE_STATUS_MAP } from "../shared/jdeStatusMap";
import { ENV } from "./_core/env";

export interface JDEEnv {
  MSSQL_HOST: string;
  MSSQL_PORT: number;
  MSSQL_USER: string;
  MSSQL_PASSWORD: string;
  MSSQL_DATABASE: string;
}

function getJDEConfig(): JDEEnv {
  return {
    MSSQL_HOST: ENV.mssqlHost || "localhost",
    MSSQL_PORT: ENV.mssqlPort || 1433,
    MSSQL_USER: ENV.mssqlUser || "",
    MSSQL_PASSWORD: ENV.mssqlPassword || "",
    MSSQL_DATABASE: ENV.mssqlDatabase || "JDE_AI",
  };
}

// Configuration for MSSQL connection
function getSqlConfig(): sql.config {
  const config = getJDEConfig();
  return {
    server: config.MSSQL_HOST,
    port: config.MSSQL_PORT,
    user: config.MSSQL_USER,
    password: config.MSSQL_PASSWORD,
    database: config.MSSQL_DATABASE,
    options: {
      encrypt: true,
      trustServerCertificate: false,
      enableArithAbort: true,
      connectionTimeout: 30000,
      requestTimeout: 30000,
    },
    pool: {
      max: 5,
      min: 1,
      idleTimeoutMillis: 60000,
    },
  };
}

// ============ SINGLETON CONNECTION POOL ============
let poolPromise: Promise<sql.ConnectionPool> | null = null;
let poolInstance: sql.ConnectionPool | null = null;

/**
 * Get or create the singleton connection pool
 * This ensures we reuse connections instead of creating new ones for each query
 */
async function getPool(): Promise<sql.ConnectionPool | null> {
  const config = getJDEConfig();
  
  if (!config.MSSQL_USER || !config.MSSQL_PASSWORD || !config.MSSQL_HOST) {
    console.warn("[JDE Database] MSSQL credentials not configured");
    return null;
  }

  // If we already have a connected pool, check if it's still valid
  if (poolInstance) {
    try {
      // Check if the pool is still connected
      if ((poolInstance as any).connected) {
        return poolInstance;
      }
      // Pool exists but disconnected, clear it
      poolInstance = null;
      poolPromise = null;
    } catch (e) {
      // Pool might be in a bad state, reset
      poolInstance = null;
      poolPromise = null;
    }
  }

  // If there's an existing promise, return it (avoid creating multiple connections)
  if (poolPromise) {
    try {
      poolInstance = await poolPromise;
      return poolInstance;
    } catch (e) {
      // Promise failed, reset and try again
      poolPromise = null;
      poolInstance = null;
    }
  }

  // Create new connection pool promise
  poolPromise = (async () => {
    try {
      console.log("[JDE Database] Creating new connection pool...");
      const pool = await sql.connect(getSqlConfig());
      
      poolInstance = pool;
      console.log("[JDE Database] Connection pool established successfully");
      return pool;
    } catch (error) {
      console.error("[JDE Database] Failed to create connection pool:", error);
      poolPromise = null;
      poolInstance = null;
      throw error;
    }
  })();

  return poolPromise;
}

/**
 * Close the connection pool (for graceful shutdown)
 */
export async function closeJDEDb(): Promise<void> {
  if (poolInstance) {
    try {
      await poolInstance.close();
      console.log("[JDE Database] Connection pool closed");
    } catch (error) {
      console.warn("[JDE Database] Error closing pool:", error);
    }
    poolInstance = null;
    poolPromise = null;
  }
}

/**
 * Check if the database connection is available
 */
export async function isJDEConnected(): Promise<boolean> {
  try {
    const pool = await getPool();
    return pool !== null && (pool as any).connected;
  } catch {
    return false;
  }
}

/**
 * Convert JDE Julian date (CYYDDD) to YYYY-MM-DD format
 */
function convertJDEJulianDate(julianDate: string | number | null | undefined): string {
  if (!julianDate) return "";
  
  const dateStr = String(julianDate).trim();
  if (!dateStr || dateStr === "0") return "";
  
  try {
    if (dateStr.includes("-") && dateStr.length === 10) {
      return dateStr;
    }
    
    if (dateStr.length === 6) {
      const c = parseInt(dateStr.charAt(0));
      const yy = parseInt(dateStr.substring(1, 3));
      const ddd = parseInt(dateStr.substring(3, 6));
      
      if (isNaN(c) || isNaN(yy) || isNaN(ddd)) {
        console.warn("[JDE Database] Invalid Julian date components:", dateStr);
        return dateStr;
      }
      
      const year = (c * 100) + 1900 + yy;
      
      if (ddd < 1 || ddd > 365) {
        console.warn("[JDE Database] Invalid day of year:", ddd, "for date:", dateStr);
        return dateStr;
      }
      
      const dateObj = new Date(year, 0, 1);
      dateObj.setDate(dateObj.getDate() + (ddd - 1));
      
      const formattedYear = dateObj.getFullYear();
      const formattedMonth = String(dateObj.getMonth() + 1).padStart(2, '0');
      const formattedDay = String(dateObj.getDate()).padStart(2, '0');
      
      return `${formattedYear}-${formattedMonth}-${formattedDay}`;
    }
    
    let year: number, month: number, day: number;
    
    if (dateStr.length === 7) {
      const century = parseInt(dateStr.charAt(0));
      year = century === 0 ? 2000 + parseInt(dateStr.substring(1, 3)) : 1900 + parseInt(dateStr.substring(1, 3));
      month = parseInt(dateStr.substring(3, 5)) - 1;
      day = parseInt(dateStr.substring(5, 7));
    } else if (dateStr.length === 8) {
      year = parseInt(dateStr.substring(0, 4));
      month = parseInt(dateStr.substring(4, 6)) - 1;
      day = parseInt(dateStr.substring(6, 8));
    } else {
      return dateStr;
    }
    
    if (month < 0 || month > 11) {
      console.warn("[JDE Database] Invalid month:", month, "for date:", dateStr);
      return dateStr;
    }
    if (day < 1 || day > 31) {
      console.warn("[JDE Database] Invalid day:", day, "for date:", dateStr);
      return dateStr;
    }
    
    const dateObj = new Date(year, month, day);
    if (isNaN(dateObj.getTime())) {
      return dateStr;
    }
    
    const formattedMonth = String(month + 1).padStart(2, '0');
    const formattedDay = String(day).padStart(2, '0');
    return `${year}-${formattedMonth}-${formattedDay}`;
  } catch (error) {
    console.warn("[JDE Database] Error converting JDE date:", error);
    return dateStr;
  }
}

function convertJEDate(julianDate: string | number | null | undefined): string {
  return convertJDEJulianDate(julianDate);
}

/**
 * Execute a query using the singleton connection pool
 */
export async function executeQuery<T>(query: string): Promise<T[]> {
  try {
    const pool = await getPool();
    if (!pool) {
      console.warn("[JDE Database] Cannot execute query: database not available");
      return [];
    }

    const request = pool.request();
    const result = await request.query(query);
    return result.recordset as T[];
  } catch (error) {
    console.error("[JDE Database] Query error:", error);
    return [];
  }
  // Note: We don't close the pool here because we're using a singleton connection pool
}

export interface JDEPurchaseOrder {
  poNumber: string;
  supplierName: string;
  orderDate: string;
  requestedDeliveryDate: string;
  status: string;
  riskLevel: string;
  delayProbability: number;
  id?: number;
}

export async function getJDEPurchaseOrders(): Promise<JDEPurchaseOrder[]> {
  const config = getJDEConfig();
  
  if (!config.MSSQL_USER || !config.MSSQL_PASSWORD || !config.MSSQL_HOST) {
    console.warn("[JDE Database] MSSQL credentials not configured");
    return [];
  }

  const query = `
    SELECT
      RTRIM(CONVERT(VARCHAR, F4301.PHDOCO)) AS poNumber,
      RTRIM(ISNULL(F0101.ABALPH, 'Unknown Supplier')) AS supplierName,
      CASE 
        WHEN F4301.PHTRDJ IS NOT NULL AND F4301.PHTRDJ > 0 THEN 
          CONVERT(VARCHAR, CAST(F4301.PHTRDJ AS INT))
        ELSE ''
      END AS orderDate,
      CASE 
        WHEN F4311.PDDRQJ IS NOT NULL AND F4311.PDDRQJ > 0 THEN 
          CONVERT(VARCHAR, CAST(F4311.PDDRQJ AS INT))
        ELSE ''
      END AS requestedDeliveryDate,
      RTRIM(ISNULL(F4311.PDNXTR, '')) AS status
    FROM dbo.F4301 F4301
    INNER JOIN dbo.F4311 F4311 ON F4301.PHDOCO = F4311.PDDOCO AND F4301.PHDCTO = F4311.PDDCTO
    LEFT JOIN dbo.F0101 F0101 ON F4311.PDAN8 = F0101.ABAN8
    ORDER BY F4301.PHDOCO DESC
  `;

  try {
    const rows = await executeQuery<any>(query);

    console.log("[JDE RAW DATA]:", rows);
    
    return rows.map((row: any) => {
      const mappedStatus = mapJDEStatus(row.status);
      const requestedDate = convertJDEJulianDate(row.requestedDeliveryDate);
      const parsedDate = requestedDate ? new Date(requestedDate) : null;
      const riskData = calculateJDEPORisk(row.status, parsedDate);
      
      return {
        poNumber: row.poNumber || "",
        supplierName: row.supplierName || "Unknown Supplier",
        orderDate: convertJEDate(row.orderDate),
        requestedDeliveryDate: requestedDate,
        status: mappedStatus,
        riskLevel: riskData.riskLevel,
        delayProbability: riskData.delayProbability,
      };
    });
  } catch (error) {
    console.error("[JDE Database] Error fetching purchase orders:", error);
    return [];
  }
}

function mapJDEStatus(nxtStatus: string): string {
  const statusMap: Record<string, string> = {
      "05": "PRP Order, Pre-Quote Accept",
    "1": "Purchasing Activities",
    "100": "Enter Purchase Requisition",
    "110": "Approved/MRP Requisition",
    "120": "Print Purchase Requisition",
    "130": "Generate PO from Requisition",
    "132": "SDS Req to Whse",
    "134": "SDS Req to PO",
    "140": "Enter Request for Bid/Quote",
    "160": "Print Request for Bid/Quote",
    "161": "Send EDI Request for Quote",
    "180": "Enter Supplier Bid",
    "200": "Print Bid/Quote Confirmation",
    "210": "Enter Blanket Purchase Order",
    "215": "Release Blanket Order",
    "216": "Preliminary Order Created",
    "220": "Enter Purchase Order",
    "225": "Rejected Order",
    "230": "Approval Process",
    "240": "Print Purchase Order Proof",
    "245": "Awaiting Acknowledgement",
    "250": "Approve Shipment/Load",
    "260": "Approve Purchase Order Proof",
    "280": "Print Purchase Order",
    "281": "Send EDI Purchase Order",
    "282": "Receive EDI PO Acknowledgment",
    "300": "Record Supplier Acknowledgement",
    "320": "Enter Change Order",
    "325": "Order Revised by Ack.",
    "340": "Approve Change Order",
    "360": "Print Change Order",
    "361": "Send EDI Purchase Order Change",
    "362": "Receive EDI Change Ack.",
    "370": "Record Supplier Shipment",
    "380": "Print Purchase Receiver",
    "381": "Application Certificate",
    "400": "Record Purchase Receipt",
    "410": "Back Ordered",
    "420": "Release from Inspection",
    "425": "Freight, Insurance & Expenses Brazil Purchasing",
    "430": "Close Nota Fiscal Brazil Purchasing",
    "440": "Record Matching Voucher",
    "499": "Canceled Line",
  };
  
  const trimmed = nxtStatus?.trim() || "";
  return statusMap[trimmed] || "Pending";
}

function calculateJDEPORisk(status: string, requestedDate: Date | null): { riskLevel: string; delayProbability: number } {
  if (!requestedDate) {
    return { riskLevel: "Unknown", delayProbability: 0 };
  }

  const today = new Date();

  // ---- STEP 1: Time factor ----
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysDiff = (requestedDate.getTime() - today.getTime()) / msPerDay;

  // configurable windows (NOT hardcoded logic, just scaling factors)
  const maxFutureWindow = 30;  // how far future we normalize
  const maxDelayWindow = 30;   // how far delay we normalize

  let timeScore;

  if (daysDiff >= 0) {
    timeScore = 1 - (daysDiff / maxFutureWindow);
  } else {
    timeScore = 1 + (Math.abs(daysDiff) / maxDelayWindow);
  }

  // normalize between 0–1
  timeScore = Math.max(0, Math.min(1, timeScore));

  // ---- STEP 2: Status factor ----
  const statusNum = parseFloat(status || "0");

  const minStatus = 0;
  const maxStatus = 400; // configurable (JDE completion)

  const progress = (statusNum - minStatus) / (maxStatus - minStatus);
  const statusScore = 1 - Math.max(0, Math.min(1, progress));

  // ---- STEP 3: Weighted combination ----
  const w1 = 0.6; // time weight
  const w2 = 0.4; // status weight

  let delayProbability = (w1 * timeScore) + (w2 * statusScore);

  // clamp
  delayProbability = Math.max(0, Math.min(1, delayProbability));

  // ---- STEP 4: Derive risk level (not hardcoded, threshold-based) ----
  let riskLevel = "Low";

  if (delayProbability > 0.75) riskLevel = "High";
  else if (delayProbability > 0.4) riskLevel = "Medium";

  return {
    riskLevel,
    delayProbability: Number(delayProbability.toFixed(2)) * 100  // Convert to %
  };
}

export async function getJDEPurchaseOrderById(poNumber: string): Promise<JDEPurchaseOrder | null> {
  const config = getJDEConfig();
  
  if (!config.MSSQL_USER || !config.MSSQL_PASSWORD || !config.MSSQL_HOST) {
    console.warn("[JDE Database] MSSQL credentials not configured");
    return null;
  }

  const query = `
    SELECT TOP 1
      RTRIM(CONVERT(VARCHAR, F4301.PHDOCO)) AS poNumber,
      RTRIM(ISNULL(F0101.ABALPH, 'Unknown Supplier')) AS supplierName,
      CASE 
        WHEN F4301.PHTRDJ IS NOT NULL AND F4301.PHTRDJ > 0 THEN 
          CONVERT(VARCHAR, CAST(F4301.PHTRDJ AS INT))
        ELSE ''
      END AS orderDate,
      CASE 
        WHEN F4311.PDDRQJ IS NOT NULL AND F4311.PDDRQJ > 0 THEN 
          CONVERT(VARCHAR, CAST(F4311.PDDRQJ AS INT))
        ELSE ''
      END AS requestedDeliveryDate,
      RTRIM(ISNULL(F4311.PDNXTR, '')) AS status
    FROM dbo.F4301 F4301
    INNER JOIN dbo.F4311 F4311 ON F4301.PHDOCO = F4311.PDDOCO AND F4301.PHDCTO = F4311.PDDCTO
    LEFT JOIN dbo.F0101 F0101 ON F4311.PDAN8 = F0101.ABAN8
    WHERE RTRIM(CONVERT(VARCHAR, F4301.PHDOCO)) = '${poNumber}'
    ORDER BY F4301.PHDOCO DESC
  `;

  try {
    const rows = await executeQuery<any>(query);
    
    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    const mappedStatus = mapJDEStatus(row.status);
    const requestedDate = convertJDEJulianDate(row.requestedDeliveryDate);
    const parsedDate = requestedDate ? new Date(requestedDate) : null;
    const riskData = calculateJDEPORisk(row.status, parsedDate);
    
    return {
      poNumber: row.poNumber || "",
      supplierName: row.supplierName || "Unknown Supplier",
      orderDate: convertJEDate(row.orderDate),
      requestedDeliveryDate: requestedDate,
      status: mappedStatus,
      riskLevel: riskData.riskLevel,
      delayProbability: riskData.delayProbability,
    };
  } catch (error) {
    console.error("[JDE Database] Error fetching purchase order:", error);
    return null;
  }
}

// ============ JDE SALES ORDER INTERFACE ============
export interface JDESalesOrder {
  soNumber: string;
  customerName: string;
  itemNumber: string;
  secondItemNumber: string;
  thirdItemNumber: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  requestedShipDate: string;
  status: string;
  priority: string;
  fulfillmentRisk: string;
}

export async function getJDESalesOrders(): Promise<JDESalesOrder[]> {
  const config = getJDEConfig();
  
  if (!config.MSSQL_USER || !config.MSSQL_PASSWORD || !config.MSSQL_HOST) {
    console.warn("[JDE Database] MSSQL credentials not configured");
    return [];
  }

  const query = `
    SELECT
      RTRIM(CONVERT(VARCHAR, F4211.SDDOCO)) AS soNumber,
      RTRIM(ISNULL(F0101.ABALPH, 'Unknown Customer')) AS customerName,
      RTRIM(CONVERT(VARCHAR, F4211.SDITM)) AS itemNumber,
      RTRIM(ISNULL(F4211.SDLITM, '')) AS secondItemNumber,
      RTRIM(ISNULL(F4211.SDAITM, '')) AS thirdItemNumber,
      COALESCE(TRY_CAST(F4211.SDUORG AS FLOAT), 0) AS quantity,
      COALESCE(TRY_CAST(F4211.SDUPRC AS FLOAT), 0) AS unitPrice,
      (COALESCE(TRY_CAST(F4211.SDUORG AS FLOAT), 0) * COALESCE(TRY_CAST(F4211.SDUPRC AS FLOAT), 0)) AS totalAmount,
      CASE 
        WHEN F4211.SDDRQJ IS NOT NULL AND F4211.SDDRQJ > 0 THEN 
          CONVERT(VARCHAR, CAST(F4211.SDDRQJ AS INT))
        ELSE ''
      END AS requestedShipDate,
      RTRIM(ISNULL(F4211.SDNXTR, '')) AS status,
      RTRIM(ISNULL(F4211.SDPRIO, '')) AS priority
    FROM dbo.F4211 F4211
    INNER JOIN dbo.F4201 F4201 ON F4211.SDDOCO = F4201.SHDOCO AND F4211.SDDCTO = F4201.SHDCTO
    LEFT JOIN dbo.F0101 F0101 ON F4201.SHAN8 = F0101.ABAN8
    ORDER BY F4211.SDDOCO DESC
  `;

  try {
    const rows = await executeQuery<any>(query);
    
      return rows.map((row: any) => ({
        soNumber: row.soNumber || "",
        customerName: row.customerName || "Unknown Customer",
        itemNumber: row.itemNumber || "",
        secondItemNumber: row.secondItemNumber || "",
        thirdItemNumber: row.thirdItemNumber || "",
        quantity: Number(row.quantity) || 0,
        unitPrice: Number(row.unitPrice) || 0,
        totalAmount: Number(row.totalAmount) || 0,
        requestedShipDate: convertJEDate(row.requestedShipDate),
        status: mapJDESOStatus(row.status),
        priority: mapJDESOPriority(row.priority),
        fulfillmentRisk: calculateJDESORisk(row.status, row.requestedShipDate, Number(row.totalAmount) || 0, Number(row.quantity) || 0),
      }));
  } catch (error) {
    console.error("[JDE Database] Error fetching sales orders:", error);
    return [];
  }
}

function mapJDESOStatus(nxtStatus: string): string {
  const code = nxtStatus?.trim() || "";

  const statusMap: Record<string, string> = {
    "500": "Enter Quote/Blanket Order",
    "515": "Release Quote/Blanket to Order",
    "520": "Enter Order/Receive EDI Order",
    "521": "Review EDI/Uploaded Order",
    "522": "Correct EDI Order",
    "523": "Send EDI Change Acknowledgement",
    "524": "In Fulfillment",
    "525": "Print Acknowledgement / Send EDI",
    "527": "Approve Shipment/Load",
    "530": "Work Order Created",
    "535": "In Warehouse",
    "536": "Approve Shipment",
    "537": "Print Control Pick",
    "540": "Print Pick",
    "542": "Print Loading Note ECS",
    "545": "Pick Confirmation",
    "550": "Print Shipping Documents",
    "555": "Pack Confirmation",
    "559": "Waiting Purchase Order Receipt",
    "560": "Ship Confirmation",
    "561": "Send EDI Response to RFQ",
    "562": "Print Packing List/Invoice",
    "563": "Print Packing List/Invoice",
    "564": "Delivery Document Selection ECS",
    "565": "Print Delivery Notes",
    "570": "Print Bill of Lading",
    "571": "Send EDI Advanced Ship Notice",
    "572": "Receive EDI Receiving Advice",
    "573": "Delivery Confirm ECS",
    "574": "Normal Generate XML Brazil",
    "575": "Cycle Billing",
    "576": "Send EDI Advanced Ship Notice",
    "577": "Receive EDI Receiving Advice",
    "578": "EDI Receiving Advice Reject",
    "579": "Pending Revenue Recognition",
    "580": "Print Invoices",
    "581": "Send EDI Invoice",
    "585": "Print Interbranch Invoice",
    "590": "Print Pre-Invoice Proof",
    "595": "Generate Nota Fiscal Brazil Sales",
    "597": "Freight, Insurance & Expenses Brazil Sales",
    "598": "Print Nota Fiscal Brazil Sales",
    "600": "Invoice Journal",
    "610": "Print G/L Sales Recap-Detail",
    "615": "Print G/L Sales Recap-Summary",
    "617": "Generate Tax Lines Brazil Sales",
    "620": "Sales Update",
    "625": "End of Month Repricing ECS",
    "800": "Direct Ship Acknowledgement",
    "810": "Print Sales Invoice",
    "831": "Invoice Error Argentina",
    "832": "Shipment Note Error Argentina",

    "900": "Backorder in S/O Entry",
    "902": "Backorder in Commitments",
    "904": "Backorder in Ship Confirmation",
    "909": "Backorder in Transportation",

    "910": "Added in Price Adjustments",
    "912": "Added in Commitments",
    "913": "Added in Pick Confirmation",
    "914": "Added in Ship Confirmation",
    "915": "Added as Replacement Item",
    "916": "Added as Substitution/Associated Item",
    "917": "Added as Promotional Item",
    "918": "Added in Transport Arrange Import",
    "919": "Added in Transportation",
    "920": "Added in Order Repricing",
    "922": "Added in Work Order Generation",
    "924": "Added in Freight Update",
    "925": "Added in Transport Confirm Import",
    "926": "Added in Fulfillment Release",

    "980": "Canceled in Order Entry",
    "981": "Canceled in Fulfillment Release",
    "982": "Canceled in Commitments",
    "983": "Canceled in Pick Confirmation",
    "984": "Canceled in Ship Confirmation",
    "985": "Canceled by Replacement",
    "986": "Canceled by Substitution",
    "987": "Canceled by Price Recalculation",
    "988": "Canceled in Update",
    "989": "Canceled in Transportation",
    "990": "Canceled by Promotional Item",
    "991": "Canceled due to BOM",
    "995": "Unapproved Load",
    "996": "Cancelled Nota Fiscal",
    "997": "Cancelled Nota Fiscal after Run",
    "998": "Reversed Nota Fiscal Brazil",
    "999": "Complete - Ready to Purge"
  };

  return statusMap[code] || code || "Unknown";
}

function mapJDESOPriority(priority: string): string {
  const trimmed = priority?.trim() || "";
  if (!trimmed || trimmed === "") {
    return "Medium"; // Default if empty
  }
  const numPriority = parseInt(trimmed, 10);
  switch (numPriority) {
    case 1: return "Critical";
    case 2: return "High";
    case 3: return "Medium";
    case 4:
    case 5: return "Low";
    default: return trimmed; // Bind raw data directly if not 1-5
  }
}

function calculateJDESORisk(
  status: string,
  shipDate: string,
  totalAmount: number,
  quantity: number
): string {
  let riskScore = 0;

  const statusCode = parseInt(status?.trim() || "0", 10);

  // 1. Status-based risk
  if (statusCode >= 999) {
    return "green"; // completed
  }

  if (statusCode >= 580 && statusCode <= 620) {
    riskScore += 10; // in progress (low risk)
  } else if (statusCode < 540) {
    riskScore += 40; // not started (high risk)
  } else {
    riskScore += 20;
  }

  // 2. Ship date risk (delay)
  if (shipDate) {
    const today = new Date();
    const reqDate = new Date(convertJEDate(shipDate));

    const diffDays = Math.ceil(
      (reqDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays < 0) {
      riskScore += 50; // already delayed
    } else if (diffDays <= 2) {
      riskScore += 30; // very close
    } else if (diffDays <= 7) {
      riskScore += 15;
    }
  }

  // 3. High value order risk
  if (totalAmount > 100000) {
    riskScore += 20;
  }

  // 4. Large quantity risk
  if (quantity > 100) {
    riskScore += 10;
  }

  // Final Risk Level
  if (riskScore >= 80) return "red";
  if (riskScore >= 40) return "yellow";
  return "green";
}

export async function getJDESalesOrderById(soNumber: string): Promise<JDESalesOrder | null> {
  const config = getJDEConfig();
  
  if (!config.MSSQL_USER || !config.MSSQL_PASSWORD || !config.MSSQL_HOST) {
    console.warn("[JDE Database] MSSQL credentials not configured");
    return null;
  }

  const query = `
    SELECT TOP 1
      RTRIM(CONVERT(VARCHAR, F4211.SDDOCO)) AS soNumber,
      RTRIM(ISNULL(F0101.ABALPH, 'Unknown Customer')) AS customerName,
      RTRIM(CONVERT(VARCHAR, F4211.SDITM)) AS itemNumber,
      RTRIM(ISNULL(F4211.SDLITM, '')) AS secondItemNumber,
      RTRIM(ISNULL(F4211.SDAITM, '')) AS thirdItemNumber,
      COALESCE(TRY_CAST(F4211.SDUORG AS FLOAT), 0) AS quantity,
      COALESCE(TRY_CAST(F4211.SDUPRC AS FLOAT), 0) AS unitPrice,
      (COALESCE(TRY_CAST(F4211.SDUORG AS FLOAT), 0) * COALESCE(TRY_CAST(F4211.SDUPRC AS FLOAT), 0)) AS totalAmount,
      CASE 
        WHEN F4211.SDDRQJ IS NOT NULL AND F4211.SDDRQJ > 0 THEN 
          CONVERT(VARCHAR, CAST(F4211.SDDRQJ AS INT))
        ELSE ''
      END AS requestedShipDate,
      RTRIM(ISNULL(F4211.SDNXTR, '')) AS status,
      RTRIM(ISNULL(F4211.SDPRIO, '')) AS priority
    FROM dbo.F4211 F4211
    INNER JOIN dbo.F4201 F4201 ON F4211.SDDOCO = F4201.SHDOCO AND F4211.SDDCTO = F4201.SHDCTO
    LEFT JOIN dbo.F0101 F0101 ON F4201.SHAN8 = F0101.ABAN8
    WHERE RTRIM(CONVERT(VARCHAR, F4211.SDDOCO)) = '${soNumber}'
    ORDER BY F4211.SDDOCO DESC
  `;

  try {
    const rows = await executeQuery<any>(query);
    
    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      soNumber: row.soNumber || "",
      customerName: row.customerName || "Unknown Customer",
      itemNumber: row.itemNumber || "",
      secondItemNumber: row.secondItemNumber || "",
      thirdItemNumber: row.thirdItemNumber || "",
      quantity: Number(row.quantity) || 0,
      unitPrice: Number(row.unitPrice) || 0,
      totalAmount: Number(row.totalAmount) || 0,
      requestedShipDate: convertJEDate(row.requestedShipDate),
      status: mapJDESOStatus(row.status),
      priority: mapJDESOPriority(row.priority),
      fulfillmentRisk: calculateJDESORisk(row.status, row.requestedShipDate, Number(row.totalAmount) || 0, Number(row.quantity) || 0),
    };
  } catch (error) {
    console.error("[JDE Database] Error fetching sales order:", error);
    return null;
  }
}

// ============ JDE INVENTORY INTERFACE ============
export interface JDEInventoryItem {
  itemCode: string;
  description: string;
  category: string;
  quantityAvailable: number;
  daysOfSupply: number;
  reorderPoint: number;
  stockoutRisk: string;
}

export async function getJDEInventoryItems(): Promise<JDEInventoryItem[]> {
  const config = getJDEConfig();
  
  if (!config.MSSQL_USER || !config.MSSQL_PASSWORD || !config.MSSQL_HOST) {
    console.warn("[JDE Database] MSSQL credentials not configured");
    return [];
  }

  const query = `
    SELECT DISTINCT
      RTRIM(F4101.IMLITM) AS itemCode,
      RTRIM(ISNULL(F4101.IMDSC1, '')) AS description,
      RTRIM(ISNULL(F4101.IMSRP1, '')) AS category,
      ISNULL(F41021.LIPQOH, 0) AS quantityAvailable,
      ISNULL(F4102.IBROPI, 0) AS reorderPoint,
      (
        SELECT TOP 1 F4111_2.ILTRQT
        FROM dbo.F4111 F4111_2
        WHERE F4111_2.ILITM = F4101.IMITM
        ORDER BY F4111_2.ILTRDJ DESC
      ) AS transactionQuantity
    FROM dbo.F4101 F4101
    LEFT JOIN dbo.F41021 F41021 
      ON F4101.IMITM = F41021.LIITM
    LEFT JOIN dbo.F4102 F4102 
      ON F4101.IMITM = F4102.IBITM
    WHERE F4101.IMITM IS NOT NULL
    ORDER BY itemCode
  `;

  try {
    const rows = await executeQuery<any>(query);
    
    return rows.map((row: any) => {
      const quantityAvailable = Number(row.quantityAvailable) || 0;
      const transactionQuantity = Number(row.transactionQuantity) || 0;
      
      let daysOfSupply = 0;
      if (transactionQuantity > 0) {
        daysOfSupply = Math.round(quantityAvailable / transactionQuantity);
      } else if (quantityAvailable > 0) {
        daysOfSupply = 30;
      }
      
      const reorderPoint = Number(row.reorderPoint) || 0;
      let stockoutRisk = "low";
      
      if (quantityAvailable === 0) {
        stockoutRisk = "critical";
      } else if (reorderPoint > 0) {
        const ratio = quantityAvailable / reorderPoint;
        if (ratio <= 0.5) {
          stockoutRisk = "critical";
        } else if (ratio <= 1.0) {
          stockoutRisk = "high";
        } else if (ratio <= 1.5) {
          stockoutRisk = "medium";
        } else {
          stockoutRisk = "low";
        }
      } else if (daysOfSupply <= 7) {
        stockoutRisk = "critical";
      } else if (daysOfSupply <= 14) {
        stockoutRisk = "high";
      } else if (daysOfSupply <= 30) {
        stockoutRisk = "medium";
      }
      
      return {
        itemCode: row.itemCode || "",
        description: row.description || "",
        category: row.category || "Uncategorized",
        quantityAvailable,
        daysOfSupply,
        reorderPoint,
        stockoutRisk,
      };
    });
  } catch (error) {
    console.error("[JDE Database] Error fetching inventory items:", error);
    return [];
  }
}

export async function getJDEInventoryItemByCode(itemCode: string): Promise<JDEInventoryItem | null> {
  const config = getJDEConfig();
  
  if (!config.MSSQL_USER || !config.MSSQL_PASSWORD || !config.MSSQL_HOST) {
    console.warn("[JDE Database] MSSQL credentials not configured");
    return null;
  }

  const query = `
    SELECT TOP 1
      RTRIM(CONVERT(VARCHAR, F4101.IMLITM)) AS itemCode,
      RTRIM(ISNULL(F4101.IMDSC1, '')) AS description,
      RTRIM(ISNULL(F4101.IMSRP1, '')) AS category,
      RTRIM(CONVERT(VARCHAR, ISNULL(F41021.LIPQOH, '0'))) AS quantityAvailable,
      RTRIM(CONVERT(VARCHAR, ISNULL(F4102.IBROPI, '0'))) AS reorderPoint,
      (
        SELECT TOP 1 RTRIM(CONVERT(VARCHAR, ISNULL(F4111.ILTRQT, '0')))
        FROM dbo.F4111 F4111
        WHERE RTRIM(CONVERT(VARCHAR, F4111.ILITM)) = RTRIM(CONVERT(VARCHAR, F4101.IMLITM))
        ORDER BY F4111.ILTRDJ DESC
      ) AS transactionQuantity
    FROM dbo.F4101 F4101
    LEFT JOIN dbo.F41021 F41021 ON RTRIM(CONVERT(VARCHAR, F4101.IMLITM)) = RTRIM(CONVERT(VARCHAR, F41021.LIITM))
    LEFT JOIN dbo.F4102 F4102 ON RTRIM(CONVERT(VARCHAR, F4101.IMLITM)) = RTRIM(CONVERT(VARCHAR, F4102.IBITM))
    WHERE RTRIM(CONVERT(VARCHAR, F4101.IMLITM)) = '${itemCode}'
    ORDER BY RTRIM(CONVERT(VARCHAR, F4101.IMLITM))
  `;

  try {
    const rows = await executeQuery<any>(query);
    
    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    const quantityAvailable = Number(row.quantityAvailable) || 0;
    const transactionQuantity = Number(row.transactionQuantity) || 0;
    
    let daysOfSupply = 0;
    if (transactionQuantity > 0) {
      daysOfSupply = Math.round(quantityAvailable / transactionQuantity);
    } else if (quantityAvailable > 0) {
      daysOfSupply = 30;
    }
    
    const reorderPoint = Number(row.reorderPoint) || 0;
    let stockoutRisk = "low";
    
    if (quantityAvailable === 0) {
      stockoutRisk = "critical";
    } else if (reorderPoint > 0) {
      const ratio = quantityAvailable / reorderPoint;
      if (ratio <= 0.5) {
        stockoutRisk = "critical";
      } else if (ratio <= 1.0) {
        stockoutRisk = "high";
      } else if (ratio <= 1.5) {
        stockoutRisk = "medium";
      }
    } else if (daysOfSupply <= 7) {
      stockoutRisk = "critical";
    } else if (daysOfSupply <= 14) {
      stockoutRisk = "high";
    } else if (daysOfSupply <= 30) {
      stockoutRisk = "medium";
    }
    
    return {
      itemCode: row.itemCode || "",
      description: row.description || "",
      category: row.category || "Uncategorized",
      quantityAvailable,
      daysOfSupply,
      reorderPoint,
      stockoutRisk,
    };
  } catch (error) {
    console.error("[JDE Database] Error fetching inventory item:", error);
    return null;
  }
}

// ============ JDE SHIPMENT INTERFACE ============
export interface JDEShipment {
  shipmentNumber: string;
  carrier: string;
  originCity: string;
  originCountry: string;
  destination: string;
  eta: string;
  status: string;
  riskLevel: string;
  temperature?: number;
}

export async function getJDEShipments(): Promise<JDEShipment[]> {
  const config = getJDEConfig();
  
  if (!config.MSSQL_USER || !config.MSSQL_PASSWORD || !config.MSSQL_HOST) {
    console.warn("[JDE Database] MSSQL credentials not configured");
    return [];
  }

const query = `
SELECT 
  RTRIM(CONVERT(VARCHAR, F4215.XHSHPN)) AS shipmentNumber,
  RTRIM(ISNULL(F0101Dest.ABALPH, '')) AS destination,
  CASE 
    WHEN F4211.SDPDDJ IS NOT NULL 
      AND TRY_CAST(F4211.SDPDDJ AS FLOAT) > 0 
    THEN CONVERT(VARCHAR, CAST(F4211.SDPDDJ AS INT)) 
    ELSE '' 
  END AS eta,
  RTRIM(ISNULL(F4211.SDNXTR, '')) AS status,
  RTRIM(ISNULL(F0116.ALCTY1, '')) AS originCity,
  RTRIM(ISNULL(F0116.ALCTR, '')) AS originCountry
FROM dbo.F4215 F4215
LEFT JOIN dbo.F4211 F4211 
  ON RTRIM(CONVERT(VARCHAR, F4215.XHSHPN)) = RTRIM(CONVERT(VARCHAR, F4211.SDDOCO))
LEFT JOIN dbo.F0116 F0116 
  ON F4215.XHAN8 = F0116.ALAN8
LEFT JOIN dbo.F0101 F0101Dest 
  ON F4211.SDSHAN = F0101Dest.ABAN8
ORDER BY F4215.XHSHPN DESC;
`;

  try {
const rows = await executeQuery<any>(query);

console.log("[SHIPMENT RAW DATA RECORDS] Found", rows.length, "rows");
rows.forEach((row: any, index: number) => {
  console.log(`Record ${index + 1}: Shipment# ${row.shipmentNumber}, Status: "${row.status}", ETA: "${row.eta}", Dest: "${row.destination}", Origin: "${row.originCity}, ${row.originCountry}"`);
});
if (rows.length > 0) {
  console.log("Sample row:", rows[0]);
}
    return rows.map((row: any) => ({
      shipmentNumber: row.shipmentNumber || "",
      carrier: "TBD",
      originCity: row.originCity || "",
      originCountry: row.originCountry || "",
      destination: row.destination || "",
      eta: convertJEDate(row.eta),
      status: mapJDEShipmentStatus(row.status),
      riskLevel: calculateShipmentRisk(row.status, row.eta),
    }));
  } catch (error) {
    console.error("[JDE Database] Error fetching shipments:", error);
    return [];
  }
}

function mapJDEShipmentStatus(nxtStatus: string): string {
  const code = nxtStatus?.trim() || "";
  return JDE_STATUS_MAP[code] || code || "Unknown";
}

function calculateShipmentRisk(status: string, eta: string): string {
  let riskScore = 0;

  const statusCode = parseInt(status || "0", 10);

  // Status-based risk
  if (statusCode >= 999) {
    return "green";
  }

  if (statusCode >= 560 && statusCode <= 620) {
    riskScore += 10; // shipped/invoiced low risk
  } else if (statusCode < 540) {
    riskScore += 40; // pre-pick high risk
  } else {
    riskScore += 20;
  }

  // ETA delay risk
  if (eta) {
    const today = new Date();
    const reqDate = new Date(convertJEDate(eta));

    const diffDays = Math.ceil((reqDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      riskScore += 50;
    } else if (diffDays <= 2) {
      riskScore += 30;
    } else if (diffDays <= 7) {
      riskScore += 15;
    }
  }

  // Final
  if (riskScore >= 80) return "red";
  if (riskScore >= 40) return "yellow";
  return "green";
}

export async function getJDEShipmentById(shipmentNumber: string): Promise<JDEShipment | null> {
  const config = getJDEConfig();
  
  if (!config.MSSQL_USER || !config.MSSQL_PASSWORD || !config.MSSQL_HOST) {
    console.warn("[JDE Database] MSSQL credentials not configured");
    return null;
  }

  const query = `
    SELECT TOP 1
      RTRIM(CONVERT(VARCHAR, F4215.XHSHPN)) AS shipmentNumber,
      RTRIM(ISNULL(F0101Dest.ABALPH, '')) AS destination,
      CASE 
        WHEN F4211.SDPDDJ IS NOT NULL AND TRY_CAST(F4211.SDPDDJ AS FLOAT) > 0 THEN 
          CONVERT(VARCHAR, CAST(F4211.SDPDDJ AS INT))
        ELSE ''
      END AS eta,
      RTRIM(ISNULL(F4211.SDNXTR, '')) AS status,
      RTRIM(ISNULL(F0116.ALCTY1, '')) AS originCity,
      RTRIM(ISNULL(F0116.ALCTR, '')) AS originCountry
    FROM dbo.F4215 F4215
    LEFT JOIN dbo.F4211 F4211 ON RTRIM(CONVERT(VARCHAR, F4215.XHSHPN)) = RTRIM(CONVERT(VARCHAR, F4211.SDDOCO))
    LEFT JOIN dbo.F0116 F0116 ON F4215.XHAN8 = F0116.ALAN8
    LEFT JOIN dbo.F0101 F0101Dest ON F4211.SDSHAN = F0101Dest.ABAN8
    WHERE RTRIM(CONVERT(VARCHAR, F4215.XHSHPN)) = '${shipmentNumber}'
    ORDER BY F4215.XHSHPN DESC
  `;

  try {
    const rows = await executeQuery<any>(query);
    
    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      shipmentNumber: row.shipmentNumber || "",
      carrier: "TBD",
      originCity: row.originCity || "",
      originCountry: row.originCountry || "",
      destination: row.destination || "",
      eta: convertJEDate(row.eta),
      status: mapJDEShipmentStatus(row.status),
      riskLevel: calculateShipmentRisk(row.status, row.eta),
    };
  } catch (error) {
    console.error("[JDE Database] Error fetching shipment:", error);
    return null;
  }
}

// ============ JDE SUPPLIERS INTERFACE ============
export interface JDESupplier {
  id: string;
  name: string;
  type: string;
  country: string;
  leadDays: number;
  reliabilityScore?: number;
  qualityScore?: number;
}

export async function getJDESuppliers(): Promise<JDESupplier[]> {
  const config = getJDEConfig();
  
  if (!config.MSSQL_USER || !config.MSSQL_PASSWORD || !config.MSSQL_HOST) {
    console.warn("[JDE Database] MSSQL credentials not configured");
    return [];
  }

  const suppliersQuery = `
    SELECT
      RTRIM(CONVERT(VARCHAR, F0101.ABAN8)) AS id,
      RTRIM(ISNULL(F0101.ABALPH, '')) AS name,
      RTRIM(ISNULL(F0101.ABAT1, '')) AS type,
      RTRIM(ISNULL(F0116.ALCTR, '')) AS country,
      COALESCE(TRY_CAST(F4311.PDPDDJ AS INT), 0) - COALESCE(TRY_CAST(F4311.PDTRDJ AS INT), 0) AS leadDays
    FROM dbo.F0101 F0101
    LEFT JOIN dbo.F0116 F0116 ON F0101.ABAN8 = F0116.ALAN8
    LEFT JOIN dbo.F4311 F4311 ON F0101.ABAN8 = F4311.PDAN8
    WHERE F0101.ABAT1 = 'VEND'
      AND F0101.ABAN8 IS NOT NULL
      AND F0101.ABALPH IS NOT NULL
      AND RTRIM(F0101.ABALPH) <> ''
    GROUP BY F0101.ABAN8, F0101.ABALPH, F0101.ABAT1, F0116.ALCTR, F4311.PDPDDJ, F4311.PDTRDJ
    ORDER BY F0101.ABALPH ASC
  `;

  const reliabilityQuery = `
    SELECT 
      F4311.PDAN8 AS supplierId,
      COUNT(*) AS totalReceipts,
      SUM(CASE 
        WHEN F43121.PRRCDJ IS NOT NULL AND F43121.PRRCDJ > 0 
             AND F4311.PDDRQJ IS NOT NULL AND F4311.PDDRQJ > 0
             AND F43121.PRRCDJ <= F4311.PDDRQJ 
        THEN 1 ELSE 0 END) AS reliableReceipts
    FROM dbo.F4311 F4311
    INNER JOIN dbo.F43121 F43121 ON F4311.PDDOCO = F43121.PRDOCO 
      AND F4311.PDDCTO = F43121.PRDCTO 
      AND F4311.PDLNID = F43121.PRLNID
    WHERE F43121.PRRCDJ IS NOT NULL AND F43121.PRRCDJ > 0
    GROUP BY F4311.PDAN8
  `;

  const qualityQuery = `
    SELECT 
      F4311.PDAN8 AS supplierId,
      SUM(COALESCE(TRY_CAST(F4311.PDUORG AS FLOAT), 0)) AS totalOrdered,
      SUM(COALESCE(TRY_CAST(F4311.PDUORG AS FLOAT), 0) - COALESCE(TRY_CAST(F4311.PDUOPN AS FLOAT), 0)) AS totalReceived
    FROM dbo.F4311 F4311
    WHERE F4311.PDUORG IS NOT NULL AND F4311.PDUORG > 0
    GROUP BY F4311.PDAN8
  `;

  try {
    const [supplierRows, reliabilityRows, qualityRows] = await Promise.all([
      executeQuery<any>(suppliersQuery),
      executeQuery<any>(reliabilityQuery),
      executeQuery<any>(qualityQuery),
    ]);

    const reliabilityMap = new Map<string, { total: number; reliable: number }>();
    for (const row of reliabilityRows) {
      reliabilityMap.set(String(row.supplierId), {
        total: Number(row.totalReceipts) || 0,
        reliable: Number(row.reliableReceipts) || 0,
      });
    }

    const qualityMap = new Map<string, { ordered: number; received: number }>();
    for (const row of qualityRows) {
      qualityMap.set(String(row.supplierId), {
        ordered: Number(row.totalOrdered) || 0,
        received: Number(row.totalReceived) || 0,
      });
    }

    const supplierMap = new Map<string, JDESupplier>();
    
    for (const row of supplierRows) {
      const supplierId = row.id;
      if (!supplierMap.has(supplierId)) {
        const relData = reliabilityMap.get(supplierId);
        let reliabilityScore: number | undefined;
        
        if (relData && relData.total > 0) {
          reliabilityScore = Math.round((relData.reliable / relData.total) * 1000) / 10;
        }

        const qualData = qualityMap.get(supplierId);
        let qualityScore: number | undefined;
        
        if (qualData && qualData.ordered > 0) {
          qualityScore = Math.round((qualData.received / qualData.ordered) * 1000) / 10;
        }
        
        supplierMap.set(supplierId, {
          id: supplierId,
          name: row.name || "",
          type: row.type || "",
          country: row.country || "",
          leadDays: Number(row.leadDays) || 0,
          reliabilityScore,
          qualityScore,
        });
      }
    }
    
    return Array.from(supplierMap.values());
  } catch (error) {
    console.error("[JDE Database] Error fetching suppliers:", error);
    return [];
  }
}

export async function getJDEDelayedPurchaseOrders(): Promise<JDEPurchaseOrder[]> {
  const allOrders = await getJDEPurchaseOrders();
  return allOrders.filter(po => po.riskLevel === "red");
}

export async function getJDEAtRiskShipments(): Promise<JDEShipment[]> {
  const allShipments = await getJDEShipments();
  return allShipments.filter(shipment => shipment.riskLevel === "red" || shipment.riskLevel === "yellow");
}

export async function createAlertResolutionsTable(): Promise<void> {
  const query = `
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='alert_resolutions' AND xtype='U')
    CREATE TABLE [dbo].[alert_resolutions] (
        [id] INT IDENTITY(1,1) PRIMARY KEY,
        [alert_id] INT NOT NULL,
        [user_id] INT NOT NULL,
        [action_taken] NVARCHAR(MAX),
        [resolved_at] DATETIME2 DEFAULT GETDATE(),
        [created_at] DATETIME2 DEFAULT GETDATE(),
        [updated_at] DATETIME2 DEFAULT GETDATE()
    );

    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_alert_resolutions_alert_id')
    CREATE INDEX IX_alert_resolutions_alert_id ON [dbo].[alert_resolutions] ([alert_id]);

    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_alert_resolutions_user_id')
    CREATE INDEX IX_alert_resolutions_user_id ON [dbo].[alert_resolutions] ([user_id]);
  `;

  try {
    await executeQuery(query);
    console.log("[JDE Database] Alert resolutions table created/verified");
  } catch (error) {
    console.error("[JDE Database] Error creating alert resolutions table:", error);
    throw error;
  }
}

export async function resolveAlert(alertId: number, userId: number, actionTaken: string): Promise<void> {
  const query = `
    MERGE [dbo].[alert_resolutions] AS target
    USING (SELECT @alertId as alert_id, @userId as user_id, @actionTaken as action_taken) AS source
    ON target.alert_id = source.alert_id AND target.user_id = source.user_id
    WHEN MATCHED THEN
        UPDATE SET 
            action_taken = source.action_taken,
            resolved_at = GETDATE(),
            updated_at = GETDATE()
    WHEN NOT MATCHED THEN
        INSERT (alert_id, user_id, action_taken, resolved_at, created_at, updated_at)
        VALUES (source.alert_id, source.user_id, source.action_taken, GETDATE(), GETDATE(), GETDATE());
  `;

  try {
    const pool = await getPool();
    if (!pool) {
      throw new Error("Database not available");
    }

    const request = pool.request();
    request.input('alertId', sql.Int, alertId);
    request.input('userId', sql.Int, userId);
    request.input('actionTaken', sql.NVarChar, actionTaken);

    await request.query(query);
    console.log(`[JDE Database] Alert ${alertId} resolved by user ${userId}`);
  } catch (error) {
    console.error("[JDE Database] Error resolving alert:", error);
    throw error;
  }
}

export async function getResolvedAlerts(userId: number): Promise<number[]> {
  const query = `
    SELECT alert_id
    FROM [dbo].[alert_resolutions]
    WHERE user_id = @userId
  `;

  try {
    const pool = await getPool();
    if (!pool) {
      return [];
    }

    const request = pool.request();
    request.input('userId', sql.Int, userId);

    const result = await request.query(query);
    return result.recordset.map((row: any) => row.alert_id);
  } catch (error) {
    console.error("[JDE Database] Error getting resolved alerts:", error);
    return [];
  }
}

export { sql };

