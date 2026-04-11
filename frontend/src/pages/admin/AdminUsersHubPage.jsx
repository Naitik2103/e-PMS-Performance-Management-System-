import React from "react";
import { Link } from "react-router-dom";
import { UserPlus, Users, Network } from "lucide-react";

const AdminUsersHubPage = () => (
  <div className="page-content">
    <div className="card">
      <div className="card-header">
        <h2>User management</h2>
      </div>
      <div className="admin-hub-grid">
        <Link className="admin-hub-card" to="/admin/users/create">
          <UserPlus size={22} />
          <div>
            <div className="admin-hub-card-title">Create user</div>
            <div className="admin-hub-card-desc">Add a new employee account</div>
          </div>
        </Link>
        <Link className="admin-hub-card" to="/admin/all-users">
          <Users size={22} />
          <div>
            <div className="admin-hub-card-title">All users</div>
            <div className="admin-hub-card-desc">Browse and manage accounts</div>
          </div>
        </Link>
        <Link className="admin-hub-card" to="/admin/hierarchy">
          <Network size={22} />
          <div>
            <div className="admin-hub-card-title">Reporting hierarchy</div>
            <div className="admin-hub-card-desc">Org chart view</div>
          </div>
        </Link>
      </div>
    </div>
  </div>
);

export default AdminUsersHubPage;
