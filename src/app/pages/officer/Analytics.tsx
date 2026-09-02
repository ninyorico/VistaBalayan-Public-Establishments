import { useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Users, MapPin } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { calculateAccommodationOccupancy } from "../../../lib/reportMetrics";

interface AnalyticsData {
  seasonalData: { month: string; visitors: number; guestNights: number }[];
  performanceData: { name: string; visitors: number; occupancyRate: number; score: number }[];
  visitorOrigins: { location: string; visitors: number; growth: number }[];
  lowPerformers: {
    establishment: string;
    occupancyRate: number;
    visitorTrend: number;
    issue: string;
  }[];
  peakSeason: { month: string; visitors: number; growth: number };
  topOrigin: { location: string; percentage: number };
  growthRate: number;
}

type VisitorReport = {
  report_date: string;
  total_guests: number | null;
  residence_type: string | null;
  place_of_residence: string | null;
  establishments?: { name: string } | null;
};

type AccommodationReport = {
  report_date: string;
  total_rooms: number | null;
  total_occupied_rooms: number | null;
  establishments?: { name: string } | null;
};

const monthLabel = (date: string) =>
  new Date(date).toLocaleString("default", { month: "short", year: "numeric" });

const monthKey = (date: string) => date.slice(0, 7);

const percentChange = (current: number, previous: number) =>
  previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? 100 : 0;

