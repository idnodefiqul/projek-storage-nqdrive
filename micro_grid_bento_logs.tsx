import React, { useState, useMemo, useEffect } from 'react';
import { 
  FileText, 
  FileArchive, 
  FileCode, 
  Image as ImageIcon, 
  Monitor, 
  ChevronLeft, 
  ChevronRight,
  Inbox
} from 'lucide-react';

// Type definitions
type LogStatus = 'Sukses' | 'Gagal';
type ActivityType = 'upload' | 'download';

interface LogEntry {
  id: string;
  filename: string;
  size: string;
  duration: string;
  status: LogStatus;
  timestamp: string;
  type: ActivityType;
}

// Generate mock data: 15 uploads (to trigger pagination > 12) and 0 downloads
const mockLogs: LogEntry[] = [
  { id: '1', filename: 'DESIGN.md', size: '4.99 KB', duration: '0.0s', status: 'Sukses', timestamp: '18/7/2026, 10.13.46', type: 'upload' },
  { id: '2', filename: 'src.zip', size: '154.93 KB', duration: '0.0s', status: 'Sukses', timestamp: '18/7/2026, 08.59.08', type: 'upload' },
  { id: '3', filename: 'file_manager_ui.html', size: '20.26 KB', duration: '0.0s', status: 'Sukses', timestamp: '17/7/2026, 21.26.55', type: 'upload' },
  { id: '4', filename: 'storage_analytics_bento.html', size: '28.48 KB', duration: '0.0s', status: 'Sukses', timestamp: '17/7/2026, 21.07.04', type: 'upload' },
  { id: '5', filename: 'windows.gz', size: '44.48 KB', duration: '0.0s', status: 'Sukses', timestamp: '17/7/2026, 20.52.35', type: 'upload' },
  { id: '6', filename: '1725103249_monster-legends.jpg', size: '13.62 KB', duration: '0.0s', status: 'Sukses', timestamp: '17/7/2026, 20.42.37', type: 'upload' },
  { id: '7', filename: '5ed7891c2251387941d4.png', size: '566.00 B', duration: '0.0s', status: 'Sukses', timestamp: '17/7/2026, 20.35.44', type: 'upload' },
  { id: '8', filename: 'api_routes.ts', size: '2.1 KB', duration: '0.1s', status: 'Sukses', timestamp: '17/7/2026, 19.15.22', type: 'upload' },
  { id: '9', filename: 'database_dump.sql', size: '12.5 MB', duration: '2.4s', status: 'Sukses', timestamp: '17/7/2026, 18.30.00', type: 'upload' },
  { id: '10', filename: 'user_avatars.zip', size: '45.2 MB', duration: '5.1s', status: 'Sukses', timestamp: '17/7/2026, 17.45.10', type: 'upload' },
  { id: '11', filename: 'styles.css', size: '14.2 KB', duration: '0.0s', status: 'Sukses', timestamp: '17/7/2026, 16.20.05', type: 'upload' },
  { id: '12', filename: 'app_config.json', size: '1.2 KB', duration: '0.0s', status: 'Sukses', timestamp: '17/7/2026, 15.10.33', type: 'upload' },
  { id: '13', filename: 'error_log_01.txt', size: '8.5 KB', duration: '0.0s', status: 'Sukses', timestamp: '17/7/2026, 14.05.12', type: 'upload' },
  { id: '14', filename: 'presentation.pdf', size: '2.4 MB', duration: '0.8s', status: 'Sukses', timestamp: '17/7/2026, 12.30.45', type: 'upload' },
  { id: '15', filename: 'build_v1.0.tar.gz', size: '120.5 MB', duration: '12.5s', status: 'Gagal', timestamp: '17/7/2026, 11.15.20', type: 'upload' },
];

const ITEMS_PER_PAGE = 12;

const getFileIcon = (filename: string) => {
  const extension = filename.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'zip':
    case 'gz':
    case 'tar':
      return <FileArchive className="w-6 h-6 text-purple-500" strokeWidth={1.5} />;
    case 'html':
    case 'css':
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'json':
      return <FileCode className="w-6 h-6 text-orange-500" strokeWidth={1.5} />;
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'svg':
    case 'gif':
      return <ImageIcon className="w-6 h-6 text-teal-500" strokeWidth={1.5} />;
    case 'md':
    case 'txt':
    case 'pdf':
      return <FileText className="w-6 h-6 text-blue-500" strokeWidth={1.5} />;
    case 'sql':
      return <Monitor className="w-6 h-6 text-rose-500" strokeWidth={1.5} />;
    default:
      return <FileText className="w-6 h-6 text-slate-500" strokeWidth={1.5} />;
  }
};

