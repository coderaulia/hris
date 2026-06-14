const API_URL = import.meta.env.VITE_LARAVEL_API_URL || 'http://localhost:8000/api/v1';

function getToken() {
    return localStorage.getItem('laravel_token');
}

async function fetchApi(endpoint, options = {}) {
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const headers = {
        'Accept': 'application/json',
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers,
    };

    const token = getToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
    });

    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch {
            errorData = { message: response.statusText };
        }
        throw new Error(errorData.message || 'API request failed');
    }

    if (response.status === 204) return null;

    return response.json();
}

async function fetchBlob(endpoint, options = {}) {
    const headers = {
        'Accept': 'application/pdf',
        ...options.headers,
    };

    const token = getToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
    });

    if (!response.ok) {
        let message = response.statusText;
        try {
            const errorData = await response.json();
            message = errorData.message || message;
        } catch {
            // Keep the status text when the file endpoint does not return JSON.
        }
        throw new Error(message || 'API request failed');
    }

    return response.blob();
}

export const laravelAdapter = {
    auth: {
        signIn: async (email, password) => {
            try {
                const data = await fetchApi('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({ email, password })
                });
                localStorage.setItem('laravel_token', data.token);
                return { data: { session: { access_token: data.token, user: data.user } }, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        signOut: async () => {
            try {
                await fetchApi('/auth/logout', { method: 'POST' });
                localStorage.removeItem('laravel_token');
                return { error: null };
            } catch (error) {
                return { error };
            }
        },
        getSession: async () => {
            try {
                const data = await fetchApi('/auth/me');
                return { data: { session: { user: data.data } }, error: null };
            } catch (error) {
                return { data: { session: null }, error: null };
            }
        },
        onAuthStateChange: (callback) => {
            return { data: { subscription: { unsubscribe: () => {} } } };
        }
    },
    settings: {
        list: async () => {
            try {
                const data = await fetchApi('/settings');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        update: async (key, value) => {
            try {
                const data = await fetchApi(`/settings/${key}`, {
                    method: 'PUT',
                    body: JSON.stringify({ value })
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        }
    },
    employees: {
        list: async () => {
            try {
                const data = await fetchApi('/employees');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        get: async (id) => {
            try {
                const data = await fetchApi(`/employees/${id}`);
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        create: async (payload) => {
            try {
                const data = await fetchApi('/employees', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        update: async (id, payload) => {
            try {
                const data = await fetchApi(`/employees/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload)
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        delete: async (id) => {
            try {
                await fetchApi(`/employees/${id}`, { method: 'DELETE' });
                return { error: null };
            } catch (error) {
                return { error };
            }
        }
    },
    assessments: {
        list: async () => {
            try {
                const data = await fetchApi('/assessments');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        listScores: async () => {
            try {
                const data = await fetchApi('/assessment-scores');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        listHistory: async () => {
            try {
                const data = await fetchApi('/assessment-history');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        save: async (payload) => {
            try {
                const data = await fetchApi('/assessments', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        }
    },
    training: {
        list: async () => {
            try {
                const data = await fetchApi('/training-records');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        create: async (payload) => {
            try {
                const data = await fetchApi('/training-records', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        update: async (id, payload) => {
            try {
                const data = await fetchApi(`/training-records/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload)
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        delete: async (id) => {
            try {
                await fetchApi(`/training-records/${id}`, { method: 'DELETE' });
                return { error: null };
            } catch (error) {
                return { error };
            }
        }
    },
    kpis: {
        list: async () => {
            try {
                const data = await fetchApi('/kpis');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        saveDefinition: async (payload) => {
            try {
                const data = await fetchApi('/kpis', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        deleteDefinition: async (id) => {
            try {
                await fetchApi(`/kpis/${id}`, { method: 'DELETE' });
                return { error: null };
            } catch (error) {
                return { error };
            }
        },
        listDefinitionVersions: async () => {
            try {
                const data = await fetchApi('/kpi-definition-versions');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        saveDefinitionVersion: async (payload) => {
            try {
                const data = await fetchApi('/kpi-definition-versions', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        updateDefinitionVersion: async (id, payload) => {
            try {
                const data = await fetchApi(`/kpi-definition-versions/${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify(payload)
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        listTargetVersions: async () => {
            try {
                const data = await fetchApi('/employee-kpi-target-versions');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        saveTargetVersion: async (payload) => {
            try {
                const data = await fetchApi('/employee-kpi-target-versions', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        updateTargetVersion: async (id, payload) => {
            try {
                const data = await fetchApi(`/employee-kpi-target-versions/${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify(payload)
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        listRecords: async () => {
            try {
                const data = await fetchApi('/kpi-records');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        listWeightProfiles: async () => {
            try {
                const data = await fetchApi('/kpi-weight-profiles');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        listWeightItems: async () => {
            try {
                const data = await fetchApi('/kpi-weight-items');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        saveWeightProfile: async (payload) => {
            try {
                const data = await fetchApi('/kpi-weight-profiles', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        saveWeightItems: async (profileId, payload) => {
            try {
                const data = await fetchApi(`/kpi-weight-profiles/${profileId}/items`, {
                    method: 'POST',
                    body: JSON.stringify({ items: payload })
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        saveRecord: async (payload) => {
            try {
                const data = await fetchApi('/kpi-records', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        deleteRecord: async (id) => {
            try {
                await fetchApi(`/kpi-records/${id}`, { method: 'DELETE' });
                return { error: null };
            } catch (error) {
                return { error };
            }
        }
    },
    dashboard: {
        fetchSummary: async () => {
            try {
                const data = await fetchApi('/dashboard/summary');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        fetchProbationExpiry: async (limit = 8) => {
            try {
                const data = await fetchApi(`/dashboard/probation-expiry?limit=${limit}`);
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        fetchAssessmentCoverage: async () => {
            try {
                const data = await fetchApi('/dashboard/assessment-coverage');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
    },
    scores: {
        list: async () => {
            try {
                const data = await fetchApi('/performance-scores');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        save: async (payload) => {
            try {
                const data = await fetchApi('/performance-scores', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        }
    },
    config: {
        listCompetencies: async () => {
            try {
                const data = await fetchApi('/competency-config');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        saveCompetencies: async (position, competencies) => {
            try {
                const data = await fetchApi(`/competency-config/${position}`, {
                    method: 'PUT',
                    body: JSON.stringify({ competencies })
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        }
    },
    activity: {
        list: async () => {
            try {
                const data = await fetchApi('/activity-logs');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        log: async (payload) => {
            try {
                const data = await fetchApi('/activity-logs', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        }
    },
    manpower: {
        listPlans: async () => {
            try {
                const data = await fetchApi('/manpower-plans');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        listRequests: async () => {
            try {
                const data = await fetchApi('/headcount-requests');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        listPipeline: async () => {
            try {
                const data = await fetchApi('/recruitment-pipeline');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        savePlan: async (payload) => {
            try {
                const data = await fetchApi('/manpower-plans', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        saveRequest: async (payload) => {
            try {
                const data = await fetchApi('/headcount-requests', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        savePipeline: async (payload) => {
            try {
                const data = await fetchApi('/recruitment-pipeline', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        deletePipeline: async (id) => {
            try {
                await fetchApi(`/recruitment-pipeline/${id}`, { method: 'DELETE' });
                return { error: null };
            } catch (error) {
                return { error };
            }
        }
    },
    probation: {
        listReviews: async () => {
            try {
                const data = await fetchApi('/probation-reviews');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        listMonthlyScores: async () => {
            try {
                const data = await fetchApi('/probation-monthly-scores');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        listAttendance: async () => {
            try {
                const data = await fetchApi('/probation-attendance-records');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        saveReview: async (payload) => {
            try {
                const data = await fetchApi('/probation-reviews', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        saveMonthlyScore: async (payload) => {
            try {
                const data = await fetchApi('/probation-monthly-scores', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        saveAttendance: async (payload) => {
            try {
                const data = await fetchApi('/probation-attendance-records', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        }
    },
    pip: {
        listPlans: async () => {
            try {
                const data = await fetchApi('/pip-plans');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        listActions: async () => {
            try {
                const data = await fetchApi('/pip-actions');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        savePlan: async (payload) => {
            try {
                const data = await fetchApi('/pip-plans', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        saveAction: async (payload) => {
            try {
                const data = await fetchApi('/pip-actions', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        }
    },
    documents: {
        listTemplates: async () => {
            try {
                const data = await fetchApi('/hr-document-templates');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        listOptions: async () => {
            try {
                const data = await fetchApi('/hr-document-options');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        listPayrollRecords: async () => {
            try {
                const data = await fetchApi('/hr-payroll-records');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        savePayrollRecords: async (payloads) => {
            try {
                const data = await fetchApi('/hr-payroll-records/import', {
                    method: 'POST',
                    body: JSON.stringify({ records: payloads })
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        saveTemplate: async (payload) => {
            try {
                const data = await fetchApi('/hr-document-templates', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        deleteTemplate: async (id) => {
            try {
                await fetchApi(`/hr-document-templates/${id}`, { method: 'DELETE' });
                return { error: null };
            } catch (error) {
                return { error };
            }
        },
        listArchive: async () => {
            try {
                const data = await fetchApi('/hr-document-archive');
                return { data: data.data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        storeArchive: async (archiveRow, pdfBlob) => {
            try {
                const created = await fetchApi('/hr-document-archive', {
                    method: 'POST',
                    body: JSON.stringify(archiveRow),
                });
                let archive = created.data;
                if (pdfBlob && archive?.id) {
                    const formData = new FormData();
                    formData.append('file', pdfBlob, archive.filename || archiveRow.filename || 'document.pdf');
                    const uploaded = await fetchApi(`/hr-document-archive/${archive.id}/file`, {
                        method: 'POST',
                        body: formData,
                    });
                    archive = uploaded.data;
                }
                return { data: archive, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        deleteArchive: async (id) => {
            try {
                await fetchApi(`/hr-document-archive/${id}`, { method: 'DELETE' });
                return { error: null };
            } catch (error) {
                return { error };
            }
        },
        getSignedUrl: async (storagePath) => {
            try {
                const parts = String(storagePath || '').split('/');
                const archiveRootIndex = parts.indexOf('hr-document-archive');
                const id = archiveRootIndex >= 0
                    ? parts[archiveRootIndex + 1]
                    : (parts[parts.length - 1] || '').match(/^[0-9a-f-]{36}/i)?.[0];
                if (!id) throw new Error('Archive file path is invalid');
                const blob = await fetchBlob(`/hr-document-archive/${id}/file`);
                return { data: { signedUrl: URL.createObjectURL(blob) }, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        // E-signature workflow is Supabase-only for now. Laravel parity is a
        // deferred follow-up; these stubs degrade gracefully in Laravel mode.
        listSignatureRequests: async () => {
            return { data: [], error: null };
        },
        listMySignatureRequests: async () => {
            return { data: [], error: null };
        },
        createSignatureRequests: async () => {
            return { data: null, error: new Error('Signature requests are not available in Laravel mode yet') };
        },
        updateSignatureRequest: async () => {
            return { data: null, error: new Error('Signature requests are not available in Laravel mode yet') };
        },
        deleteSignatureRequest: async () => {
            return { error: new Error('Signature requests are not available in Laravel mode yet') };
        },
        getSignatureSignedUrl: async () => {
            return { data: null, error: new Error('Signature requests are not available in Laravel mode yet') };
        },
    },
    // Live Attendance is Supabase-only for now. Laravel parity is a deferred
    // follow-up; these stubs degrade gracefully in Laravel mode.
    attendance: {
        listWorkSites: async () => {
            return { data: [], error: null };
        },
        upsertWorkSite: async () => {
            return { data: null, error: new Error('Live Attendance is not available in Laravel mode yet') };
        },
        deleteWorkSite: async () => {
            return { error: new Error('Live Attendance is not available in Laravel mode yet') };
        },
        listMyAttendance: async () => {
            return { data: [], error: null };
        },
        listAttendance: async () => {
            return { data: [], error: null };
        },
        recordEvent: async () => {
            return { data: null, error: new Error('Live Attendance is not available in Laravel mode yet') };
        },
        updateRecord: async () => {
            return { data: null, error: new Error('Live Attendance is not available in Laravel mode yet') };
        },
        deleteRecord: async () => {
            return { error: new Error('Live Attendance is not available in Laravel mode yet') };
        },
        getPhotoUrl: async () => {
            return { data: null, error: new Error('Live Attendance is not available in Laravel mode yet') };
        },
    },
};