const getCurrentYearRange = () => {
  const year = new Date().getFullYear();
  return {
    year,
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
};

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData>({
    seasonalData: [],
    performanceData: [],
    visitorOrigins: [],
    lowPerformers: [],
    peakSeason: { month: "", visitors: 0, growth: 0 },
    topOrigin: { location: "", percentage: 0 },
    growthRate: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setLoading(true);
    const currentYear = getCurrentYearRange();

    const { data: visitorData, error: visitorError } = await supabase
      .from("visitor_reports")
      .select(`
        report_date,
        total_guests,
        residence_type,
        place_of_residence,
        establishments (name)
      `)
      .eq("status", "approved")
      .gte("report_date", currentYear.start)
      .lte("report_date", currentYear.end)
      .order("report_date", { ascending: true });

    if (visitorError) console.error("Error fetching visitor data:", visitorError);

    const { data: accommodationData, error: accError } = await supabase
      .from("accommodation_reports")
      .select(`
        report_date,
        total_rooms,
        total_occupied_rooms,
        establishments (name)
      `)
      .eq("status", "approved")
      .gte("report_date", currentYear.start)
      .lte("report_date", currentYear.end)
      .order("report_date", { ascending: true });

    if (accError) console.error("Error fetching accommodation data:", accError);

    const visitors = (visitorData || []) as unknown as VisitorReport[];
    const accommodations = (accommodationData || []) as unknown as AccommodationReport[];

    const monthlyData: Record<string, { label: string; visitors: number; guestNights: number }> = {};
    visitors.forEach((item) => {
      const key = monthKey(item.report_date);
      if (!monthlyData[key]) {
        monthlyData[key] = { label: monthLabel(item.report_date), visitors: 0, guestNights: 0 };
      }
      monthlyData[key].visitors += item.total_guests || 0;
    });

    accommodations.forEach((item) => {
      const key = monthKey(item.report_date);
      if (!monthlyData[key]) {
        monthlyData[key] = { label: monthLabel(item.report_date), visitors: 0, guestNights: 0 };
      }
      monthlyData[key].guestNights += item.total_occupied_rooms || 0;
    });

    const sortedMonthKeys = Object.keys(monthlyData).sort();
    const seasonalData = sortedMonthKeys.map((key) => ({
      month: monthlyData[key].label,
      visitors: monthlyData[key].visitors,
      guestNights: monthlyData[key].guestNights,
    }));

    const visitorsByEstablishment: Record<string, { name: string; visitors: number; monthly: Record<string, number> }> = {};
    visitors.forEach((item) => {
      const name = item.establishments?.name || "Unknown";
      const key = monthKey(item.report_date);
      if (!visitorsByEstablishment[name]) {
        visitorsByEstablishment[name] = { name, visitors: 0, monthly: {} };
      }
      visitorsByEstablishment[name].visitors += item.total_guests || 0;
      visitorsByEstablishment[name].monthly[key] =
        (visitorsByEstablishment[name].monthly[key] || 0) + (item.total_guests || 0);
    });

    const occupancyByEstablishment: Record<string, { rates: number[] }> = {};
    accommodations.forEach((item) => {
      const name = item.establishments?.name || "Unknown";
      if (!occupancyByEstablishment[name]) {
        occupancyByEstablishment[name] = { rates: [] };
      }
      occupancyByEstablishment[name].rates.push(
        calculateAccommodationOccupancy(
          item.total_occupied_rooms,
          item.total_rooms,
          item.report_date
        )
      );
    });

    const maxVisitors = Math.max(1, ...Object.values(visitorsByEstablishment).map((est) => est.visitors));
    const performanceData = Object.values(visitorsByEstablishment)
      .map((est) => {
        const occ = occupancyByEstablishment[est.name];
        const occupancyRate = occ?.rates.length
          ? occ.rates.reduce((sum, rate) => sum + rate, 0) / occ.rates.length
          : 0;
        const visitorScore = (est.visitors / maxVisitors) * 70;
        const occupancyScore = Math.min(occupancyRate, 100) * 0.3;
        return {
          name: est.name.length > 18 ? est.name.slice(0, 18) + "..." : est.name,
          visitors: est.visitors,
          occupancyRate,
          score: Math.round(visitorScore + occupancyScore),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 7);

    const residenceByMonth: Record<string, Record<string, number>> = {};
    const residenceCounts: Record<string, number> = {};
    visitors.forEach((item) => {
      const residence = item.residence_type || item.place_of_residence || "Unknown";
      const key = monthKey(item.report_date);
      residenceCounts[residence] = (residenceCounts[residence] || 0) + (item.total_guests || 0);
      if (!residenceByMonth[residence]) residenceByMonth[residence] = {};
      residenceByMonth[residence][key] = (residenceByMonth[residence][key] || 0) + (item.total_guests || 0);
    });

    const latestMonth = sortedMonthKeys[sortedMonthKeys.length - 1];
    const previousMonth = sortedMonthKeys[sortedMonthKeys.length - 2];
    const visitorOrigins = Object.entries(residenceCounts)
      .map(([location, total]) => ({
        location,
        visitors: total,
        growth: percentChange(
          residenceByMonth[location]?.[latestMonth] || 0,
          residenceByMonth[location]?.[previousMonth] || 0
        ),
      }))
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, 8);

    const lowPerformers = Object.values(visitorsByEstablishment)
      .map((est) => {
        const occ = occupancyByEstablishment[est.name];
        const occupancyRate = occ?.rates.length
          ? occ.rates.reduce((sum, rate) => sum + rate, 0) / occ.rates.length
          : 0;
        const current = est.monthly[latestMonth] || 0;
        const previous = est.monthly[previousMonth] || 0;
        const visitorTrend = percentChange(current, previous);
        const issue =
          visitorTrend < -20
            ? "Visitor count decreased by more than 20% from the previous month"
            : occupancyRate > 0 && occupancyRate < 35
            ? "Low accommodation occupancy rate"
            : "Lower total visitor volume compared with other establishments";
        return { establishment: est.name, occupancyRate, visitorTrend, issue, visitors: est.visitors };
      })
      .filter((est) => est.visitorTrend < -20 || (est.occupancyRate > 0 && est.occupancyRate < 35) || est.visitors < maxVisitors * 0.08)
      .sort((a, b) => a.visitors - b.visitors)
      .slice(0, 5);

    const peakKey = sortedMonthKeys.reduce(
      (best, key) => (monthlyData[key].visitors > (monthlyData[best]?.visitors || 0) ? key : best),
      sortedMonthKeys[0] || ""
    );
    const peakIndex = sortedMonthKeys.indexOf(peakKey);
    const beforePeakKey = peakIndex > 0 ? sortedMonthKeys[peakIndex - 1] : "";

    const totalVisitors = Object.values(residenceCounts).reduce((sum, count) => sum + count, 0);
    const [topLocation, topVisitors] = Object.entries(residenceCounts).sort((a, b) => b[1] - a[1])[0] || ["", 0];

    setData({
      seasonalData,
      performanceData,
      visitorOrigins,
      lowPerformers,
      peakSeason: {
        month: monthlyData[peakKey]?.label || "N/A",
        visitors: monthlyData[peakKey]?.visitors || 0,
        growth: percentChange(monthlyData[peakKey]?.visitors || 0, monthlyData[beforePeakKey]?.visitors || 0),
      },
      topOrigin: {
        location: topLocation,
        percentage: totalVisitors > 0 ? Math.round((topVisitors / totalVisitors) * 100) : 0,
      },
      growthRate: percentChange(
        monthlyData[latestMonth]?.visitors || 0,
        monthlyData[previousMonth]?.visitors || 0
      ),
    });

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1CA7C9] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading analytics data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
        <p className="text-gray-600 mt-1">Data-driven tourism analytics and decision support for {getCurrentYearRange().year}</p>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4" data-analytics-kpi-row="mobile-one-row">
        <div className="bg-white rounded-lg border border-gray-200 p-2.5 shadow-sm sm:p-5">
          <div className="mb-1.5 flex items-center justify-between gap-1">
            <p className="text-[10px] font-medium leading-tight text-gray-600 sm:text-sm">Peak Season</p>
            <TrendingUp className="h-3.5 w-3.5 shrink-0 text-green-600 sm:h-5 sm:w-5" />
          </div>
          <p className="truncate text-base font-bold leading-tight text-gray-900 sm:text-2xl">{data.peakSeason.month || "N/A"}</p>
          <p className="mt-1 truncate text-[10px] leading-tight text-green-600 sm:text-sm">
            {data.peakSeason.visitors.toLocaleString()} visitors
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-2.5 shadow-sm sm:p-5">
          <div className="mb-1.5 flex items-center justify-between gap-1">
            <p className="text-[10px] font-medium leading-tight text-gray-600 sm:text-sm">Top Origin</p>
            <MapPin className="h-3.5 w-3.5 shrink-0 text-purple-600 sm:h-5 sm:w-5" />
          </div>
          <p className="truncate text-base font-bold leading-tight text-gray-900 sm:text-2xl">{data.topOrigin.location || "N/A"}</p>
          <p className="mt-1 truncate text-[10px] leading-tight text-purple-600 sm:text-sm">{data.topOrigin.percentage}% visitors</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-2.5 shadow-sm sm:p-5">
          <div className="mb-1.5 flex items-center justify-between gap-1">
            <p className="text-[10px] font-medium leading-tight text-gray-600 sm:text-sm">Latest Growth</p>
            {data.growthRate >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5 shrink-0 text-green-600 sm:h-5 sm:w-5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 shrink-0 text-red-600 sm:h-5 sm:w-5" />
            )}
          </div>
          <p className="truncate text-base font-bold leading-tight text-gray-900 sm:text-2xl">{data.growthRate.toFixed(1)}%</p>
          <p className="mt-1 truncate text-[10px] leading-tight text-orange-600 sm:text-sm">Month over month</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Tourism Trends and Seasonal Patterns ({getCurrentYearRange().year})</h3>
        {data.seasonalData.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={data.seasonalData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="visitors" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.45} name="Visitors" />
              <Area type="monotone" dataKey="guestNights" stroke="#10b981" fill="#10b981" fillOpacity={0.25} name="Occupied room nights" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-12 text-gray-500">No seasonal data available</div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">High-Performing Establishments</h3>
        {data.performanceData.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={data.performanceData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} />
              <YAxis dataKey="name" type="category" width={170} />
              <Tooltip formatter={(value, name) => [name === "score" ? `${value}/100` : value, name === "score" ? "Performance Score" : name]} />
              <Bar dataKey="score" fill="#10b981" name="Performance Score" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-12 text-gray-500">No establishment data available</div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Visitor Origins & Actual Growth</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Location</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Visitors</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Growth Rate</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.visitorOrigins.length > 0 ? (
                data.visitorOrigins.map((origin, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{origin.location}</td>
                    <td className="px-6 py-4 text-gray-900">{origin.visitors.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className={`font-medium ${origin.growth >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {origin.growth >= 0 ? "+" : ""}{origin.growth.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`flex items-center gap-1 ${origin.growth >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {origin.growth >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        <span className="text-sm font-medium">{origin.growth >= 0 ? "Growing" : "Declining"}</span>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">No visitor origin data available</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Underperforming Establishments</h3>
          <p className="text-sm text-gray-600 mt-1">
            Establishments requiring attention based on actual visitor trends, total visitor volume, and occupancy rates
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Establishment</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Occupancy Rate</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Visitor Trend</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Decision Support Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.lowPerformers.length > 0 ? (
                data.lowPerformers.map((establishment, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{establishment.establishment}</td>
                    <td className="px-6 py-4">
                      {establishment.occupancyRate > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2 w-24">
                            <div className="h-2 rounded-full bg-red-500" style={{ width: `${Math.min(establishment.occupancyRate, 100)}%` }}></div>
                          </div>
                          <span className="text-sm font-medium text-red-600">{establishment.occupancyRate.toFixed(1)}%</span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500">No accommodation data</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className={`flex items-center gap-1 ${establishment.visitorTrend >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {establishment.visitorTrend >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        <span className="font-medium text-sm">{establishment.visitorTrend.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{establishment.issue}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">No underperforming establishments detected</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
