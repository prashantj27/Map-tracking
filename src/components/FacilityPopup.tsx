import { useState } from 'react';
import { db, type Location } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { classifyFacility, FACILITY_CONFIG } from '../lib/facilityTypes';
import { getDisciplineIcon } from '../lib/disciplineIcons';

type TabId = 'Overview' | 'Disciplines' | 'Admin';

export function FacilityPopupContent({ loc }: { loc: Location }) {
  const [activeTab, setActiveTab] = useState<TabId>('Overview');

  const disciplines = useLiveQuery(
    () => db.disciplines.where('Facility_ID').equals(loc.Facility_ID).toArray(),
    [loc.Facility_ID]
  ) || [];
  const funds = useLiveQuery(
    () => db.funds.where('Facility_ID').equals(loc.Facility_ID).toArray(),
    [loc.Facility_ID]
  ) || [];
  const manpower = useLiveQuery(
    () => db.manpower.where('Facility_ID').equals(loc.Facility_ID).toArray(),
    [loc.Facility_ID]
  ) || [];

  const hasDisciplines = disciplines.length > 0;
  const hasAdmin = funds.length > 0 || manpower.length > 0;
  const accent = FACILITY_CONFIG[classifyFacility(loc.Facility_Type)].color;

  const tab = (id: TabId, label: string) => (
    <button
      className={`popup-tab${activeTab === id ? ' active' : ''}`}
      role="tab"
      aria-selected={activeTab === id}
      onClick={() => setActiveTab(id)}
    >
      {label}
    </button>
  );

  return (
    <div className="facility-popup">
      <h3 style={{ color: accent }}>{loc.Facility_Name}</h3>
      <p className="popup-type" style={{ color: accent }}>{loc.Facility_Type}</p>

      <div className="popup-tabs" role="tablist">
        {tab('Overview', 'Overview')}
        {hasDisciplines && tab('Disciplines', 'Disciplines')}
        {hasAdmin && tab('Admin', 'Funds & Staff')}
      </div>

      {activeTab === 'Overview' && (
        <div role="tabpanel">
          <div className="popup-block">
            <strong className="muted"><span aria-hidden="true">📍 </span>Address:</strong><br />
            {loc.Address}{loc.Address ? <br /> : null}
            {[loc.City, loc.District, loc.State].filter(Boolean).join(', ')}
          </div>
          {(loc.Total_Trainees ?? 0) > 0 && (
            <div className="popup-card">
              <strong className="muted"><span aria-hidden="true">👥 </span>Trainees:</strong>{' '}
              <span className="strong">{loc.Total_Trainees}</span>
              <span className="dim"> (M: {loc.Trainees_Male || 0} / F: {loc.Trainees_Female || 0})</span>
            </div>
          )}
          {loc.Incharge_Contact_Person && (
            <div className="popup-card contact">
              <strong><span aria-hidden="true">📞 </span>Contact In-Charge:</strong><br />
              {loc.Incharge_Contact_Person}
            </div>
          )}
        </div>
      )}

      {activeTab === 'Disciplines' && hasDisciplines && (
        <div className="popup-scroll" role="tabpanel">
          <table className="popup-table">
            <thead>
              <tr>
                <th>Discipline</th>
                <th>M</th>
                <th>F</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {disciplines.map((d, i) => (
                <tr key={i}>
                  <td className="strong-500">
                    <span aria-hidden="true">{getDisciplineIcon(d.Discipline)} </span>
                    {d.Discipline}
                  </td>
                  <td>{d.Trainees_Male || 0}</td>
                  <td>{d.Trainees_Female || 0}</td>
                  <td className="strong">{d.Total_Trainees || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'Admin' && hasAdmin && (
        <div className="popup-scroll popup-admin" role="tabpanel">
          {funds.length > 0 && (
            <div>
              <strong className="muted block"><span aria-hidden="true">💰 </span>Funds Released</strong>
              {funds.map((f, i) => (
                <div key={i} className="fund-card">
                  <div className="fund-amount">₹{(f['Funds Released (Rs)'] || 0).toLocaleString('en-IN')}</div>
                  <div className="dim small">{f['Financial Year']} • {f['Head']}</div>
                  <div className="small">{f['UC Status']}</div>
                </div>
              ))}
            </div>
          )}
          {manpower.length > 0 && (
            <div>
              <strong className="muted block"><span aria-hidden="true">🧑‍💼 </span>Manpower Status</strong>
              {manpower.map((m, i) => (
                <div key={i} className="manpower-card">
                  <div className="manpower-role">{m.Designation}</div>
                  <div className="dim small">
                    Sanctioned: {m['Sanctioned Strength'] || 0} | Current: {m['Current Strength'] || 0}
                  </div>
                  <div className={`small strong-500 ${m.Status === 'Vacant' ? 'status-vacant' : 'status-filled'}`}>
                    Status: {m.Status}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
