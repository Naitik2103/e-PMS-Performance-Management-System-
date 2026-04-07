import React, { useEffect, useState } from "react";
import { apiClient } from "../../api/client";
import { ChevronRight } from "lucide-react";
import { roleLabel } from "../../constants/rbac";

const ReportingHierarchyPage = () => {
  const [tree, setTree] = useState([]);

  useEffect(() => {
    const loadHierarchy = async () => {
      try {
        const treeRes = await apiClient.get("/users/hierarchy");
        setTree(treeRes.data || []);
      } catch {
        setTree([]);
      }
    };
    loadHierarchy();
  }, []);

  const renderTree = (nodes, depth = 0) => {
    return nodes.map((node) => (
      <div key={node.id} className="tree-node" style={{ marginLeft: depth * 20 }}>
        <ChevronRight size={13} style={{ marginRight: 4, opacity: 0.5 }} />
        <strong>{node.name}</strong>
        <span className="tree-role-chip">{roleLabel(node.role)}</span>
        {node.reports && renderTree(node.reports, depth + 1)}
      </div>
    ));
  };

  return (
    <div className="page-content">
      <div className="card">
        <div className="card-header">
          <h2>Reporting Hierarchy</h2>
        </div>
        <div className="tree-container">{renderTree(tree)}</div>
      </div>
    </div>
  );
};

export default ReportingHierarchyPage;
