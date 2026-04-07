import React from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Bell, ChevronDown } from "lucide-react";
import { apiClient } from "../api/client";
import { roleLabel } from "../constants/rbac";

const pageTitles = {
  "/dashboard": "Dashboard",
  "/reporting-dashboard": "Dashboard",
  "/reviewing-dashboard": "Dashboard",
  "/accepting-dashboard": "Dashboard",
  "/admin-dashboard": "Admin Panel",
  "/admin/create-user": "Create New User",
  "/admin/cycles": "Appraisal Cycle Management",
  "/admin/all-users": "All Users",
  "/admin/hierarchy": "Reporting Hierarchy",
  "/goals": "Annual Goal Setting",
  "/tracking": "Six-Month Tracking",
  "/reviews": "Year-End Reviews",
};

const Topbar = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState([]);
  const notifRef = React.useRef(null);
  const profileRef = React.useRef(null);
  const title = pageTitles[location.pathname] || "e-PMS";
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const loadUnreadCount = React.useCallback(() => {
    if (!user) return;
    apiClient
      .get("/notifications/unread-count")
      .then((res) => setUnreadCount(res.data.count || 0))
      .catch(() => setUnreadCount(0));
  }, [user]);

  const loadNotifications = React.useCallback(() => {
    if (!user) return;
    apiClient
      .get("/notifications")
      .then((res) => setNotifications(Array.isArray(res.data) ? res.data : []))
      .catch(() => setNotifications([]));
  }, [user]);

  React.useEffect(() => {
    loadUnreadCount();
  }, [loadUnreadCount, location.pathname]);

  React.useEffect(() => {
    if (!notifOpen) return;
    loadNotifications();
  }, [notifOpen, loadNotifications]);

  React.useEffect(() => {
    const handleOutsideClick = (event) => {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const currentRoleLabel = roleLabel(user?.role);

  const markAsRead = async (id) => {
    try {
      await apiClient.patch(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, isRead: true, readAt: new Date().toISOString() } : item)));
      loadUnreadCount();
    } catch (error) {
      // Intentionally silent; notification drawer should remain usable.
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1 className="topbar-title">{title}</h1>
        <p className="topbar-date">{today}</p>
      </div>
      <div className="topbar-right">
        <div className="topbar-notif-wrap" ref={notifRef}>
          <button className="topbar-icon-btn" title="Notifications" onClick={() => setNotifOpen((prev) => !prev)}>
            <Bell size={18} />
            {unreadCount > 0 && <span className="topbar-notif-count">{unreadCount}</span>}
          </button>
          {notifOpen && (
            <div className="topbar-notif-panel">
              <div className="topbar-notif-panel-head">Notifications</div>
              {notifications.length === 0 ? (
                <div className="topbar-notif-empty">No notifications yet.</div>
              ) : (
                <div className="topbar-notif-list">
                  {notifications.slice(0, 12).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`topbar-notif-item${item.isRead ? "" : " unread"}`}
                      onClick={() => markAsRead(item.id)}
                    >
                      <div className="topbar-notif-title">{item.title}</div>
                      <div className="topbar-notif-message">{item.message}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="topbar-profile-wrap" ref={profileRef}>
          <button className="topbar-user-pill topbar-user-pill-btn" type="button" onClick={() => setProfileOpen((prev) => !prev)}>
            <div className="topbar-avatar">
              {user?.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "U"}
            </div>
            <div>
              <div className="topbar-name">{user?.name}</div>
              <div className="topbar-role">{currentRoleLabel}</div>
            </div>
            <ChevronDown size={14} className={`topbar-profile-chevron${profileOpen ? " open" : ""}`} />
          </button>
          {profileOpen && (
            <div className="topbar-profile-panel">
              <div className="topbar-profile-head">
                <div className="topbar-profile-head-avatar">
                  {user?.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "U"}
                </div>
                <div>
                  <div className="topbar-profile-name">{user?.name || "User"}</div>
                  <div className="topbar-profile-sub">{user?.email || "No email"}</div>
                  <div className="topbar-profile-role-chip">{currentRoleLabel}</div>
                </div>
              </div>
              <div className="topbar-profile-info-list">
                <div className="topbar-profile-info-item">
                  <span className="topbar-profile-info-label">Department</span>
                  <span className="topbar-profile-info-value">{user?.department || "Not set"}</span>
                </div>
                <div className="topbar-profile-info-item">
                  <span className="topbar-profile-info-label">Email</span>
                  <span className="topbar-profile-info-value">{user?.email || "Not set"}</span>
                </div>
                <div className="topbar-profile-info-item">
                  <span className="topbar-profile-info-label">Account</span>
                  <span className="topbar-profile-info-status">Active</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Topbar;
