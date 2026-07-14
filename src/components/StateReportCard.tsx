import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Location, type DisciplineDetail } from '../db';
import { classifyFacility, FACILITY_CONFIG, ALL_CATEGORIES, type FacilityCategory } from '../lib/facilityTypes';
import { getDisciplineIcon, isRealDiscipline } from '../lib/disciplineIcons';

export interface StateReportCardProps {
  stateName: string;
  locations: Location[];        // all locations (unfiltered)
  disciplineRows: DisciplineDetail[];
  onClose: () => void;
  onPickFacility: (loc: Location) => void;
}

function formatINR(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

export function StateReportCard({ stateName, locations, disciplineRows, onClose, onPickFacility }: StateReportCardProps) {
  const allFunds = useLiveQuery(() => db.funds.toArray()) || [];
  const allManpower = useLiveQuery(() => db.manpower.toArray()) || [];
  const [selectedDiscipline, setSelectedDiscipline] = useState<string | null>(null);

  const report = useMemo(() => {
    const stateLocs = locations.filter(l => l.State === stateName);
    const facIds = new Set(stateLocs.map(l => l.Facility_ID));

    // Rank among states by facility count
    const perState: Record<string, number> = {};
    locations.forEach(l => { if (l.State) perState[l.State] = (perState[l.State] || 0) + 1; });
    const ranked = Object.entries(perState).sort((a, b) => b[1] - a[1]);
    const rank = ranked.findIndex(([s]) => s === stateName) + 1;

    const regions = Array.from(new Set(stateLocs.map(l => l.Parent_Region).filter(Boolean))) as string[];

    // Facility mix + trainees
    const counts = Object.fromEntries(ALL_CATEGORIES.map(c => [c, 0])) as Record<FacilityCategory, number>;
    let m = 0, f = 0, total = 0;
    // Utilization is only meaningful for facilities that record BOTH numbers.
    let sanctioned = 0, sanctionedActual = 0;
    stateLocs.forEach(l => {
      counts[classifyFacility(l.Facility_Type)]++;
      m += l.Trainees_Male || 0;
      f += l.Trainees_Female || 0;
      total += l.Total_Trainees || 0;
      if ((l.Sanctioned_Strength || 0) > 0) {
        sanctioned += l.Sanctioned_Strength || 0;
        sanctionedActual += l.Total_Trainees || 0;
      }
    });

    // All disciplines offered in the state, with facility counts and trainee totals
    const facilitiesPerDiscipline: Record<string, number> = {};
    stateLocs.forEach(l => l.Disciplines?.split(',').forEach(d => {
      const t = d.trim();
      if (t && isRealDiscipline(t)) facilitiesPerDiscipline[t] = (facilitiesPerDiscipline[t] || 0) + 1;
    }));
    const disciplineList = Object.entries(facilitiesPerDiscipline)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    const traineesPerDiscipline: Record<string, number> = {};
    disciplineRows.forEach(row => {
      if (!facIds.has(row.Facility_ID) || !row.Discipline || !isRealDiscipline(row.Discipline)) return;
      const t = row.Total_Trainees ?? ((row.Trainees_Male || 0) + (row.Trainees_Female || 0));
      traineesPerDiscipline[row.Discipline] = (traineesPerDiscipline[row.Discipline] || 0) + t;
    });

    // KISCE funds
    const stateFunds = allFunds.filter(r => facIds.has(r.Facility_ID));
    const totalFunds = stateFunds.reduce((s, r) => s + (r['Funds Released (Rs)'] || 0), 0);
    const fundsByFY: Record<string, number> = {};
    stateFunds.forEach(r => {
      const fy = r['Financial Year'] || 'Unknown';
      fundsByFY[fy] = (fundsByFY[fy] || 0) + (r['Funds Released (Rs)'] || 0);
    });

    // KISCE manpower
    const stateMan = allManpower.filter(r => facIds.has(r.Facility_ID));
    const manSanctioned = stateMan.reduce((s, r) => s + (r['Sanctioned Strength'] || 0), 0);
    const manCurrent = stateMan.reduce((s, r) => s + (r['Current Strength'] || 0), 0);
    const vacancies = Math.max(0, manSanctioned - manCurrent);

    // Top facilities by trainees
    const topFacilities = [...stateLocs]
      .sort((a, b) => (b.Total_Trainees || 0) - (a.Total_Trainees || 0))
      .slice(0, 5);

    return {
      stateLocs, rank, totalStates: ranked.length, regions, counts,
      m, f, total, sanctioned, sanctionedActual,
      disciplineList, traineesPerDiscipline,
      fundRows: stateFunds.length, totalFunds,
      fundsByFY: Object.entries(fundsByFY).sort((a, b) => a[0].localeCompare(b[0])),
      manSanctioned, manCurrent, vacancies,
      topFacilities,
    };
  }, [stateName, locations, disciplineRows, allFunds, allManpower]);

  // Facilities in this state offering the selected discipline, with that sport's trainee count.
  const disciplineFacilities = useMemo(() => {
    if (!selectedDiscipline) return [];
    const perFacility: Record<string, number> = {};
    disciplineRows.forEach(row => {
      if (row.Discipline === selectedDiscipline) {
        perFacility[row.Facility_ID] =
          (perFacility[row.Facility_ID] || 0) +
          (row.Total_Trainees ?? ((row.Trainees_Male || 0) + (row.Trainees_Female || 0)));
      }
    });
    return report.stateLocs
      .filter(l => l.Disciplines?.split(',').some(d => d.trim() === selectedDiscipline))
      .map(loc => ({ loc, trainees: perFacility[loc.Facility_ID] || 0 }))
      .sort((a, b) => b.trainees - a.trainees || a.loc.Facility_Name.localeCompare(b.loc.Facility_Name));
  }, [selectedDiscipline, report.stateLocs, disciplineRows]);

  const malePct = (report.m / (report.m + report.f || 1)) * 100;
  const utilization = report.sanctioned > 0 ? Math.round((report.sanctionedActual / report.sanctioned) * 100) : null;
  const staffedPct = report.manSanctioned > 0 ? Math.round((report.manCurrent / report.manSanctioned) * 100) : null;
  const maxFY = Math.max(1, ...report.fundsByFY.map(([, v]) => v));

  return (
    <aside className="report-card" role="dialog" aria-label={`${stateName} report card`}>
      <div className="report-header">
        <div>
          <h3>{stateName}</h3>
          <div className="report-sub">
            {report.regions.length > 0 && <>SAI Region: {report.regions.join(', ')} • </>}
            #{report.rank} of {report.totalStates} states by facilities
          </div>
        </div>
        <button className="report-close" onClick={onClose} aria-label="Close report card">×</button>
      </div>

      <div className="report-body">
        {/* Facility mix */}
        <section>
          <h4>Facility Mix <span className="dim">({report.stateLocs.length} total)</span></h4>
          <div className="mix-grid">
            {ALL_CATEGORIES.filter(c => report.counts[c] > 0).map(cat => (
              <div key={cat} className="mix-chip" style={{ background: FACILITY_CONFIG[cat].lightBg }}>
                <span className="mix-count" style={{ color: FACILITY_CONFIG[cat].color }}>{report.counts[cat]}</span>
                <span className="mix-label">{FACILITY_CONFIG[cat].acronym}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Trainees */}
        <section>
          <h4>Trainees</h4>
          <div className="report-big">{report.total.toLocaleString()}</div>
          <div className="gender-bar" role="img" aria-label={`Male ${report.m}, Female ${report.f}`}>
            <div style={{ width: `${malePct}%`, background: '#1a73e8' }}></div>
            <div style={{ width: `${100 - malePct}%`, background: '#e91e63' }}></div>
          </div>
          <div className="gender-legend">
            <span><strong style={{ color: '#1a73e8' }}>M:</strong> {report.m.toLocaleString()}</span>
            <span><strong style={{ color: '#e91e63' }}>F:</strong> {report.f.toLocaleString()}</span>
          </div>
          {utilization !== null && (
            <div className="util-row">
              <div className="util-track" role="img" aria-label={`Utilization ${utilization}% of sanctioned strength`}>
                <div className="util-fill" style={{ width: `${Math.min(100, utilization)}%`, background: utilization >= 85 ? '#188038' : utilization >= 60 ? '#f9ab00' : '#d93025' }} />
              </div>
              <span className="small dim">
                {utilization}% of {report.sanctioned.toLocaleString()} sanctioned seats filled
                (where sanctioned strength is recorded)
              </span>
            </div>
          )}
        </section>

        {/* Disciplines — click one to list its facilities */}
        <section>
          <h4>Disciplines <span className="dim">({report.disciplineList.length} offered — click to see facilities)</span></h4>
          <div className="disc-grid">
            {report.disciplineList.map(([name, count]) => (
              <button
                key={name}
                className={`disc-chip${selectedDiscipline === name ? ' active' : ''}`}
                aria-pressed={selectedDiscipline === name}
                onClick={() => setSelectedDiscipline(prev => (prev === name ? null : name))}
              >
                <span aria-hidden="true">{getDisciplineIcon(name)}</span>
                <span className="disc-name">{name}</span>
                <span className="disc-count">{count}</span>
              </button>
            ))}
          </div>

          {selectedDiscipline && (
            <div className="disc-facilities">
              <div className="small dim disc-facilities-head">
                {disciplineFacilities.length} facilit{disciplineFacilities.length === 1 ? 'y' : 'ies'} offer{disciplineFacilities.length === 1 ? 's' : ''} {selectedDiscipline}
                {(report.traineesPerDiscipline[selectedDiscipline] || 0) > 0 &&
                  <> • {report.traineesPerDiscipline[selectedDiscipline].toLocaleString()} trainees</>}
              </div>
              {disciplineFacilities.map(({ loc, trainees }) => {
                const cat = classifyFacility(loc.Facility_Type);
                return (
                  <button key={loc.id} className="facility-row" onClick={() => onPickFacility(loc)}>
                    <span className="facility-acronym" style={{ background: FACILITY_CONFIG[cat].color }}>
                      {FACILITY_CONFIG[cat].acronym}
                    </span>
                    <span className="facility-name">{loc.Facility_Name}</span>
                    {trainees > 0 && <span className="rc-value">{trainees.toLocaleString()}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* KISCE funds */}
        <section>
          <h4>KISCE Funds</h4>
          {report.fundRows === 0 ? (
            <p className="dim small">No KISCE fund records for this state.</p>
          ) : (
            <>
              <div className="report-big">{formatINR(report.totalFunds)}</div>
              <div className="small dim" style={{ marginBottom: 8 }}>{report.fundRows} releases</div>
              {report.fundsByFY.map(([fy, amount]) => (
                <div key={fy} className="fy-row">
                  <span className="fy-label">{fy}</span>
                  <div className="fy-track">
                    <div className="fy-fill" style={{ width: `${(amount / maxFY) * 100}%` }} />
                  </div>
                  <span className="fy-amount">{formatINR(amount)}</span>
                </div>
              ))}
            </>
          )}
        </section>

        {/* KISCE staffing */}
        <section>
          <h4>KISCE Staffing</h4>
          {report.manSanctioned === 0 ? (
            <p className="dim small">No KISCE manpower records for this state.</p>
          ) : (
            <>
              <div className="staff-row">
                <div><div className="report-mid">{report.manCurrent}</div><div className="small dim">in post</div></div>
                <div><div className="report-mid">{report.manSanctioned}</div><div className="small dim">sanctioned</div></div>
                <div><div className="report-mid" style={{ color: report.vacancies > 0 ? '#d93025' : '#188038' }}>{report.vacancies}</div><div className="small dim">vacant</div></div>
              </div>
              {staffedPct !== null && (
                <div className="util-track" role="img" aria-label={`${staffedPct}% of sanctioned posts filled`}>
                  <div className="util-fill" style={{ width: `${Math.min(100, staffedPct)}%`, background: staffedPct >= 85 ? '#188038' : staffedPct >= 60 ? '#f9ab00' : '#d93025' }} />
                </div>
              )}
            </>
          )}
        </section>

        {/* Top facilities */}
        <section>
          <h4>Top Facilities <span className="dim">(by trainees)</span></h4>
          {report.topFacilities.map(loc => {
            const cat = classifyFacility(loc.Facility_Type);
            return (
              <button key={loc.id} className="facility-row" onClick={() => onPickFacility(loc)}>
                <span className="facility-acronym" style={{ background: FACILITY_CONFIG[cat].color }}>
                  {FACILITY_CONFIG[cat].acronym}
                </span>
                <span className="facility-name">{loc.Facility_Name}</span>
                <span className="rc-value">{(loc.Total_Trainees || 0).toLocaleString()}</span>
              </button>
            );
          })}
        </section>
      </div>
    </aside>
  );
}
