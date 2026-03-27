'use client';

import { useState } from 'react';
import { fetchIrrigationAnalysis, pollForShapefileUrl, fetchStoredOperations } from '@/lib/john-deere-client';
import { supabase } from '@/lib/supabase';
import { processShapefile, classifyHarvestPolygons, classifySeedingPolygons, type HarvestZoneStats, type SeedingZoneStats } from '@/lib/shapefile-analysis';
import { Button } from '@/components/ui/button';
import { Loader as Loader2, Droplets, Wheat, Sprout } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { convertArea } from '@/lib/area-utils';
import type { StoredField, IrrigationAnalysis as IrrigationAnalysisType } from '@/types/john-deere';

interface Props {
  fields: StoredField[];
  preferredUnit: string;
}

const COLORS = {
  irrigated: '#10b981',
  dryland: '#f59e0b',
};

function formatAcres(acres: number, preferredUnit: string): string {
  if (preferredUnit === 'ha') {
    return convertArea(acres, 'ac', 'ha').toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' ha';
  }
  return acres.toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' ac';
}

type OpEntry = { id: string; startDate?: string; crop?: { name: string }; fieldName: string };

// --- Reusable analysis section for a single operation type ---

function OperationSection({
  title,
  icon,
  accentColor,
  ops,
  opsLoading,
  analysis,
  preferredUnit,
  onRun,
}: {
  title: string;
  icon: React.ReactNode;
  accentColor: string;
  ops: OpEntry[];
  opsLoading: boolean;
  analysis: IrrigationAnalysisType | null;
  preferredUnit: string;
  onRun: (operationId: string) => Promise<void>;
}) {
  const [selectedOpId, setSelectedOpId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressStatus, setProgressStatus] = useState('');
  const [pollAttempt, setPollAttempt] = useState(0);
  const [result, setResult] = useState<HarvestZoneStats | SeedingZoneStats | null>(null);

  const handleRun = async () => {
    if (!selectedOpId || !analysis) return;
    setIsLoading(true);
    setError(null);
    setResult(null);
    setPollAttempt(0);
    setProgressStatus('');

    try {
      setProgressStatus('Waiting for John Deere to generate shapefile...');
      const storagePath = await pollForShapefileUrl(
        selectedOpId,
        (attempt) => setPollAttempt(attempt),
      );

      setProgressStatus('Downloading shapefile from storage...');
      const { data: blob, error: downloadError } = await supabase.storage
        .from('shapefiles')
        .download(storagePath);

      if (downloadError || !blob) {
        throw new Error(`Failed to download shapefile: ${downloadError?.message || 'No data'}`);
      }
      const zipBuffer = await blob.arrayBuffer();

      setProgressStatus(`Parsing shapefile (${(zipBuffer.byteLength / 1024 / 1024).toFixed(1)} MB)...`);
      const geojson = await processShapefile(zipBuffer);

      const interiorRings = (analysis.interiorRingsGeoJSON || []) as Array<{ type: 'Polygon'; coordinates: number[][][] }>;
      setProgressStatus(`Analyzing ${geojson.features.length.toLocaleString()} polygons...`);

      if (title.toLowerCase().includes('seeding') || title.toLowerCase().includes('planting')) {
        setResult(classifySeedingPolygons(geojson, interiorRings, analysis.irrigated));
      } else {
        setResult(classifyHarvestPolygons(geojson, interiorRings, analysis.irrigated));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsLoading(false);
      setProgressStatus('');
    }
  };

  const isHarvest = !title.toLowerCase().includes('seeding') && !title.toLowerCase().includes('planting');

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
        {icon}
        {title}
      </h3>

      <div className="flex items-end gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Select Operation
          </label>
          {opsLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </div>
          ) : ops.length === 0 ? (
            <p className="text-sm text-slate-500 py-2">No operations found for this field.</p>
          ) : (
            <select
              value={selectedOpId}
              onChange={(e) => { setSelectedOpId(e.target.value); setResult(null); }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Choose an operation...</option>
              {ops.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.crop?.name || 'Unknown crop'} — {op.startDate ? new Date(op.startDate).toLocaleDateString() : 'Unknown date'}
                </option>
              ))}
            </select>
          )}
        </div>

        <Button
          onClick={handleRun}
          disabled={!selectedOpId || isLoading}
          className={`${accentColor} text-white`}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            'Run Analysis'
          )}
        </Button>
      </div>

      {isLoading && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{progressStatus || 'Starting...'}</span>
          </div>
          {pollAttempt > 1 && (
            <p className="mt-1 text-xs text-blue-600">
              Poll attempt {pollAttempt} — large operations can take a minute or two.
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {result && isHarvest && (() => {
        const r = result as HarvestZoneStats;
        const pieData = [
          { name: 'Irrigated', value: r.irrigatedHarvestedAcres, color: COLORS.irrigated },
          { name: 'Dryland', value: r.drylandHarvestedAcres, color: COLORS.dryland },
        ].filter(d => d.value > 0);

        return (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {pieData.length > 0 && (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={75} paddingAngle={2} dataKey="value"
                      label={({ value }) => formatAcres(value, preferredUnit)}>
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatAcres(value, preferredUnit)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 rounded-lg p-3">
                  <p className="text-xs text-emerald-700 font-medium">Irrigated Harvested</p>
                  <p className="text-lg font-bold text-emerald-900">{formatAcres(r.irrigatedHarvestedAcres, preferredUnit)}</p>
                  {r.irrigatedTotalBushels > 0 && <p className="text-xs text-emerald-600 font-medium">Total: {r.irrigatedTotalBushels.toLocaleString(undefined, { maximumFractionDigits: 0 })} bu</p>}
                  {r.irrigatedAvgYield != null && <p className="text-xs text-emerald-600">Avg yield: {r.irrigatedAvgYield.toLocaleString(undefined, { maximumFractionDigits: 1 })} bu/ac</p>}
                  {r.irrigatedAvgMoisture != null && <p className="text-xs text-emerald-600">Avg moisture: {r.irrigatedAvgMoisture.toFixed(1)}%</p>}
                </div>
                <div className="bg-amber-50 rounded-lg p-3">
                  <p className="text-xs text-amber-700 font-medium">Dryland Harvested</p>
                  <p className="text-lg font-bold text-amber-900">{formatAcres(r.drylandHarvestedAcres, preferredUnit)}</p>
                  {r.drylandTotalBushels > 0 && <p className="text-xs text-amber-600 font-medium">Total: {r.drylandTotalBushels.toLocaleString(undefined, { maximumFractionDigits: 0 })} bu</p>}
                  {r.drylandAvgYield != null && <p className="text-xs text-amber-600">Avg yield: {r.drylandAvgYield.toLocaleString(undefined, { maximumFractionDigits: 1 })} bu/ac</p>}
                  {r.drylandAvgMoisture != null && <p className="text-xs text-amber-600">Avg moisture: {r.drylandAvgMoisture.toFixed(1)}%</p>}
                </div>
              </div>
              <p className="text-xs text-slate-500">Analyzed {r.harvestPolygonCount.toLocaleString()} harvest polygons</p>
            </div>
          </div>
        );
      })()}

      {result && !isHarvest && (() => {
        const r = result as SeedingZoneStats;
        const pieData = [
          { name: 'Irrigated', value: r.irrigatedSeededAcres, color: COLORS.irrigated },
          { name: 'Dryland', value: r.drylandSeededAcres, color: COLORS.dryland },
        ].filter(d => d.value > 0);

        return (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {pieData.length > 0 && (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={75} paddingAngle={2} dataKey="value"
                      label={({ value }) => formatAcres(value, preferredUnit)}>
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatAcres(value, preferredUnit)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 rounded-lg p-3">
                  <p className="text-xs text-emerald-700 font-medium">Irrigated Seeded</p>
                  <p className="text-lg font-bold text-emerald-900">{formatAcres(r.irrigatedSeededAcres, preferredUnit)}</p>
                  {r.irrigatedAvgSeedingRate != null && <p className="text-xs text-emerald-600">Avg rate: {r.irrigatedAvgSeedingRate.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>}
                  {r.irrigatedAvgControlRate != null && <p className="text-xs text-emerald-600">Rx rate: {r.irrigatedAvgControlRate.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>}
                </div>
                <div className="bg-amber-50 rounded-lg p-3">
                  <p className="text-xs text-amber-700 font-medium">Dryland Seeded</p>
                  <p className="text-lg font-bold text-amber-900">{formatAcres(r.drylandSeededAcres, preferredUnit)}</p>
                  {r.drylandAvgSeedingRate != null && <p className="text-xs text-amber-600">Avg rate: {r.drylandAvgSeedingRate.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>}
                  {r.drylandAvgControlRate != null && <p className="text-xs text-amber-600">Rx rate: {r.drylandAvgControlRate.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>}
                </div>
              </div>
              <p className="text-xs text-slate-500">Analyzed {r.seedingPolygonCount.toLocaleString()} seeding polygons</p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// --- Main component ---

export function IrrigationAnalysis({ fields, preferredUnit }: Props) {
  const [selectedFieldId, setSelectedFieldId] = useState<string>('');
  const [analysis, setAnalysis] = useState<IrrigationAnalysisType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [harvestOps, setHarvestOps] = useState<OpEntry[]>([]);
  const [seedingOps, setSeedingOps] = useState<OpEntry[]>([]);
  const [opsLoading, setOpsLoading] = useState(false);

  const fieldsWithBoundary = fields.filter(f => f.active_boundary && f.boundary_geojson);

  const handleAnalyze = async () => {
    if (!selectedFieldId) return;
    setIsLoading(true);
    setError(null);
    setAnalysis(null);
    setHarvestOps([]);
    setSeedingOps([]);

    try {
      const result = await fetchIrrigationAnalysis(selectedFieldId);
      setAnalysis(result);

      setOpsLoading(true);
      try {
        const [harvestData, seedingData] = await Promise.all([
          fetchStoredOperations(selectedFieldId, 'harvest').catch(() => ({ operations: [] })),
          fetchStoredOperations(selectedFieldId, 'seeding').catch(() => ({ operations: [] })),
        ]);

        const toOpEntry = (ops: Array<{ jd_operation_id: string; start_date?: string | null; crop_name?: string | null }>) =>
          ops.map((op) => ({
            id: op.jd_operation_id,
            startDate: op.start_date || undefined,
            crop: op.crop_name ? { name: op.crop_name } : undefined,
            fieldName: '',
          }));

        setHarvestOps(toOpEntry(harvestData.operations || []));
        setSeedingOps(toOpEntry(seedingData.operations || []));
      } catch (_) {
        // Non-critical
      } finally {
        setOpsLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze irrigation');
    } finally {
      setIsLoading(false);
    }
  };

  const pieData = analysis ? [
    { name: 'Irrigated', value: analysis.irrigatedAcres, color: COLORS.irrigated },
    { name: 'Dryland', value: analysis.drylandAcres, color: COLORS.dryland },
  ].filter(d => d.value > 0) : [];

  return (
    <div className="space-y-6">
      {/* Field Selector */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Droplets className="w-5 h-5 text-emerald-600" />
          Irrigation Analysis
        </h3>

        <div className="flex items-end gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-700 mb-1">Select Field</label>
            <select
              value={selectedFieldId}
              onChange={(e) => { setSelectedFieldId(e.target.value); setAnalysis(null); }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Choose a field...</option>
              {fieldsWithBoundary.map((field) => (
                <option key={field.jd_field_id} value={field.jd_field_id}>
                  {field.name} {field.farm_name ? `(${field.farm_name})` : ''}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={handleAnalyze} disabled={!selectedFieldId || isLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analyzing...</> : 'Analyze Boundary'}
          </Button>
        </div>

        {error && <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      </div>

      {/* Boundary Analysis Results */}
      {analysis && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">{analysis.fieldName}</h3>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${analysis.irrigated ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {analysis.irrigated ? 'Irrigated' : 'Dryland'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {pieData.length > 0 && (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2} dataKey="value"
                      label={({ name, value }) => `${name}: ${formatAcres(value, preferredUnit)}`}>
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatAcres(value, preferredUnit)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-50 rounded-lg p-4">
                  <p className="text-sm text-emerald-700 font-medium">Irrigated</p>
                  <p className="text-2xl font-bold text-emerald-900">{formatAcres(analysis.irrigatedAcres, preferredUnit)}</p>
                  {(analysis.irrigatedAcres + analysis.drylandAcres) > 0 && (
                    <p className="text-xs text-emerald-600 mt-1">{((analysis.irrigatedAcres / (analysis.irrigatedAcres + analysis.drylandAcres)) * 100).toFixed(1)}%</p>
                  )}
                </div>
                <div className="bg-amber-50 rounded-lg p-4">
                  <p className="text-sm text-amber-700 font-medium">Dryland</p>
                  <p className="text-2xl font-bold text-amber-900">{formatAcres(analysis.drylandAcres, preferredUnit)}</p>
                  {(analysis.irrigatedAcres + analysis.drylandAcres) > 0 && (
                    <p className="text-xs text-amber-600 mt-1">{((analysis.drylandAcres / (analysis.irrigatedAcres + analysis.drylandAcres)) * 100).toFixed(1)}%</p>
                  )}
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-sm text-slate-600 font-medium">Total Field Area</p>
                <p className="text-xl font-bold text-slate-900">{formatAcres(analysis.irrigatedAcres + analysis.drylandAcres, preferredUnit)}</p>
                {analysis.totalArea && (
                  <p className="text-xs text-slate-500 mt-1">
                    JD reported: {formatAcres(convertArea(analysis.totalArea.value, analysis.totalArea.unit, 'ac'), preferredUnit)}
                    {analysis.workableArea && ` | Workable: ${formatAcres(convertArea(analysis.workableArea.value, analysis.workableArea.unit, 'ac'), preferredUnit)}`}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Side-by-side Seeding + Harvest Analysis */}
      {analysis && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <OperationSection
            title="Seeding / Planting"
            icon={<Sprout className="w-5 h-5 text-green-600" />}
            accentColor="bg-green-600 hover:bg-green-700"
            ops={seedingOps}
            opsLoading={opsLoading}
            analysis={analysis}
            preferredUnit={preferredUnit}
            onRun={async () => {}}
          />
          <OperationSection
            title="Harvest"
            icon={<Wheat className="w-5 h-5 text-amber-600" />}
            accentColor="bg-amber-600 hover:bg-amber-700"
            ops={harvestOps}
            opsLoading={opsLoading}
            analysis={analysis}
            preferredUnit={preferredUnit}
            onRun={async () => {}}
          />
        </div>
      )}

      {/* Empty state */}
      {!analysis && !isLoading && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Droplets className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-600 mb-2">Irrigation Analysis</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Select a field with an active boundary to analyze irrigated vs dryland acres.
            The analysis uses field boundary data from John Deere Operations Center.
          </p>
        </div>
      )}
    </div>
  );
}
