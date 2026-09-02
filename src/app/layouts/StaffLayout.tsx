import { supabase } from "../../lib/supabase";

import { Outlet, NavLink, useNavigate } from "react-router";
import {
  LayoutDashboard,
  FileUp,
  Bed,
  History,
  BarChart3,
  Brain,
  User,
  LogOut,
  Menu,
  Settings,
  Building2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { canSubmitAccommodationReport, canSubmitVisitorReport } from "../../lib/establishmentReportForms";
import NotificationCenter from "../components/NotificationCenter";

const menuItems = [
  { path: "/staff", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/staff/submit-visitor-report", icon: FileUp, label: "Resort", form: "visitor" },
  { path: "/staff/submit-accommodation-report", icon: Bed, label: "Hotels", form: "accommodation" },
  { path: "/staff/submission-history", icon: History, label: "Submission History" },
  { path: "/staff/analytics", icon: BarChart3, label: "Analytics" },
  { path: "/staff/ai-insights", icon: Brain, label: "AI Insights" },
  { path: "/staff/manage-listing", icon: Building2, label: "Manage Public Listing" },
];

export default function StaffLayout() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [establishment, setEstablishment] = useState<any>(null);

  useEffect(() => {
    const loadEstablishment = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("establishment_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile?.establishment_id) return;

      const { data: establishmentData } = await supabase
        .from("establishments")
        .select("type,total_rooms")
        .eq("id", profile.establishment_id)
        .maybeSingle();

      setEstablishment(establishmentData);
    };

    loadEstablishment();
  }, []);

  const visibleMenuItems = menuItems.filter((item) => {
    if (item.form === "visitor") return canSubmitVisitorReport(establishment);
    if (item.form === "accommodation") return canSubmitAccommodationReport(establishment);
    return true;
  });

  const handleLogout = async () => {
  await supabase.auth.signOut();
  window.location.href = "/admin/login";
  };

  const closeSidebarOnMobile = () => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  return (
    <div className="min-h-[100dvh] tourism-shell text-slate-950">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-[85] bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 lg:top-0 h-full lg:h-full border-r border-[#d7e5e2] bg-white shadow-[0_24px_80px_rgba(7,59,76,0.18)] transition-all duration-300 lg:bg-white/92 lg:backdrop-blur-xl ${
          sidebarOpen ? "w-[82vw] max-w-80 z-[90]" : "w-0 lg:w-64 z-40"
        } overflow-hidden`}
      >
        <div className="border-b border-[#d7e5e2] bg-[linear-gradient(135deg,#ffffff,#f6f8f7_55%,#eef4f2)] p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0E5A72] text-sm font-black text-white shadow-lg shadow-teal-950/15">VB</div>
            <div>
              <h1 className="text-xl font-semibold tracking-[-0.035em] text-[#0B2530]">VistaBalayan</h1>
              <p className="mt-0.5 text-sm font-medium text-[#0E5A72]">Establishment Portal</p>
            </div>
          </div>
        </div>

        <nav className="h-[calc(100vh-130px)] space-y-1.5 overflow-y-auto bg-white p-4 lg:h-auto lg:bg-transparent">
          {visibleMenuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/staff"}
              onClick={closeSidebarOnMobile}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  isActive
                    ? "bg-[#0E5A72] text-white shadow-lg shadow-teal-950/15"
                    : "text-[#334155] hover:bg-[#e5f1f2] hover:text-[#0B2530]"
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              <span className="font-semibold text-sm">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="lg:ml-64">
        {/* Top Navbar */}
        <header className="sticky top-0 z-[80] border-b border-[#d7e5e2] bg-white/90 shadow-[0_10px_40px_rgba(7,59,76,0.06)] backdrop-blur-xl">
          <div className="px-4 sm:px-6 py-4 flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="rounded-2xl bg-[#0E5A72] p-2.5 shadow-lg shadow-teal-950/15 transition-all duration-200 hover:bg-[#073B4C] lg:hidden"
            >
              <Menu className="w-5 h-5 text-white" />
            </button>

            <div className="flex items-center gap-3">
              <NotificationCenter role="establishment_staff" />

              <div className="h-8 w-px bg-slate-200"></div>

              <div className="relative">
                <button
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="flex items-center gap-2 rounded-2xl px-2 py-1.5 transition-colors hover:bg-slate-100 sm:gap-3"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#0E5A72] text-xs font-bold text-white shadow-md sm:h-10 sm:w-10 sm:text-sm">
                    ES
                  </div>
                  <div className="hidden sm:block text-left">
                    <div className="text-sm font-semibold text-[#0F172A]">
                      Establishment Staff
                    </div>
                    <div className="text-xs text-[#6B7280]">
                      staff@establishment.com
                    </div>
                  </div>
                </button>

                {/* Profile Dropdown */}
                {profileDropdownOpen && (
                  <div className="absolute right-0 z-50 mt-2 w-56 rounded-2xl border border-slate-200 bg-white py-2 shadow-xl">
                    <button
                      onClick={() => {
                        navigate("/staff/profile");
                        setProfileDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F2F5F7] transition-colors text-left"
                    >
                      <User className="w-5 h-5 text-[#6B7280]" />
                      <span className="text-sm font-medium text-[#0F172A]">Profile</span>
                    </button>
                    <div className="border-t border-[#D9E2EC] my-2"></div>
                    <button
                      onClick={() => {
                        handleLogout();
                        setProfileDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 transition-colors text-left"
                    >
                      <LogOut className="w-5 h-5 text-red-600" />
                      <span className="text-sm font-medium text-red-600">Logout</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="w-full p-3 sm:p-4 lg:p-4 xl:p-5 2xl:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
