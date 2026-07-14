import { useEffect, useRef, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import { FACILITY_CONFIG, QUICK_FILTER_CATEGORIES, type FacilityCategory } from '../lib/facilityTypes';

/** Animates a number towards its target value (ease-out, ~600 ms). */
function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    const start = performance.now();
    const duration = 600;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(from + (value - from) * eased);
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);

  return <>{display.toLocaleString()}</>;
}

export interface Stats {
  counts: Record<FacilityCategory, number>;
  m: number;
  f: number;
  total: number;
}

export interface TopBarData {
  name: string;
  total: number;
  breakdown: Record<string, number>;
}

export interface StatsDeckProps {
  stats: Stats & { traineesByCategory: Record<FacilityCategory, number> };
  topBarChartData: TopBarData[];
  topBarChartTitle: string;
  facilityGenderData: { name: string; Male: number; Female: number }[];
  activeQuickFilter: FacilityCategory | null;
  onToggleQuickFilter: (cat: FacilityCategory) => void;
  scopeLabel: string;
}

export function StatsDeck({
  stats, topBarChartData, topBarChartTitle, facilityGenderData,
  activeQuickFilter, onToggleQuickFilter, scopeLabel
}: StatsDeckProps) {
  const malePct = (stats.m / (stats.m + stats.f || 1)) * 100;

  return (
    <div className="stats-deck">
      <h4>
        Statistics Overview <br />
        <span className="scope-label">{scopeLabel}</span>
      </h4>

      <div className="stat-cards">
        {QUICK_FILTER_CATEGORIES.map(cat => {
          const cfg = FACILITY_CONFIG[cat];
          const active = activeQuickFilter === cat;
          return (
            <button
              key={cat}
              className="stat-card"
              aria-pressed={active}
              onClick={() => onToggleQuickFilter(cat)}
              style={{
                background: active ? cfg.color : cfg.lightBg,
                color: active ? '#fff' : cfg.color
              }}
            >
              <div className="stat-value"><AnimatedNumber value={stats.counts[cat]} /></div>
              <div className="stat-label" style={{ color: active ? '#fff' : '#5f6368' }}>{cfg.acronym}s</div>
            </button>
          );
        })}
      </div>

      <div className="trainee-box">
        <div className="dim small">Total Trainee Strength</div>
        <div className="trainee-total"><AnimatedNumber value={stats.total} /></div>
        <div className="dim small" style={{ marginBottom: 8, fontSize: '0.75rem' }}>
          Breakup: NCOE ({stats.traineesByCategory['NCOE'].toLocaleString()}) • STC ({stats.traineesByCategory['STC'].toLocaleString()}) • KIC ({stats.traineesByCategory['KIC'].toLocaleString()}) • KISCE ({stats.traineesByCategory['KISCE'].toLocaleString()})
        </div>
        <div className="gender-bar" role="img" aria-label={`Male ${stats.m.toLocaleString()}, Female ${stats.f.toLocaleString()}`}>
          <div style={{ width: `${malePct}%`, background: '#1a73e8' }}></div>
          <div style={{ width: `${100 - malePct}%`, background: '#e91e63' }}></div>
        </div>
        <div className="gender-legend">
          <span><strong style={{ color: '#1a73e8' }}>Male:</strong> {stats.m.toLocaleString()}</span>
          <span><strong style={{ color: '#e91e63' }}>Female:</strong> {stats.f.toLocaleString()}</span>
        </div>
      </div>

      {stats.total > 0 && (
        <div className="charts">
          <div className="chart-block">
            <div className="chart-title">{topBarChartTitle}</div>
            <div className="chart-holder" style={{ height: 180 }}>
              <ResponsiveContainer>
                <BarChart data={topBarChartData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 10, fill: '#5f6368' }} axisLine={false} tickLine={false} />
                  <RechartsTooltip 
                    cursor={{ fill: '#f1f3f4' }} 
                    contentStyle={{ borderRadius: 8, fontSize: 12, padding: 6 }}
                    formatter={(value: any, name: any, props: any) => {
                      const breakdown = props.payload.breakdown;
                      const subtext = `KIC: ${breakdown.KIC}, KISCE: ${breakdown.KISCE}, STC: ${breakdown.STC}, NCOE: ${breakdown.NCOE}`;
                      return [<span>{value}<br/><span style={{ fontSize: '0.8em', color: '#888' }}>{subtext}</span></span>, name];
                    }}
                  />
                  <Bar dataKey="total" fill="#34a853" radius={[0, 4, 4, 0]} barSize={12} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="chart-block">
            <div className="chart-title">Gender by Facility Type</div>
            <div className="chart-holder" style={{ height: 160 }}>
              <ResponsiveContainer>
                <BarChart data={facilityGenderData} margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8eaed" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#5f6368' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#5f6368' }} width={35} axisLine={false} tickLine={false} />
                  <RechartsTooltip cursor={{ fill: '#f1f3f4' }} contentStyle={{ borderRadius: 8, fontSize: 12, padding: 6 }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11, color: '#5f6368' }} />
                  <Bar dataKey="Male" stackId="a" fill="#1a73e8" barSize={20} />
                  <Bar dataKey="Female" stackId="a" fill="#e91e63" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
