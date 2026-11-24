// client/src/components/PipelineTracker.jsx
import React from 'react';
import {
  UserPlus,
  ThumbsUp,
  FileSpreadsheet,
  FileCheck2,
  Receipt,
  Search,
  ShoppingCart,
  Cog,
  CheckCircle2,
  Truck,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { canAccessTab } from '../utils/rbac';

export default function PipelineTracker({ currentUser, activeTab, onSelectStage }) {
  const allStages = [
    { id: 'leads', step: '1', title: 'Lead Inward', icon: UserPlus },
    { id: 'leads', step: '2', title: 'Lead Review', icon: ThumbsUp },
    { id: 'quotations', step: '3', title: 'Quotations', icon: FileSpreadsheet },
    { id: 'purchase_orders', step: '4', title: 'Customer PO', icon: FileCheck2 },
    { id: 'payments', step: '5', title: 'Advance Pay', icon: Receipt },
    { id: 'mrp', step: '7a', title: 'BOM Check', icon: Search },
    { id: 'mrp', step: '7b', title: 'Procure Stock', icon: ShoppingCart },
    { id: 'manufacturing', step: '8', title: '5-Level Mfg', icon: Cog },
    { id: 'qc', step: '9', title: 'Stage QC', icon: CheckCircle2 },
    { id: 'dispatch', step: '10', title: 'Dispatch', icon: Truck },
    { id: 'customer_portal', step: '11', title: 'Client QC & RMA', icon: RotateCcw },
    { id: 'payments', step: '12', title: 'Final Pay', icon: Sparkles },
  ];

  // Filter stages according to user permissions!
  const accessibleStages = allStages.filter(st => canAccessTab(currentUser, st.id));

  if (accessibleStages.length === 0) return null;

  return (
    <div className="bg-white rounded-lg p-2.5 shadow-xs border border-slate-200/90 mb-4">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-900"></span>
          <h2 className="text-xs font-semibold text-slate-800 tracking-tight">
            Lifecycle Workflow Pipeline
          </h2>
          <span className="text-[10px] text-slate-400 font-medium">
            ({accessibleStages.length} authorized step{accessibleStages.length === 1 ? '' : 's'})
          </span>
        </div>
      </div>

      {/* Horizontal Compact Stepper (ShadCN style) */}
      <div className="overflow-x-auto pb-1 scrollbar-thin">
        <div className="flex items-center space-x-1.5 min-w-max">
          {accessibleStages.map((st, i) => {
            const Icon = st.icon;
            const isCurrent = activeTab === st.id;
            return (
              <React.Fragment key={i}>
                <button
                  onClick={() => onSelectStage(st.id)}
                  className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md border text-left transition-colors text-xs ${
                    isCurrent
                      ? 'bg-slate-900 border-slate-900 text-white font-medium shadow-xs'
                      : 'bg-slate-50/70 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`h-3 w-3 ${isCurrent ? 'text-sky-400' : 'text-slate-500'}`} />
                  <span className="text-[10px] uppercase font-bold tracking-wider opacity-70">
                    {st.step}.
                  </span>
                  <span className="font-medium text-xs leading-none">
                    {st.title}
                  </span>
                </button>

                {i < accessibleStages.length - 1 && (
                  <div className="h-px w-2 bg-slate-300 flex-shrink-0" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
