"use client";

import { useEffect, useState } from "react";

interface CostStats {
  currentMonth: number;
  last12Months: number;
}

export function CostDisplay() {
  const [stats, setStats] = useState<CostStats | null>(null);
  const [error, setError] = useState<boolean>(false);

  const fetchCosts = async () => {
    try {
      const res = await fetch("/api/costs");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
        setError(false);
      } else {
          setError(true);
      }
    } catch (e) {
      console.error("Failed to fetch costs", e);
      setError(true);
    }
  };

  useEffect(() => {
    fetchCosts();
    const interval = setInterval(fetchCosts, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  if (error && !stats) return null; // Hide silently on error if no data
  if (!stats) return null;

  return (
    <div className="flex flex-col text-[10px] leading-tight font-mono opacity-80 mr-4">
      <div className="font-bold">
        ${stats.currentMonth.toFixed(2)} <span className="font-normal opacity-60">THIS MONTH</span>
      </div>
      <div className="opacity-60">
        ${stats.last12Months.toFixed(2)} <span className="opacity-60">LAST 12M</span>
      </div>
    </div>
  );
}
