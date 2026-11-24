// client/src/components/Navbar.jsx
import React from 'react';
import { 
  Factory, 
  RefreshCw, 
  Layers,
  LogOut,
  ShieldAlert,
  ChevronDown
} from 'lucide-react';

export default function Navbar({ currentUser, roles, onRoleChange, onLogout, isRefreshing, onRefresh }) {
  return (
    <header className="bg-slate-900 text-slate-100 border-b border-slate-800 sticky top-0 z-30 shadow-xs h-13">
      <div className="max-w-7xl mx-auto px-3 sm:px-5 h-full flex items-center justify-between">
        
        {/* Brand / Logo */}
        <div className="flex items-center space-x-2.5">
          <div className="h-7 w-7 rounded-md bg-sky-600 flex items-center justify-center text-white shadow-xs">
            <Factory className="h-4 w-4" />
          </div>
          <div className="flex items-center space-x-2">
            <span className="font-bold text-sm tracking-tight text-white">
              ForgeFlow
            </span>
            <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
              ERP POC
            </span>
          </div>
        </div>

        {/* Action Controls & Role Switcher */}
        <div className="flex items-center space-x-2.5">
          
          {/* Refresh Data button */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh Data"
            className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-sky-400' : ''}`} />
          </button>

          {/* Interactive Persona Switcher for Access Testing */}
          <div className="flex items-center space-x-1.5 bg-slate-800 border border-slate-700 rounded-md px-2 py-1 shadow-xs">
            <Layers className="h-3.5 w-3.5 text-sky-400" />
            <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">Role:</span>
            <select
              value={currentUser?.role_id || 1}
              onChange={(e) => onRoleChange(Number(e.target.value))}
              className="bg-transparent text-xs font-semibold text-white focus:outline-none cursor-pointer pr-1"
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id} className="bg-slate-900 text-white">
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* User Profile Badge */}
          <div className="flex items-center space-x-2 pl-2 border-l border-slate-800">
            <div className="h-6 w-6 rounded-md bg-sky-600/30 border border-sky-500/40 flex items-center justify-center text-sky-300 font-semibold text-[11px]">
              {currentUser?.name?.charAt(0) || 'U'}
            </div>
            <div className="hidden md:block text-left leading-none">
              <p className="text-xs font-semibold text-slate-200">
                {currentUser?.name?.split(' ')[0] || 'User'}
              </p>
              <p className="text-[10px] text-sky-400 font-medium mt-0.5">
                {currentUser?.role_name}
              </p>
            </div>
          </div>

          {/* Logout / Session activity logger button */}
          <button
            onClick={onLogout}
            title="Log Out & Record Session Logout"
            className="p-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>

        </div>

      </div>
    </header>
  );
}
