import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Users, Search, Filter, Briefcase } from "lucide-react";
import { apiClient } from "../../api/client";

const ACCENT_COLORS = [
  { bg: "#eff6ff", text: "#1e40af", border: "#dbeafe" }, // Blue
  { bg: "#f0fdf4", text: "#166534", border: "#dcfce7" }, // Green
  { bg: "#faf5ff", text: "#6b21a8", border: "#f3e8ff" }, // Purple
  { bg: "#fff7ed", text: "#9a3412", border: "#ffedd5" }, // Orange
  { bg: "#fdf2f8", text: "#9d174d", border: "#fce7f3" }, // Pink
  { bg: "#f0fdfa", text: "#0f766e", border: "#ccfbf1" }, // Teal
];

const DepartmentsPage = () => {
  const [searchTerm, setSearchTerm] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "departments"],
    queryFn: async () => {
      const res = await apiClient.get("/admin/meta/departments-designations");
      return res.data?.departments || [];
    }
  });

  const filteredDepartments = useMemo(() => {
    if (!data) return [];
    const term = searchTerm.toLowerCase().trim();
    if (!term) return data;
    return data.filter(
      (dept) =>
        dept.name?.toLowerCase().includes(term) ||
        dept.code?.toLowerCase().includes(term)
    );
  }, [data, searchTerm]);

  if (isLoading) {
    return (
      <div className="page-content">
        <div className="muted" style={{ padding: "40px", textAlign: "center" }}>
          Loading departments...
        </div>
      </div>
    );
  }

  return (
    <div className="page-content" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header Section */}
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        flexWrap: "wrap",
        gap: "16px"
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "24px", fontWeight: "700", color: "#0f172a" }}>Organizational Departments</h2>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: "14px" }}>
            Monitor and manage departmental distribution across the organization.
          </p>
        </div>
      </div>

      {/* Control Bar */}
      <div className="card" style={{ padding: "16px", display: "flex", gap: "16px" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search 
            size={18} 
            style={{ 
              position: "absolute", 
              left: "12px", 
              top: "50%", 
              transform: "translateY(-50%)", 
              color: "#64748b" 
            }} 
          />
          <input
            type="text"
            placeholder="Search departments by name or code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px 10px 40px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              fontSize: "14px",
              outline: "none",
              transition: "border-color 0.2s"
            }}
            onFocus={(e) => e.target.style.borderColor = "#3b82f6"}
            onBlur={(e) => e.target.style.borderColor = "#e2e8f0"}
          />
        </div>
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: "8px", 
          padding: "0 16px", 
          borderLeft: "1px solid #e2e8f0",
          color: "#64748b",
          fontSize: "14px",
          fontWeight: "600"
        }}>
          <Filter size={16} />
          {filteredDepartments.length} Results
        </div>
      </div>

      {/* Grid Section */}
      {filteredDepartments.length === 0 ? (
        <div className="card" style={{ padding: "80px 24px", textAlign: "center" }}>
          <div style={{ 
            width: "64px", 
            height: "64px", 
            background: "#f1f5f9", 
            borderRadius: "50%", 
            display: "inline-flex", 
            alignItems: "center", 
            justifyContent: "center",
            marginBottom: "16px",
            color: "#94a3b8"
          }}>
            <Building2 size={32} />
          </div>
          <h3 style={{ margin: 0, color: "#1e293b" }}>No departments found</h3>
          <p className="muted">Try adjusting your search terms.</p>
        </div>
      ) : (
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", 
          gap: "20px" 
        }}>
          {filteredDepartments.map((dept, index) => {
            const color = ACCENT_COLORS[index % ACCENT_COLORS.length];
            return (
              <div 
                key={dept.id} 
                className="card" 
                style={{ 
                  padding: "0", 
                  overflow: "hidden", 
                  transition: "transform 0.2s, box-shadow 0.2s",
                  cursor: "default",
                  borderLeft: `4px solid \${color.text}`
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow = "0 10px 15px -3px rgb(0 0 0 / 0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "var(--shadow-md)";
                }}
              >
                <div style={{ padding: "24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                    <div style={{ 
                      width: "48px", 
                      height: "48px", 
                      background: color.bg, 
                      color: color.text, 
                      borderRadius: "12px", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center" 
                    }}>
                      <Briefcase size={24} />
                    </div>
                    <div style={{ 
                      padding: "4px 10px", 
                      background: "#f1f5f9", 
                      borderRadius: "6px", 
                      fontSize: "11px", 
                      fontWeight: "700", 
                      color: "#475569",
                      letterSpacing: "0.05em"
                    }}>
                      {dept.code || "N/A"}
                    </div>
                  </div>

                  <h3 style={{ margin: "0 0 4px", fontSize: "18px", fontWeight: "700", color: "#0f172a" }}>
                    {dept.name}
                  </h3>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#64748b", fontSize: "14px" }}>
                    <Building2 size={14} />
                    Department
                  </div>

                  <div style={{ 
                    marginTop: "24px", 
                    paddingTop: "20px", 
                    borderTop: "1px solid #f1f5f9",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ 
                        width: "32px", 
                        height: "32px", 
                        borderRadius: "50%", 
                        background: "#f8fafc", 
                        display: "flex", 
                        alignItems: "center", 
                        justifyContent: "center",
                        color: "#94a3b8"
                      }}>
                        <Users size={16} />
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: "500", color: "#475569" }}>
                        Active Employees
                      </div>
                    </div>
                    <div style={{ fontSize: "20px", fontWeight: "800", color: color.text }}>
                      {dept.employeeCount || 0}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DepartmentsPage;
