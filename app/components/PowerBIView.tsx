import { useState } from 'react';

const PBI_URL =
  'https://app.powerbi.com/view?r=eyJrIjoiODJlMjUzZjctNmRjNC00MGFkLTlkYmEtNjk0NGU2NDNmNzE0IiwidCI6IjNhMzY0ZGI2LTg2NmEtNDRkOS1iMzY5LWM1ODk1OWQ0NDhmOCJ9';

export function PowerBIView() {
  const [maximized, setMaximized] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3 flex-shrink-0"
        style={{ background: '#080F1F', borderBottom: '1px solid #1E3050' }}
      >
        <div>
          <h2 className="text-sm font-semibold text-white">Power BI — Dashboard COMAE</h2>
          <p className="text-[10px] text-slate-500 mt-0.5">Visualização gerencial integrada</p>
        </div>
        <button
          onClick={() => setMaximized(m => !m)}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 transition-all cursor-pointer"
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            {maximized
              ? <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
              : <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
            }
          </svg>
          {maximized ? 'Restaurar' : 'Maximizar'}
        </button>
      </div>

      {/* iframe normal */}
      {!maximized && (
        <div className="flex-1 relative">
          <iframe
            src={PBI_URL}
            title="Dashboard COMAE — Power BI"
            className="absolute inset-0 w-full h-full border-0"
            allowFullScreen
            loading="lazy"
          />
        </div>
      )}

      {/* iframe maximizado — fullscreen overlay */}
      {maximized && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#0C1526' }}>
          <div
            className="flex items-center justify-between px-5 py-2 flex-shrink-0"
            style={{ background: '#080F1F', borderBottom: '1px solid #1E3050' }}
          >
            <span className="text-sm font-semibold text-white">Dashboard COMAE — Power BI</span>
            <button
              onClick={() => setMaximized(false)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 transition-all cursor-pointer"
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
              </svg>
              Restaurar
            </button>
          </div>
          <iframe
            src={PBI_URL}
            title="Dashboard COMAE — Power BI"
            className="flex-1 w-full border-0"
            allowFullScreen
            loading="lazy"
          />
        </div>
      )}
    </div>
  );
}
