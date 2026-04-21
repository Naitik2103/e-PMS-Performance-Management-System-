import React from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, AreaChart, Area, RadarChart, PolarGrid, PolarAngleAxis, 
  PolarRadiusAxis, Radar, Legend 
} from "recharts";
import { apiClient } from "../../api/client";
import { Loader2, TrendingUp, Users, Award, CheckCircle } from "lucide-react";

const COLORS = ["#4F46E5", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];

const AnalyticsDashboard = () => {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ["admin", "analytics", "dashboard"],
    queryFn: async () => {
      const res = await apiClient.get("/admin/analytics/dashboard-stats");
      return res.data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-indigo-600" size={48} />
      </div>
    );
  }

  if (error || !stats || !stats.periodProgress) {
    return (
      <div className="p-8 text-center bg-red-50 text-red-600 rounded-xl">
        Failed to load analytics. Please ensure an active cycle exists.
      </div>
    );
  }

  const { periodProgress, departmentalStats, scoreDistribution, orgLevelStats, cycleName, currentPhase } = stats;

  const isAnnualStarted = periodProgress.annual.submitted > 0;

  const renderDataPending = (title) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', padding: '40px 0' }}>
      <Award size={64} style={{ opacity: 0.15, marginBottom: '16px' }} />
      <p style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>Awaiting Final Ratings</p>
      <p style={{ fontSize: '13px', opacity: 0.6 }}>Insights will activate during Annual Appraisal</p>
    </div>
  );

  const renderPeriodDonut = (title, current, total, color, gradientId) => {
    const data = [
      { name: "Completed", value: current },
      { name: "Remaining", value: Math.max(0, total - current) },
    ];
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

    return (
      <div className="analytics-card premium-card">
        <h4 className="analytics-card-title">{title}</h4>
        <div style={{ height: '220px', width: '100%', position: 'relative' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={1}/>
                  <stop offset="100%" stopColor={color} stopOpacity={0.7}/>
                </linearGradient>
              </defs>
              <Pie
                data={data}
                innerRadius={65}
                outerRadius={85}
                paddingAngle={8}
                dataKey="value"
                stroke="none"
              >
                <Cell fill={`url(#${gradientId})`} />
                <Cell fill="#f1f5f9" />
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <span style={{ fontSize: '28px', fontWeight: '800', color: '#1e293b' }}>{percentage}%</span>
            <span style={{ fontSize: '13px', fontWeight: '500', color: '#64748b' }}>{current} / {total}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="analytics-page">
      <div className="analytics-header">
        <div>
          <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.02em' }}>Organization Analytics</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></div>
            <p style={{ color: '#64748b', fontSize: '14px' }}>Live Snapshot: <span style={{ fontWeight: '600', color: '#4f46e5' }}>{cycleName}</span></p>
          </div>
        </div>
      </div>

      {/* Phase Trackers */}
      <div className="analytics-grid-3">
        {renderPeriodDonut("Goal Setting Phase", periodProgress.goal.submitted, periodProgress.goal.total, "#6366f1", "gradGoal")}
        {renderPeriodDonut("Six-Month Review Phase", periodProgress.sixMonth.submitted, periodProgress.sixMonth.total, "#10b981", "gradSix")}
        {renderPeriodDonut("Annual Appraisal Phase", periodProgress.annual.submitted, periodProgress.annual.total, "#f59e0b", "gradAnnual")}
      </div>

      <div className="analytics-grid-2">
        {/* Department Leaderboard */}
        <div className="analytics-card premium-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
            <div style={{ background: '#e0e7ff', padding: '8px', borderRadius: '10px' }}>
              <Users style={{ color: '#4f46e5' }} size={20} />
            </div>
            <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b', margin: 0 }}>{currentPhase} Completion by Dept</h4>
          </div>
          <div style={{ height: '320px', width: '100%' }}>
            {departmentalStats.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={departmentalStats} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#4f46e5" />
                      <stop offset="100%" stopColor="#818cf8" />
                    </linearGradient>
                  </defs>
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    tick={{ fontSize: 12, fontWeight: 500, fill: '#475569' }} 
                    width={110}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="completed" fill="url(#barGrad)" radius={[0, 10, 10, 0]} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>
                <Users size={48} style={{ opacity: 0.15, marginBottom: '12px' }} />
                <p>No department data available</p>
              </div>
            )}
          </div>
        </div>

        {/* Radar Performance */}
        <div className="analytics-card premium-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
            <div style={{ background: '#d1fae5', padding: '8px', borderRadius: '10px' }}>
              <Award style={{ color: '#059669' }} size={20} />
            </div>
            <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Level-Wise Performance Radar</h4>
          </div>
          <div style={{ height: '320px', width: '100%' }}>
            {orgLevelStats && orgLevelStats.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={orgLevelStats}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="level" tick={{ fontSize: 12, fontWeight: 600, fill: '#475569' }} />
                  <PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} />
                  <Radar
                    name="Avg Score"
                    dataKey="score"
                    stroke="#10b981"
                    strokeWidth={3}
                    fill="#10b981"
                    fillOpacity={0.4}
                  />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            ) : renderDataPending()}
          </div>
        </div>
      </div>

      {/* Bell Curve */}
      <div className="analytics-card premium-card" style={{ marginTop: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
          <div style={{ background: '#fef3c7', padding: '8px', borderRadius: '10px' }}>
            <TrendingUp style={{ color: '#d97706' }} size={20} />
          </div>
          <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Overall Performance Distribution (Bell Curve)</h4>
        </div>
        <div style={{ height: '350px', width: '100%' }}>
          {scoreDistribution && scoreDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={scoreDistribution} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="range" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip />
                <Area 
                  type="monotone" 
                  dataKey="count" 
                  stroke="#f59e0b" 
                  strokeWidth={4}
                  fillOpacity={1} 
                  fill="url(#colorScore)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : renderDataPending()}
        </div>
      </div>

      <style>{`
        .analytics-page {
          padding: 32px;
          background: #f8fafc;
          min-height: 100vh;
          font-family: 'Inter', sans-serif;
        }
        .analytics-header {
          margin-bottom: 40px;
        }
        .premium-card {
          background: white;
          padding: 28px;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,0.7);
          box-shadow: 0 10px 25px -5px rgba(0,0,0,0.04), 0 8px 10px -6px rgba(0,0,0,0.04);
          transition: transform 0.2s ease;
        }
        .premium-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 20px 25px -5px rgba(0,0,0,0.06);
        }
        .analytics-card-title {
          font-size: 15px;
          font-weight: 700;
          color: #64748b;
          margin-bottom: 24px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .analytics-grid-3 {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 28px;
          margin-bottom: 28px;
        }
        .analytics-grid-2 {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 28px;
        }
        @media (max-width: 1200px) {
          .analytics-grid-3, .analytics-grid-2 {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

export default AnalyticsDashboard;
