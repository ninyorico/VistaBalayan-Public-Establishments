import { useState, useEffect, useMemo, useRef, type TouchEvent } from "react";
import { ChevronRight, Download, Search, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../../lib/supabase";
import { datestampedFilename, downloadCsv } from "../../../lib/exportCsv";

interface VisitorRecord {
  id: string;
  establishment: string;
  date: string;
  guestName: string;
  male: number;
  female: number;
  total: number;
  residenceType: string;
  location: string;
}

export default function VisitorMonitoring({ embedded = false }: { embedded?: boolean }) {
  const [visitorRecords, setVisitorRecords] = useState<VisitorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterResidence, setFilterResidence] = useState("all");
  const [specificMonth, setSpecificMonth] = useState("");
  const [selectedEstablishment, setSelectedEstablishment] = useState<string | null>(null);
  const tableTouchRef = useRef<{ x: number; y: number; lastX: number; axis: "x" | "y" | null }>({
    x: 0,
    y: 0,
    lastX: 0,
    axis: null,
  });

  const handleTableTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    tableTouchRef.current = { x: touch.clientX, y: touch.clientY, lastX: touch.clientX, axis: null };
  };

  const handleTableTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    const state = tableTouchRef.current;
    const deltaX = touch.clientX - state.x;
    const deltaY = touch.clientY - state.y;

    if (!state.axis && Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 8) {
      state.axis = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
    }

    if (state.axis === "x") {
      event.preventDefault();
      event.currentTarget.scrollLeft += state.lastX - touch.clientX;
      state.lastX = touch.clientX;
    }
  };

  useEffect(() => {
    fetchVisitorRecords();
  }, []);

  const fetchVisitorRecords = async () => {
    setLoading(true);
    
    // Fetch visitor reports with establishment names
    const { data, error } = await supabase
      .from("visitor_reports")
      .select(`
        id,
        report_date,
        total_male,
        total_female,
        total_guests,
        residence_type,
        place_of_residence,
        establishments (name)
      `)
      .in("status", ["pending", "approved"])
      .order("report_date", { ascending: false });

    if (error) {
      console.error("Error fetching visitor records:", error);
      setLoading(false);
      return;
    }

    // Transform data for display
    const formattedRecords: VisitorRecord[] = (data || []).map((item: any) => ({
      id: item.id,
      establishment: item.establishments?.name || "Unknown",
      date: item.report_date,
      guestName: "N/A", // Note: guest_name field doesn't exist in your schema
      male: item.total_male || 0,
      female: item.total_female || 0,
      total: item.total_guests || 0,
      residenceType: item.residence_type || "Unknown",
      location: item.place_of_residence || "Unknown",
    }));

    setVisitorRecords(formattedRecords);
    setLoading(false);
  };

  // Filter records based on search, residence, date/month
  const filteredRecords = visitorRecords.filter((record) => {
    const matchesSearch = 
      record.establishment.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.location.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesResidence = filterResidence === "all" || record.residenceType === filterResidence;
      
    let matchesDate = true;
    if (specificMonth) {
      matchesDate = record.date.startsWith(specificMonth);
    }
    
    return matchesSearch && matchesResidence && matchesDate;
  });

  const groupedRecords = useMemo(() => {
    const groups = new Map<string, {
      establishment: string;
      records: VisitorRecord[];
      male: number;
      female: number;
      total: number;
      locations: Set<string>;
      residenceTypes: Set<string>;
    }>();

    filteredRecords.forEach((record) => {
      const current = groups.get(record.establishment) || {
        establishment: record.establishment,
        records: [],
        male: 0,
        female: 0,
        total: 0,
        locations: new Set<string>(),
        residenceTypes: new Set<string>(),
      };

      current.records.push(record);
      current.male += record.male;
      current.female += record.female;
      current.total += record.total;
      current.locations.add(record.location);
      current.residenceTypes.add(record.residenceType);
      groups.set(record.establishment, current);
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        records: [...group.records].sort((a, b) => b.date.localeCompare(a.date)),
      }))
      .sort((a, b) => a.establishment.localeCompare(b.establishment));
  }, [filteredRecords]);

  const selectedGroup = useMemo(
    () => groupedRecords.find((group) => group.establishment === selectedEstablishment) || null,
    [groupedRecords, selectedEstablishment]
  );

  const monthLabel = specificMonth
    ? new Date(`${specificMonth}-01T00:00:00`).toLocaleString("default", { month: "long", year: "numeric" })
    : "all available months";

  const totalVisitors = filteredRecords.reduce((sum, r) => sum + r.total, 0);
  const totalMale = filteredRecords.reduce((sum, r) => sum + r.male, 0);
  const totalFemale = filteredRecords.reduce((sum, r) => sum + r.female, 0);

  const handleExport = () => {
    downloadCsv(
      datestampedFilename("visitor-records"),
      ["Date", "Establishment", "Guest/Group", "Male", "Female", "Total", "Place of Residence", "Location"],
      filteredRecords.map((record) => [
        record.date,
        record.establishment,
        record.guestName,
        record.male,
        record.female,
        record.total,
        record.residenceType,
        record.location,
      ])
    );
    toast.success(`Exported ${filteredRecords.length} visitor record(s)`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1CA7C9] mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading visitor records...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-[13px] sm:space-y-6 sm:text-sm lg:text-base">
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Visitor Monitoring</h1>
          <p className="mt-1 text-sm text-gray-600 sm:text-base">
            Monitor and review visitor data from all establishments
          </p>
        </div>
      )}

      {/* Statistics */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <p className="mb-1 text-xs text-gray-600 sm:text-sm">Total Visitors</p>
          <p className="text-2xl font-bold text-gray-900 sm:text-3xl">{totalVisitors}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <p className="mb-1 text-xs text-gray-600 sm:text-sm">Male</p>
          <p className="text-2xl font-bold text-blue-600 sm:text-3xl">{totalMale}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <p className="mb-1 text-xs text-gray-600 sm:text-sm">Female</p>
          <p className="text-2xl font-bold text-purple-600 sm:text-3xl">{totalFemale}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <p className="mb-1 text-xs text-gray-600 sm:text-sm">Total Records</p>
          <p className="text-2xl font-bold text-gray-900 sm:text-3xl">{filteredRecords.length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="min-w-0 flex-1 basis-full sm:basis-64">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 sm:h-5 sm:w-5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by establishment or location..."
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500 sm:pl-10 sm:pr-4 sm:text-base"
              />
            </div>
          </div>
          <div className="min-w-0 flex-1 sm:flex-none">
            <select
              value={filterResidence}
              onChange={(e) => setFilterResidence(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500 sm:px-4 sm:text-base"
            >
              <option value="all">All Places of Residence</option>
              <option value="Batangas Resident">Batangas Resident</option>
              <option value="Outside Batangas">Outside Batangas</option>
              <option value="Foreign">Foreign</option>
            </select>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
            <button
              type="button"
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white transition sm:text-sm"
              aria-pressed="true"
            >
              Month
            </button>
          </div>
          <input
            type="month"
            value={specificMonth}
            onChange={(e) => setSpecificMonth(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500 sm:flex-none sm:px-4 sm:text-base"
            title="Select report month"
          />
          <button 
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white transition hover:bg-blue-700 sm:px-4 sm:text-base"
            onClick={handleExport}
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Visitor Records by Establishment */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 sm:px-6 sm:py-4">
          <h2 className="text-base font-semibold text-gray-900 sm:text-lg">Visitor records by establishment</h2>
          <p className="mt-1 text-xs leading-5 text-gray-600 sm:text-sm">Click an establishment to open the full {monthLabel} record in a modal.</p>
        </div>
        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[700px] sm:min-w-[860px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-700 sm:px-6 sm:py-3 sm:text-xs">Establishment</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-700 sm:px-6 sm:py-3 sm:text-xs">Records</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-700 sm:px-6 sm:py-3 sm:text-xs">Male</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-700 sm:px-6 sm:py-3 sm:text-xs">Female</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-700 sm:px-6 sm:py-3 sm:text-xs">Total Visitors</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-700 sm:px-6 sm:py-3 sm:text-xs">Places of Residence</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-700 sm:px-6 sm:py-3 sm:text-xs">Locations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {groupedRecords.length > 0 ? (
                groupedRecords.map((group) => (
                      <tr key={group.establishment} className="cursor-pointer hover:bg-gray-50" onClick={() => setSelectedEstablishment(group.establishment)}>
                        <td className="px-3 py-3 text-xs font-medium text-gray-900 sm:px-6 sm:py-4 sm:text-sm">
                          <div className="flex items-center gap-1.5 sm:gap-2">
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-500 sm:h-4 sm:w-4" />
                            {group.establishment}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-600 sm:px-6 sm:py-4 sm:text-sm">{group.records.length}</td>
                        <td className="px-3 py-3 text-xs font-medium text-blue-600 sm:px-6 sm:py-4 sm:text-sm">{group.male}</td>
                        <td className="px-3 py-3 text-xs font-medium text-purple-600 sm:px-6 sm:py-4 sm:text-sm">{group.female}</td>
                        <td className="px-3 py-3 text-xs font-semibold text-gray-900 sm:px-6 sm:py-4 sm:text-sm">{group.total}</td>
                        <td className="max-w-[9rem] px-3 py-3 text-xs text-gray-600 sm:max-w-none sm:px-6 sm:py-4 sm:text-sm">{Array.from(group.residenceTypes).join(", ")}</td>
                        <td className="max-w-[11rem] px-3 py-3 text-xs text-gray-600 sm:max-w-none sm:px-6 sm:py-4 sm:text-sm">{Array.from(group.locations).join(", ")}</td>
                      </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-xs text-gray-500 sm:px-6 sm:py-8 sm:text-sm">
                    No visitor records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedGroup && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setSelectedEstablishment(null)}>
          <div className="max-h-[90dvh] w-full overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-w-5xl sm:rounded-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 bg-gray-50 px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Visitor records</p>
                <h3 className="mt-1 truncate text-lg font-semibold text-gray-900 sm:text-xl">{selectedGroup.establishment}</h3>
                <p className="mt-1 text-xs text-gray-600 sm:text-sm">{selectedGroup.records.length} record(s) for {monthLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEstablishment(null)}
                className="rounded-full p-2 text-gray-500 transition hover:bg-gray-200 hover:text-gray-900"
                aria-label="Close visitor records modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 border-b border-gray-100 px-4 py-3 text-center sm:px-6">
              <div className="rounded-lg bg-blue-50 px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-blue-700 sm:text-xs">Male</p>
                <p className="text-lg font-bold text-blue-700 sm:text-2xl">{selectedGroup.male}</p>
              </div>
              <div className="rounded-lg bg-purple-50 px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-purple-700 sm:text-xs">Female</p>
                <p className="text-lg font-bold text-purple-700 sm:text-2xl">{selectedGroup.female}</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-700 sm:text-xs">Total</p>
                <p className="text-lg font-bold text-slate-900 sm:text-2xl">{selectedGroup.total}</p>
              </div>
            </div>

            <div className="px-0 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:px-6 sm:py-6">
              <div className="px-4 py-2 text-[11px] font-medium text-gray-500 sm:hidden">
                Swipe sideways to see all table columns.
              </div>
              <div
                className="max-h-[54dvh] overflow-auto overscroll-contain touch-auto [-webkit-overflow-scrolling:touch] sm:max-h-[60vh]"
                onTouchStart={handleTableTouchStart}
                onTouchMove={handleTableTouchMove}
              >
                <table className="w-full min-w-[620px] table-fixed sm:min-w-[760px]">
                  <colgroup>
                    <col className="w-[20%]" />
                    <col className="w-[18%]" />
                    <col className="w-[10%]" />
                    <col className="w-[10%]" />
                    <col className="w-[10%]" />
                    <col className="w-[17%]" />
                    <col className="w-[15%]" />
                  </colgroup>
                  <thead className="bg-white">
                    <tr>
                      <th className="sticky top-0 z-30 border-b border-gray-200 bg-white px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-600 shadow-[0_1px_0_rgba(148,163,184,0.35)] sm:px-4 sm:text-xs">Date</th>
                      <th className="sticky top-0 z-30 border-b border-gray-200 bg-white px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-600 shadow-[0_1px_0_rgba(148,163,184,0.35)] sm:px-4 sm:text-xs">Guest/Group</th>
                      <th className="sticky top-0 z-30 border-b border-gray-200 bg-white px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-600 shadow-[0_1px_0_rgba(148,163,184,0.35)] sm:px-4 sm:text-xs">Male</th>
                      <th className="sticky top-0 z-30 border-b border-gray-200 bg-white px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-600 shadow-[0_1px_0_rgba(148,163,184,0.35)] sm:px-4 sm:text-xs">Female</th>
                      <th className="sticky top-0 z-30 border-b border-gray-200 bg-white px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-600 shadow-[0_1px_0_rgba(148,163,184,0.35)] sm:px-4 sm:text-xs">Total</th>
                      <th className="sticky top-0 z-30 border-b border-gray-200 bg-white px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-600 shadow-[0_1px_0_rgba(148,163,184,0.35)] sm:px-4 sm:text-xs">Residence</th>
                      <th className="sticky top-0 z-30 border-b border-gray-200 bg-white px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-600 shadow-[0_1px_0_rgba(148,163,184,0.35)] sm:px-4 sm:text-xs">Location</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedGroup.records.map((record) => (
                      <tr key={record.id} className="align-top">
                        <td className="break-words px-2 py-2 text-[11px] text-gray-600 sm:px-4 sm:py-3 sm:text-sm">{record.date}</td>
                        <td className="break-words px-2 py-2 text-[11px] text-gray-900 sm:px-4 sm:py-3 sm:text-sm">{record.guestName}</td>
                        <td className="px-2 py-2 text-[11px] font-medium text-blue-600 sm:px-4 sm:py-3 sm:text-sm">{record.male}</td>
                        <td className="px-2 py-2 text-[11px] font-medium text-purple-600 sm:px-4 sm:py-3 sm:text-sm">{record.female}</td>
                        <td className="px-2 py-2 text-[11px] font-semibold text-gray-900 sm:px-4 sm:py-3 sm:text-sm">{record.total}</td>
                        <td className="break-words px-2 py-2 text-[11px] text-gray-600 sm:px-4 sm:py-3 sm:text-sm">{record.residenceType}</td>
                        <td className="break-words px-2 py-2 text-[11px] text-gray-600 sm:px-4 sm:py-3 sm:text-sm">{record.location}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}