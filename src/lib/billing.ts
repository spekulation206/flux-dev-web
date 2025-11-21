import { db } from "./firestore";
import { FieldValue } from "firebase-admin/firestore";

const AGGREGATE_DOC_REF = db.collection("costs_aggregates").doc("global");

export async function recordCost(service: "replicate" | "gemini", cost: number, metadata: any = {}, deduplicationId?: string) {
  if (cost <= 0) return;

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  try {
    await db.runTransaction(async (t) => {
      // Deduplication check
      if (deduplicationId) {
        const logRef = db.collection("cost_logs").doc(deduplicationId);
        const existing = await t.get(logRef);
        if (existing.exists) {
          return; // Already recorded
        }
      }

      const doc = await t.get(AGGREGATE_DOC_REF);
      let data = doc.data() || {
        currentMonth: { value: 0, month: currentMonthKey },
        monthlyHistory: {},
      };

      // Check for month rollover
      if (data.currentMonth.month !== currentMonthKey) {
        // Save previous month to history
        if (data.currentMonth.month) {
            data.monthlyHistory[data.currentMonth.month] = data.currentMonth.value;
        }
        // Reset current
        data.currentMonth = { value: 0, month: currentMonthKey };
      }

      // Add cost
      data.currentMonth.value = (data.currentMonth.value || 0) + cost;
      
      // Update history for current month as well for safety
      data.monthlyHistory[currentMonthKey] = data.currentMonth.value;

      // Calculate last 12 months
      const historyKeys = Object.keys(data.monthlyHistory).filter(k => k !== currentMonthKey).sort().reverse().slice(0, 12);
      const last12MonthsTotal = historyKeys.reduce((sum, key) => sum + (data.monthlyHistory[key] || 0), 0);

      t.set(AGGREGATE_DOC_REF, {
        ...data,
        last12MonthsTotal,
        lastUpdated: FieldValue.serverTimestamp()
      });

      // Also log the individual transaction for audit
      const logRef = deduplicationId ? db.collection("cost_logs").doc(deduplicationId) : db.collection("cost_logs").doc();
      t.set(logRef, {
        service,
        cost,
        timestamp: FieldValue.serverTimestamp(),
        month: currentMonthKey,
        metadata
      });
    });
  } catch (error) {
    console.error("Failed to record cost:", error);
  }
}

export async function getCostStats() {
  const doc = await AGGREGATE_DOC_REF.get();
  const data = doc.data();
  
  if (!data) {
    return { currentMonth: 0, last12Months: 0 };
  }
  
  // Ensure we return 0 if month rolled over but no transaction happened yet (should be handled by recordCost but good to be safe)
  // Actually, recordCost handles rollover. If no cost recorded this month, data.currentMonth.month might be old.
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  
  let currentMonthCost = data.currentMonth.value;
  if (data.currentMonth.month !== currentMonthKey) {
      currentMonthCost = 0;
  }

  return {
    currentMonth: currentMonthCost,
    last12Months: data.last12MonthsTotal || 0
  };
}