export default function App() {
  const [activeType, setActiveType] = useState<ActivityType>('upload');
  const [statusFilter, setStatusFilter] = useState<string>('Semua Status');
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Reset page to 1 when changing tabs or filters
  useEffect(() => {
    setCurrentPage(1);
  }, [activeType, statusFilter]);

  // Filter logic
  const filteredLogs = useMemo(() => {
    return mockLogs.filter(log => {
      const typeMatch = log.type === activeType;
      const statusMatch = statusFilter === 'Semua Status' || log.status === statusFilter;
      return typeMatch && statusMatch;
    });
  }, [activeType, statusFilter]);

  // Pagination logic
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / ITEMS_PER_PAGE));
  const currentLogs = filteredLogs.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 md:p-8 font-sans flex flex-col">
      <div className="max-w-7xl mx-auto w-full flex-grow flex flex-col">
        
        {/* Header Bento Box */}
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm mb-6 flex flex-col xl:flex-row xl:items-center justify-between gap-6 border border-slate-100 flex-shrink-0">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-1">System Logs</h1>
            <p className="text-slate-500 text-sm">Riwayat aktivitas upload dan download real-time.</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Upload/Download Toggles */}
            <div className="flex bg-slate-100 rounded-xl p-1">
              <button 
                onClick={() => setActiveType('upload')}
                className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  activeType === 'upload' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Upload
              </button>
              <button 
                onClick={() => setActiveType('download')}
                className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  activeType === 'download' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Download
              </button>
            </div>
            
            {/* Status Filter */}
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white border border-slate-200 text-slate-700 py-3 px-5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm cursor-pointer"
            >
              <option value="Semua Status">Semua Status</option>
              <option value="Sukses">Sukses</option>
              <option value="Gagal">Gagal</option>
            </select>
            
            {/* Counter */}
            <div className="bg-blue-50 border border-blue-100 text-blue-700 font-bold py-3 px-5 rounded-xl text-sm shadow-sm">
              Total: {filteredLogs.length}
            </div>
          </div>
        </div>

        {/* Main Content Area (Expands to push pagination to bottom) */}
        <div className="flex-grow flex flex-col">
          {filteredLogs.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
              {currentLogs.map((log) => (
                <div key={log.id} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col gap-4 hover:shadow-md transition-shadow relative overflow-hidden group h-[160px]">
                  {/* Decorative background blob */}
                  <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50 rounded-bl-full -mr-8 -mt-8 opacity-50 group-hover:scale-110 transition-transform"></div>
                  
                  <div className="flex justify-between items-start relative z-10">
                    {/* Pure Icon - No background container */}
                    <div className="pt-1">
                        {getFileIcon(log.filename)}
                    </div>
                    
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${
                        log.status === 'Sukses' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {log.status}
                    </span>
                  </div>
                  
                  <div className="relative z-10">
                    <h3 className="font-semibold text-slate-900 truncate" title={log.filename}>
                        {log.filename}
                    </h3>
                    <div className="text-slate-400 text-xs mt-1 font-medium">
                        {log.size} &bull; {log.duration}
                    </div>
                  </div>
                  
                  <div className="text-xs font-medium text-slate-400 mt-auto pt-3 border-t border-slate-50 relative z-10">
                      {log.timestamp}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Empty State for Download / No results */
            <div className="flex-grow flex flex-col items-center justify-center bg-white rounded-3xl border border-slate-100 shadow-sm border-dashed mb-6 p-8 text-center min-h-[400px]">
                <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-2xl flex items-center justify-center mb-4">
                    <Inbox className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-1">Belum ada log {activeType}</h3>
                <p className="text-slate-500 text-sm max-w-sm">
                    Saat ini tidak ada aktivitas {activeType} yang terekam dengan filter yang Anda pilih.
                </p>
            </div>
          )}
        </div>

        {/* Pagination Box - Kept firmly at the bottom of the container */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between flex-shrink-0">
            <span className="text-sm text-slate-500 font-medium pl-2 hidden sm:block">
                Halaman <span className="text-slate-900 font-bold">{currentPage}</span> dari <span className="text-slate-900 font-bold">{totalPages}</span>
            </span>
            
            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="flex items-center gap-1 px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    <ChevronLeft className="w-4 h-4" />
                    Sebelumnya
                </button>
                
                {/* Mobile page indicator */}
                <span className="text-sm text-slate-500 font-medium sm:hidden">
                   {currentPage} / {totalPages}
                </span>

                <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="flex items-center gap-1 px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    Selanjutnya
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>

      </div>
    </div>
  );
}