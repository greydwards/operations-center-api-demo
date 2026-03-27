'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { fetchStoredOperations } from '@/lib/john-deere-client';
import { Button } from '@/components/ui/button';
import { Loader2, Wheat, RefreshCw, Calendar, Droplets } from 'lucide-react';
import type { StoredFieldOperation } from '@/types/john-deere';

export function HarvestOperations() {
  const { johnDeereConnection } = useAuth();
  const [operations, setOperations] = useState<StoredFieldOperation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (johnDeereConnection?.selected_org_id) {
      loadOperations();
    }
  }, [johnDeereConnection?.selected_org_id]);

  const loadOperations = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchStoredOperations(undefined, 'harvest');
      setOperations(data.operations || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load harvest operations');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Unknown date';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  // Group by field
  const fieldGroups = operations.reduce((acc, op) => {
    const key = op.jd_field_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(op);
    return acc;
  }, {} as Record<string, StoredFieldOperation[]>);

  const fieldEntries = Object.entries(fieldGroups);
  const totalOperations = operations.length;

  if (!johnDeereConnection?.selected_org_id) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="text-center py-8">
          <Wheat className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Select an organization to view harvest operations</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
            <Wheat className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Harvest Operations</h3>
            <p className="text-sm text-slate-500">
              {totalOperations} operations across {fieldEntries.length} fields
            </p>
          </div>
        </div>
        <Button onClick={loadOperations} variant="outline" size="sm" disabled={isLoading}>
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
      </div>

      {isLoading && operations.length === 0 ? (
        <div className="p-8 text-center">
          <Loader2 className="w-8 h-8 text-amber-600 animate-spin mx-auto mb-3" />
          <p className="text-slate-500">Loading harvest operations...</p>
        </div>
      ) : error ? (
        <div className="p-6">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        </div>
      ) : totalOperations === 0 ? (
        <div className="p-8 text-center">
          <Wheat className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No harvest operations found. Import fields to sync operations.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {fieldEntries.map(([fieldId, ops]) => (
            <div key={fieldId} className="px-6 py-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="font-medium text-slate-900">{fieldId}</span>
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                  {ops.length} operation{ops.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-3">
                {ops.map((op) => (
                  <div key={op.id} className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      {op.crop_name && (
                        <div className="flex items-center gap-1.5">
                          <Wheat className="w-4 h-4 text-amber-600" />
                          <span className="text-slate-700">{op.crop_name}</span>
                        </div>
                      )}
                      {op.crop_season && (
                        <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded">
                          {op.crop_season}
                        </span>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-blue-600" />
                        <span className="text-slate-700">{formatDate(op.start_date)}</span>
                      </div>
                      {op.avg_moisture != null && (
                        <div className="flex items-center gap-1.5">
                          <Droplets className="w-4 h-4 text-cyan-600" />
                          <span className="text-slate-700">{op.avg_moisture.toFixed(1)}% moisture</span>
                        </div>
                      )}
                      {op.avg_yield_value != null && (
                        <span className="text-slate-700 font-medium">
                          Avg yield: {op.avg_yield_value.toLocaleString(undefined, { maximumFractionDigits: 2 })} {op.avg_yield_unit || ''}
                        </span>
                      )}
                      {op.area_value != null && (
                        <span className="text-slate-500">
                          {op.area_value.toLocaleString(undefined, { maximumFractionDigits: 1 })} {op.area_unit || ''}
                        </span>
                      )}
                    </div>
                    {op.variety_name && op.variety_name !== '---' && (
                      <p className="text-xs text-slate-500 mt-2">Variety: {op.variety_name}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
