import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Bell, CheckCheck, Clock, ExternalLink, FileText, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

type NotificationCenterProps = {
  role: "municipal_officer" | "establishment_staff";
};

type DbNotification = {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string | null;
  is_read: boolean | null;
  read_at?: string | null;
  action_path?: string | null;
  created_at: string | null;
};

type AppNotification = {
  id: string;
  source: "database" | "system";
  title: string;
  message: string;
  type: string;
  actionPath: string;
  createdAt: string;
  isRead: boolean;
};

const typeStyles: Record<string, { border: string; bg: string; icon: string }> = {
  warning: { border: "border-amber-400", bg: "bg-amber-50", icon: "text-amber-600" },
  report: { border: "border-sky-400", bg: "bg-sky-50", icon: "text-sky-600" },
  success: { border: "border-emerald-400", bg: "bg-emerald-50", icon: "text-emerald-600" },
  ai: { border: "border-violet-400", bg: "bg-violet-50", icon: "text-violet-600" },
  info: { border: "border-[#1CA7C9]", bg: "bg-[#e5f1f2]", icon: "text-[#0E5A72]" },
};

function getLocalReadIds(userId?: string): Set<string> {
  if (!userId) return new Set<string>();
  try {
    const parsed = JSON.parse(localStorage.getItem(`vistabalayan-notification-read:${userId}`) || "[]");
    return new Set<string>(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function saveLocalReadIds(userId: string, ids: Set<string>) {
  localStorage.setItem(`vistabalayan-notification-read:${userId}`, JSON.stringify([...ids].slice(-200)));
}

function relativeTime(value: string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  if (!Number.isFinite(diffMs)) return "just now";
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function startOfMonthIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function deadlineNotification(role: NotificationCenterProps["role"], canSubmitAccommodation = true): AppNotification {
  const now = new Date();
  const due = new Date(now.getFullYear(), now.getMonth(), 15);
  const daysUntil = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
  const dueText = due.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  return {
    id: `deadline-${now.getFullYear()}-${now.getMonth() + 1}`,
    source: "system",
    title: daysUntil >= 0 ? "Monthly report deadline" : "Monthly report follow-up",
    message: daysUntil >= 0
      ? `Submit this month's tourism report by ${dueText}. ${daysUntil} day${daysUntil === 1 ? "" : "s"} remaining.`
      : `This month's report deadline has passed. Review or submit any missing reports.`,
    type: daysUntil <= 3 ? "warning" : "report",
    actionPath: role === "municipal_officer" ? "/officer/report-monitoring" : canSubmitAccommodation ? "/staff/submit-accommodation-report" : "/staff/submit-visitor-report",
    createdAt: now.toISOString(),
    isRead: false,
  };
}

export default function NotificationCenter({ role }: NotificationCenterProps) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dbNotifications, setDbNotifications] = useState<AppNotification[]>([]);
  const [systemNotifications, setSystemNotifications] = useState<AppNotification[]>([]);
  const [localReadIds, setLocalReadIds] = useState<Set<string>>(() => getLocalReadIds(user?.id));

  useEffect(() => {
    setLocalReadIds(getLocalReadIds(user?.id));
  }, [user?.id]);

  const markLocalRead = useCallback((ids: string[]) => {
    if (!user?.id) return;
    setLocalReadIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => next.add(id));
      saveLocalReadIds(user.id, next);
      return next;
    });
  }, [user?.id]);

  const loadNotifications = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);

    const nowIso = new Date().toISOString();
    const recentCutoffIso = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const readIds = getLocalReadIds(user.id);
    const countOf = (...responses: Array<{ count: number | null }>) => responses.reduce((total, response) => total + (response.count || 0), 0);
    const newestCreatedAt = (...rows: Array<Array<{ created_at?: string | null }> | null | undefined>) => {
      const values = rows
        .flatMap((items) => items || [])
        .map((item) => item.created_at || "")
        .filter(Boolean)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      return values[0] || nowIso;
    };

    const { data: persisted, error: persistedError } = await supabase
      .from("notifications")
      .select("id,user_id,title,message,type,is_read,read_at,action_path,created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    if (persistedError) {
      console.warn("Could not load persisted notifications:", persistedError.message);
      setError("Saved notifications are unavailable, but live reminders are still shown.");
      setDbNotifications([]);
    } else {
      setDbNotifications(((persisted || []) as DbNotification[]).map((notification) => ({
        id: notification.id,
        source: "database",
        title: notification.title,
        message: notification.message,
        type: notification.type || "info",
        actionPath: notification.action_path || (role === "municipal_officer" ? "/officer/report-monitoring" : "/staff/submission-history"),
        createdAt: notification.created_at || nowIso,
        isRead: Boolean(notification.is_read),
      })));
    }

    const monthStart = startOfMonthIso();
    const dynamic: AppNotification[] = [];

    if (role === "municipal_officer") {
      const [
        pendingVisitor,
        pendingAccommodation,
        holdVisitor,
        holdAccommodation,
        recommendations,
        recentEstablishments,
        pendingEstablishments,
        recentReviews,
      ] = await Promise.all([
        supabase.from("visitor_reports").select("id,created_at", { count: "exact" }).in("status", ["pending", "under_review"]).order("created_at", { ascending: false }).limit(1),
        supabase.from("accommodation_reports").select("id,created_at", { count: "exact" }).in("status", ["pending", "under_review"]).order("created_at", { ascending: false }).limit(1),
        supabase.from("visitor_reports").select("id,created_at", { count: "exact" }).eq("status", "on_hold").order("created_at", { ascending: false }).limit(1),
        supabase.from("accommodation_reports").select("id,created_at", { count: "exact" }).eq("status", "on_hold").order("created_at", { ascending: false }).limit(1),
        supabase.from("ai_recommendations").select("id,created_at", { count: "exact" }).gte("created_at", monthStart).order("created_at", { ascending: false }).limit(1),
        supabase.from("establishments").select("id,name,created_at", { count: "exact" }).gte("created_at", recentCutoffIso).order("created_at", { ascending: false }).limit(3),
        supabase.from("establishments").select("id,name,created_at", { count: "exact" }).eq("status", "pending").order("created_at", { ascending: false }).limit(3),
        supabase.from("establishment_rating_reviews").select("establishment_id,created_at", { count: "exact" }).gte("created_at", recentCutoffIso).order("created_at", { ascending: false }).limit(1),
      ]);

      const pendingTotal = countOf(pendingVisitor, pendingAccommodation);
      const holdTotal = countOf(holdVisitor, holdAccommodation);
      const recentEstablishmentCount = recentEstablishments.count || 0;
      const pendingEstablishmentCount = pendingEstablishments.count || 0;
      const reviewCount = recentReviews.count || 0;

      if (pendingTotal > 0) {
        dynamic.push({
          id: `officer-pending-${pendingTotal}-${newestCreatedAt(pendingVisitor.data, pendingAccommodation.data)}`,
          source: "system",
          title: "Reports awaiting review",
          message: `${pendingTotal} report${pendingTotal === 1 ? "" : "s"} need officer review.`,
          type: "warning",
          actionPath: "/officer/report-monitoring",
          createdAt: newestCreatedAt(pendingVisitor.data, pendingAccommodation.data),
          isRead: false,
        });
      }
      if (holdTotal > 0) {
        dynamic.push({
          id: `officer-hold-${holdTotal}-${newestCreatedAt(holdVisitor.data, holdAccommodation.data)}`,
          source: "system",
          title: "Reports on hold",
          message: `${holdTotal} flagged report${holdTotal === 1 ? "" : "s"} need manual verification.`,
          type: "warning",
          actionPath: "/officer/report-monitoring",
          createdAt: newestCreatedAt(holdVisitor.data, holdAccommodation.data),
          isRead: false,
        });
      }
      if (pendingEstablishmentCount > 0) {
        const names = (pendingEstablishments.data || []).map((item: any) => item.name).filter(Boolean).slice(0, 2).join(", ");
        dynamic.push({
          id: `officer-establishments-pending-${pendingEstablishmentCount}-${newestCreatedAt(pendingEstablishments.data)}`,
          source: "system",
          title: "Establishments need review",
          message: `${pendingEstablishmentCount} establishment${pendingEstablishmentCount === 1 ? "" : "s"} awaiting approval${names ? `: ${names}` : ""}.`,
          type: "warning",
          actionPath: "/officer/establishments",
          createdAt: newestCreatedAt(pendingEstablishments.data),
          isRead: false,
        });
      } else if (recentEstablishmentCount > 0) {
        const names = (recentEstablishments.data || []).map((item: any) => item.name).filter(Boolean).slice(0, 2).join(", ");
        dynamic.push({
          id: `officer-establishments-new-${recentEstablishmentCount}-${newestCreatedAt(recentEstablishments.data)}`,
          source: "system",
          title: "New establishment registered",
          message: `${recentEstablishmentCount} establishment${recentEstablishmentCount === 1 ? "" : "s"} added in the last 7 days${names ? `: ${names}` : ""}.`,
          type: "info",
          actionPath: "/officer/establishments",
          createdAt: newestCreatedAt(recentEstablishments.data),
          isRead: false,
        });
      }
      if (reviewCount > 0) {
        dynamic.push({
          id: `officer-reviews-${reviewCount}-${newestCreatedAt(recentReviews.data)}`,
          source: "system",
          title: "New visitor reviews",
          message: `${reviewCount} review${reviewCount === 1 ? "" : "s"} posted in the last 7 days.`,
          type: "info",
          actionPath: "/officer/establishments",
          createdAt: newestCreatedAt(recentReviews.data),
          isRead: false,
        });
      }
      if ((recommendations.count || 0) > 0) {
        dynamic.push({
          id: `officer-ai-${recommendations.count}-${newestCreatedAt(recommendations.data)}`,
          source: "system",
          title: "AI insights updated",
          message: `${recommendations.count} recommendation${recommendations.count === 1 ? "" : "s"} available for this month.`,
          type: "ai",
          actionPath: "/officer/ai-insights",
          createdAt: newestCreatedAt(recommendations.data),
          isRead: false,
        });
      }
      dynamic.push(deadlineNotification(role));
    } else {
      const canSubmitAccommodation = Boolean(profile?.establishment_id);
      if (profile?.establishment_id) {
        const [pendingVisitor, pendingAccommodation, approvedVisitor, approvedAccommodation, onHoldVisitor, onHoldAccommodation] = await Promise.all([
          supabase.from("visitor_reports").select("id,created_at", { count: "exact" }).eq("establishment_id", profile.establishment_id).eq("status", "pending").order("created_at", { ascending: false }).limit(1),
          supabase.from("accommodation_reports").select("id,created_at", { count: "exact" }).eq("establishment_id", profile.establishment_id).eq("status", "pending").order("created_at", { ascending: false }).limit(1),
          supabase.from("visitor_reports").select("id,created_at", { count: "exact" }).eq("establishment_id", profile.establishment_id).eq("status", "approved").gte("created_at", monthStart).order("created_at", { ascending: false }).limit(1),
          supabase.from("accommodation_reports").select("id,created_at", { count: "exact" }).eq("establishment_id", profile.establishment_id).eq("status", "approved").gte("created_at", monthStart).order("created_at", { ascending: false }).limit(1),
          supabase.from("visitor_reports").select("id,created_at", { count: "exact" }).eq("establishment_id", profile.establishment_id).eq("status", "on_hold").order("created_at", { ascending: false }).limit(1),
          supabase.from("accommodation_reports").select("id,created_at", { count: "exact" }).eq("establishment_id", profile.establishment_id).eq("status", "on_hold").order("created_at", { ascending: false }).limit(1),
        ]);

        const pendingTotal = countOf(pendingVisitor, pendingAccommodation);
        const approvedTotal = countOf(approvedVisitor, approvedAccommodation);
        const onHoldTotal = countOf(onHoldVisitor, onHoldAccommodation);
        if (pendingTotal > 0) {
          dynamic.push({
            id: `staff-pending-${profile.establishment_id}-${pendingTotal}-${newestCreatedAt(pendingVisitor.data, pendingAccommodation.data)}`,
            source: "system",
            title: "Submitted reports pending",
            message: `${pendingTotal} report${pendingTotal === 1 ? "" : "s"} from your establishment are waiting for officer review.`,
            type: "report",
            actionPath: "/staff/submission-history",
            createdAt: newestCreatedAt(pendingVisitor.data, pendingAccommodation.data),
            isRead: false,
          });
        }
        if (onHoldTotal > 0) {
          dynamic.push({
            id: `staff-hold-${profile.establishment_id}-${onHoldTotal}-${newestCreatedAt(onHoldVisitor.data, onHoldAccommodation.data)}`,
            source: "system",
            title: "Report needs attention",
            message: `${onHoldTotal} submitted report${onHoldTotal === 1 ? "" : "s"} from your establishment are on hold for verification.`,
            type: "warning",
            actionPath: "/staff/submission-history",
            createdAt: newestCreatedAt(onHoldVisitor.data, onHoldAccommodation.data),
            isRead: false,
          });
        }
        if (approvedTotal > 0) {
          dynamic.push({
            id: `staff-approved-${profile.establishment_id}-${approvedTotal}-${newestCreatedAt(approvedVisitor.data, approvedAccommodation.data)}`,
            source: "system",
            title: "Reports approved this month",
            message: `${approvedTotal} report${approvedTotal === 1 ? "" : "s"} from your establishment were approved this month.`,
            type: "success",
            actionPath: "/staff/submission-history",
            createdAt: newestCreatedAt(approvedVisitor.data, approvedAccommodation.data),
            isRead: false,
          });
        }
      }
      dynamic.push(deadlineNotification(role, canSubmitAccommodation));
      dynamic.push({
        id: `staff-listing-reminder-${profile?.establishment_id || user.id}`,
        source: "system",
        title: "Keep your public listing updated",
        message: "Review photos, contact details, amenities, and exact map pin for visitors.",
        type: "info",
        actionPath: "/staff/manage-listing",
        createdAt: nowIso,
        isRead: false,
      });
    }

    setSystemNotifications(dynamic.map((item) => ({ ...item, isRead: readIds.has(item.id) })));
    setLoading(false);
  }, [profile?.establishment_id, role, user?.id]);

  useEffect(() => {
    loadNotifications();
    const interval = window.setInterval(loadNotifications, 60_000);
    const onFocus = () => loadNotifications();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadNotifications]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notifications-live-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, loadNotifications)
      .on("postgres_changes", { event: "*", schema: "public", table: "visitor_reports" }, loadNotifications)
      .on("postgres_changes", { event: "*", schema: "public", table: "accommodation_reports" }, loadNotifications)
      .on("postgres_changes", { event: "*", schema: "public", table: "establishments" }, loadNotifications)
      .on("postgres_changes", { event: "*", schema: "public", table: "establishment_ratings" }, loadNotifications)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadNotifications, user?.id]);

  const notifications = useMemo(() => [...dbNotifications, ...systemNotifications].slice(0, 10), [dbNotifications, systemNotifications]);
  const unreadCount = notifications.filter((notification) => !notification.isRead).length;

  const markRead = async (notification: AppNotification) => {
    if (notification.source === "database") {
      await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", notification.id);
      setDbNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, isRead: true } : item));
    } else {
      markLocalRead([notification.id]);
      setSystemNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, isRead: true } : item));
    }
  };

  const markAllRead = async () => {
    const unreadDbIds = dbNotifications.filter((notification) => !notification.isRead).map((notification) => notification.id);
    if (unreadDbIds.length > 0) {
      await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).in("id", unreadDbIds);
      setDbNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
    }
    markLocalRead(systemNotifications.map((notification) => notification.id));
    setSystemNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
  };

  const openNotification = async (notification: AppNotification) => {
    await markRead(notification);
    setOpen(false);
    navigate(notification.actionPath);
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        onClick={() => setOpen((current) => !current)}
        className="relative rounded-2xl p-2.5 transition-colors hover:bg-[#e5f1f2] focus:outline-none focus:ring-2 focus:ring-[#0E5A72]/25"
      >
        <Bell className="h-5 w-5 text-slate-500" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#F59E0B] px-1.5 text-[10px] font-black text-white ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(92vw,24rem)] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/15">
          <div className="flex items-center justify-between gap-3 border-b border-[#D9E2EC] px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-[#0F172A]">Notifications</h3>
              <p className="text-xs text-[#6B7280]">Live reminders and report updates</p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={loadNotifications} className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100" aria-label="Refresh notifications">
                <RefreshCw className="h-4 w-4" />
              </button>
              <button type="button" onClick={markAllRead} disabled={unreadCount === 0} className="rounded-xl p-2 text-[#0E5A72] transition-colors hover:bg-[#e5f1f2] disabled:cursor-not-allowed disabled:opacity-40" aria-label="Mark all notifications as read">
                <CheckCheck className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="max-h-[26rem] overflow-y-auto py-2">
            {loading && (
              <div className="flex items-center gap-2 px-4 py-6 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading notifications…
              </div>
            )}
            {!loading && error && notifications.length > 0 && (
              <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-700">{error}</div>
            )}
            {!loading && error && notifications.length === 0 && (
              <div className="px-4 py-4 text-sm text-rose-600">Could not load notifications: {error}</div>
            )}
            {!loading && !error && notifications.length === 0 && (
              <div className="px-4 py-8 text-center">
                <Bell className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm font-semibold text-slate-700">No notifications yet</p>
                <p className="mt-1 text-xs text-slate-500">New report activity and reminders will appear here.</p>
              </div>
            )}
            {!loading && notifications.map((notification) => {
              const style = typeStyles[notification.type] || typeStyles.info;
              const Icon = notification.type === "ai" ? Sparkles : notification.type === "report" ? FileText : Clock;
              return (
                <button
                  key={`${notification.source}-${notification.id}`}
                  type="button"
                  onClick={() => openNotification(notification)}
                  className={`w-full border-l-4 ${style.border} px-4 py-3 text-left transition-colors hover:bg-[#F2F5F7] ${notification.isRead ? "opacity-70" : "bg-white"}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.bg}`}>
                      <Icon className={`h-4 w-4 ${style.icon}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-[#0F172A]">{notification.title}</p>
                        {!notification.isRead && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#F59E0B]" />}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-[#6B7280]">{notification.message}</p>
                      <p className="mt-2 flex items-center gap-1 text-xs font-medium text-[#0E5A72]">
                        {relativeTime(notification.createdAt)} <ExternalLink className="h-3 w-3" />
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="border-t border-[#D9E2EC] p-3">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate(role === "municipal_officer" ? "/officer/report-monitoring" : "/staff/submission-history");
              }}
              className="w-full rounded-2xl bg-[#e5f1f2] px-4 py-2 text-center text-sm font-semibold text-[#0E5A72] transition-colors hover:bg-[#d2e8ea]"
            >
              View related activity
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
