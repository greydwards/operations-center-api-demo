'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { JohnDeereConnect } from '@/components/dashboard/john-deere-connect';
import { OrganizationSelector } from '@/components/dashboard/organization-selector';
import { AreaUnitToggle } from '@/components/dashboard/area-unit-toggle';
import { FieldMap } from '@/components/dashboard/field-map';
import { FieldsList } from '@/components/dashboard/fields-list';
import { FieldFilters } from '@/components/dashboard/field-filters';
import { HarvestOperations } from '@/components/dashboard/harvest-operations';
import { IrrigationAnalysis } from '@/components/dashboard/irrigation-analysis';
import { fetchStoredFields, importFieldsWithBoundaries, importOperations } from '@/lib/john-deere-client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader as Loader2, LogOut, Tractor, Map, MapPin, Wheat, Droplets, User } from 'lucide-react';
import type { StoredField } from '@/types/john-deere';

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading, signOut, johnDeereConnection, updatePreferredAreaUnit } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);

  const [storedFields, setStoredFields] = useState<StoredField[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [selectedFarm, setSelectedFarm] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  const loadStoredFields = useCallback(async () => {
    if (!johnDeereConnection?.selected_org_id) return;
    setFieldsLoading(true);
    setFieldsError(null);
    try {
      const data = await fetchStoredFields();
      setStoredFields(data.fields || []);
    } catch (err) {
      setFieldsError(err instanceof Error ? err.message : 'Failed to load fields');
    } finally {
      setFieldsLoading(false);
    }
  }, [johnDeereConnection?.selected_org_id]);

  useEffect(() => {
    loadStoredFields();
  }, [loadStoredFields, refreshKey]);

  useEffect(() => {
    setSelectedClient(null);
    setSelectedFarm(null);
  }, [johnDeereConnection?.selected_org_id]);

  const [isSyncingOps, setIsSyncingOps] = useState(false);

  const handleImport = async () => {
    setIsImporting(true);
    setFieldsError(null);
    try {
      const data = await importFieldsWithBoundaries();
      setStoredFields(data.fields || []);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setFieldsError(err instanceof Error ? err.message : 'Failed to import fields');
    } finally {
      setIsImporting(false);
    }
  };

  const handleSyncOperations = async () => {
    setIsSyncingOps(true);
    try {
      await importOperations();
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setFieldsError(err instanceof Error ? err.message : 'Failed to sync operations');
    } finally {
      setIsSyncingOps(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  const handleOrganizationChange = () => {
    setRefreshKey((k) => k + 1);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const preferredUnit = johnDeereConnection?.preferred_area_unit || 'ac';

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center">
                <Tractor className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-semibold text-slate-900">Farm Data Hub</span>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <User className="w-4 h-4" />
                <span>{user.email}</span>
              </div>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-600 mt-1">Manage your John Deere Operations Center connection and view farm data</p>
        </div>

        <div className="space-y-6">
          <JohnDeereConnect />

          {johnDeereConnection && (
            <>
              <OrganizationSelector onOrganizationChange={handleOrganizationChange} />

              {johnDeereConnection.selected_org_id && (
                <>
                  <FieldFilters
                    fields={storedFields}
                    selectedClient={selectedClient}
                    selectedFarm={selectedFarm}
                    onClientChange={setSelectedClient}
                    onFarmChange={setSelectedFarm}
                  />

                  <Tabs defaultValue="map" className="w-full">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <TabsList className="bg-white border border-slate-200 p-1">
                        <TabsTrigger
                          value="map"
                          className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
                        >
                          <Map className="w-4 h-4 mr-2" />
                          Map
                        </TabsTrigger>
                        <TabsTrigger
                          value="fields"
                          className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
                        >
                          <MapPin className="w-4 h-4 mr-2" />
                          Fields
                        </TabsTrigger>
                        <TabsTrigger
                          value="harvest"
                          className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
                        >
                          <Wheat className="w-4 h-4 mr-2" />
                          Harvest Operations
                        </TabsTrigger>
                        <TabsTrigger
                          value="irrigation"
                          className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
                        >
                          <Droplets className="w-4 h-4 mr-2" />
                          Irrigation
                        </TabsTrigger>
                      </TabsList>

                      <AreaUnitToggle
                        value={preferredUnit}
                        onChange={updatePreferredAreaUnit}
                      />
                    </div>

                    <TabsContent value="map" className="mt-4 data-[state=inactive]:hidden" forceMount>
                      <FieldMap
                        fields={storedFields}
                        selectedClient={selectedClient}
                        selectedFarm={selectedFarm}
                        isLoading={fieldsLoading}
                        error={fieldsError}
                        onImport={handleImport}
                        isImporting={isImporting}
                      />
                    </TabsContent>

                    <TabsContent value="fields" className="mt-4">
                      <FieldsList
                        fields={storedFields}
                        selectedClient={selectedClient}
                        selectedFarm={selectedFarm}
                        preferredUnit={preferredUnit}
                        isLoading={fieldsLoading}
                        error={fieldsError}
                      />
                    </TabsContent>

                    <TabsContent value="harvest" className="mt-4">
                      <HarvestOperations key={`harvest-${refreshKey}`} />
                    </TabsContent>

                    <TabsContent value="irrigation" className="mt-4">
                      <IrrigationAnalysis
                        fields={storedFields}
                        preferredUnit={preferredUnit}
                      />
                    </TabsContent>
                  </Tabs>
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
